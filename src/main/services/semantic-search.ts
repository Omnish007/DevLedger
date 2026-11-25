import type Database from 'better-sqlite3';
import type { SearchResult } from '../../shared/contracts.js';
import {
    cosineSimilarity,
    semanticCandidateExpression,
    mergeCandidateIds,
    vectorBandBuckets,
    nearbyBucketValues,
} from '../../domain/vector-search.ts';
import { parseSearchQuery } from '../../domain/search-query.ts';
import type { EmbeddingAdapter } from './embeddings.ts';

export class SemanticSearchService {
    private readonly db: Database.Database;
    private readonly embeddingAdapter: EmbeddingAdapter;

    constructor(db: Database.Database, embeddingAdapter: EmbeddingAdapter) {
        this.db = db;
        this.embeddingAdapter = embeddingAdapter;
    }

    private ensureVectorBuckets(model: string, generation: string): void {
        const select = this.db.prepare(`
      SELECT sc.id, sc.vector_json FROM semantic_chunks sc
      WHERE sc.model = ? AND sc.generation_id = ?
        AND NOT EXISTS (SELECT 1 FROM semantic_vector_buckets vb WHERE vb.chunk_id = sc.id)
      ORDER BY sc.id LIMIT 2_000
    `);
        const insert = this.db.prepare(
            'INSERT OR IGNORE INTO semantic_vector_buckets (chunk_id, band, bucket) VALUES (?, ?, ?)',
        );
        // Legacy vector generations are backfilled completely in bounded transactions.
        // New generations already write buckets in the same transaction as each vector.
        while (true) {
            const missing = select.all(model, generation) as Array<{ id: string; vector_json: string }>;
            if (!missing.length) break;
            this.db
                .transaction(() => {
                    for (const row of missing) {
                        try {
                            const vector = JSON.parse(row.vector_json) as number[];
                            vectorBandBuckets(vector).forEach((bucket, band) =>
                                insert.run(row.id, band, bucket),
                            );
                            if (vector.length === 0) throw new Error('empty vector');
                        } catch {
                            // Mark malformed vectors as handled so they cannot cause an infinite backfill loop.
                            insert.run(row.id, 0, 0);
                            insert.run(row.id, 1, 0);
                            insert.run(row.id, 2, 0);
                        }
                    }
                })
                .immediate();
        }
    }

