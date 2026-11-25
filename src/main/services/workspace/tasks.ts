import { randomUUID } from 'node:crypto';
import type { TaskInput, TaskRecord, TaskStatus, PageRequest, PageResult } from '../../../shared/contracts.js';
import { normalizePage, escapeLikeQuery } from '../../../domain/pagination.ts';
import { safeFtsQuery } from '../../../domain/validation.ts';
import { elapsedMinutes } from '../../../domain/task-rules.ts';
import { isValidDateOnly } from '../../../domain/date-only.ts';
import { WorkspaceNotesService } from './notes.ts';

import { nowIso, mapTask } from './base.ts';

export class WorkspaceTasksService extends WorkspaceNotesService {
  listTasksPage(input: PageRequest = {}): PageResult<TaskRecord> {
    const { limit, offset, query } = normalizePage(input);
    const projectId = input.projectId ?? null;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const titleLike = `%${escapeLikeQuery(normalizedQuery)}%`;
    const match = safeFtsQuery(query);
    const includeCompleted = input.includeCompleted !== false;
    const order = `COALESCE(due_date, date(due_at, 'localtime')) IS NULL,
      COALESCE(due_date, date(due_at, 'localtime')), due_date IS NULL, due_at, created_at`;
    const queryClause = normalizedQuery === ''
      ? ''
      : match
        ? ` AND (id IN (SELECT task_id FROM task_search WHERE task_search MATCH ?) OR lower(title) LIKE ? ESCAPE '\\')`
        : ` AND lower(title) LIKE ? ESCAPE '\\'`;
    const where = `deleted_at IS NULL AND (? IS NULL OR project_id = ?)${queryClause} AND (? = 1 OR status NOT IN ('completed', 'cancelled'))`;
    const queryParams = normalizedQuery === '' ? [] : match ? [match, titleLike] : [titleLike];
    const params = [projectId, projectId, ...queryParams, includeCompleted ? 1 : 0] as const;
    const totalRow = this.db.prepare(`SELECT count(*) AS total FROM tasks WHERE ${where}`).get(...params) as { total: number };
    const rows = this.db.prepare(`WITH RECURSIVE selected(id) AS (
        SELECT id FROM tasks WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?
      ), ancestors(id) AS (
        SELECT id FROM selected
        UNION
        SELECT parent.parent_id FROM tasks parent JOIN ancestors child ON parent.id = child.id
          WHERE parent.parent_id IS NOT NULL AND parent.deleted_at IS NULL
      )
      SELECT task.* FROM tasks task JOIN ancestors ON ancestors.id = task.id
      WHERE task.deleted_at IS NULL ORDER BY ${order}`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    const items = rows.map(mapTask);
    return { items, total: Number(totalRow.total), limit, offset, hasMore: offset + limit < Number(totalRow.total) };
  }

  getTaskTitles(ids: string[]): Record<string, string> {
    const uniqueIds = [...new Set(ids)].filter((id) => typeof id === 'string' && id.length > 0).slice(0, 200);
    if (uniqueIds.length === 0) return {};
    const placeholders = uniqueIds.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT id, title FROM tasks WHERE id IN (${placeholders}) AND deleted_at IS NULL`).all(...uniqueIds) as Array<{ id: string; title: string }>;
    return Object.fromEntries(rows.map((row) => [String(row.id), String(row.title)]));
  }


  private validateTaskDueDate(dueAt: string | null | undefined, dueDate: string | null | undefined): void {
    if (dueAt && dueDate) throw new Error('A task cannot have both a date-only deadline and a timed deadline.');
    if (dueDate && !isValidDateOnly(dueDate)) throw new Error('Due date must be a valid YYYY-MM-DD calendar date.');
    if (dueAt && !Number.isFinite(Date.parse(dueAt))) throw new Error('Due date-time must be a valid timestamp.');
  }

  createTask(input: TaskInput): TaskRecord {
    this.assertProjectExists(input.projectId);
    if (input.parentId) this.assertParent(input.parentId, input.projectId);
    this.validateTaskDueDate(input.dueAt, input.dueDate);
    const id = randomUUID();
    const now = nowIso();
    this.db.prepare(`INSERT INTO tasks (id, project_id, parent_id, title, description, priority, due_at, due_date,
      estimate_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.projectId, input.parentId ?? null, input.title.trim(), input.description?.trim() ?? '',
        input.priority ?? 'medium', input.dueAt ?? null, input.dueDate ?? null, input.estimateMinutes ?? null, now, now);
    this.addActivity('task', id, 'created', `Created task ${input.title.trim()}`);
    const task = this.getTask(id);
    if (!task) throw new Error('Task creation could not be verified.');
    return task;
  }

  updateTask(id: string, input: Partial<TaskInput> & { status?: TaskStatus }): TaskRecord {
    const existing = this.db.prepare('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined;
    if (!existing) throw new Error('Task not found.');
    const projectId = input.projectId ?? String(existing['project_id']);
    const parentId = input.parentId === undefined ? (existing['parent_id'] ? String(existing['parent_id']) : null) : input.parentId;
    this.assertProjectExists(projectId);
    if (parentId) this.assertParent(parentId, projectId, id);
    if (parentId) {
      const cycle = this.db.prepare(`WITH RECURSIVE ancestor_chain(id, parent_id) AS (
          SELECT id, parent_id FROM tasks WHERE id = ? AND deleted_at IS NULL
          UNION
          SELECT parent.id, parent.parent_id FROM tasks parent
            JOIN ancestor_chain child ON parent.id = child.parent_id
            WHERE parent.deleted_at IS NULL
        )
        SELECT 1 AS creates_cycle FROM ancestor_chain WHERE id = ? LIMIT 1`)
        .get(parentId, id) as { creates_cycle: number } | undefined;
      if (cycle) throw new Error('A task cannot become its own ancestor.');
    }

    const dueWasChanged = input.dueAt !== undefined || input.dueDate !== undefined;
    const nextDueAt = dueWasChanged ? (input.dueAt ?? null) : (existing['due_at'] ? String(existing['due_at']) : null);
    const nextDueDate = dueWasChanged ? (input.dueDate ?? null) : (existing['due_date'] ? String(existing['due_date']) : null);
    this.validateTaskDueDate(nextDueAt, nextDueDate);
    const next = {
      title: input.title?.trim() ?? String(existing['title']),
      description: input.description?.trim() ?? String(existing['description']),
      status: input.status ?? existing['status'],
      priority: input.priority ?? existing['priority'],
      dueAt: nextDueAt,
      dueDate: nextDueDate,
      estimateMinutes: input.estimateMinutes === undefined ? existing['estimate_minutes'] : input.estimateMinutes,
    };
    this.db.prepare(`UPDATE tasks SET project_id = ?, parent_id = ?, title = ?, description = ?, status = ?,
      priority = ?, due_at = ?, due_date = ?, estimate_minutes = ?, updated_at = ? WHERE id = ?`)
      .run(projectId, parentId, next.title, next.description, next.status, next.priority, next.dueAt,
        next.dueDate, next.estimateMinutes ?? null, nowIso(), id);
    this.addActivity('task', id, 'updated', `Updated task ${next.title}`);
    const task = this.getTask(id);
    if (!task) throw new Error('Task update could not be verified.');
    return task;
  }

  removeTask(id: string): void {
    const now = nowIso();
    const result = this.db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(now, now, id);
    if (result.changes === 0) throw new Error('Task not found.');
    this.addActivity('task', id, 'deleted', 'Moved task to trash');
  }

  startTimer(taskId: string): string {
    this.assertTaskExists(taskId);
    const active = this.db.prepare('SELECT id, task_id FROM time_entries WHERE is_active = 1').get() as { id: string; task_id: string } | undefined;
    if (active) {
      if (active.task_id === taskId) throw new Error('The timer is already running for this task.');
      throw new Error('Another task timer is already running. Stop it before starting a new one.');
    }
    const id = randomUUID();
    const startedAt = nowIso();
    this.db.prepare(`INSERT INTO time_entries (id, task_id, started_at, is_active, created_at, active_session_id, heartbeat_at)
      VALUES (?, ?, ?, 1, ?, ?, ?)`)
      .run(id, taskId, startedAt, startedAt, this.sessionId, startedAt);
    this.addActivity('task', taskId, 'timer_started', 'Started task timer');
    return id;
  }

  stopTimer(taskId: string): number {
    const active = this.db.prepare('SELECT id, started_at, active_session_id FROM time_entries WHERE task_id = ? AND is_active = 1').get(taskId) as { id: string; started_at: string; active_session_id: string | null } | undefined;
    if (!active) throw new Error('No active timer exists for this task.');
    if (active.active_session_id !== this.sessionId) throw new Error('Recover the interrupted timer before stopping it.');
    const endedAt = nowIso();
    const seconds = Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(active.started_at)) / 1_000));
    this.db.prepare('UPDATE time_entries SET ended_at = ?, duration_seconds = ?, is_active = 0 WHERE id = ? AND is_active = 1')
      .run(endedAt, seconds, active.id);
    this.addActivity('task', taskId, 'timer_stopped', `Stopped timer after ${elapsedMinutes(active.started_at, endedAt)} minutes`);
    return seconds;
  }

  getActiveTimer(): { taskId: string; startedAt: string; lastHeartbeatAt: string | null; recoveryRequired: boolean } | null {
    const row = this.db.prepare('SELECT task_id, started_at, active_session_id, heartbeat_at FROM time_entries WHERE is_active = 1 LIMIT 1').get() as { task_id: string; started_at: string; active_session_id: string | null; heartbeat_at: string | null } | undefined;
    if (!row) return null;
    const lastHeartbeatAt = row.heartbeat_at ?? row.started_at;
    const staleHeartbeat = Date.now() - Date.parse(lastHeartbeatAt) > 120_000;
    return { taskId: row.task_id, startedAt: row.started_at, lastHeartbeatAt: row.heartbeat_at, recoveryRequired: row.active_session_id !== this.sessionId || staleHeartbeat };
  }

  heartbeatActiveTimer(at = nowIso()): void {
    const state = this.db as unknown as { open?: boolean | (() => void); isOpen?: boolean };
    if (state.open === false || state.isOpen === false) return;
    this.db.prepare('UPDATE time_entries SET heartbeat_at = ? WHERE is_active = 1 AND active_session_id = ?')
      .run(at, this.sessionId);
  }

  resolveTimerRecovery(taskId: string, action: 'resume' | 'stop' | 'discard', endedAt?: string): void {
    const activeTimer = this.getActiveTimer();
    if (!activeTimer || activeTimer.taskId !== taskId || !activeTimer.recoveryRequired) throw new Error('No interrupted timer requires recovery.');
    const entry = this.db.prepare('SELECT id, started_at, heartbeat_at, recovery_acknowledged_at FROM time_entries WHERE task_id = ? AND is_active = 1').get(taskId) as { id: string; started_at: string; heartbeat_at: string | null; recovery_acknowledged_at: string | null } | undefined;
    if (!entry) throw new Error('No active timer requires recovery.');
    const timestamp = nowIso();
    if (action === 'resume') {
      // Close the last known session at its persisted heartbeat, then start a fresh
      // session now. Time while the app was closed is never silently accumulated.
      const checkpoint = entry.heartbeat_at ?? entry.recovery_acknowledged_at ?? entry.started_at;
      const checkpointMs = Math.max(Date.parse(entry.started_at), Date.parse(checkpoint));
      const checkpointIso = new Date(checkpointMs).toISOString();
      const seconds = Math.max(0, Math.floor((checkpointMs - Date.parse(entry.started_at)) / 1_000));
      const nextId = randomUUID();
      const resume = this.db.transaction(() => {
        this.db.prepare('UPDATE time_entries SET ended_at = ?, duration_seconds = ?, is_active = 0, recovery_acknowledged_at = ? WHERE id = ? AND is_active = 1')
          .run(checkpointIso, seconds, timestamp, entry.id);
        this.db.prepare(`INSERT INTO time_entries (id, task_id, started_at, is_active, created_at, active_session_id, heartbeat_at)
          VALUES (?, ?, ?, 1, ?, ?, ?)`)
          .run(nextId, taskId, timestamp, timestamp, this.sessionId, timestamp);
      });
      resume.immediate();
      this.addActivity('task', taskId, 'timer_recovery_resumed', 'Recovered the previous session through its last saved checkpoint and resumed from now; closed-app time was excluded');
      return;
    }
    if (action === 'discard') {
      this.db.prepare('DELETE FROM time_entries WHERE id = ? AND is_active = 1').run(entry.id);
      this.addActivity('task', taskId, 'timer_recovery_discarded', 'Discarded an unconfirmed timer session after restart');
      return;
    }
    const end = endedAt ? Date.parse(endedAt) : Number.NaN;
    const start = Date.parse(entry.started_at);
    if (!Number.isFinite(end) || end < start || end > Date.now() + 5_000) {
      throw new Error('Choose a recovery end time between the timer start and the current time.');
    }
    const endIso = new Date(end).toISOString();
    const seconds = Math.floor((end - start) / 1_000);
    this.db.prepare('UPDATE time_entries SET ended_at = ?, duration_seconds = ?, is_active = 0, recovery_acknowledged_at = ? WHERE id = ? AND is_active = 1')
      .run(endIso, seconds, timestamp, entry.id);
    this.addActivity('task', taskId, 'timer_recovery_stopped', `Recovered timer with a confirmed ${elapsedMinutes(entry.started_at, endIso)} minute session`);
  }

}
