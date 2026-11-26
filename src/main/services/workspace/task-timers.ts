import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { elapsedMinutes } from '../../../domain/task-rules.ts';
import type { ActiveTimerRecord } from '../../../shared/contracts.js';
import { nowIso } from './base.ts';

export interface TaskTimerContext {
    db: Database.Database;
    sessionId: string;
    assertTaskExists: (taskId: string) => void;
    addActivity: (entityType: string, entityId: string, eventType: string, summary: string) => void;
}

export function startTaskTimer(context: TaskTimerContext, taskId: string): string {
    context.assertTaskExists(taskId);
    const active = context.db.prepare('SELECT id, task_id FROM time_entries WHERE is_active = 1').get() as
        { id: string; task_id: string } | undefined;
    if (active) {
        if (active.task_id === taskId) throw new Error('The timer is already running for this task.');
        throw new Error('Another task timer is already running. Stop it before starting a new one.');
    }
    const id = randomUUID();
    const startedAt = nowIso();
    context.db
        .prepare(
            `INSERT INTO time_entries (id, task_id, started_at, is_active, created_at, active_session_id, heartbeat_at)
      VALUES (?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(id, taskId, startedAt, startedAt, context.sessionId, startedAt);
    context.addActivity('task', taskId, 'timer_started', 'Started task timer');
    return id;
}

export function stopTaskTimer(context: TaskTimerContext, taskId: string): number {
    const active = context.db
        .prepare(
            'SELECT id, started_at, active_session_id FROM time_entries WHERE task_id = ? AND is_active = 1',
        )
        .get(taskId) as { id: string; started_at: string; active_session_id: string | null } | undefined;
    if (!active) throw new Error('No active timer exists for this task.');
    if (active.active_session_id !== context.sessionId)
        throw new Error('Recover the interrupted timer before stopping it.');
    const endedAt = nowIso();
    const seconds = Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(active.started_at)) / 1_000));
    context.db
        .prepare(
            'UPDATE time_entries SET ended_at = ?, duration_seconds = ?, is_active = 0 WHERE id = ? AND is_active = 1',
        )
        .run(endedAt, seconds, active.id);
    context.addActivity(
        'task',
        taskId,
        'timer_stopped',
        `Stopped timer after ${elapsedMinutes(active.started_at, endedAt)} minutes`,
    );
    return seconds;
}

export function getActiveTaskTimer(context: TaskTimerContext): ActiveTimerRecord | null {
    const row = context.db
        .prepare(
            'SELECT task_id, started_at, active_session_id, heartbeat_at FROM time_entries WHERE is_active = 1 LIMIT 1',
        )
        .get() as
        | {
              task_id: string;
              started_at: string;
              active_session_id: string | null;
              heartbeat_at: string | null;
          }
        | undefined;
    if (!row) return null;
    const lastHeartbeatAt = row.heartbeat_at ?? row.started_at;
    const staleHeartbeat = Date.now() - Date.parse(lastHeartbeatAt) > 120_000;
    return {
        taskId: row.task_id,
        startedAt: row.started_at,
        lastHeartbeatAt: row.heartbeat_at,
        recoveryRequired: row.active_session_id !== context.sessionId || staleHeartbeat,
    };
}

export function heartbeatActiveTaskTimer(context: TaskTimerContext, at = nowIso()): void {
    const state = context.db as unknown as { open?: boolean | (() => void); isOpen?: boolean };
    if (state.open === false || state.isOpen === false) return;
    context.db
        .prepare('UPDATE time_entries SET heartbeat_at = ? WHERE is_active = 1 AND active_session_id = ?')
        .run(at, context.sessionId);
}

export function resolveTaskTimerRecovery(
    context: TaskTimerContext,
    taskId: string,
    action: 'resume' | 'stop' | 'discard',
    endedAt?: string,
): void {
    const activeTimer = getActiveTaskTimer(context);
    if (!activeTimer || activeTimer.taskId !== taskId || !activeTimer.recoveryRequired)
        throw new Error('No interrupted timer requires recovery.');
    const entry = context.db
        .prepare(
            'SELECT id, started_at, heartbeat_at, recovery_acknowledged_at FROM time_entries WHERE task_id = ? AND is_active = 1',
        )
        .get(taskId) as
        | {
              id: string;
              started_at: string;
              heartbeat_at: string | null;
              recovery_acknowledged_at: string | null;
          }
        | undefined;
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
        const resume = context.db.transaction(() => {
            context.db
                .prepare(
                    'UPDATE time_entries SET ended_at = ?, duration_seconds = ?, is_active = 0, recovery_acknowledged_at = ? WHERE id = ? AND is_active = 1',
                )
                .run(checkpointIso, seconds, timestamp, entry.id);
            context.db
                .prepare(
                    `INSERT INTO time_entries (id, task_id, started_at, is_active, created_at, active_session_id, heartbeat_at)
          VALUES (?, ?, ?, 1, ?, ?, ?)`,
                )
                .run(nextId, taskId, timestamp, timestamp, context.sessionId, timestamp);
        });
        resume.immediate();
        context.addActivity(
            'task',
            taskId,
            'timer_recovery_resumed',
            'Recovered the previous session through its last saved checkpoint and resumed from now; closed-app time was excluded',
        );
        return;
    }
    if (action === 'discard') {
        context.db.prepare('DELETE FROM time_entries WHERE id = ? AND is_active = 1').run(entry.id);
        context.addActivity(
            'task',
            taskId,
            'timer_recovery_discarded',
            'Discarded an unconfirmed timer session after restart',
        );
        return;
    }
    const end = endedAt ? Date.parse(endedAt) : Number.NaN;
    const start = Date.parse(entry.started_at);
    if (!Number.isFinite(end) || end < start || end > Date.now() + 5_000) {
        throw new Error('Choose a recovery end time between the timer start and the current time.');
    }
    const endIso = new Date(end).toISOString();
    const seconds = Math.floor((end - start) / 1_000);
    context.db
        .prepare(
            'UPDATE time_entries SET ended_at = ?, duration_seconds = ?, is_active = 0, recovery_acknowledged_at = ? WHERE id = ? AND is_active = 1',
        )
        .run(endIso, seconds, timestamp, entry.id);
    context.addActivity(
        'task',
        taskId,
        'timer_recovery_stopped',
        `Recovered timer with a confirmed ${elapsedMinutes(entry.started_at, endIso)} minute session`,
    );
}
