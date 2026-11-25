import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { cancelBackgroundJob, enqueueBackgroundJob } from './background-jobs.ts';
import {
    assignTag,
    createTag,
    deleteTag,
    listEntityTags,
    listTagsPage,
    unassignTag,
} from './operations-tags.ts';
import { listActivityPage, listJobsPage } from './operations-history.ts';
import { normalizePage } from '../../domain/pagination.ts';
import type { PageRequest, PageResult, RecordSummary } from '../../shared/contracts.js';
import {
    assertEntityExists,
    getBlocker,
    getReminder,
    mapLink,
    resolveRecordSummaries,
} from './operations-mappers.ts';
import { REMINDER_TYPES, mapReminder, mapTimeEntry, mapBlocker, mapJob, now } from './operations-shared.ts';
import type {
    EntityType,
    TagRecord,
    EntityLinkRecord,
    ReminderRecord,
    TimeEntryRecord,
    TaskBlockerRecord,
    ActivityRecord,
    BackgroundJobRecord,
} from './operations-shared.ts';
export type {
    EntityType,
    TagRecord,
    EntityLinkRecord,
    ReminderRecord,
    TimeEntryRecord,
    TaskBlockerRecord,
    ActivityRecord,
    BackgroundJobRecord,
} from './operations-shared.ts';

/** Operational records shared by tasks, knowledge records, reminders and persistent workers. */
export class WorkspaceOperationsService {
    private readonly db: Database.Database;
    constructor(db: Database.Database) {
        this.db = db;
    }

    listTagsPage(input: PageRequest = {}): PageResult<TagRecord> {
        return listTagsPage(this.db, input);
    }
    createTag(name: string, color = 'neutral'): TagRecord {
        return createTag(this.db, name, color);
    }
    deleteTag(tagId: string): void {
        deleteTag(this.db, tagId);
    }
    listEntityTags(entityType: EntityType, entityId: string): TagRecord[] {
        return listEntityTags(this.db, entityType, entityId);
    }
    assignTag(entityType: EntityType, entityId: string, tagId: string): void {
        assignTag(this.db, entityType, entityId, tagId);
    }
    unassignTag(entityType: EntityType, entityId: string, tagId: string): void {
        unassignTag(this.db, entityType, entityId, tagId);
    }

    createLink(
        sourceType: EntityType,
        sourceId: string,
        targetType: EntityType,
        targetId: string,
        relationship = 'related',
    ): EntityLinkRecord {
        assertEntityExists(this.db, sourceType, sourceId);
        assertEntityExists(this.db, targetType, targetId);
        if (sourceType === targetType && sourceId === targetId)
            throw new Error('A record cannot link to itself.');
        const label = relationship.trim().slice(0, 64) || 'related';
        const id = randomUUID();
        const createdAt = now();
        this.db
            .prepare(
                `INSERT OR IGNORE INTO entity_links (id, source_type, source_id, target_type, target_id, relationship, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(id, sourceType, sourceId, targetType, targetId, label, createdAt);
        const row = this.db
            .prepare(
                `SELECT * FROM entity_links WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND relationship = ?`,
            )
            .get(sourceType, sourceId, targetType, targetId, label) as Record<string, unknown>;
        return mapLink(row, 'outgoing');
    }

    listLinksPage(
        entityType: EntityType,
        entityId: string,
        input: PageRequest = {},
    ): PageResult<EntityLinkRecord> {
        assertEntityExists(this.db, entityType, entityId);
        const page = normalizePage(input);
        const total = Number(
            (
                this.db
                    .prepare(
                        `SELECT
      (SELECT count(*) FROM entity_links WHERE source_type = ? AND source_id = ?) +
      (SELECT count(*) FROM entity_links WHERE target_type = ? AND target_id = ?) AS total`,
                    )
                    .get(entityType, entityId, entityType, entityId) as { total: number }
            ).total,
        );
        const rows = this.db
            .prepare(
                `SELECT * FROM (
      SELECT *, 'outgoing' AS direction FROM entity_links WHERE source_type = ? AND source_id = ?
      UNION ALL
      SELECT *, 'incoming' AS direction FROM entity_links WHERE target_type = ? AND target_id = ?
    ) ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
            )
            .all(entityType, entityId, entityType, entityId, page.limit, page.offset) as Array<
            Record<string, unknown>
        >;
        const items = rows.map((row) => mapLink(row, row['direction'] as 'outgoing' | 'incoming'));
        return {
            items,
            total,
            limit: page.limit,
            offset: page.offset,
            hasMore: page.offset + items.length < total,
        };
    }

