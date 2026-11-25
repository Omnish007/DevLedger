import type { DashboardSummary } from '../../../shared/contracts.js';
import { WorkspaceTasksService } from './tasks.ts';

import { nowIso, mapNote, mapTask } from './base.ts';

export class WorkspaceDashboardService extends WorkspaceTasksService {
    getSettings(): Record<string, unknown> {
        const rows = this.db.prepare('SELECT key, value_json FROM app_settings').all() as Array<{
            key: string;
            value_json: string;
        }>;
        return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value_json) as unknown]));
    }

    setSetting(key: string, value: unknown): void {
        if (!/^[a-z][a-z0-9_.-]{0,63}$/i.test(key)) throw new Error('Invalid settings key.');
        const json = JSON.stringify(value);
        if (json.length > 20_000) throw new Error('Settings values must be smaller than 20 KB.');
        this.db
            .prepare(
                `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
            )
            .run(key, json, nowIso());
    }

    dashboardSummary(): DashboardSummary {
        const now = nowIso();
        const activeProjects = this.scalar(
            "SELECT count(*) FROM projects WHERE status = 'active' AND deleted_at IS NULL",
        );
        const openTasks = this.scalar(
            "SELECT count(*) FROM tasks WHERE status NOT IN ('completed', 'cancelled') AND deleted_at IS NULL",
        );
        const overdueTasks = this.scalar(
            `SELECT count(*) FROM tasks WHERE status NOT IN ('completed', 'cancelled') AND deleted_at IS NULL
      AND ((due_date IS NOT NULL AND due_date < date('now', 'localtime')) OR (due_date IS NULL AND due_at IS NOT NULL AND due_at < ?))`,
            [now],
        );
        const blockedTasks = this.scalar(
            "SELECT count(*) FROM tasks WHERE status = 'blocked' AND deleted_at IS NULL",
        );
        const activeTimers = this.scalar('SELECT count(*) FROM time_entries WHERE is_active = 1');
        const pendingDocuments = this.scalar(
            "SELECT count(*) FROM documents WHERE status IN ('queued', 'extracting', 'needs_attention') AND deleted_at IS NULL",
        );
        // Fetch only the six dashboard cards. Avoid loading every note body into main-process memory.
        const recentNotes = (
            this.db
                .prepare(
                    `SELECT id, project_id, title, substr(content, 1, 600) AS content, created_at, updated_at, locked
      FROM notes WHERE deleted_at IS NULL AND locked = 0 ORDER BY updated_at DESC LIMIT 6`,
                )
                .all() as Array<Record<string, unknown>>
        ).map(mapNote);
        const upcomingTasks = (
            this.db
                .prepare(
                    `SELECT * FROM tasks WHERE deleted_at IS NULL
      AND status NOT IN ('completed', 'cancelled')
      AND ((due_date IS NOT NULL AND due_date >= date('now', 'localtime')) OR (due_date IS NULL AND due_at IS NOT NULL AND due_at >= ?))
      ORDER BY COALESCE(due_date, date(due_at, 'localtime')) ASC, due_date IS NULL, due_at ASC LIMIT 8`,
                )
                .all(now) as Array<Record<string, unknown>>
        ).map(mapTask);
        return {
            activeProjects,
            openTasks,
            overdueTasks,
            blockedTasks,
            recentNotes,
            upcomingTasks,
            activeTimers,
            pendingDocuments,
        };
    }
}
