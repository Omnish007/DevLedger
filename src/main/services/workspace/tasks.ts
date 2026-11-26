import { randomUUID } from 'node:crypto';
import type {
    PageRequest,
    PageResult,
    TaskInput,
    TaskRecord,
    TaskRelationSummary,
    TaskStatus,
} from '../../../shared/contracts.js';
import { isValidDateOnly } from '../../../domain/date-only.ts';
import { escapeLikeQuery, normalizePage } from '../../../domain/pagination.ts';
import { safeFtsQuery } from '../../../domain/validation.ts';
import { mapTask, nowIso } from './base.ts';
import { WorkspaceNotesService } from './notes.ts';
import { buildTaskRelationSummaries } from './task-relations.ts';
import {
    type TaskTimerContext,
    getActiveTaskTimer,
    heartbeatActiveTaskTimer,
    resolveTaskTimerRecovery,
    startTaskTimer,
    stopTaskTimer,
} from './task-timers.ts';

export class WorkspaceTasksService extends WorkspaceNotesService {
    private timerContext(): TaskTimerContext {
        return {
            db: this.db,
            sessionId: this.sessionId,
            assertTaskExists: (taskId) => this.assertTaskExists(taskId),
            addActivity: (entityType, entityId, eventType, summary) =>
                this.addActivity(entityType, entityId, eventType, summary),
        };
    }

    listTasksPage(input: PageRequest = {}): PageResult<TaskRecord> {
        const { limit, offset, query } = normalizePage(input);
        const projectId = input.projectId ?? null;
        const status = input.status ?? null;
        const normalizedQuery = query.trim().toLocaleLowerCase();
        const likePattern = `%${escapeLikeQuery(normalizedQuery)}%`;
        const match = safeFtsQuery(query);
        const includeCompleted = input.includeCompleted !== false;
        const order = `COALESCE(due_date, date(due_at, 'localtime')) IS NULL,
      COALESCE(due_date, date(due_at, 'localtime')), due_date IS NULL, due_at, created_at`;
        const queryClause =
            normalizedQuery === ''
                ? ''
                : match
                  ? ` AND (id IN (SELECT task_id FROM task_search WHERE task_search MATCH ?) OR lower(title) LIKE ? ESCAPE '\\' OR lower(description) LIKE ? ESCAPE '\\')`
                  : ` AND (lower(title) LIKE ? ESCAPE '\\' OR lower(description) LIKE ? ESCAPE '\\')`;
        const where = `deleted_at IS NULL AND (? IS NULL OR project_id = ?) AND (? IS NULL OR status = ?)${queryClause} AND (? IS NOT NULL OR ? = 1 OR status NOT IN ('completed', 'cancelled'))`;
        const queryParams =
            normalizedQuery === ''
                ? []
                : match
                  ? [match, likePattern, likePattern]
                  : [likePattern, likePattern];
        const params = [
            projectId,
            projectId,
            status,
            status,
            ...queryParams,
            status,
            includeCompleted ? 1 : 0,
        ] as const;
        const totalRow = this.db
            .prepare(`SELECT count(*) AS total FROM tasks WHERE ${where}`)
            .get(...params) as { total: number };
        const rows = this.db
            .prepare(
                `WITH RECURSIVE selected(id) AS (
        SELECT id FROM tasks WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?
      ), ancestors(id) AS (
        SELECT id FROM selected
        UNION
        SELECT parent.parent_id FROM tasks parent JOIN ancestors child ON parent.id = child.id
          WHERE parent.parent_id IS NOT NULL AND parent.deleted_at IS NULL
      )
      SELECT task.* FROM tasks task JOIN ancestors ON ancestors.id = task.id
      WHERE task.deleted_at IS NULL ORDER BY ${order}`,
            )
            .all(...params, limit, offset) as Array<Record<string, unknown>>;
        const items = rows.map(mapTask);
        return {
            items,
            total: Number(totalRow.total),
            limit,
            offset,
            hasMore: offset + limit < Number(totalRow.total),
        };
    }

    getTaskTitles(ids: string[]): Record<string, string> {
        const uniqueIds = [...new Set(ids)]
            .filter((id) => typeof id === 'string' && id.length > 0)
            .slice(0, 200);
        if (uniqueIds.length === 0) return {};
        const placeholders = uniqueIds.map(() => '?').join(',');
        const rows = this.db
            .prepare(`SELECT id, title FROM tasks WHERE id IN (${placeholders}) AND deleted_at IS NULL`)
            .all(...uniqueIds) as Array<{ id: string; title: string }>;
        return Object.fromEntries(rows.map((row) => [String(row.id), String(row.title)]));
    }

    getTaskRelationSummaries(ids: string[]): Record<string, TaskRelationSummary> {
        return buildTaskRelationSummaries(this.db, ids);
    }

