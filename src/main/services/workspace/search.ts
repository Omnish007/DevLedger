import type { SearchInput, SearchResult } from '../../../shared/contracts.js';
import { stripHtmlToPlainText } from '../../../domain/html-text.ts';
import { safeFtsQuery } from '../../../domain/validation.ts';
import { parseSearchQuery } from '../../../domain/search-query.ts';
import { WorkspaceDashboardService } from './dashboard.ts';

export class WorkspaceSearchService extends WorkspaceDashboardService {
    search(input: SearchInput): SearchResult[] {
        const filters = parseSearchQuery(input.query);
        const match = safeFtsQuery(filters.text);
        const types = new Set(input.types ?? ['project', 'note', 'task', 'document', 'contact']);
        if (filters.entityType) {
            for (const type of [...types]) if (type !== filters.entityType) types.delete(type);
            types.add(filters.entityType);
        }
        if (filters.status) {
            if (types.has('task')) {
                for (const type of [...types]) if (type !== 'task') types.delete(type);
            } else return [];
        }
        const limit = Math.min(Math.max(input.limit ?? 30, 1), 50);
        const results: SearchResult[] = [];
        let projectParam = input.projectId ?? null;

        if (filters.project) {
            const exact = this.db
                .prepare(
                    'SELECT id, name FROM projects WHERE deleted_at IS NULL AND name = ? COLLATE NOCASE LIMIT 2',
                )
                .all(filters.project) as Array<{ id: string; name: string }>;
            const candidates = exact.length
                ? exact
                : (this.db
                      .prepare(
                          "SELECT id, name FROM projects WHERE deleted_at IS NULL AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 3",
                      )
                      .all(`%${filters.project.replace(/[\\%_]/g, '\\$&')}%`) as Array<{
                      id: string;
                      name: string;
                  }>);
            if (candidates.length > 1)
                throw new Error(`Project filter “${filters.project}” is ambiguous. Use its full name.`);
            if (!candidates.length || (projectParam && projectParam !== candidates[0]!.id)) return [];
            projectParam = candidates[0]!.id;
        }

        if (
            !match &&
            !filters.tag &&
            !filters.project &&
            !filters.entityType &&
            !filters.extension &&
            !filters.status &&
            !filters.after &&
            !filters.before
        )
            return [];
        const tagName = filters.tag ?? null;
        if (tagName && !this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').get(tagName))
            return [];
        const after = filters.after ? `${filters.after}T00:00:00.000Z` : null;
        const before = filters.before ? `${filters.before}T00:00:00.000Z` : null;
        const escapedQuery = filters.text.replace(/[\\%_]/g, '\\$&');

        if (types.has('note')) {
            const baseFilter = `n.deleted_at IS NULL AND n.locked = 0 AND (? IS NULL OR n.project_id = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'note' AND et.entity_id = n.id AND tg.name = ? COLLATE NOCASE))
        AND (? IS NULL OR n.updated_at >= ?) AND (? IS NULL OR n.updated_at < ?)`;
            const rows = match
                ? this.db
                      .prepare(
                          `SELECT n.id, n.project_id, n.title, n.updated_at, snippet(note_search, 3, '<mark>', '</mark>', ' … ', 18) AS excerpt,
            substr(n.content, 1, 400) AS fallback_content,
            bm25(note_search, 0, 0, 6, 1) AS score FROM note_search JOIN notes n ON n.id = note_search.note_id
            WHERE note_search MATCH ? AND ${baseFilter} ORDER BY score LIMIT ?`,
                      )
                      .all(
                          match,
                          projectParam,
                          projectParam,
                          tagName,
                          tagName,
                          after,
                          after,
                          before,
                          before,
                          limit,
                      )
                : this.db
                      .prepare(
                          `SELECT n.id, n.project_id, n.title, n.updated_at, substr(n.content, 1, 400) AS excerpt,
            substr(n.content, 1, 400) AS fallback_content, 0 AS score FROM notes n
            WHERE ${baseFilter} ORDER BY n.updated_at DESC LIMIT ?`,
                      )
                      .all(projectParam, projectParam, tagName, tagName, after, after, before, before, limit);
            results.push(
                ...(rows as Array<Record<string, unknown>>).map((row) => {
                    const cleaned = stripHtmlToPlainText(String(row['excerpt'] ?? ''), {
                        preserveMark: Boolean(match),
                    });
                    const excerpt =
                        (match ? cleaned : cleaned.slice(0, 180)) ||
                        stripHtmlToPlainText(String(row['fallback_content'] ?? '')).slice(0, 180);
                    return {
                        id: String(row['id']),
                        type: 'note' as const,
                        title: String(row['title']),
                        excerpt,
                        projectId: row['project_id'] ? String(row['project_id']) : null,
                        updatedAt: String(row['updated_at']),
                    };
                }),
            );
        }
        if (types.has('task')) {
            const statusFilter =
                filters.status === 'blocked'
                    ? "t.status = 'blocked'"
                    : filters.status === 'completed'
                      ? "t.status = 'completed'"
                      : filters.status === 'in_progress'
                        ? "t.status = 'in_progress'"
                        : filters.status === 'overdue'
                          ? "t.status NOT IN ('completed', 'cancelled') AND ((t.due_date IS NOT NULL AND t.due_date < date('now', 'localtime')) OR (t.due_date IS NULL AND t.due_at IS NOT NULL AND t.due_at < ?))"
                          : '1 = 1';
            const datePredicate = `AND (? IS NULL OR t.updated_at >= ?) AND (? IS NULL OR t.updated_at < ?)`;
            const tagPredicate = `AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'task' AND et.entity_id = t.id AND tg.name = ? COLLATE NOCASE))`;
            const projectPredicate = `AND (? IS NULL OR t.project_id = ?)`;
            const params: unknown[] = [];
            let ftsPredicate = '';
            if (match) {
                ftsPredicate = 'task_search MATCH ? AND ';
                params.push(match);
            }
            params.push(projectParam, projectParam, tagName, tagName, after, after, before, before);
            if (filters.status === 'overdue') params.push(new Date().toISOString());
            params.push(limit);
            const rows = match
                ? this.db
                      .prepare(
                          `SELECT t.id, t.project_id, t.title, t.updated_at, snippet(task_search, 3, '<mark>', '</mark>', ' … ', 18) AS excerpt, bm25(task_search, 0, 0, 6, 1) AS score
            FROM task_search JOIN tasks t ON t.id = task_search.task_id WHERE ${ftsPredicate}t.deleted_at IS NULL ${projectPredicate} ${tagPredicate} ${datePredicate} AND ${statusFilter} ORDER BY score LIMIT ?`,
                      )
                      .all(...params)
                : this.db
                      .prepare(
                          `SELECT t.id, t.project_id, t.title, t.updated_at, substr(t.description, 1, 180) AS excerpt, 0 AS score FROM tasks t
            WHERE t.deleted_at IS NULL ${projectPredicate} ${tagPredicate} ${datePredicate} AND ${statusFilter} ORDER BY t.updated_at DESC LIMIT ?`,
                      )
                      .all(...params.slice(0, match ? params.length : params.length));
            results.push(
                ...(rows as Array<Record<string, unknown>>).map((row) => ({
                    id: String(row['id']),
                    type: 'task' as const,
                    title: String(row['title']),
                    excerpt: String(row['excerpt']),
                    projectId: String(row['project_id']),
                    updatedAt: String(row['updated_at']),
                })),
            );
        }
        if (types.has('document')) {
            const extensionPredicate = `AND (? IS NULL OR d.extension = ?)`;
            const projectPredicate = `d.deleted_at IS NULL AND (? IS NULL OR d.project_id = ?)`;
            const tagPredicate = `AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'document' AND et.entity_id = d.id AND tg.name = ? COLLATE NOCASE))`;
            const datePredicate = `AND (? IS NULL OR d.updated_at >= ?) AND (? IS NULL OR d.updated_at < ?)`;
            const params: unknown[] = [];
            let ftsPredicate = '';
            if (match) {
                ftsPredicate = 'document_search MATCH ? AND ';
                params.push(match);
            }
            params.push(
                projectParam,
                projectParam,
                tagName,
                tagName,
                filters.extension ?? null,
                filters.extension ?? null,
                after,
                after,
                before,
                before,
                limit,
            );
            const rows = match
                ? this.db
                      .prepare(
                          `SELECT d.id, d.project_id, d.title, d.updated_at, snippet(document_search, 3, '<mark>', '</mark>', ' … ', 18) AS excerpt, bm25(document_search, 0, 0, 6, 1) AS score
            FROM document_search JOIN documents d ON d.id = document_search.document_id WHERE ${ftsPredicate}${projectPredicate} ${tagPredicate} ${extensionPredicate} ${datePredicate} ORDER BY score LIMIT ?`,
                      )
                      .all(...params)
                : this.db
                      .prepare(
                          `SELECT d.id, d.project_id, d.title, d.updated_at, substr(d.extracted_text, 1, 180) AS excerpt, 0 AS score FROM documents d
            WHERE ${projectPredicate} ${tagPredicate} ${extensionPredicate} ${datePredicate} ORDER BY d.updated_at DESC LIMIT ?`,
                      )
                      .all(...params.slice(match ? 1 : 0));
            results.push(
                ...(rows as Array<Record<string, unknown>>).map((row) => ({
                    id: String(row['id']),
                    type: 'document' as const,
                    title: String(row['title']),
                    excerpt: String(row['excerpt']),
                    projectId: row['project_id'] ? String(row['project_id']) : null,
                    updatedAt: String(row['updated_at']),
                })),
            );
        }
        if (types.has('contact')) {
            const contactProjectPredicate = `AND (? IS NULL OR EXISTS (SELECT 1 FROM project_contacts pc WHERE pc.contact_id = c.id AND pc.project_id = ?))`;
            const contactTagPredicate = `AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'contact' AND et.entity_id = c.id AND tg.name = ? COLLATE NOCASE))`;
            const contactDatePredicate = `AND (? IS NULL OR c.updated_at >= ?) AND (? IS NULL OR c.updated_at < ?)`;
            const params: unknown[] = [];
            let ftsPredicate = '';
            if (match) {
                ftsPredicate = 'contact_search MATCH ? AND ';
                params.push(match);
            }
            params.push(projectParam, projectParam, tagName, tagName, after, after, before, before, limit);
            const rows = match
                ? this.db
                      .prepare(
                          `SELECT c.id, c.name, c.company, c.role, c.updated_at,
            snippet(contact_search, 2, '<mark>', '</mark>', ' … ', 18) AS excerpt,
            bm25(contact_search, 0, 5, 2, 1, 1, 1, 1) AS score
            FROM contact_search JOIN contacts c ON c.id = contact_search.contact_id
            WHERE ${ftsPredicate}c.deleted_at IS NULL ${contactProjectPredicate} ${contactTagPredicate} ${contactDatePredicate}
            ORDER BY score LIMIT ?`,
                      )
                      .all(...params)
                : this.db
                      .prepare(
                          `SELECT c.id, c.name, c.company, c.role, c.updated_at, substr(c.notes, 1, 180) AS excerpt, 0 AS score
            FROM contacts c WHERE c.deleted_at IS NULL ${contactProjectPredicate} ${contactTagPredicate} ${contactDatePredicate}
            ORDER BY c.updated_at DESC LIMIT ?`,
                      )
                      .all(...params);
            results.push(
                ...(rows as Array<Record<string, unknown>>).map((row) => ({
                    id: String(row['id']),
                    type: 'contact' as const,
                    title: String(row['name']),
                    excerpt: [
                        String(row['role'] ?? ''),
                        String(row['company'] ?? ''),
                        String(row['excerpt'] ?? ''),
                    ]
                        .filter(Boolean)
                        .join(' · ')
                        .slice(0, 360),
                    projectId: projectParam,
                    updatedAt: String(row['updated_at']),
                })),
            );
        }
        if (types.has('project')) {
            const tagPredicate = `AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'project' AND et.entity_id = p.id AND tg.name = ? COLLATE NOCASE))`;
            const datePredicate = `AND (? IS NULL OR p.updated_at >= ?) AND (? IS NULL OR p.updated_at < ?)`;
            const rows = this.db
                .prepare(
                    `SELECT p.id, p.name, p.description, p.updated_at FROM projects p
        WHERE p.deleted_at IS NULL AND (? IS NULL OR p.id = ?) ${tagPredicate} ${datePredicate}
        AND (? = '' OR p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')
        ORDER BY p.updated_at DESC LIMIT ?`,
                )
                .all(
                    projectParam,
                    projectParam,
                    tagName,
                    tagName,
                    after,
                    after,
                    before,
                    before,
                    escapedQuery,
                    `%${escapedQuery}%`,
                    `%${escapedQuery}%`,
                    limit,
                ) as Array<Record<string, unknown>>;
            results.push(
                ...rows.map((row) => ({
                    id: String(row['id']),
                    type: 'project' as const,
                    title: String(row['name']),
                    excerpt: String(row['description']).slice(0, 180),
                    projectId: String(row['id']),
                    updatedAt: String(row['updated_at']),
                })),
            );
        }
        return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
    }
}
