import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { normalizePage } from '../../domain/pagination.ts';
import type { PageRequest, PageResult } from '../../shared/contracts.js';
import { type TimeEntryRecord, addOperationActivity, mapTimeEntry, now } from './operations-shared.ts';

const MAX_TIME_ENTRY_MS = 7 * 24 * 60 * 60 * 1000;

function parseTimeEntryRange(
    startedAt: string,
    endedAt: string,
    maxRangeMessage: string,
): { startIso: string; endIso: string; durationSeconds: number; roundedMinutes: number } {
    const start = Date.parse(startedAt);
    const end = Date.parse(endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        throw new Error('Time entry must end after it starts.');
    if (end - start > MAX_TIME_ENTRY_MS) throw new Error(maxRangeMessage);
    return {
        startIso: new Date(start).toISOString(),
        endIso: new Date(end).toISOString(),
        durationSeconds: Math.floor((end - start) / 1000),
        roundedMinutes: Math.round((end - start) / 60000),
    };
}

export function listTaskTimeEntriesPage(
    db: Database.Database,
    taskId: string,
    input: PageRequest = {},
): PageResult<TimeEntryRecord> {
    const page = normalizePage(input);
    const total = Number(
        (
            db.prepare('SELECT count(*) AS total FROM time_entries WHERE task_id = ?').get(taskId) as {
                total: number;
            }
        ).total,
    );
    const items = (
        db
            .prepare(
                'SELECT * FROM time_entries WHERE task_id = ? ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?',
            )
            .all(taskId, page.limit, page.offset) as Array<Record<string, unknown>>
    ).map(mapTimeEntry);
    return {
        items,
        total,
        limit: page.limit,
        offset: page.offset,
        hasMore: page.offset + items.length < total,
    };
}

export function addManualTaskTimeEntry(
    db: Database.Database,
    taskId: string,
    startedAt: string,
    endedAt: string,
    note = '',
): TimeEntryRecord {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL').get(taskId);
    if (!task) throw new Error('Task not found.');
    const range = parseTimeEntryRange(
        startedAt,
        endedAt,
        'A manual time entry cannot exceed seven days. Split longer periods into separate entries.',
    );
    const id = randomUUID();
    const createdAt = now();
    db.prepare(
        `INSERT INTO time_entries (id, task_id, started_at, ended_at, duration_seconds, note, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
        id,
        taskId,
        range.startIso,
        range.endIso,
        range.durationSeconds,
        note.trim().slice(0, 1000),
        createdAt,
    );
    addOperationActivity(
        db,
        'task',
        taskId,
        'time_entry_added',
        `Added ${range.roundedMinutes} minutes manually`,
    );
    return mapTimeEntry(
        db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id) as Record<string, unknown>,
    );
}

export function updateTaskTimeEntry(
    db: Database.Database,
    entryId: string,
    startedAt: string,
    endedAt: string,
    note = '',
): TimeEntryRecord {
    const row = db
        .prepare('SELECT task_id, is_active, started_at, ended_at FROM time_entries WHERE id = ?')
        .get(entryId) as
        { task_id: string; is_active: number; started_at: string; ended_at: string | null } | undefined;
    if (!row) throw new Error('Time entry not found.');
    if (row.is_active) throw new Error('Stop the active timer before correcting this entry.');
    const range = parseTimeEntryRange(
        startedAt,
        endedAt,
        'A time entry cannot exceed seven days. Split longer periods into separate entries.',
    );
    const updatedAt = now();
    db.prepare(
        'UPDATE time_entries SET started_at = ?, ended_at = ?, duration_seconds = ?, note = ? WHERE id = ? AND is_active = 0',
    ).run(range.startIso, range.endIso, range.durationSeconds, note.trim().slice(0, 1000), entryId);
    addOperationActivity(
        db,
        'task',
        row.task_id,
        'time_entry_corrected',
        `Corrected time entry from ${row.started_at} to ${row.ended_at ?? 'unknown'}; new duration ${range.roundedMinutes} minutes at ${updatedAt}`,
    );
    return mapTimeEntry(
        db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId) as Record<string, unknown>,
    );
}

export function deleteTaskTimeEntry(db: Database.Database, entryId: string): void {
    const row = db.prepare('SELECT task_id, is_active FROM time_entries WHERE id = ?').get(entryId) as
        { task_id: string; is_active: number } | undefined;
    if (!row) throw new Error('Time entry not found.');
    if (row.is_active) throw new Error('Stop the active timer before removing this entry.');
    db.prepare('DELETE FROM time_entries WHERE id = ?').run(entryId);
    addOperationActivity(db, 'task', row.task_id, 'time_entry_removed', 'Removed a time entry');
}