    private validateTaskDueDate(dueAt: string | null | undefined, dueDate: string | null | undefined): void {
        if (dueAt && dueDate)
            throw new Error('A task cannot have both a date-only deadline and a timed deadline.');
        if (dueDate && !isValidDateOnly(dueDate))
            throw new Error('Due date must be a valid YYYY-MM-DD calendar date.');
        if (dueAt && !Number.isFinite(Date.parse(dueAt)))
            throw new Error('Due date-time must be a valid timestamp.');
    }

    createTask(input: TaskInput): TaskRecord {
        this.assertProjectExists(input.projectId);
        if (input.parentId) this.assertParent(input.parentId, input.projectId);
        this.validateTaskDueDate(input.dueAt, input.dueDate);
        const id = randomUUID();
        const now = nowIso();
        this.db
            .prepare(
                `INSERT INTO tasks (id, project_id, parent_id, title, description, priority, due_at, due_date,
      estimate_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
                id,
                input.projectId,
                input.parentId ?? null,
                input.title.trim(),
                input.description?.trim() ?? '',
                input.priority ?? 'medium',
                input.dueAt ?? null,
                input.dueDate ?? null,
                input.estimateMinutes ?? null,
                now,
                now,
            );
        this.addActivity('task', id, 'created', `Created task ${input.title.trim()}`);
        const task = this.getTask(id);
        if (!task) throw new Error('Task creation could not be verified.');
        return task;
    }

    updateTask(id: string, input: Partial<TaskInput> & { status?: TaskStatus | undefined }): TaskRecord {
        const existing = this.db
            .prepare('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL')
            .get(id) as Record<string, unknown> | undefined;
        if (!existing) throw new Error('Task not found.');
        const projectId = input.projectId ?? String(existing['project_id']);
        const parentId =
            input.parentId === undefined
                ? existing['parent_id']
                    ? String(existing['parent_id'])
                    : null
                : input.parentId;
        this.assertProjectExists(projectId);
        if (parentId) this.assertParent(parentId, projectId, id);
        if (parentId) {
            const cycle = this.db
                .prepare(
                    `WITH RECURSIVE ancestor_chain(id, parent_id) AS (
          SELECT id, parent_id FROM tasks WHERE id = ? AND deleted_at IS NULL
          UNION
          SELECT parent.id, parent.parent_id FROM tasks parent
            JOIN ancestor_chain child ON parent.id = child.parent_id
            WHERE parent.deleted_at IS NULL
        )
        SELECT 1 AS creates_cycle FROM ancestor_chain WHERE id = ? LIMIT 1`,
                )
                .get(parentId, id) as { creates_cycle: number } | undefined;
            if (cycle) throw new Error('A task cannot become its own ancestor.');
        }

        const dueWasChanged = input.dueAt !== undefined || input.dueDate !== undefined;
        const nextDueAt = dueWasChanged
            ? (input.dueAt ?? null)
            : existing['due_at']
              ? String(existing['due_at'])
              : null;
        const nextDueDate = dueWasChanged
            ? (input.dueDate ?? null)
            : existing['due_date']
              ? String(existing['due_date'])
              : null;
        this.validateTaskDueDate(nextDueAt, nextDueDate);
        const next = {
            title: input.title?.trim() ?? String(existing['title']),
            description: input.description?.trim() ?? String(existing['description']),
            status: input.status ?? existing['status'],
            priority: input.priority ?? existing['priority'],
            dueAt: nextDueAt,
            dueDate: nextDueDate,
            estimateMinutes:
                input.estimateMinutes === undefined ? existing['estimate_minutes'] : input.estimateMinutes,
        };
        this.db
            .prepare(
                `UPDATE tasks SET project_id = ?, parent_id = ?, title = ?, description = ?, status = ?,
      priority = ?, due_at = ?, due_date = ?, estimate_minutes = ?, updated_at = ? WHERE id = ?`,
            )
            .run(
                projectId,
                parentId,
                next.title,
                next.description,
                next.status,
                next.priority,
                next.dueAt,
                next.dueDate,
                next.estimateMinutes ?? null,
                nowIso(),
                id,
            );
        this.addActivity('task', id, 'updated', `Updated task ${next.title}`);
        const task = this.getTask(id);
        if (!task) throw new Error('Task update could not be verified.');
        return task;
    }

    removeTask(id: string): void {
        const now = nowIso();
        const result = this.db
            .prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
            .run(now, now, id);
        if (result.changes === 0) throw new Error('Task not found.');
        this.addActivity('task', id, 'deleted', 'Moved task to trash');
    }

    startTimer(taskId: string): string {
        return startTaskTimer(this.timerContext(), taskId);
    }
    stopTimer(taskId: string): number {
        return stopTaskTimer(this.timerContext(), taskId);
    }
    getActiveTimer() {
        return getActiveTaskTimer(this.timerContext());
    }
    heartbeatActiveTimer(at = nowIso()): void {
        heartbeatActiveTaskTimer(this.timerContext(), at);
    }
    resolveTimerRecovery(taskId: string, action: 'resume' | 'stop' | 'discard', endedAt?: string): void {
        resolveTaskTimerRecovery(this.timerContext(), taskId, action, endedAt);
    }
}