    removeLink(linkId: string): void {
        const result = this.db.prepare('DELETE FROM entity_links WHERE id = ?').run(linkId);
        if (!result.changes) throw new Error('Relationship not found.');
    }

    addDependency(taskId: string, dependsOnTaskId: string): void {
        if (taskId === dependsOnTaskId) throw new Error('A task cannot depend on itself.');
        const task = this.db
            .prepare('SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL')
            .get(taskId) as { project_id: string } | undefined;
        const dependency = this.db
            .prepare('SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL')
            .get(dependsOnTaskId) as { project_id: string } | undefined;
        if (!task || !dependency) throw new Error('Both tasks must exist and be active.');
        if (task.project_id !== dependency.project_id)
            throw new Error('Task dependencies must belong to the same project.');
        // Follow only the dependency chain reachable from the proposed prerequisite.
        // A cycle exists exactly when that chain already reaches the task being updated.
        // This keeps validation proportional to the reachable subgraph instead of copying
        // the entire workspace dependency graph into the main-process JavaScript heap.
        const cycle = this.db
            .prepare(
                `WITH RECURSIVE dependency_path(task_id) AS (
      SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?
      UNION
      SELECT edge.depends_on_task_id FROM task_dependencies edge
      INNER JOIN dependency_path path ON edge.task_id = path.task_id
    ) SELECT 1 AS creates_cycle FROM dependency_path WHERE task_id = ? LIMIT 1`,
            )
            .get(dependsOnTaskId, taskId) as { creates_cycle: number } | undefined;
        if (cycle) throw new Error('This dependency would create a cycle.');
        this.db
            .prepare(
                'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, created_at) VALUES (?, ?, ?)',
            )
            .run(taskId, dependsOnTaskId, now());
        this.addActivity('task', taskId, 'dependency_added', `Added dependency on task ${dependsOnTaskId}`);
    }

    removeDependency(taskId: string, dependsOnTaskId: string): void {
        this.db
            .prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?')
            .run(taskId, dependsOnTaskId);
    }

    listDependencies(
        taskId: string,
        input: { dependsOn?: PageRequest | undefined; blocks?: PageRequest | undefined } = {},
    ): {
        dependsOn: PageResult<string>;
        blocks: PageResult<string>;
    } {
        const dependsPage = normalizePage(input.dependsOn);
        const blocksPage = normalizePage(input.blocks);
        const dependsTotal = Number(
            (
                this.db
                    .prepare('SELECT count(*) AS total FROM task_dependencies WHERE task_id = ?')
                    .get(taskId) as { total: number }
            ).total,
        );
        const blocksTotal = Number(
            (
                this.db
                    .prepare('SELECT count(*) AS total FROM task_dependencies WHERE depends_on_task_id = ?')
                    .get(taskId) as { total: number }
            ).total,
        );
        const dependsOn = (
            this.db
                .prepare(
                    `SELECT depends_on_task_id FROM task_dependencies
      WHERE task_id = ? ORDER BY depends_on_task_id LIMIT ? OFFSET ?`,
                )
                .all(taskId, dependsPage.limit, dependsPage.offset) as Array<{ depends_on_task_id: string }>
        ).map((row) => row.depends_on_task_id);
        const blocks = (
            this.db
                .prepare(
                    `SELECT task_id FROM task_dependencies
      WHERE depends_on_task_id = ? ORDER BY task_id LIMIT ? OFFSET ?`,
                )
                .all(taskId, blocksPage.limit, blocksPage.offset) as Array<{ task_id: string }>
        ).map((row) => row.task_id);
        return {
            dependsOn: {
                items: dependsOn,
                total: dependsTotal,
                limit: dependsPage.limit,
                offset: dependsPage.offset,
                hasMore: dependsPage.offset + dependsOn.length < dependsTotal,
            },
            blocks: {
                items: blocks,
                total: blocksTotal,
                limit: blocksPage.limit,
                offset: blocksPage.offset,
                hasMore: blocksPage.offset + blocks.length < blocksTotal,
            },
        };
    }

