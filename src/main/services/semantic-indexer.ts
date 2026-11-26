import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SearchResult, SemanticIndexReport } from '../../shared/contracts.js';
import { stripHtmlToPlainText } from '../../domain/html-text.ts';
import { splitIntoChunks, vectorBandBuckets } from '../../domain/vector-search.ts';
import { formatTextForEmbeddingModel, resolveEmbeddingModel } from './ai-models.ts';
import type { EmbeddingAdapter } from './embeddings.ts';

interface EmbeddingServiceStatus {
    available: boolean;
    models: string[];
    error: string | null;
}

interface KnowledgeSourceRow {
    source_type: SearchResult['type'];
    source_id: string;
    project_id: string | null;
    title: string;
    body: string;
    source_updated_at: string;
}

interface PendingChunk extends KnowledgeSourceRow {
    chunk_index: number;
    content: string;
    content_hash: string;
}

const UNIFIED_KNOWLEDGE_SOURCES_SQL = `
  SELECT 'project' AS source_type, id AS source_id, id AS project_id, name AS title,
    description AS body, updated_at AS source_updated_at
  FROM projects WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'contact', c.id, NULL, c.name,
    trim(
      c.company || char(10) || c.role || char(10) || c.email || char(10) || c.phone || char(10) || c.notes || char(10) ||
      replace(replace(replace(c.custom_attributes_json, '{', ''), '}', ''), '"', '')
    ),
    c.updated_at
  FROM contacts c WHERE c.deleted_at IS NULL
  UNION ALL
  SELECT 'note', id, project_id, title, content, updated_at
  FROM notes WHERE locked = 0 AND deleted_at IS NULL
  UNION ALL
  SELECT 'task', t.id, t.project_id, t.title,
    trim(
      t.description || char(10) ||
      coalesce(
        (
          SELECT group_concat(
            trim(tb.reason || coalesce((SELECT ' waiting on ' || c.name FROM contacts c WHERE c.id = tb.waiting_contact_id), '') || CASE WHEN tb.resolution_note <> '' THEN ' ' || tb.resolution_note ELSE '' END),
            char(10)
          )
          FROM task_blockers tb WHERE tb.task_id = t.id
        ),
        ''
      )
    ),
    t.updated_at
  FROM tasks t WHERE t.deleted_at IS NULL
  UNION ALL
  SELECT 'document', id, project_id, title, extracted_text, updated_at
  FROM documents WHERE status = 'indexed' AND deleted_at IS NULL AND is_encrypted = 0
`;

export class SemanticIndexer {
    private readonly db: Database.Database;
    private readonly embeddingAdapter: EmbeddingAdapter;
    private readonly getStatus: () => Promise<EmbeddingServiceStatus>;

    constructor(
        db: Database.Database,
        embeddingAdapter: EmbeddingAdapter,
        getStatus: () => Promise<EmbeddingServiceStatus>,
    ) {
        this.db = db;
        this.embeddingAdapter = embeddingAdapter;
        this.getStatus = getStatus;
    }

    private formatSourceText(source: KnowledgeSourceRow): string {
        const rawBody = String(source.body ?? '').slice(0, 500_000);
        const body = source.source_type === 'note' ? stripHtmlToPlainText(rawBody) : rawBody;
        return `${String(source.title).trim()}\n\n${body}`.trim();
    }

