import type Database from 'better-sqlite3';
import type { SearchResult } from '../../../shared/contracts.js';
import { stripHtmlToPlainText } from '../../../domain/html-text.ts';
import { escapeLikeQuery } from '../../../domain/pagination.ts';
import type { ParsedSearchQuery } from '../../../domain/search-query.ts';
import type { buildLexicalQueryPlan } from '../../../domain/validation.ts';

type SearchRow = Array<Record<string, unknown>>;

export interface WorkspaceSearchContext {
    db: Database.Database;
    filters: ParsedSearchQuery;
    plan: ReturnType<typeof buildLexicalQueryPlan>;
    projectParam: string | null;
    tagName: string | null;
    after: string | null;
    before: string | null;
    hasText: boolean;
    escapedRaw: string;
    limit: number;
    recordHit: (result: SearchResult, score: number) => void;
    runSafeFts: <T>(queryFn: () => T[]) => T[];
    tokenOverlapBonus: (title: string, text: string, tokens: readonly string[]) => number;
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

function runFtsTiers(
    context: WorkspaceSearchContext,
    ftsSql: string,
    params: readonly unknown[],
    onRow: (row: Record<string, unknown>, baseScore: number) => void,
    onLikeFallback: () => void,
): void {
    const { db, plan, limit, runSafeFts } = context;
    for (const row of runSafeFts(
        () => db.prepare(ftsSql).all(plan.strictFts, ...params, limit) as SearchRow,
    )) {
        onRow(row, 1000);
    }
    if (plan.hasUnknownOperator) return;
    if (plan.contentFts && plan.contentFts !== plan.strictFts) {
        for (const row of runSafeFts(
            () => db.prepare(ftsSql).all(plan.contentFts, ...params, limit) as SearchRow,
        )) {
            onRow(row, 650);
        }
    }
    onLikeFallback();
    if (plan.relaxedFts && plan.contentTokens.length > 1) {
        for (const row of runSafeFts(
            () => db.prepare(ftsSql).all(plan.relaxedFts, ...params, limit) as SearchRow,
        )) {
            onRow(row, 180);
        }
    }
}

export function searchNotes(context: WorkspaceSearchContext): void {
    const { db, filters, plan, projectParam, tagName, after, before, hasText, escapedRaw, limit } = context;
    const baseFilter = `n.deleted_at IS NULL AND n.locked = 0 AND (? IS NULL OR n.project_id = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'note' AND et.entity_id = n.id AND tg.name = ? COLLATE NOCASE))
        AND (? IS NULL OR n.updated_at >= ?) AND (? IS NULL OR n.updated_at < ?)`;
    const common = [projectParam, projectParam, tagName, tagName, after, after, before, before];
    const mapNoteRow = (
        row: Record<string, unknown>,
        highlighted: boolean,
        baseScore: number,
        precomputedPlain?: string,
    ) => {
        const cleaned = stripHtmlToPlainText(String(row['excerpt'] ?? ''), { preserveMark: highlighted });
        const fallbackClean = precomputedPlain ?? stripHtmlToPlainText(String(row['fallback_content'] ?? ''));
        const needle = filters.text.trim().toLowerCase();
        let slice = cleaned;
        if (!highlighted && needle) {
            const matchIdx = fallbackClean.toLowerCase().indexOf(needle);
            if (matchIdx >= 0) {
                const start = Math.max(0, matchIdx - 60);
                const end = Math.min(fallbackClean.length, start + 180);
                slice = `${start > 0 ? '… ' : ''}${fallbackClean.slice(start, end)}${end < fallbackClean.length ? ' …' : ''}`;
            }
        }
        const excerpt = (highlighted ? slice : slice.slice(0, 190)) || fallbackClean.slice(0, 180);
        const title = String(row['title']);
        const bm25 = Number(row['score'] ?? 0);
        const overlap = hasText
            ? context.tokenOverlapBonus(title, `${cleaned} ${fallbackClean}`, plan.contentTokens)
            : 0;
        context.recordHit(
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
    if (!hasText) {
        const rows = db
            .prepare(
                `SELECT n.id, n.project_id, n.title, n.updated_at, substr(n.content, 1, 400) AS excerpt,
              substr(n.content, 1, 400) AS fallback_content, 0 AS score FROM notes n
              WHERE ${baseFilter} ORDER BY n.updated_at DESC LIMIT ?`,
            )
            .all(...common, limit) as SearchRow;
        for (const row of rows) mapNoteRow(row, false, 0);
        return;
    }
    const ftsSql = `SELECT n.id, n.project_id, n.title, n.updated_at,
          snippet(note_search, 3, '<mark>', '</mark>', ' … ', 18) AS excerpt,
          substr(n.content, 1, 600) AS fallback_content,
          bm25(note_search, 0, 0, 6, 1) AS score
          FROM note_search JOIN notes n ON n.id = note_search.note_id
          WHERE note_search MATCH ? AND ${baseFilter} ORDER BY score LIMIT ?`;
    runFtsTiers(
        context,
        ftsSql,
        common,
        (row, score) => mapNoteRow(row, true, score),
        () => {
            const likeRows = db
                .prepare(
                    `SELECT n.id, n.project_id, n.title, n.updated_at,
                substr(n.content, 1, 200000) AS excerpt, substr(n.content, 1, 200000) AS fallback_content, 0 AS score
                FROM notes n WHERE ${baseFilter}
                AND (lower(n.title) LIKE ? ESCAPE '\\' OR lower(n.content) LIKE ? ESCAPE '\\')
                ORDER BY n.updated_at DESC LIMIT ?`,
                )
                .all(...common, escapedRaw, escapedRaw, limit) as SearchRow;
            const needle = filters.text.trim().toLowerCase();
            for (const row of likeRows) {
                const plain = stripHtmlToPlainText(String(row['fallback_content'] ?? ''));
                if (
                    String(row['title']).toLowerCase().includes(needle) ||
                    plain.toLowerCase().includes(needle)
                ) {
                    mapNoteRow(row, false, 450, plain);
                }
            }
        },
    );
}

export function searchTasks(context: WorkspaceSearchContext): void {
    const { db, filters, plan, projectParam, tagName, after, before, hasText, escapedRaw, limit } = context;
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
        const overlap = hasText ? context.tokenOverlapBonus(title, excerpt, plan.contentTokens) : 0;
        context.recordHit(
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
    if (!hasText) {
        const rows = db
            .prepare(
                `SELECT t.id, t.project_id, t.title, t.updated_at, substr(t.description, 1, 180) AS excerpt, 0 AS score
              FROM tasks t WHERE ${taskFilter} ORDER BY t.updated_at DESC LIMIT ?`,
            )
            .all(...taskParams, limit) as SearchRow;
        for (const row of rows) mapTaskRow(row, 0);
        return;
    }
    const ftsSql = `SELECT t.id, t.project_id, t.title, t.updated_at,
          snippet(task_search, 3, '<mark>', '</mark>', ' … ', 18) AS excerpt,
          bm25(task_search, 0, 0, 6, 1) AS score
          FROM task_search JOIN tasks t ON t.id = task_search.task_id
          WHERE task_search MATCH ? AND ${taskFilter} ORDER BY score LIMIT ?`;
    runFtsTiers(context, ftsSql, taskParams, mapTaskRow, () => {
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
        const blockerRows = db
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
            ) as SearchRow;
        for (const row of blockerRows) mapTaskRow(row, 480);
    });
}

export function searchDocuments(context: WorkspaceSearchContext): void {
    const { db, filters, plan, projectParam, tagName, after, before, hasText, escapedRaw, limit } = context;
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
        const overlap = hasText ? context.tokenOverlapBonus(title, excerpt, plan.contentTokens) : 0;
        context.recordHit(
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
    if (!hasText) {
        const rows = db
            .prepare(
                `SELECT d.id, d.project_id, d.title, d.updated_at, substr(d.extracted_text, 1, 180) AS excerpt, 0 AS score
              FROM documents d WHERE ${docFilter} ORDER BY d.updated_at DESC LIMIT ?`,
            )
            .all(...docParams, limit) as SearchRow;
        for (const row of rows) mapDocRow(row, 0);
        return;
    }
    const ftsSql = `SELECT d.id, d.project_id, d.title, d.updated_at,
          snippet(document_search, 3, '<mark>', '</mark>', ' … ', 18) AS excerpt,
          bm25(document_search, 0, 0, 6, 1) AS score
          FROM document_search JOIN documents d ON d.id = document_search.document_id
          WHERE document_search MATCH ? AND ${docFilter} ORDER BY score LIMIT ?`;
    runFtsTiers(context, ftsSql, docParams, mapDocRow, () => {
        const likeRows = db
            .prepare(
                `SELECT d.id, d.project_id, d.title, d.updated_at, substr(d.extracted_text, 1, 200) AS excerpt, 0 AS score
                FROM documents d WHERE ${docFilter}
                AND (lower(d.title) LIKE ? ESCAPE '\\' OR lower(d.original_name) LIKE ? ESCAPE '\\' OR lower(d.extracted_text) LIKE ? ESCAPE '\\')
                ORDER BY d.updated_at DESC LIMIT ?`,
            )
            .all(...docParams, escapedRaw, escapedRaw, escapedRaw, limit) as SearchRow;
        for (const row of likeRows) mapDocRow(row, 420);
    });
}

export function searchContacts(context: WorkspaceSearchContext): void {
    const { db, plan, projectParam, tagName, after, before, hasText, escapedRaw, limit } = context;
    const contactFilter = `c.deleted_at IS NULL
        AND (? IS NULL OR EXISTS (SELECT 1 FROM project_contacts pc WHERE pc.contact_id = c.id AND pc.project_id = ?))
        AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'contact' AND et.entity_id = c.id AND tg.name = ? COLLATE NOCASE))
        AND (? IS NULL OR c.updated_at >= ?) AND (? IS NULL OR c.updated_at < ?)`;
    const contactParams = [projectParam, projectParam, tagName, tagName, after, after, before, before];
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
        const overlap = hasText ? context.tokenOverlapBonus(name, excerpt, plan.contentTokens) : 0;
        context.recordHit(
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
    if (!hasText) {
        const rows = db
            .prepare(
                `SELECT c.id, c.name, c.company, c.role, c.notes, c.custom_attributes_json, c.updated_at,
              substr(c.notes, 1, 180) AS excerpt, 0 AS score FROM contacts c
              WHERE ${contactFilter} ORDER BY c.updated_at DESC LIMIT ?`,
            )
            .all(...contactParams, limit) as SearchRow;
        for (const row of rows) mapContactRow(row, 0);
        return;
    }
    const ftsSql = `SELECT c.id, c.name, c.company, c.role, c.notes, c.custom_attributes_json, c.updated_at,
          snippet(contact_search, -1, '<mark>', '</mark>', ' … ', 18) AS excerpt,
          bm25(contact_search, 0, 5, 2, 1, 1, 1, 1, 1) AS score
          FROM contact_search JOIN contacts c ON c.id = contact_search.contact_id
          WHERE contact_search MATCH ? AND ${contactFilter} ORDER BY score LIMIT ?`;
    runFtsTiers(context, ftsSql, contactParams, mapContactRow, () => {
        const likeRows = db
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
            ) as SearchRow;
        for (const row of likeRows) mapContactRow(row, 430);
    });
}

export function searchProjects(context: WorkspaceSearchContext): void {
    const { db, plan, projectParam, tagName, after, before, hasText, escapedRaw, limit } = context;
    const projFilter = `p.deleted_at IS NULL AND (? IS NULL OR p.id = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'project' AND et.entity_id = p.id AND tg.name = ? COLLATE NOCASE))
        AND (? IS NULL OR p.updated_at >= ?) AND (? IS NULL OR p.updated_at < ?)`;
    const projParams = [projectParam, projectParam, tagName, tagName, after, after, before, before];
    const tokenClauses =
        hasText && !plan.hasUnknownOperator && plan.contentTokens.length
            ? plan.contentTokens.map(
                  () => "(lower(p.name) LIKE ? ESCAPE '\\' OR lower(p.description) LIKE ? ESCAPE '\\')",
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
        ? (db
              .prepare(
                  `SELECT p.id, p.name, p.description, p.updated_at FROM projects p
                WHERE ${projFilter} AND (
                  lower(p.name) LIKE ? ESCAPE '\\' OR lower(p.description) LIKE ? ESCAPE '\\'
                  ${tokenClauses.length ? `OR (${tokenClauses.join(' AND ')})` : ''}
                ) ORDER BY p.updated_at DESC LIMIT ?`,
              )
              .all(...projParams, escapedRaw, escapedRaw, ...tokenLikeParams, limit) as SearchRow)
        : (db
              .prepare(
                  `SELECT p.id, p.name, p.description, p.updated_at FROM projects p
                WHERE ${projFilter} ORDER BY p.updated_at DESC LIMIT ?`,
              )
              .all(...projParams, limit) as SearchRow);
    for (const row of rows) {
        const name = String(row['name']);
        const description = String(row['description'] ?? '');
        const base = hasText ? 720 + context.tokenOverlapBonus(name, description, plan.contentTokens) : 0;
        context.recordHit(
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