    async semanticSearch(query: string, projectId?: string | null): Promise<SearchResult[]> {
        const normalized = query.trim().replace(/\s+/g, ' ');
        if (!normalized || normalized.length > 500)
            throw new Error('Enter a search query of 1–500 characters.');
        const filters = parseSearchQuery(normalized);
        if (!filters.text)
            throw new Error('Add a text phrase for semantic search; structured filters alone use FTS5.');
        const modelRow = this.db
            .prepare("SELECT value_json FROM app_settings WHERE key = 'ai.semantic.activeModel'")
            .get() as { value_json: string } | undefined;
        const generationRow = this.db
            .prepare("SELECT value_json FROM app_settings WHERE key = 'ai.semantic.activeGeneration'")
            .get() as { value_json: string } | undefined;
        if (!modelRow || !generationRow)
            throw new Error('Build the local semantic index in Settings before enabling semantic search.');
        const model = String(JSON.parse(modelRow.value_json));
        const generation = String(JSON.parse(generationRow.value_json));
        this.ensureVectorBuckets(model, generation);
        const [queryVector] = await this.embeddingAdapter.embed([filters.text], model);
        if (!queryVector) throw new Error('The embedding model did not return a query vector.');
        let scopedProjectId = projectId ?? null;
        if (filters.project) {
            const exact = this.db
                .prepare(
                    'SELECT id FROM projects WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL LIMIT 2',
                )
                .all(filters.project) as Array<{ id: string }>;
            const matches = exact.length
                ? exact
                : (this.db
                      .prepare(
                          "SELECT id FROM projects WHERE name LIKE ? ESCAPE '\\' AND deleted_at IS NULL ORDER BY name LIMIT 3",
                      )
                      .all(`%${filters.project.replace(/[\\%_]/g, '\\$&')}%`) as Array<{ id: string }>);
            if (matches.length !== 1 || (scopedProjectId && scopedProjectId !== matches[0]!.id)) return [];
            scopedProjectId = matches[0]!.id;
        }
        const clauses = ['model = ?', 'generation_id = ?'];
        const params: unknown[] = [model, generation];
        if (scopedProjectId) {
            clauses.push(`(project_id = ? OR (source_type = 'contact' AND EXISTS (
        SELECT 1 FROM project_contacts pc WHERE pc.contact_id = sc.source_id AND pc.project_id = ?
      )))`);
            params.push(scopedProjectId, scopedProjectId);
        }
        if (filters.entityType) {
            clauses.push('source_type = ?');
            params.push(filters.entityType);
        }
        if (filters.extension) {
            clauses.push(
                `source_type = 'document' AND EXISTS (SELECT 1 FROM documents d WHERE d.id = sc.source_id AND d.extension = ? AND d.deleted_at IS NULL AND d.is_encrypted = 0)`,
            );
            params.push(filters.extension);
        }
        if (filters.tag) {
            clauses.push(
                `EXISTS (SELECT 1 FROM entity_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entity_type = sc.source_type AND et.entity_id = sc.source_id AND t.name = ? COLLATE NOCASE)`,
            );
            params.push(filters.tag);
        }
        if (filters.after) {
            clauses.push('source_updated_at >= ?');
            params.push(`${filters.after}T00:00:00.000Z`);
        }
        if (filters.before) {
            clauses.push('source_updated_at < ?');
            params.push(`${filters.before}T00:00:00.000Z`);
        }
        if (filters.status) {
            const statusPredicate =
                filters.status === 'blocked'
                    ? "status = 'blocked'"
                    : filters.status === 'completed'
                      ? "status = 'completed'"
                      : filters.status === 'in_progress'
                        ? "status = 'in_progress'"
                        : "status NOT IN ('completed', 'cancelled') AND ((due_date IS NOT NULL AND due_date < date('now', 'localtime')) OR (due_date IS NULL AND due_at IS NOT NULL AND due_at < ?))";
            clauses.push(
                `source_type = 'task' AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = sc.source_id AND ${statusPredicate})`,
            );
            if (filters.status === 'overdue') params.push(new Date().toISOString());
        }
        // Three-band random-hyperplane LSH reduces a large generation to a bounded
        // cosine-neighborhood candidate set. FTS5 adds exact lexical hits and the recent
        // window protects recall while a fresh index is warming up.
        const candidateIds: string[][] = [];
        const bandHashes = vectorBandBuckets(queryVector);
        const bandClauses: string[] = [];
        const bandParams: number[] = [];
        bandHashes.forEach((hash, band) => {
            const nearby = nearbyBucketValues(hash, 2);
            bandClauses.push(`(band = ? AND bucket IN (${nearby.map(() => '?').join(',')}))`);
            bandParams.push(band, ...nearby);
        });
        const vectorCandidates = this.db
            .prepare(
                `
      SELECT sc.id, count(*) AS matches
      FROM semantic_vector_buckets vb INDEXED BY semantic_vector_bucket_lookup_idx JOIN semantic_chunks sc ON sc.id = vb.chunk_id
      WHERE (${bandClauses.join(' OR ')}) AND ${clauses.join(' AND ')}
      GROUP BY sc.id ORDER BY matches DESC, sc.indexed_at DESC LIMIT 6_000
    `,
            )
            .all(...bandParams, ...params) as Array<{ id: string }>;
        candidateIds.push(vectorCandidates.map((item) => String(item.id)));

        const ftsExpression = semanticCandidateExpression(filters.text);
        if (ftsExpression) {
            try {
                const lexicalCandidates = this.db
                    .prepare(
                        `
          SELECT sc.id
          FROM semantic_chunk_search
          JOIN semantic_chunks sc ON sc.id = semantic_chunk_search.chunk_id
          WHERE semantic_chunk_search MATCH ? AND ${clauses.join(' AND ')}
          ORDER BY bm25(semantic_chunk_search)
          LIMIT 1_500
        `,
                    )
                    .all(ftsExpression, ...params) as Array<{ id: string }>;
                candidateIds.push(lexicalCandidates.map((item) => String(item.id)));
            } catch {
                // The vector index remains usable if the auxiliary FTS index requires repair.
            }
        }
        const recentCandidates = this.db
            .prepare(
                `
      SELECT sc.id FROM semantic_chunks sc WHERE ${clauses.join(' AND ')}
      ORDER BY indexed_at DESC LIMIT 500
    `,
            )
            .all(...params) as Array<{ id: string }>;
        candidateIds.push(recentCandidates.map((item) => String(item.id)));
        const selectedIds = mergeCandidateIds(...candidateIds).slice(0, 8_000);
        if (!selectedIds.length) return [];
        const placeholders = selectedIds.map(() => '?').join(',');
        const rows = this.db
            .prepare(
                `
      SELECT sc.source_type, sc.source_id, sc.project_id, sc.title, sc.excerpt, sc.source_updated_at, sc.dimensions, sc.vector_json
      FROM semantic_chunks sc
      WHERE ${clauses.join(' AND ')} AND sc.id IN (${placeholders})
    `,
            )
            .iterate(...params, ...selectedIds) as Iterable<Record<string, unknown>>;
        const best = new Map<string, { result: SearchResult; score: number }>();
        for (const row of rows) {
            if (Number(row['dimensions']) !== queryVector.length) continue;
            let vector: number[];
            try {
                vector = JSON.parse(String(row['vector_json'])) as number[];
            } catch {
                continue;
            }
            const score = cosineSimilarity(queryVector, vector);
            if (!Number.isFinite(score)) continue;
            const type = String(row['source_type']) as SearchResult['type'];
            const id = String(row['source_id']);
            const key = `${type}:${id}`;
            if ((best.get(key)?.score ?? Number.NEGATIVE_INFINITY) >= score) continue;
            best.set(key, {
                score,
                result: {
                    id,
                    type,
                    title: String(row['title']),
                    excerpt: String(row['excerpt']),
                    projectId: row['project_id'] ? String(row['project_id']) : null,
                    updatedAt: String(row['source_updated_at']),
                },
            });
        }
        return [...best.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, 40)
            .map((item) => item.result);
    }
}