    private saveSetting(key: string, value: unknown): void {
        const timestamp = new Date().toISOString();
        this.db
            .prepare(
                `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
            )
            .run(key, JSON.stringify(value), timestamp);
    }

    private insertChunkStatements() {
        const insert = this.db.prepare(`INSERT INTO semantic_chunks
      (id, source_type, source_id, project_id, chunk_index, title, content, excerpt, source_updated_at,
       content_hash, model, generation_id, dimensions, vector_json, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const insertBucket = this.db.prepare(
            'INSERT INTO semantic_vector_buckets (chunk_id, band, bucket) VALUES (?, ?, ?)',
        );
        return { insert, insertBucket };
    }

    /** Build a new generation off to the side, then atomically switch active generation after every batch succeeds. */
    async indexLocalKnowledge(
        signal?: AbortSignal,
        onProgress?: (progress: { sources: number; chunks: number; phase: string }) => void,
    ): Promise<SemanticIndexReport> {
        const status = await this.getStatus();
        if (!status.available)
            throw new Error(`Ollama is unavailable (${status.error ?? 'connection failed'}).`);
        const { model } = resolveEmbeddingModel(this.db, status.models);
        if (!status.models.includes(model))
            throw new Error(
                `Embedding model “${model}” is not installed. Pull it in Ollama or change ai.embeddingModel in Settings.`,
            );
        signal?.throwIfAborted();
        const generation = randomUUID();
        const startedAt = new Date().toISOString();
        this.saveSetting('ai.semantic.progress', {
            status: 'indexing',
            model,
            generation,
            chunks: 0,
            startedAt,
        });

        const sources = this.db.prepare(UNIFIED_KNOWLEDGE_SOURCES_SQL).all() as KnowledgeSourceRow[];
        const pending: PendingChunk[] = [];
        let sourceCount = 0;
        let chunkCount = 0;
        let dimensions = 0;
        const { insert, insertBucket } = this.insertChunkStatements();

        const persistBatch = async (flushAll = false): Promise<void> => {
            while (pending.length >= 16 || (flushAll && pending.length > 0)) {
                const batch = pending.splice(0, 16);
                signal?.throwIfAborted();
                const vectors = await this.embeddingAdapter.embed(
                    batch.map((item) => formatTextForEmbeddingModel(item.content, model, 'document')),
                    model,
                    signal,
                );
                signal?.throwIfAborted();
                if (vectors.length !== batch.length)
                    throw new Error('The embedding adapter returned an invalid batch size.');
                const timestamp = new Date().toISOString();
                this.db.exec('BEGIN IMMEDIATE');
                try {
                    batch.forEach((item, index) => {
                        const vector = vectors[index]!;
                        if (dimensions && vector.length !== dimensions)
                            throw new Error('Embedding model returned inconsistent vector dimensions.');
                        dimensions = vector.length;
                        const chunkId = randomUUID();
                        insert.run(
                            chunkId,
                            item.source_type,
                            item.source_id,
                            item.project_id,
                            item.chunk_index,
                            item.title,
                            item.content,
                            item.content.slice(0, 320),
                            item.source_updated_at,
                            item.content_hash,
                            model,
                            generation,
                            vector.length,
                            JSON.stringify(vector),
                            timestamp,
                        );
                        vectorBandBuckets(vector).forEach((bucket, band) =>
                            insertBucket.run(chunkId, band, bucket),
                        );
                    });
                    this.db.exec('COMMIT');
                } catch (error) {
                    this.db.exec('ROLLBACK');
                    throw error;
                }
                chunkCount += batch.length;
                this.saveSetting('ai.semantic.progress', {
                    status: 'indexing',
                    model,
                    generation,
                    sources: sourceCount,
                    chunks: chunkCount,
                    startedAt,
                });
                onProgress?.({ sources: sourceCount, chunks: chunkCount, phase: 'embedding' });
            }
        };

        try {
            for (const source of sources) {
                signal?.throwIfAborted();
                const text = this.formatSourceText(source);
                if (!text) continue;
                const chunks = splitIntoChunks(text, 400, 60);
                if (!chunks.length) continue;
                sourceCount += 1;
                const contentHash = createHash('sha256').update(text).digest('hex');
                chunks.forEach((content, chunkIndex) =>
                    pending.push({ ...source, chunk_index: chunkIndex, content, content_hash: contentHash }),
                );
                if (pending.length >= 16) await persistBatch(false);
                if (chunkCount + pending.length > 100_000)
                    throw new Error(
                        'The semantic index exceeds the 100,000 chunk safety limit. Narrow your data set or use FTS5 for this workspace.',
                    );
                if (sourceCount % 100 === 0)
                    onProgress?.({
                        sources: sourceCount,
                        chunks: chunkCount + pending.length,
                        phase: 'collecting',
                    });
            }
            await persistBatch(true);
            signal?.throwIfAborted();
            if (!chunkCount)
                throw new Error('No eligible unlocked text records were found for semantic indexing.');
            this.saveSetting('ai.semantic.activeGeneration', generation);
            this.saveSetting('ai.semantic.activeModel', model);
            this.saveSetting('ai.semantic.indexedAt', new Date().toISOString());
            this.db
                .prepare('DELETE FROM semantic_chunks WHERE model = ? AND generation_id <> ?')
                .run(model, generation);
            const completedAt = new Date().toISOString();
            const report = { model, sources: sourceCount, chunks: chunkCount, completedAt };
            this.saveSetting('ai.semantic.progress', { status: 'complete', ...report });
            return report;
        } catch (error) {
            const message =
                error instanceof Error ? error.message.slice(0, 1000) : 'Semantic indexing failed.';
            this.saveSetting('ai.semantic.progress', {
                status: 'failed',
                model,
                generation,
                sources: sourceCount,
                chunks: chunkCount,
                error: message,
                failedAt: new Date().toISOString(),
            });
            this.db
                .prepare('DELETE FROM semantic_chunks WHERE model = ? AND generation_id = ?')
                .run(model, generation);
            throw error;
        }
    }

    /** Incrementally embed records added or modified, and remove orphaned/locked/deleted records. */
    async syncMissingSources(signal?: AbortSignal): Promise<{ syncedSources: number; syncedChunks: number }> {
        const modelRow = this.db
            .prepare("SELECT value_json FROM app_settings WHERE key = 'ai.semantic.activeModel'")
            .get() as { value_json: string } | undefined;
        const genRow = this.db
            .prepare("SELECT value_json FROM app_settings WHERE key = 'ai.semantic.activeGeneration'")
            .get() as { value_json: string } | undefined;
        if (!modelRow || !genRow) return { syncedSources: 0, syncedChunks: 0 };
        const model = String(JSON.parse(modelRow.value_json));
        const generation = String(JSON.parse(genRow.value_json));

        this.db
            .prepare(
                `DELETE FROM semantic_chunks
                 WHERE model = ? AND generation_id = ?
                   AND NOT EXISTS (
                     SELECT 1 FROM (${UNIFIED_KNOWLEDGE_SOURCES_SQL}) src
                     WHERE src.source_type = semantic_chunks.source_type
                       AND src.source_id = semantic_chunks.source_id
                   )`,
            )
            .run(model, generation);

        const missingRows = this.db
            .prepare(
                `SELECT src.* FROM (${UNIFIED_KNOWLEDGE_SOURCES_SQL}) src
                 WHERE trim(coalesce(src.title, '') || coalesce(src.body, '')) <> ''
                   AND (
                     NOT EXISTS (
                       SELECT 1 FROM semantic_chunks sc
                       WHERE sc.source_type = src.source_type
                         AND sc.source_id = src.source_id
                         AND sc.model = ?
                         AND sc.generation_id = ?
                     )
                     OR EXISTS (
                       SELECT 1 FROM semantic_chunks sc
                       WHERE sc.source_type = src.source_type
                         AND sc.source_id = src.source_id
                         AND sc.model = ?
                         AND sc.generation_id = ?
                         AND sc.source_updated_at <> src.source_updated_at
                     )
                   )
                 LIMIT 80`,
            )
            .all(model, generation, model, generation) as KnowledgeSourceRow[];
        if (!missingRows.length) return { syncedSources: 0, syncedChunks: 0 };

        const groupedBySource = new Map<string, PendingChunk[]>();
        let syncedSources = 0;
        for (const source of missingRows) {
            signal?.throwIfAborted();
            const text = this.formatSourceText(source);
            if (!text) continue;
            const chunks = splitIntoChunks(text, 400, 60);
            if (!chunks.length) continue;
            syncedSources += 1;
            const contentHash = createHash('sha256').update(text).digest('hex');
            const sourceKey = `${source.source_type}:${source.source_id}`;
            groupedBySource.set(
                sourceKey,
                chunks.map((content, chunkIndex) => ({
                    ...source,
                    chunk_index: chunkIndex,
                    content,
                    content_hash: contentHash,
                })),
            );
        }
        const pending = [...groupedBySource.values()].flat();
        if (!pending.length) return { syncedSources: 0, syncedChunks: 0 };

        const vectorsByItem: number[][] = [];
        for (let offset = 0; offset < pending.length; offset += 16) {
            signal?.throwIfAborted();
            const batch = pending.slice(offset, offset + 16);
            const vectors = await this.embeddingAdapter.embed(
                batch.map((item) => formatTextForEmbeddingModel(item.content, model, 'document')),
                model,
                signal,
            );
            if (vectors.length !== batch.length)
                throw new Error('The embedding adapter returned an invalid batch size.');
            vectorsByItem.push(...vectors);
        }

        const { insert, insertBucket } = this.insertChunkStatements();
        const del = this.db.prepare(
            'DELETE FROM semantic_chunks WHERE source_type = ? AND source_id = ? AND model = ? AND generation_id = ?',
        );
        const timestamp = new Date().toISOString();
        let cursor = 0;
        this.db.exec('BEGIN IMMEDIATE');
        try {
            for (const sourceChunks of groupedBySource.values()) {
                const first = sourceChunks[0]!;
                del.run(first.source_type, first.source_id, model, generation);
                for (const item of sourceChunks) {
                    const vector = vectorsByItem[cursor++]!;
                    const chunkId = randomUUID();
                    insert.run(
                        chunkId,
                        item.source_type,
                        item.source_id,
                        item.project_id,
                        item.chunk_index,
                        item.title,
                        item.content,
                        item.content.slice(0, 320),
                        item.source_updated_at,
                        item.content_hash,
                        model,
                        generation,
                        vector.length,
                        JSON.stringify(vector),
                        timestamp,
                    );
                    vectorBandBuckets(vector).forEach((bucket, band) =>
                        insertBucket.run(chunkId, band, bucket),
                    );
                }
            }
            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
        return { syncedSources, syncedChunks: pending.length };
    }
}