    createBlocker(
        taskId: string,
        reason: string,
        waitingContactId: string | null,
        followUpAt: string | null,
    ): TaskBlockerRecord {
        const task = this.db.prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL').get(taskId);
        if (!task) throw new Error('Task not found.');
        if (!reason.trim() || reason.length > 4000)
            throw new Error('Enter a blocker reason (up to 4,000 characters).');
        if (
            waitingContactId &&
            !this.db
                .prepare('SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL')
                .get(waitingContactId)
        )
            throw new Error('Waiting contact not found.');
        const active = this.db
            .prepare('SELECT id FROM task_blockers WHERE task_id = ? AND resolved_at IS NULL')
            .get(taskId) as { id: string } | undefined;
        if (active)
            throw new Error('This task already has an unresolved blocker. Resolve it before adding another.');
        const id = randomUUID();
        const createdAt = now();
        this.db
            .prepare(
                'INSERT INTO task_blockers (id, task_id, reason, waiting_contact_id, follow_up_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(id, taskId, reason.trim(), waitingContactId, followUpAt, createdAt);
        this.db
            .prepare("UPDATE tasks SET status = 'blocked', updated_at = ? WHERE id = ?")
            .run(createdAt, taskId);
        this.addActivity('task', taskId, 'blocked', `Blocked: ${reason.trim().slice(0, 200)}`);
        return getBlocker(this.db, id);
    }

    listBlockersPage(
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
                this.db.prepare(`SELECT count(*) AS total FROM task_blockers ${where}`).get(...params) as {
                    total: number;
                }
            ).total,
        );
        const items = (
            this.db
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

    resolveBlocker(id: string, resolutionNote = ''): TaskBlockerRecord {
        const resolvedAt = now();
        const result = this.db
            .prepare(
                'UPDATE task_blockers SET resolved_at = ?, resolution_note = ? WHERE id = ? AND resolved_at IS NULL',
            )
            .run(resolvedAt, resolutionNote.slice(0, 4000), id);
        if (!result.changes) throw new Error('Open blocker not found.');
        const row = this.db.prepare('SELECT task_id FROM task_blockers WHERE id = ?').get(id) as {
            task_id: string;
        };
        this.db
            .prepare(
                "UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'blocked'",
            )
            .run(resolvedAt, row.task_id);
        this.addActivity(
            'task',
            row.task_id,
            'blocker_resolved',
            resolutionNote.trim() || 'Resolved blocker',
        );
        return getBlocker(this.db, id);
    }

    createReminder(
        entityType: ReminderRecord['entityType'],
        entityId: string,
        dueAt: string,
        message = '',
    ): ReminderRecord {
        if (!REMINDER_TYPES.has(entityType)) throw new Error('Unsupported reminder target.');
        assertEntityExists(this.db, entityType, entityId);
        if (!Number.isFinite(Date.parse(dueAt))) throw new Error('Reminder date is invalid.');
        const id = randomUUID();
        const timestamp = now();
        this.db
            .prepare(
                `INSERT INTO reminders (id, entity_type, entity_id, due_at, status, message, created_at, updated_at) VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?)`,
            )
            .run(
                id,
                entityType,
                entityId,
                new Date(dueAt).toISOString(),
                message.trim().slice(0, 500),
                timestamp,
                timestamp,
            );
        return getReminder(this.db, id);
    }

    listRemindersPage(
        input: {
            entityType?: ReminderRecord['entityType'] | undefined;
            entityId?: string | undefined;
            status?: ReminderRecord['status'] | undefined;
            limit?: number | undefined;
            offset?: number | undefined;
        } = {},
    ): PageResult<ReminderRecord> {
        const page = normalizePage(input);
        const clauses = [input.status ? 'status = ?' : "status IN ('scheduled', 'snoozed', 'delivered')"];
        const parameters: unknown[] = input.status ? [input.status] : [];
        if (input.entityType) {
            clauses.push('entity_type = ?');
            parameters.push(input.entityType);
        }
        if (input.entityId) {
            clauses.push('entity_id = ?');
            parameters.push(input.entityId);
        }
        const where = `WHERE ${clauses.join(' AND ')}`;
        const total = Number(
            (
                this.db.prepare(`SELECT count(*) AS total FROM reminders ${where}`).get(...parameters) as {
                    total: number;
                }
            ).total,
        );
        const items = (
            this.db
                .prepare(`SELECT * FROM reminders ${where} ORDER BY due_at ASC, id ASC LIMIT ? OFFSET ?`)
                .all(...parameters, page.limit, page.offset) as Array<Record<string, unknown>>
        ).map(mapReminder);
        return {
            items,
            total,
            limit: page.limit,
            offset: page.offset,
            hasMore: page.offset + items.length < total,
        };
    }
    resolveRecordSummaries(refs: Array<{ type: EntityType; id: string }>): Record<string, RecordSummary> {
        return resolveRecordSummaries(this.db, refs);
    }

    updateReminder(
        id: string,
        action: 'snooze' | 'dismiss' | 'reschedule' | 'cancel',
        dueAt?: string,
        snoozeMinutes: 15 | 60 | 240 | 1440 = 60,
    ): ReminderRecord {
        const current = this.db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as
            Record<string, unknown> | undefined;
        if (!current) throw new Error('Reminder not found.');
        const timestamp = now();
        if (action === 'reschedule') {
            if (!dueAt || !Number.isFinite(Date.parse(dueAt)))
                throw new Error('A valid new reminder date is required.');
            this.db
                .prepare("UPDATE reminders SET due_at = ?, status = 'scheduled', updated_at = ? WHERE id = ?")
                .run(new Date(dueAt).toISOString(), timestamp, id);
        } else if (action === 'snooze') {
            // Snoozing must move the due time, otherwise the scheduler would deliver it again immediately.
            if (![15, 60, 240, 1440].includes(snoozeMinutes))
                throw new Error('Choose a supported snooze duration.');
            const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000).toISOString();
            this.db
                .prepare("UPDATE reminders SET status = 'snoozed', due_at = ?, updated_at = ? WHERE id = ?")
                .run(snoozedUntil, timestamp, id);
        } else {
            const status = action === 'dismiss' ? 'dismissed' : 'cancelled';
            this.db
                .prepare('UPDATE reminders SET status = ?, updated_at = ? WHERE id = ?')
                .run(status, timestamp, id);
        }
        return getReminder(this.db, id);
    }

