import type { SearchInput, SearchResult } from '../../../shared/contracts.js';
import { stripHtmlToPlainText } from '../../../domain/html-text.ts';
import { escapeLikeQuery } from '../../../domain/pagination.ts';
import { parseSearchQuery } from '../../../domain/search-query.ts';
import { buildLexicalQueryPlan } from '../../../domain/validation.ts';
import { WorkspaceDashboardService } from './dashboard.ts';

interface ScoredHit {
    result: SearchResult;
    score: number;
    matchedTokens: Set<string>;
}

function cleanCustomAttributes(rawJson: string): string {
    try {
        const parsed = JSON.parse(rawJson || '{}') as Record<string, unknown>;
        return Object.entries(parsed)
            .filter(([, value]) => typeof value === 'string' && value.trim())
            .map(([key, value]) => `${key}: ${String(value).trim()}`)
            .join(' · ');
    } catch {
        return '';
    }
}

export class WorkspaceSearchService extends WorkspaceDashboardService {
    private runSafeFts<T>(queryFn: () => T[]): T[] {
        try {
            return queryFn();
        } catch {
            return [];
        }
    }

    private tokenOverlapBonus(title: string, text: string, tokens: readonly string[]): number {
        if (!tokens.length) return 0;
        const lowerTitle = title.toLowerCase();
        const lowerCombined = `${lowerTitle} ${text.toLowerCase()}`;
        let matched = 0;
        let titleMatches = 0;
        for (const token of tokens) {
            if (lowerCombined.includes(token)) matched += 1;
            if (lowerTitle.includes(token)) titleMatches += 1;
        }
        return (matched / tokens.length) * 140 + (titleMatches / tokens.length) * 160;
    }

    private titleMatchBonus(title: string, rawTextQuery: string, tokens: readonly string[]): number {
        const needle = rawTextQuery.trim().toLowerCase();
        if (!needle) return 0;
        const lowerTitle = title.toLowerCase();
        if (lowerTitle === needle) return 550;
        if (lowerTitle.startsWith(needle)) return 320;
        if (lowerTitle.includes(needle)) return 190;
        return this.tokenOverlapBonus(title, '', tokens);
    }

