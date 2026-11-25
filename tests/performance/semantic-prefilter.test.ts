import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { nearbyBucketValues, vectorBandBuckets } from '../../src/domain/vector-search.ts';

const FIXTURE_SIZE = 12_000;
const MODEL = 'benchmark-model';
const GENERATION = 'benchmark-generation';

test('semantic vector prefilter uses its lookup index and bounds exact-score candidates', (t) => {
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = MEMORY; PRAGMA synchronous = OFF;');
    for (const migration of MIGRATIONS) db.exec(migration.sql);

    const insertChunk = db.prepare(`INSERT INTO semantic_chunks
    (id, source_type, source_id, project_id, chunk_index, title, content, excerpt,
     source_updated_at, content_hash, model, generation_id, dimensions, vector_json, indexed_at)
    VALUES (?, 'project', ?, NULL, 0, 'Benchmark record', 'benchmark content', 'benchmark excerpt',
      '2026-11-23T00:00:00.000Z', ?, ?, ?, 4, ?, ?)`);
    const insertBucket = db.prepare(
        'INSERT INTO semantic_vector_buckets(chunk_id, band, bucket) VALUES (?, ?, ?)',
    );
    db.exec('BEGIN IMMEDIATE');
    try {
        for (let index = 0; index < FIXTURE_SIZE; index += 1) {
            const id = `chunk-${String(index).padStart(6, '0')}`;
            const vector = [
                Math.sin(index),
                Math.cos(index * 0.31),
                Math.sin(index * 0.13),
                Math.cos(index * 0.07),
            ];
            insertChunk.run(
                id,
                `source-${index}`,
                `${index.toString(16).padStart(64, '0')}`,
                MODEL,
                GENERATION,
                JSON.stringify(vector),
                new Date(1_700_000_000_000 + index * 1_000).toISOString(),
            );
            // Deterministic, evenly distributed 16-bit signatures; vector scoring remains the
            // production code's exact cosine stage, not part of this candidate-index benchmark.
            for (let band = 0; band < 3; band += 1) {
                insertBucket.run(id, band, (index * 7_919 + band * 10_729) & 0xffff);
            }
        }
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    const queryVector = [0.8, 0.3, 0.4, 0.1];
    const queryBuckets = vectorBandBuckets(queryVector);
    const bands = queryBuckets.map((hash, band) => {
        const nearby = nearbyBucketValues(hash, 2);
        return {
            clause: `(band = ? AND bucket IN (${nearby.map(() => '?').join(',')}))`,
            params: [band, ...nearby],
        };
    });
    const sql = `SELECT sc.id, count(*) AS matches
    FROM semantic_vector_buckets vb INDEXED BY semantic_vector_bucket_lookup_idx JOIN semantic_chunks sc ON sc.id = vb.chunk_id
    WHERE (${bands.map((band) => band.clause).join(' OR ')})
      AND sc.model = ? AND sc.generation_id = ?
    GROUP BY sc.id ORDER BY matches DESC, sc.indexed_at DESC LIMIT 6_000`;
    const parameters = [...bands.flatMap((band) => band.params), MODEL, GENERATION];
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters) as Array<{ detail: string }>;
    assert.ok(
        plan.some((row) => row.detail.includes('semantic_vector_bucket_lookup_idx')),
        `Expected the indexed bucket lookup, got: ${plan.map((row) => row.detail).join(' | ')}`,
    );

    const query = db.prepare(sql);
    const samples: number[] = [];
    let candidateCount = 0;
    for (let iteration = 0; iteration < 15; iteration += 1) {
        const started = process.hrtime.bigint();
        const rows = query.all(...parameters) as Array<{ id: string }>;
        samples.push(Number(process.hrtime.bigint() - started) / 1e6);
        candidateCount = rows.length;
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor((samples.length - 1) * 0.5)]!;
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
    assert.ok(candidateCount <= 6_000, `Candidate set should be bounded, got ${candidateCount}`);
    assert.ok(Number.isFinite(p50) && Number.isFinite(p95));
    console.log(
        `[semantic-prefilter] rows=${FIXTURE_SIZE} candidates=${candidateCount} p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms`,
    );
});
