import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { normalizePage } from '../../domain/pagination.ts';
import type { PageResult } from '../../shared/contracts.js';
import { getBlocker } from './operations-mappers.ts';
import { type TaskBlockerRecord, addOperationActivity, mapBlocker, now } from './operations-shared.ts';

export function createTaskBlocker(
    db: Database.Database,
    taskId: string,
    reason: string,
    waitingContactId: string | null,
    followUpAt: string | null,
): TaskBlockerRecord {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL').get(taskId);
    if (!task) throw new Error('Task not found.');
    if (!reason.trim() || reason.length > 4000)
        throw new Error('Enter a blocker reason (up to 4,000 characters).');
    if (
        waitingContactId &&
        !db.prepare('SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL').get(waitingContactId)
    )
        throw new Error('Waiting contact not found.');
    const active = db
        .prepare('SELECT id FROM task_blockers WHERE task_id = ? AND resolved_at IS NULL')
        .get(taskId) as { id: string } | undefined;
    if (active)
        throw new Error('This task already has an unresolved blocker. Resolve it before adding another.');
    const id = randomUUID();
    const createdAt = now();
    db.prepare(
        'INSERT INTO task_blockers (id, task_id, reason, waiting_contact_id, follow_up_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, taskId, reason.trim(), waitingContactId, followUpAt, createdAt);
    db.prepare("UPDATE tasks SET status = 'blocked', updated_at = ? WHERE id = ?").run(createdAt, taskId);
    addOperationActivity(db, 'task', taskId, 'blocked', `Blocked: ${reason.trim().slice(0, 200)}`);
    return getBlocker(db, id);
}

export function listTaskBlockersPage(
    db: Database.Database,
    input: {
        taskId?: string | undefined;
        includeResolved?: boolean | undefined;
        limit?: number | undefined;
        offset?: number | undefined;
    } = {},
): PageResult<TaskBlockerRecord> {
    const page = normalizePage(input);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (!input.includeResolved) clauses.push('resolved_at IS NULL');
    if (input.taskId) {
        clauses.push('task_id = ?');
        params.push(input.taskId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = Number(
        (
            db.prepare(`SELECT count(*) AS total FROM task_blockers ${where}`).get(...params) as {
                total: number;
            }
        ).total,
    );
    const items = (
        db
            .prepare(
                `SELECT * FROM task_blockers ${where} ORDER BY coalesce(follow_up_at, created_at) ASC, id ASC LIMIT ? OFFSET ?`,
            )
            .all(...params, page.limit, page.offset) as Array<Record<string, unknown>>
    ).map(mapBlocker);
    return {
        items,
        total,
        limit: page.limit,
        offset: page.offset,
        hasMore: page.offset + items.length < total,
    };
}

export function resolveTaskBlocker(
    db: Database.Database,
    id: string,
    resolutionNote = '',
): TaskBlockerRecord {
    const resolvedAt = now();
    const result = db
        .prepare(
            'UPDATE task_blockers SET resolved_at = ?, resolution_note = ? WHERE id = ? AND resolved_at IS NULL',
        )
        .run(resolvedAt, resolutionNote.slice(0, 4000), id);
    if (!result.changes) throw new Error('Open blocker not found.');
    const row = db.prepare('SELECT task_id FROM task_blockers WHERE id = ?').get(id) as {
        task_id: string;
    };
    db.prepare(
        "UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'blocked'",
    ).run(resolvedAt, row.task_id);
    addOperationActivity(
        db,
        'task',
        row.task_id,
        'blocker_resolved',
        resolutionNote.trim() || 'Resolved blocker',
    );
    return getBlocker(db, id);
}