    markReminderDelivered(id: string): void {
        const timestamp = now();
        this.db
            .prepare(
                "UPDATE reminders SET status = 'delivered', last_delivered_at = ?, updated_at = ? WHERE id = ? AND status IN ('scheduled', 'snoozed')",
            )
            .run(timestamp, timestamp, id);
    }

    listTimeEntriesPage(taskId: string, input: PageRequest = {}): PageResult<TimeEntryRecord> {
        const page = normalizePage(input);
        const total = Number(
            (
                this.db
                    .prepare('SELECT count(*) AS total FROM time_entries WHERE task_id = ?')
                    .get(taskId) as { total: number }
            ).total,
        );
        const items = (
            this.db
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

    addManualTimeEntry(taskId: string, startedAt: string, endedAt: string, note = ''): TimeEntryRecord {
        const task = this.db.prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL').get(taskId);
        if (!task) throw new Error('Task not found.');
        const start = Date.parse(startedAt);
        const end = Date.parse(endedAt);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
            throw new Error('Time entry must end after it starts.');
        if (end - start > 7 * 24 * 60 * 60 * 1000)
            throw new Error(
                'A manual time entry cannot exceed seven days. Split longer periods into separate entries.',
            );
        const id = randomUUID();
        const createdAt = now();
        this.db
            .prepare(
                `INSERT INTO time_entries (id, task_id, started_at, ended_at, duration_seconds, note, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
            )
            .run(
                id,
                taskId,
                new Date(start).toISOString(),
                new Date(end).toISOString(),
                Math.floor((end - start) / 1000),
                note.trim().slice(0, 1000),
                createdAt,
            );
        this.addActivity(
            'task',
            taskId,
            'time_entry_added',
            `Added ${Math.round((end - start) / 60000)} minutes manually`,
        );
        return mapTimeEntry(
            this.db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id) as Record<string, unknown>,
        );
    }

    updateTimeEntry(entryId: string, startedAt: string, endedAt: string, note = ''): TimeEntryRecord {
        const row = this.db
            .prepare('SELECT task_id, is_active, started_at, ended_at FROM time_entries WHERE id = ?')
            .get(entryId) as
            { task_id: string; is_active: number; started_at: string; ended_at: string | null } | undefined;
        if (!row) throw new Error('Time entry not found.');
        if (row.is_active) throw new Error('Stop the active timer before correcting this entry.');
        const start = Date.parse(startedAt);
        const end = Date.parse(endedAt);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
            throw new Error('Time entry must end after it starts.');
        if (end - start > 7 * 24 * 60 * 60 * 1000)
            throw new Error(
                'A time entry cannot exceed seven days. Split longer periods into separate entries.',
            );
        const updatedAt = now();
        this.db
            .prepare(
                'UPDATE time_entries SET started_at = ?, ended_at = ?, duration_seconds = ?, note = ? WHERE id = ? AND is_active = 0',
            )
            .run(
                new Date(start).toISOString(),
                new Date(end).toISOString(),
                Math.floor((end - start) / 1000),
                note.trim().slice(0, 1000),
                entryId,
            );
        this.addActivity(
            'task',
            row.task_id,
            'time_entry_corrected',
            `Corrected time entry from ${row.started_at} to ${row.ended_at ?? 'unknown'}; new duration ${Math.round((end - start) / 60000)} minutes at ${updatedAt}`,
        );
        return mapTimeEntry(
            this.db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId) as Record<
                string,
                unknown
            >,
        );
    }

    deleteTimeEntry(entryId: string): void {
        const row = this.db
            .prepare('SELECT task_id, is_active FROM time_entries WHERE id = ?')
            .get(entryId) as { task_id: string; is_active: number } | undefined;
        if (!row) throw new Error('Time entry not found.');
        if (row.is_active) throw new Error('Stop the active timer before removing this entry.');
        this.db.prepare('DELETE FROM time_entries WHERE id = ?').run(entryId);
        this.addActivity('task', row.task_id, 'time_entry_removed', 'Removed a time entry');
    }

    enqueueJob(
        kind: string,
        targetType: string,
        targetId: string,
        priority = 5,
        idempotencyKey?: string,
        payload: Record<string, unknown> = {},
    ): BackgroundJobRecord {
        const row = enqueueBackgroundJob(this.db as never, kind, targetType, targetId, {
            priority,
            idempotencyKey,
            payload,
        });
        return mapJob(row as unknown as Record<string, unknown>);
    }

    enqueueMaintenanceJob(
        kind: 'search.rebuild' | 'storage.audit' | 'maintenance.optimize',
    ): BackgroundJobRecord {
        const idempotencyKey = `${kind}:${new Date().toISOString().slice(0, 16)}`;
        return this.enqueueJob(kind, 'workspace', 'local-workspace', 3, idempotencyKey);
    }

    cancelJob(id: string): 'cancelled' | 'requested' | 'not-cancellable' {
        return cancelBackgroundJob(this.db as never, id);
    }

    listJobsPage(input: PageRequest = {}): PageResult<BackgroundJobRecord> {
        return listJobsPage(this.db, input);
    }
    listActivityPage(input: PageRequest = {}): PageResult<ActivityRecord> {
        return listActivityPage(this.db, input);
    }

    private addActivity(entityType: string, entityId: string, eventType: string, summary: string): void {
        this.db
            .prepare(
                'INSERT INTO activity_events (id, entity_type, entity_id, event_type, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(randomUUID(), entityType, entityId, eventType, summary.slice(0, 500), now());
    }
}
