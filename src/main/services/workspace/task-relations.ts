import type Database from 'better-sqlite3';
import type { TaskRelationSummary } from '../../../shared/contracts.js';

export function buildTaskRelationSummaries(
    db: Database.Database,
    ids: string[],
): Record<string, TaskRelationSummary> {
    const uniqueIds = [...new Set(ids)].filter((id) => typeof id === 'string' && id.length > 0).slice(0, 200);
    if (uniqueIds.length === 0) return {};
    const result: Record<string, TaskRelationSummary> = Object.fromEntries(
        uniqueIds.map((id) => [
            id,
            {
                dependsOnOpen: 0,
                dependsOnTotal: 0,
                blocksCount: 0,
                linkCount: 0,
                activeBlockerId: null,
                activeBlockerReason: null,
                waitingContactId: null,
                waitingContactName: null,
                blockerFollowUpAt: null,
                firstPrereqId: null,
                firstPrereqTitle: null,
            },
        ]),
    );
    const ph = uniqueIds.map(() => '?').join(',');
    const prereqRows = db
        .prepare(
            `SELECT td.task_id, td.depends_on_task_id, dep.title, dep.status
             FROM task_dependencies td
             JOIN tasks dep ON dep.id = td.depends_on_task_id
             WHERE td.task_id IN (${ph}) AND dep.deleted_at IS NULL
             ORDER BY CASE WHEN dep.status IN ('completed', 'cancelled') THEN 1 ELSE 0 END, dep.title`,
        )
        .all(...uniqueIds) as Array<{
        task_id: string;
        depends_on_task_id: string;
        title: string;
        status: string;
    }>;
    for (const row of prereqRows) {
        const entry = result[row.task_id];
        if (!entry) continue;
        entry.dependsOnTotal += 1;
        const isOpen = row.status !== 'completed' && row.status !== 'cancelled';
        if (isOpen) entry.dependsOnOpen += 1;
        if (!entry.firstPrereqId && isOpen) {
            entry.firstPrereqId = row.depends_on_task_id;
            entry.firstPrereqTitle = row.title;
        }
    }
    const blockRows = db
        .prepare(
            `SELECT td.depends_on_task_id AS task_id, count(*) AS total
             FROM task_dependencies td
             JOIN tasks child ON child.id = td.task_id
             WHERE td.depends_on_task_id IN (${ph}) AND child.deleted_at IS NULL AND child.status NOT IN ('completed', 'cancelled')
             GROUP BY td.depends_on_task_id`,
        )
        .all(...uniqueIds) as Array<{ task_id: string; total: number }>;
    for (const row of blockRows) {
        const entry = result[row.task_id];
        if (entry) entry.blocksCount = Number(row.total);
    }
    const blockerRows = db
        .prepare(
            `SELECT tb.id AS blocker_id, tb.task_id, tb.reason, tb.waiting_contact_id, c.name AS contact_name, tb.follow_up_at
             FROM task_blockers tb
             LEFT JOIN contacts c ON c.id = tb.waiting_contact_id AND c.deleted_at IS NULL
             WHERE tb.task_id IN (${ph}) AND tb.resolved_at IS NULL`,
        )
        .all(...uniqueIds) as Array<{
        blocker_id: string;
        task_id: string;
        reason: string;
        waiting_contact_id: string | null;
        contact_name: string | null;
        follow_up_at: string | null;
    }>;
    for (const row of blockerRows) {
        const entry = result[row.task_id];
        if (!entry) continue;
        entry.activeBlockerId = row.blocker_id;
        entry.activeBlockerReason = row.reason;
        entry.waitingContactId = row.waiting_contact_id;
        entry.waitingContactName = row.contact_name;
        entry.blockerFollowUpAt = row.follow_up_at;
    }
    const linkRows = db
        .prepare(
            `SELECT entity_id, count(*) AS total FROM (
               SELECT source_id AS entity_id FROM entity_links WHERE source_type = 'task' AND source_id IN (${ph})
               UNION ALL
               SELECT target_id AS entity_id FROM entity_links WHERE target_type = 'task' AND target_id IN (${ph})
             ) GROUP BY entity_id`,
        )
        .all(...uniqueIds, ...uniqueIds) as Array<{ entity_id: string; total: number }>;
    for (const row of linkRows) {
        const entry = result[row.entity_id];
        if (entry) entry.linkCount = Number(row.total);
    }
    return result;
}
