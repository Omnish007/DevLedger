import { randomUUID } from 'node:crypto';
import type {
    PageRequest,
    PageResult,
    ProjectInput,
    ProjectRecord,
    ProjectStatus,
} from '../../../shared/contracts.js';
import { normalizePage, escapeLikeQuery } from '../../../domain/pagination.ts';
import { WorkspaceContactsService } from './contacts.ts';

import { nowIso, mapProject } from './base.ts';

export class WorkspaceProjectsService extends WorkspaceContactsService {
    listProjectsPage(input: PageRequest = {}): PageResult<ProjectRecord> {
        const { limit, offset, query } = normalizePage(input);
        const includeArchived = input.includeArchived === true;
        const pattern = `%${escapeLikeQuery(query)}%`;
        const where = `p.deleted_at IS NULL AND (? = 1 OR p.status != 'archived')
      AND (? = '' OR p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')`;
        const params = [includeArchived ? 1 : 0, query, pattern, pattern] as const;
        const totalRow = this.db
            .prepare(`SELECT count(*) AS total FROM projects p WHERE ${where}`)
            .get(...params) as { total: number };
        const rows = this.db
            .prepare(
                `SELECT p.*,
        (SELECT count(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS task_count,
        (SELECT count(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status NOT IN ('completed', 'cancelled')) AS open_task_count,
        (SELECT count(*) FROM notes n WHERE n.project_id = p.id AND n.deleted_at IS NULL) AS note_count
      FROM projects p WHERE ${where} ORDER BY
        CASE p.status WHEN 'active' THEN 0 WHEN 'on_hold' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
        p.updated_at DESC LIMIT ? OFFSET ?`,
            )
            .all(...params, limit, offset) as Array<Record<string, unknown>>;
        const items = rows.map(mapProject);
        return {
            items,
            total: Number(totalRow.total),
            limit,
            offset,
            hasMore: offset + items.length < Number(totalRow.total),
        };
    }

    getProjectNames(ids: string[]): Record<string, string> {
        const uniqueIds = [...new Set(ids)].slice(0, 200);
        if (!uniqueIds.length) return {};
        const placeholders = uniqueIds.map(() => '?').join(', ');
        const rows = this.db
            .prepare(`SELECT id, name FROM projects WHERE deleted_at IS NULL AND id IN (${placeholders})`)
            .all(...uniqueIds) as Array<{ id: string; name: string }>;
        return Object.fromEntries(rows.map((row) => [row.id, row.name]));
    }

    createProject(input: ProjectInput): ProjectRecord {
        const id = randomUUID();
        const now = nowIso();
        const insert = this.db.transaction(() => {
            this.db
                .prepare(
                    `INSERT INTO projects (id, name, description, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
                )
                .run(id, input.name.trim(), input.description?.trim() ?? '', input.type, now, now);
            this.addActivity('project', id, 'created', `Created project ${input.name.trim()}`);
        });
        insert.immediate();
        const project = this.getProject(id);
        if (!project) throw new Error('Project creation could not be verified.');
        return project;
    }

    updateProject(
        id: string,
        input: Partial<ProjectInput> & { status?: ProjectStatus | undefined },
    ): ProjectRecord {
        const existing = this.db
            .prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL')
            .get(id) as Record<string, unknown> | undefined;
        if (!existing) throw new Error('Project not found.');
        const next = {
            name: input.name?.trim() ?? String(existing['name']),
            description: input.description?.trim() ?? String(existing['description']),
            type: input.type ?? existing['type'],
            status: input.status ?? existing['status'],
        };
        this.db
            .prepare(
                `UPDATE projects SET name = ?, description = ?, type = ?, status = ?, updated_at = ? WHERE id = ?`,
            )
            .run(next.name, next.description, next.type, next.status, nowIso(), id);
        this.addActivity('project', id, 'updated', `Updated project ${next.name}`);
        const project = this.getProject(id);
        if (!project) throw new Error('Project update could not be verified.');
        return project;
    }

    archiveProject(id: string): void {
        const result = this.db
            .prepare(
                `UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
            )
            .run(nowIso(), id);
        if (result.changes === 0) throw new Error('Project not found.');
        this.addActivity('project', id, 'archived', 'Archived project');
    }

    restoreProject(id: string): ProjectRecord {
        const result = this.db
            .prepare(
                `UPDATE projects SET status = 'active', updated_at = ? WHERE id = ? AND deleted_at IS NULL AND status = 'archived'`,
            )
            .run(nowIso(), id);
        if (result.changes !== 1) throw new Error('Archived project not found.');
        this.addActivity('project', id, 'restored', 'Restored project');
        const project = this.getProject(id);
        if (!project) throw new Error('Project restore could not be verified.');
        return project;
    }
}
