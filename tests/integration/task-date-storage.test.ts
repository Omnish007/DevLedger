import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { WorkspaceService } from '../../src/main/services/workspace.ts';
import { addTransactionAdapter } from './sqlite-transaction-adapter.ts';

function migrate(db: DatabaseSync, throughVersion = Number.POSITIVE_INFINITY) {
    db.exec('PRAGMA foreign_keys = ON');
    const currentVersion = Number(
        (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    );
    for (const migration of MIGRATIONS.filter(
        (item) => item.version > currentVersion && item.version <= throughVersion,
    )) {
        db.exec('BEGIN IMMEDIATE');
        try {
            db.exec(migration.sql);
            db.exec(`PRAGMA user_version = ${migration.version}`);
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }
}

test('date-only task deadlines remain separate from timestamp deadlines through service CRUD', () => {
    const db = new DatabaseSync(':memory:');
    try {
        migrate(db);
        const now = new Date().toISOString();
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('project-date-test', 'Date storage test', 'greenfield', now, now);
        const service = new WorkspaceService(db as never);

        const dateOnly = service.createTask({
            projectId: 'project-date-test',
            title: 'Date-only deadline',
            dueDate: '2026-02-01',
        });
        assert.equal(dateOnly.dueDate, '2026-02-01');
        assert.equal(dateOnly.dueAt, null);

        const timed = service.createTask({
            projectId: 'project-date-test',
            title: 'Timed deadline',
            dueAt: '2026-02-01T13:25:00.000Z',
        });
        assert.equal(timed.dueDate, null);
        assert.equal(timed.dueAt, '2026-02-01T13:25:00.000Z');

        const updated = service.updateTask(dateOnly.id, { dueAt: '2026-02-02T08:00:00.000Z', dueDate: null });
        assert.equal(updated.dueDate, null);
        assert.equal(updated.dueAt, '2026-02-02T08:00:00.000Z');

        assert.throws(
            () =>
                service.createTask({
                    projectId: 'project-date-test',
                    title: 'Invalid date',
                    dueDate: '2026-02-30',
                }),
            /valid YYYY-MM-DD/,
        );
        assert.throws(
            () =>
                service.createTask({
                    projectId: 'project-date-test',
                    title: 'Ambiguous deadline',
                    dueDate: '2026-02-01',
                    dueAt: '2026-02-01T13:25:00.000Z',
                }),
            /cannot have both/,
        );
    } finally {
        db.close();
    }
});

test('schema v8 preserves existing UTC due_at values and does not guess their original local dates', () => {
    const db = new DatabaseSync(':memory:');
    try {
        migrate(db, 7);
        const now = new Date().toISOString();
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('legacy-project', 'Legacy project', 'ongoing', now, now);
        db.prepare(
            'INSERT INTO tasks (id, project_id, title, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run('legacy-task', 'legacy-project', 'Legacy timestamp task', '2026-02-01T18:30:00.000Z', now, now);
        migrate(db);
        const row = db.prepare('SELECT due_at, due_date FROM tasks WHERE id = ?').get('legacy-task') as {
            due_at: string;
            due_date: string | null;
        };
        assert.equal(row.due_at, '2026-02-01T18:30:00.000Z');
        assert.equal(row.due_date, null);
    } finally {
        db.close();
    }
});

test('dashboard overdue and upcoming counts respect local date-only deadlines and UTC time deadlines', () => {
    const db = new DatabaseSync(':memory:');
    try {
        migrate(db);
        const now = new Date().toISOString();
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('dashboard-date-project', 'Dashboard date test', 'greenfield', now, now);
        const service = new WorkspaceService(db as never);
        const localDate = (offset: number) => {
            const date = new Date();
            date.setHours(12, 0, 0, 0);
            date.setDate(date.getDate() + offset);
            return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };
        const oldDate = service.createTask({
            projectId: 'dashboard-date-project',
            title: 'Yesterday date-only',
            dueDate: localDate(-1),
        });
        const todayDate = service.createTask({
            projectId: 'dashboard-date-project',
            title: 'Today date-only',
            dueDate: localDate(0),
        });
        const overdueTime = service.createTask({
            projectId: 'dashboard-date-project',
            title: 'Past timestamp',
            dueAt: new Date(Date.now() - 60_000).toISOString(),
        });
        const futureTime = service.createTask({
            projectId: 'dashboard-date-project',
            title: 'Future timestamp',
            dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        });

        const summary = service.dashboardSummary();
        assert.equal(summary.overdueTasks, 2);
        const upcomingIds = new Set(summary.upcomingTasks.map((task) => task.id));
        assert.equal(upcomingIds.has(oldDate.id), false);
        assert.equal(upcomingIds.has(todayDate.id), true);
        assert.equal(upcomingIds.has(overdueTime.id), false);
        assert.equal(upcomingIds.has(futureTime.id), true);
    } finally {
        db.close();
    }
});

test('active timer from a previous app session requires explicit recovery and supports corrected end time', () => {
    const db = new DatabaseSync(':memory:');
    try {
        migrate(db);
        const now = new Date().toISOString();
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('timer-recovery-project', 'Timer recovery project', 'ongoing', now, now);
        db.prepare(
            'INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('timer-recovery-task', 'timer-recovery-project', 'Interrupted timer', now, now);
        const startedAt = new Date(Date.now() - 3_600_000).toISOString();
        db.prepare(
            'INSERT INTO time_entries (id, task_id, started_at, is_active, created_at) VALUES (?, ?, ?, 1, ?)',
        ).run('timer-recovery-entry', 'timer-recovery-task', startedAt, startedAt);

        const restartedService = new WorkspaceService(db as never);
        assert.equal(restartedService.getActiveTimer()?.recoveryRequired, true);
        const correctedEnd = new Date(Date.now() - 10 * 60_000).toISOString();
        restartedService.resolveTimerRecovery('timer-recovery-task', 'stop', correctedEnd);
        assert.equal(restartedService.getActiveTimer(), null);
        const entry = db
            .prepare('SELECT is_active, ended_at, duration_seconds FROM time_entries WHERE id = ?')
            .get('timer-recovery-entry') as { is_active: number; ended_at: string; duration_seconds: number };
        assert.equal(entry.is_active, 0);
        assert.equal(entry.ended_at, correctedEnd);
        assert.ok(entry.duration_seconds >= 2_900 && entry.duration_seconds <= 3_100);
    } finally {
        db.close();
    }
});

test('user can explicitly resume or discard a previous session timer', () => {
    const db = addTransactionAdapter(new DatabaseSync(':memory:'));
    try {
        migrate(db);
        const now = new Date().toISOString();
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('timer-choice-project', 'Timer choice project', 'ongoing', now, now);
        db.prepare(
            'INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('timer-choice-task', 'timer-choice-project', 'Timer choice', now, now);
        const startedAt = new Date(Date.now() - 90_000).toISOString();
        db.prepare(
            'INSERT INTO time_entries (id, task_id, started_at, is_active, created_at) VALUES (?, ?, ?, 1, ?)',
        ).run('timer-choice-entry', 'timer-choice-task', startedAt, startedAt);
        const service = new WorkspaceService(db as never);
        db.prepare('UPDATE time_entries SET active_session_id = ?, heartbeat_at = ? WHERE id = ?').run(
            'stale-current-session',
            new Date(Date.now() - 180_000).toISOString(),
            'timer-choice-entry',
        );
        assert.equal(service.getActiveTimer()?.recoveryRequired, true);
        db.prepare('UPDATE time_entries SET heartbeat_at = ? WHERE id = ?').run(
            new Date(Date.now() - 30_000).toISOString(),
            'timer-choice-entry',
        );
        service.resolveTimerRecovery('timer-choice-task', 'resume');
        const resumedTimer = service.getActiveTimer();
        assert.equal(resumedTimer?.recoveryRequired, false);
        assert.ok(Date.now() - Date.parse(resumedTimer!.startedAt) < 2_000);
        const priorEntry = db
            .prepare('SELECT is_active, duration_seconds FROM time_entries WHERE id = ?')
            .get('timer-choice-entry') as { is_active: number; duration_seconds: number };
        assert.equal(priorEntry.is_active, 0);
        assert.ok(priorEntry.duration_seconds >= 59 && priorEntry.duration_seconds <= 61);
        const nextProcessService = new WorkspaceService(db as never);
        assert.equal(nextProcessService.getActiveTimer()?.recoveryRequired, true);
        nextProcessService.resolveTimerRecovery('timer-choice-task', 'discard');
        assert.equal(nextProcessService.getActiveTimer(), null);
    } finally {
        db.close();
    }
});
