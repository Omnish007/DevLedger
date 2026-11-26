import type {
    ActivityRecord,
    DashboardActiveTimerDetail,
    DashboardBlockedItem,
    DashboardChecklistItem,
    DashboardReminderItem,
    DashboardSummary,
    ReminderRecord,
} from '../../../shared/contracts.js';
import { stripHtmlToPlainText } from '../../../domain/html-text.ts';
import { resolveRecordSummaries } from '../operations-mappers.ts';
import { WorkspaceTasksService } from './tasks.ts';

import { listAppSettings, writeAppSetting } from '../app-settings-store.ts';
import { nowIso, mapNote, mapTask } from './base.ts';

function extractOpenNoteChecklists(
    noteId: string,
    noteTitle: string,
    projectId: string | null,
    content: string,
    updatedAt: string,
    maxPerNote = 3,
): DashboardChecklistItem[] {
    const found: DashboardChecklistItem[] = [];
    const seen = new Set<string>();
    const pushItem = (raw: string) => {
        const clean = stripHtmlToPlainText(raw).replace(/\s+/g, ' ').trim();
        if (!clean || clean.length < 2) return;
        const truncated = clean.length > 120 ? `${clean.slice(0, 117)}…` : clean;
        if (seen.has(truncated)) return;
        seen.add(truncated);
        found.push({
            noteId,
            noteTitle: noteTitle || 'Untitled note',
            projectId,
            text: truncated,
            updatedAt,
        });
    };

    if (content.includes('data-checked')) {
        const parts = content.split(/<li\b/i).slice(1);
        for (const part of parts) {
            if (!/^[^>]*data-checked=["']false["']/i.test(part)) continue;
            const gt = part.indexOf('>');
            if (gt < 0) continue;
            const inner = part.slice(gt + 1).split(/<(?:ul|ol|\/li)\b/i)[0] ?? '';
            pushItem(inner);
            if (found.length >= maxPerNote) return found;
        }
    }

    for (const line of content.split(/\r?\n/)) {
        const match = /^\s*[-*]\s*\[\s\]\s+(.+)$/.exec(line);
        if (!match) continue;
        pushItem(match[1]!);
        if (found.length >= maxPerNote) break;
    }
    return found;
}

export class WorkspaceDashboardService extends WorkspaceTasksService {
    getSettings(): Record<string, unknown> {
        return listAppSettings(this.db);
    }

    setSetting(key: string, value: unknown): void {
        if (!/^[a-z][a-z0-9_.-]{0,63}$/i.test(key)) throw new Error('Invalid settings key.');
        const json = JSON.stringify(value);
        if (json.length > 20_000) throw new Error('Settings values must be smaller than 20 KB.');
        writeAppSetting(this.db, key, value, nowIso());
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
            `SELECT count(DISTINCT t.id) FROM tasks t
             LEFT JOIN task_blockers tb ON tb.task_id = t.id AND tb.resolved_at IS NULL
             WHERE t.deleted_at IS NULL AND t.status NOT IN ('completed', 'cancelled')
               AND (t.status = 'blocked' OR tb.id IS NOT NULL)`,
        );
        const activeTimers = this.scalar('SELECT count(*) FROM time_entries WHERE is_active = 1');
        const pendingDocuments = this.scalar(
            "SELECT count(*) FROM documents WHERE status IN ('queued', 'extracting', 'needs_attention') AND deleted_at IS NULL",
        );
        const attentionDocumentCount = this.scalar(
            "SELECT count(*) FROM documents WHERE status IN ('queued', 'extracting', 'ocr_required', 'failed', 'needs_attention') AND deleted_at IS NULL",
        );

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

        const overdueTaskItems = (
            this.db
                .prepare(
                    `SELECT * FROM tasks WHERE status NOT IN ('completed', 'cancelled') AND deleted_at IS NULL
      AND ((due_date IS NOT NULL AND due_date < date('now', 'localtime')) OR (due_date IS NULL AND due_at IS NOT NULL AND due_at < ?))
      ORDER BY COALESCE(due_date, date(due_at, 'localtime')) ASC, due_at ASC LIMIT 6`,
                )
                .all(now) as Array<Record<string, unknown>>
        ).map(mapTask);

        const blockedRows = this.db
            .prepare(
                `SELECT t.*, tb.id AS blocker_id, tb.reason AS blocker_reason, tb.waiting_contact_id,
                        c.name AS waiting_contact_name, tb.follow_up_at
                 FROM tasks t
                 LEFT JOIN task_blockers tb ON tb.task_id = t.id AND tb.resolved_at IS NULL
                 LEFT JOIN contacts c ON c.id = tb.waiting_contact_id AND c.deleted_at IS NULL
                 WHERE t.deleted_at IS NULL AND t.status NOT IN ('completed', 'cancelled')
                   AND (tb.id IS NOT NULL OR t.status = 'blocked')
                 ORDER BY tb.follow_up_at IS NULL, tb.follow_up_at ASC, t.updated_at DESC
                 LIMIT 8`,
            )
            .all() as Array<Record<string, unknown>>;
        const blockedItems: DashboardBlockedItem[] = blockedRows.map((row) => ({
            task: mapTask(row),
            blockerId: row['blocker_id'] ? String(row['blocker_id']) : '',
            reason: row['blocker_reason']
                ? String(row['blocker_reason'])
                : 'Marked blocked — inspect task to add reason or resolve.',
            waitingContactId: row['waiting_contact_id'] ? String(row['waiting_contact_id']) : null,
            waitingContactName: row['waiting_contact_name'] ? String(row['waiting_contact_name']) : null,
            followUpAt: row['follow_up_at'] ? String(row['follow_up_at']) : null,
        }));

        const waitingTasks = (
            this.db
                .prepare(
                    `SELECT * FROM tasks WHERE deleted_at IS NULL AND status = 'waiting'
                     AND id NOT IN (SELECT task_id FROM task_blockers WHERE resolved_at IS NULL)
                     ORDER BY COALESCE(due_date, date(due_at, 'localtime')) IS NULL,
                              COALESCE(due_date, date(due_at, 'localtime')) ASC, updated_at DESC
                     LIMIT 6`,
                )
                .all() as Array<Record<string, unknown>>
        ).map(mapTask);

        const readyTasks = (
            this.db
                .prepare(
                    `SELECT t.* FROM tasks t
                     WHERE t.deleted_at IS NULL
                       AND t.status IN ('in_progress', 'not_started')
                       AND NOT EXISTS (
                         SELECT 1 FROM task_blockers tb WHERE tb.task_id = t.id AND tb.resolved_at IS NULL
                       )
                       AND NOT EXISTS (
                         SELECT 1 FROM task_dependencies td
                         JOIN tasks dep ON dep.id = td.depends_on_task_id
                         WHERE td.task_id = t.id
                           AND dep.deleted_at IS NULL
                           AND dep.status NOT IN ('completed', 'cancelled')
                       )
                     ORDER BY
                       CASE t.status WHEN 'in_progress' THEN 0 ELSE 1 END,
                       COALESCE(t.due_date, date(t.due_at, 'localtime')) IS NULL,
                       COALESCE(t.due_date, date(t.due_at, 'localtime')) ASC,
                       CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                       t.updated_at DESC
                     LIMIT 8`,
                )
                .all() as Array<Record<string, unknown>>
        ).map(mapTask);

        const horizonIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const reminderRows = this.db
            .prepare(
                `SELECT id, entity_type, entity_id, due_at, status, message
                 FROM reminders
                 WHERE status IN ('scheduled', 'delivered', 'snoozed') AND due_at <= ?
                 ORDER BY due_at ASC LIMIT 8`,
            )
            .all(horizonIso) as Array<Record<string, unknown>>;
        const resolvedReminders = resolveRecordSummaries(
            this.db,
            reminderRows.map((row) => ({
                type: row['entity_type'] as ReminderRecord['entityType'],
                id: String(row['entity_id']),
            })),
        );
        const dueReminders: DashboardReminderItem[] = [];
        for (const row of reminderRows) {
            const entityType = row['entity_type'] as ReminderRecord['entityType'];
            const entityId = String(row['entity_id']);
            const summary = resolvedReminders[`${entityType}:${entityId}`];
            if (!summary) continue;
            dueReminders.push({
                id: String(row['id']),
                entityType,
                entityId,
                entityTitle: summary.title,
                projectId: summary.projectId,
                dueAt: String(row['due_at']),
                status: row['status'] as ReminderRecord['status'],
                message: String(row['message'] ?? ''),
            });
            if (dueReminders.length >= 6) break;
        }

        const checklistNotes = this.db
            .prepare(
                `SELECT id, project_id, title, substr(content, 1, 8000) AS content, updated_at
                 FROM notes
                 WHERE deleted_at IS NULL AND locked = 0
                   AND (content LIKE '%data-checked="false"%' OR content LIKE '%data-checked=''false''%' OR content LIKE '%[ ]%')
                 ORDER BY updated_at DESC LIMIT 12`,
            )
            .all() as Array<Record<string, unknown>>;
        const noteActionItems: DashboardChecklistItem[] = [];
        for (const row of checklistNotes) {
            const extracted = extractOpenNoteChecklists(
                String(row['id']),
                String(row['title'] ?? ''),
                row['project_id'] ? String(row['project_id']) : null,
                String(row['content'] ?? ''),
                String(row['updated_at']),
            );
            noteActionItems.push(...extracted);
            if (noteActionItems.length >= 8) break;
        }

        const activeTimerRow = this.db
            .prepare(
                `SELECT te.task_id, te.started_at, te.active_session_id, te.heartbeat_at, t.title, t.project_id
                 FROM time_entries te
                 JOIN tasks t ON t.id = te.task_id
                 WHERE te.is_active = 1 AND t.deleted_at IS NULL LIMIT 1`,
            )
            .get() as
            | {
                  task_id: string;
                  started_at: string;
                  active_session_id: string | null;
                  heartbeat_at: string | null;
                  title: string;
                  project_id: string;
              }
            | undefined;
        const activeTimerDetail: DashboardActiveTimerDetail | null = activeTimerRow
            ? {
                  taskId: activeTimerRow.task_id,
                  taskTitle: activeTimerRow.title,
                  projectId: activeTimerRow.project_id,
                  startedAt: activeTimerRow.started_at,
                  recoveryRequired:
                      activeTimerRow.active_session_id !== this.sessionId ||
                      Date.now() - Date.parse(activeTimerRow.heartbeat_at ?? activeTimerRow.started_at) >
                          120_000,
              }
            : null;

        const recentActivity: ActivityRecord[] = (
            this.db
                .prepare(
                    'SELECT id, entity_type, entity_id, event_type, summary, created_at FROM activity_events ORDER BY created_at DESC LIMIT 6',
                )
                .all() as Array<Record<string, unknown>>
        ).map((row) => ({
            id: String(row['id']),
            entityType: String(row['entity_type']),
            entityId: String(row['entity_id']),
            eventType: String(row['event_type']),
            summary: String(row['summary']),
            createdAt: String(row['created_at']),
        }));

        return {
            activeProjects,
            openTasks,
            overdueTasks,
            blockedTasks,
            recentNotes,
            upcomingTasks,
            activeTimers,
            pendingDocuments,
            overdueTaskItems,
            blockedItems,
            waitingTasks,
            readyTasks,
            dueReminders,
            noteActionItems: noteActionItems.slice(0, 8),
            activeTimerDetail,
            attentionDocumentCount,
            recentActivity,
        };
    }
}