    search(input: SearchInput): SearchResult[] {
        const filters = parseSearchQuery(input.query);
        const plan = buildLexicalQueryPlan(filters.text);
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
                      .all(`%${escapeLikeQuery(filters.project)}%`) as Array<{ id: string; name: string }>);
            if (candidates.length > 1)
                throw new Error(`Project filter “${filters.project}” is ambiguous. Use its full name.`);
            if (!candidates.length || (projectParam && projectParam !== candidates[0]!.id)) return [];
            projectParam = candidates[0]!.id;
        }

        if (
            !plan.strictFts &&
            !filters.tag &&
            !filters.project &&
            !filters.entityType &&
            !filters.extension &&
            !filters.status &&
            !filters.after &&
            !filters.before
        ) {
            return [];
        }
        const tagName = filters.tag ?? null;
        if (tagName && !this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').get(tagName)) {
            return [];
        }

        const after = filters.after ? `${filters.after}T00:00:00.000Z` : null;
        const before = filters.before ? `${filters.before}T00:00:00.000Z` : null;
        const hasText = Boolean(plan.strictFts);
        const escapedRaw = `%${escapeLikeQuery(filters.text.trim().toLowerCase())}%`;
        const hits = new Map<string, ScoredHit>();

        const recordHit = (result: SearchResult, score: number) => {
            const key = `${result.type}:${result.id}`;
            const computed =
                score + (hasText ? this.titleMatchBonus(result.title, filters.text, plan.contentTokens) : 0);
            const existing = hits.get(key);
            if (!existing || computed > existing.score) {
                hits.set(key, {
                    result,
                    score: computed,
                    matchedTokens: new Set(plan.contentTokens),
                });
            }
        };

        const runTieredFts = (
            matchExpr: string,
            tierBaseScore: number,
            queryRows: (expr: string) => void,
        ) => {
            if (!matchExpr) return;
            queryRows(matchExpr);
            void tierBaseScore;
        };

        if (types.has('note')) {
            const baseFilter = `n.deleted_at IS NULL AND n.locked = 0 AND (? IS NULL OR n.project_id = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'note' AND et.entity_id = n.id AND tg.name = ? COLLATE NOCASE))
        AND (? IS NULL OR n.updated_at >= ?) AND (? IS NULL OR n.updated_at < ?)`;
            const mapNoteRow = (row: Record<string, unknown>, highlighted: boolean, baseScore: number) => {
                const cleaned = stripHtmlToPlainText(String(row['excerpt'] ?? ''), {
                    preserveMark: highlighted,
                });
                const fallbackClean = stripHtmlToPlainText(String(row['fallback_content'] ?? ''));
                const excerpt =
                    (highlighted ? cleaned : cleaned.slice(0, 180)) || fallbackClean.slice(0, 180);
                const title = String(row['title']);
                const bm25 = Number(row['score'] ?? 0);
                const overlap = hasText
                    ? this.tokenOverlapBonus(title, `${cleaned} ${fallbackClean}`, plan.contentTokens)
                    : 0;
                recordHit(
                    {
                        id: String(row['id']),
                        type: 'note',
                        title,
                        excerpt,
                        projectId: row['project_id'] ? String(row['project_id']) : null,
                        updatedAt: String(row['updated_at']),
                    },
                    baseScore + Math.min(40, Math.max(0, -bm25)) + overlap,
                );
            };
            if (hasText) {
                const ftsSql = `SELECT n.id, n.project_id, n.title, n.updated_at,
          snippet(note_search, 3, '<mark>', '</mark>', ' … ', 18) AS excerpt,
          substr(n.content, 1, 600) AS fallback_content,
          bm25(note_search, 0, 0, 6, 1) AS score
          FROM note_search JOIN notes n ON n.id = note_search.note_id
          WHERE note_search MATCH ? AND ${baseFilter} ORDER BY score LIMIT ?`;
                const common = [projectParam, projectParam, tagName, tagName, after, after, before, before];
                for (const row of this.runSafeFts(
                    () =>
                        this.db.prepare(ftsSql).all(plan.strictFts, ...common, limit) as Array<
                            Record<string, unknown>
                        >,
                )) {
                    mapNoteRow(row, true, 1000);
                }
                if (!plan.hasUnknownOperator) {
                    if (plan.contentFts && plan.contentFts !== plan.strictFts) {
                        for (const row of this.runSafeFts(
                            () =>
                                this.db.prepare(ftsSql).all(plan.contentFts, ...common, limit) as Array<
                                    Record<string, unknown>
                                >,
                        )) {
                            mapNoteRow(row, true, 650);
                        }
                    }
                    const likeRows = this.db
                        .prepare(
                            `SELECT n.id, n.project_id, n.title, n.updated_at,
                substr(n.content, 1, 600) AS excerpt, substr(n.content, 1, 600) AS fallback_content, 0 AS score
                FROM notes n WHERE ${baseFilter}
                AND (lower(n.title) LIKE ? ESCAPE '\\' OR lower(n.content) LIKE ? ESCAPE '\\')
                ORDER BY n.updated_at DESC LIMIT ?`,
                        )
                        .all(...common, escapedRaw, escapedRaw, limit) as Array<Record<string, unknown>>;
                    for (const row of likeRows) {
                        const plain = stripHtmlToPlainText(String(row['fallback_content'] ?? ''));
                        const needle = filters.text.trim().toLowerCase();
                        if (
                            String(row['title']).toLowerCase().includes(needle) ||
                            plain.toLowerCase().includes(needle)
                        ) {
                            mapNoteRow(row, false, 450);
                        }
                    }
                    if (plan.relaxedFts && plan.contentTokens.length > 1) {
                        for (const row of this.runSafeFts(
                            () =>
                                this.db.prepare(ftsSql).all(plan.relaxedFts, ...common, limit) as Array<
                                    Record<string, unknown>
                                >,
                        )) {
                            mapNoteRow(row, true, 180);
                        }
                    }
                }
            } else {
                const rows = this.db
                    .prepare(
                        `SELECT n.id, n.project_id, n.title, n.updated_at, substr(n.content, 1, 400) AS excerpt,
              substr(n.content, 1, 400) AS fallback_content, 0 AS score FROM notes n
              WHERE ${baseFilter} ORDER BY n.updated_at DESC LIMIT ?`,
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
                        limit,
                    ) as Array<Record<string, unknown>>;
                for (const row of rows) mapNoteRow(row, false, 0);
            }
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
            const taskFilter = `t.deleted_at IS NULL AND (? IS NULL OR t.project_id = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'task' AND et.entity_id = t.id AND tg.name = ? COLLATE NOCASE))
        AND (? IS NULL OR t.updated_at >= ?) AND (? IS NULL OR t.updated_at < ?) AND ${statusFilter}`;
            const taskParams: unknown[] = [
                projectParam,
                projectParam,
                tagName,
                tagName,
                after,
                after,
                before,
                before,
            ];
            if (filters.status === 'overdue') taskParams.push(new Date().toISOString());

            const mapTaskRow = (row: Record<string, unknown>, baseScore: number) => {
                const bm25 = Number(row['score'] ?? 0);
                const title = String(row['title']);
                const excerpt = String(row['excerpt'] ?? '');
                const overlap = hasText ? this.tokenOverlapBonus(title, excerpt, plan.contentTokens) : 0;
                recordHit(
                    {
                        id: String(row['id']),
                        type: 'task',
                        title,
                        excerpt,
                        projectId: String(row['project_id']),
                        updatedAt: String(row['updated_at']),
                    },
                    baseScore + Math.min(40, Math.max(0, -bm25)) + overlap,
                );
            };
            if (hasText) {
                const ftsSql = `SELECT t.id, t.project_id, t.title, t.updated_at,
          snippet(task_search, 3, '<mark>', '</mark>', ' … ', 18) AS excerpt,
          bm25(task_search, 0, 0, 6, 1) AS score
          FROM task_search JOIN tasks t ON t.id = task_search.task_id
          WHERE task_search MATCH ? AND ${taskFilter} ORDER BY score LIMIT ?`;
                for (const row of this.runSafeFts(
                    () =>
                        this.db.prepare(ftsSql).all(plan.strictFts, ...taskParams, limit) as Array<
                            Record<string, unknown>
                        >,
                )) {
                    mapTaskRow(row, 1000);
                }
                if (!plan.hasUnknownOperator) {
                    if (plan.contentFts && plan.contentFts !== plan.strictFts) {
                        for (const row of this.runSafeFts(
                            () =>
                                this.db.prepare(ftsSql).all(plan.contentFts, ...taskParams, limit) as Array<
                                    Record<string, unknown>
                                >,
                        )) {
                            mapTaskRow(row, 650);
                        }
                    }
                    // Also search task titles, descriptions, and active/resolved blocker reasons via LIKE.
                    const likeTokens = plan.contentTokens.slice(0, 4);
                    const tokenOrClause = likeTokens
                        .map(
                            () =>
                                "(lower(t.title) LIKE ? ESCAPE '\\' OR lower(t.description) LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM task_blockers tb WHERE tb.task_id = t.id AND (lower(tb.reason) LIKE ? ESCAPE '\\' OR lower(tb.resolution_note) LIKE ? ESCAPE '\\')))",
                        )
                        .join(' AND ');
                    const likeParams = likeTokens.flatMap((tok) => {
                        const pat = `%${escapeLikeQuery(tok)}%`;
                        return [pat, pat, pat, pat];
                    });
                    const blockerRows = this.db
                        .prepare(
                            `SELECT t.id, t.project_id, t.title, t.updated_at,
                COALESCE(
                  NULLIF((SELECT group_concat(tb.reason, ' · ') FROM task_blockers tb WHERE tb.task_id = t.id AND tb.resolved_at IS NULL), ''),
                  substr(t.description, 1, 220)
                ) AS excerpt,
                0 AS score
                FROM tasks t
                WHERE ${taskFilter} AND (
                  lower(t.title) LIKE ? ESCAPE '\\'
                  OR lower(t.description) LIKE ? ESCAPE '\\'
                  OR EXISTS (SELECT 1 FROM task_blockers tb WHERE tb.task_id = t.id AND (lower(tb.reason) LIKE ? ESCAPE '\\' OR lower(tb.resolution_note) LIKE ? ESCAPE '\\'))
                  ${tokenOrClause ? `OR (${tokenOrClause})` : ''}
                )
                ORDER BY t.updated_at DESC LIMIT ?`,
                        )
                        .all(
                            ...taskParams,
                            escapedRaw,
                            escapedRaw,
                            escapedRaw,
                            escapedRaw,
                            ...likeParams,
                            limit,
                        ) as Array<Record<string, unknown>>;
                    for (const row of blockerRows) mapTaskRow(row, 480);

                    if (plan.relaxedFts && plan.contentTokens.length > 1) {
                        for (const row of this.runSafeFts(
                            () =>
                                this.db.prepare(ftsSql).all(plan.relaxedFts, ...taskParams, limit) as Array<
                                    Record<string, unknown>
                                >,
                        )) {
                            mapTaskRow(row, 180);
                        }
                    }
                }
            } else {
                const rows = this.db
                    .prepare(
                        `SELECT t.id, t.project_id, t.title, t.updated_at, substr(t.description, 1, 180) AS excerpt, 0 AS score
              FROM tasks t WHERE ${taskFilter} ORDER BY t.updated_at DESC LIMIT ?`,
                    )
                    .all(...taskParams, limit) as Array<Record<string, unknown>>;
                for (const row of rows) mapTaskRow(row, 0);
            }
        }

        if (types.has('document')) {
            const docFilter = `d.deleted_at IS NULL AND (? IS NULL OR d.project_id = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'document' AND et.entity_id = d.id AND tg.name = ? COLLATE NOCASE))
        AND (? IS NULL OR d.extension = ?) AND (? IS NULL OR d.updated_at >= ?) AND (? IS NULL OR d.updated_at < ?)`;
            const docParams = [
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
            ];
            const mapDocRow = (row: Record<string, unknown>, baseScore: number) => {
                const bm25 = Number(row['score'] ?? 0);
                const title = String(row['title']);
                const excerpt = String(row['excerpt'] ?? '');
                const overlap = hasText ? this.tokenOverlapBonus(title, excerpt, plan.contentTokens) : 0;
                recordHit(
                    {
                        id: String(row['id']),
                        type: 'document',
                        title,
                        excerpt,
                        projectId: row['project_id'] ? String(row['project_id']) : null,
                        updatedAt: String(row['updated_at']),
                    },
                    baseScore + Math.min(40, Math.max(0, -bm25)) + overlap,
                );
            };
            if (hasText) {
                const ftsSql = `SELECT d.id, d.project_id, d.title, d.updated_at,
          snippet(document_search, 3, '<mark>', '</mark>', ' … ', 18) AS excerpt,
          bm25(document_search, 0, 0, 6, 1) AS score
          FROM document_search JOIN documents d ON d.id = document_search.document_id
          WHERE document_search MATCH ? AND ${docFilter} ORDER BY score LIMIT ?`;
                for (const row of this.runSafeFts(
                    () =>
                        this.db.prepare(ftsSql).all(plan.strictFts, ...docParams, limit) as Array<
                            Record<string, unknown>
                        >,
                )) {
                    mapDocRow(row, 1000);
                }
                if (!plan.hasUnknownOperator) {
                    if (plan.contentFts && plan.contentFts !== plan.strictFts) {
                        for (const row of this.runSafeFts(
                            () =>
                                this.db.prepare(ftsSql).all(plan.contentFts, ...docParams, limit) as Array<
                                    Record<string, unknown>
                                >,
                        )) {
                            mapDocRow(row, 650);
                        }
                    }
                    const likeRows = this.db
                        .prepare(
                            `SELECT d.id, d.project_id, d.title, d.updated_at, substr(d.extracted_text, 1, 200) AS excerpt, 0 AS score
                FROM documents d WHERE ${docFilter}
                AND (lower(d.title) LIKE ? ESCAPE '\\' OR lower(d.original_name) LIKE ? ESCAPE '\\' OR lower(d.extracted_text) LIKE ? ESCAPE '\\')
                ORDER BY d.updated_at DESC LIMIT ?`,
                        )
                        .all(...docParams, escapedRaw, escapedRaw, escapedRaw, limit) as Array<
                        Record<string, unknown>
                    >;
                    for (const row of likeRows) mapDocRow(row, 420);
                    if (plan.relaxedFts && plan.contentTokens.length > 1) {
                        for (const row of this.runSafeFts(
                            () =>
                                this.db.prepare(ftsSql).all(plan.relaxedFts, ...docParams, limit) as Array<
                                    Record<string, unknown>
                                >,
                        )) {
                            mapDocRow(row, 180);
                        }
                    }
                }
            } else {
                const rows = this.db
                    .prepare(
                        `SELECT d.id, d.project_id, d.title, d.updated_at, substr(d.extracted_text, 1, 180) AS excerpt, 0 AS score
              FROM documents d WHERE ${docFilter} ORDER BY d.updated_at DESC LIMIT ?`,
                    )
                    .all(...docParams, limit) as Array<Record<string, unknown>>;
                for (const row of rows) mapDocRow(row, 0);
            }
        }

        if (types.has('contact')) {
            const contactFilter = `c.deleted_at IS NULL
        AND (? IS NULL OR EXISTS (SELECT 1 FROM project_contacts pc WHERE pc.contact_id = c.id AND pc.project_id = ?))
        AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'contact' AND et.entity_id = c.id AND tg.name = ? COLLATE NOCASE))
        AND (? IS NULL OR c.updated_at >= ?) AND (? IS NULL OR c.updated_at < ?)`;
            const contactParams = [
                projectParam,
                projectParam,
                tagName,
                tagName,
                after,
                after,
                before,
                before,
            ];
            const mapContactRow = (row: Record<string, unknown>, baseScore: number) => {
                const bm25 = Number(row['score'] ?? 0);
                const name = String(row['name']);
                const attrs = cleanCustomAttributes(String(row['custom_attributes_json'] ?? '{}'));
                const rawSnippet = String(row['excerpt'] ?? '')
                    .replace(/[{}"\\]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const excerpt = [
                    String(row['role'] ?? ''),
                    String(row['company'] ?? ''),
                    rawSnippet || String(row['notes'] ?? '').slice(0, 140),
                    attrs,
                ]
                    .filter(Boolean)
                    .join(' · ')
                    .slice(0, 360);
                const overlap = hasText ? this.tokenOverlapBonus(name, excerpt, plan.contentTokens) : 0;
                recordHit(
                    {
                        id: String(row['id']),
                        type: 'contact',
                        title: name,
                        excerpt,
                        projectId: projectParam,
                        updatedAt: String(row['updated_at']),
                    },
                    baseScore + Math.min(40, Math.max(0, -bm25)) + overlap,
                );
            };
            if (hasText) {
                const ftsSql = `SELECT c.id, c.name, c.company, c.role, c.notes, c.custom_attributes_json, c.updated_at,
          snippet(contact_search, -1, '<mark>', '</mark>', ' … ', 18) AS excerpt,
          bm25(contact_search, 0, 5, 2, 1, 1, 1, 1, 1) AS score
          FROM contact_search JOIN contacts c ON c.id = contact_search.contact_id
          WHERE contact_search MATCH ? AND ${contactFilter} ORDER BY score LIMIT ?`;
                for (const row of this.runSafeFts(
                    () =>
                        this.db.prepare(ftsSql).all(plan.strictFts, ...contactParams, limit) as Array<
                            Record<string, unknown>
                        >,
                )) {
                    mapContactRow(row, 1000);
                }
                if (!plan.hasUnknownOperator) {
                    if (plan.contentFts && plan.contentFts !== plan.strictFts) {
                        for (const row of this.runSafeFts(
                            () =>
                                this.db
                                    .prepare(ftsSql)
                                    .all(plan.contentFts, ...contactParams, limit) as Array<
                                    Record<string, unknown>
                                >,
                        )) {
                            mapContactRow(row, 650);
                        }
                    }
                    const likeRows = this.db
                        .prepare(
                            `SELECT c.id, c.name, c.company, c.role, c.notes, c.custom_attributes_json, c.updated_at,
                c.notes AS excerpt, 0 AS score
                FROM contacts c WHERE ${contactFilter}
                AND (lower(c.name) LIKE ? ESCAPE '\\' OR lower(c.company) LIKE ? ESCAPE '\\' OR lower(c.role) LIKE ? ESCAPE '\\'
                  OR lower(c.email) LIKE ? ESCAPE '\\' OR lower(c.notes) LIKE ? ESCAPE '\\' OR lower(c.custom_attributes_json) LIKE ? ESCAPE '\\')
                ORDER BY c.updated_at DESC LIMIT ?`,
                        )
                        .all(
                            ...contactParams,
                            escapedRaw,
                            escapedRaw,
                            escapedRaw,
                            escapedRaw,
                            escapedRaw,
                            escapedRaw,
                            limit,
                        ) as Array<Record<string, unknown>>;
                    for (const row of likeRows) mapContactRow(row, 430);
                    if (plan.relaxedFts && plan.contentTokens.length > 1) {
                        for (const row of this.runSafeFts(
                            () =>
                                this.db
                                    .prepare(ftsSql)
                                    .all(plan.relaxedFts, ...contactParams, limit) as Array<
                                    Record<string, unknown>
                                >,
                        )) {
                            mapContactRow(row, 180);
                        }
                    }
                }
            } else {
                const rows = this.db
                    .prepare(
                        `SELECT c.id, c.name, c.company, c.role, c.notes, c.custom_attributes_json, c.updated_at,
              substr(c.notes, 1, 180) AS excerpt, 0 AS score FROM contacts c
              WHERE ${contactFilter} ORDER BY c.updated_at DESC LIMIT ?`,
                    )
                    .all(...contactParams, limit) as Array<Record<string, unknown>>;
                for (const row of rows) mapContactRow(row, 0);
            }
        }

        if (types.has('project')) {
            const projFilter = `p.deleted_at IS NULL AND (? IS NULL OR p.id = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'project' AND et.entity_id = p.id AND tg.name = ? COLLATE NOCASE))
        AND (? IS NULL OR p.updated_at >= ?) AND (? IS NULL OR p.updated_at < ?)`;
            const projParams = [projectParam, projectParam, tagName, tagName, after, after, before, before];
            const tokenClauses =
                hasText && !plan.hasUnknownOperator && plan.contentTokens.length
                    ? plan.contentTokens.map(
                          () =>
                              "(lower(p.name) LIKE ? ESCAPE '\\' OR lower(p.description) LIKE ? ESCAPE '\\')",
                      )
                    : [];
            const tokenLikeParams =
                hasText && !plan.hasUnknownOperator
                    ? plan.contentTokens.flatMap((tok) => {
                          const p = `%${escapeLikeQuery(tok)}%`;
                          return [p, p];
                      })
                    : [];
            const rows = hasText
                ? (this.db
                      .prepare(
                          `SELECT p.id, p.name, p.description, p.updated_at FROM projects p
                WHERE ${projFilter} AND (
                  lower(p.name) LIKE ? ESCAPE '\\' OR lower(p.description) LIKE ? ESCAPE '\\'
                  ${tokenClauses.length ? `OR (${tokenClauses.join(' AND ')})` : ''}
                ) ORDER BY p.updated_at DESC LIMIT ?`,
                      )
                      .all(...projParams, escapedRaw, escapedRaw, ...tokenLikeParams, limit) as Array<
                      Record<string, unknown>
                  >)
                : (this.db
                      .prepare(
                          `SELECT p.id, p.name, p.description, p.updated_at FROM projects p
                WHERE ${projFilter} ORDER BY p.updated_at DESC LIMIT ?`,
                      )
                      .all(...projParams, limit) as Array<Record<string, unknown>>);
            for (const row of rows) {
                const name = String(row['name']);
                const description = String(row['description'] ?? '');
                const base = hasText
                    ? 720 + this.tokenOverlapBonus(name, description, plan.contentTokens)
                    : 0;
                recordHit(
                    {
                        id: String(row['id']),
                        type: 'project',
                        title: name,
                        excerpt: description.slice(0, 180),
                        projectId: String(row['id']),
                        updatedAt: String(row['updated_at']),
                    },
                    base,
                );
            }
        }

        void runTieredFts;
        return [...hits.values()]
            .sort((a, b) => b.score - a.score || b.result.updatedAt.localeCompare(a.result.updatedAt))
            .slice(0, limit)
            .map((entry) => entry.result);
    }
}
