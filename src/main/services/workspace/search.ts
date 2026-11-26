import type { SearchInput, SearchResult } from '../../../shared/contracts.js';
import { escapeLikeQuery } from '../../../domain/pagination.ts';
import { parseSearchQuery } from '../../../domain/search-query.ts';
import { buildLexicalQueryPlan } from '../../../domain/validation.ts';
import { WorkspaceDashboardService } from './dashboard.ts';
import {
    type WorkspaceSearchContext,
    searchContacts,
    searchDocuments,
    searchNotes,
    searchProjects,
    searchTasks,
} from './search-entities.ts';

interface ScoredHit {
    result: SearchResult;
    score: number;
    matchedTokens: Set<string>;
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

        const hasText = Boolean(plan.strictFts);
        const hits = new Map<string, ScoredHit>();
        const context: WorkspaceSearchContext = {
            db: this.db,
            filters,
            plan,
            projectParam,
            tagName,
            after: filters.after ? `${filters.after}T00:00:00.000Z` : null,
            before: filters.before ? `${filters.before}T00:00:00.000Z` : null,
            hasText,
            escapedRaw: `%${escapeLikeQuery(filters.text.trim().toLowerCase())}%`,
            limit,
            runSafeFts: (queryFn) => this.runSafeFts(queryFn),
            tokenOverlapBonus: (title, text, tokens) => this.tokenOverlapBonus(title, text, tokens),
            recordHit: (result, score) => {
                const key = `${result.type}:${result.id}`;
                const computed =
                    score +
                    (hasText ? this.titleMatchBonus(result.title, filters.text, plan.contentTokens) : 0);
                const existing = hits.get(key);
                if (!existing || computed > existing.score) {
                    hits.set(key, {
                        result,
                        score: computed,
                        matchedTokens: new Set(plan.contentTokens),
                    });
                }
            },
        };

        if (types.has('note')) searchNotes(context);
        if (types.has('task')) searchTasks(context);
        if (types.has('document')) searchDocuments(context);
        if (types.has('contact')) searchContacts(context);
        if (types.has('project')) searchProjects(context);

        return [...hits.values()]
            .sort((a, b) => b.score - a.score || b.result.updatedAt.localeCompare(a.result.updatedAt))
            .slice(0, limit)
            .map((entry) => entry.result);
    }
}
