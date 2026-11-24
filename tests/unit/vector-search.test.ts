import assert from 'node:assert/strict';
import test from 'node:test';
import { cosineSimilarity, reciprocalRankFusion, splitIntoChunks } from '../../src/domain/vector-search.ts';

test('chunks long text with overlap while keeping small text intact', () => {
  const short = 'A small technical decision.';
  assert.deepEqual(splitIntoChunks(short), [short]);
  const words = Array.from({ length: 1_000 }, (_, index) => `word${index}`);
  const chunks = splitIntoChunks(words.join(' '), 400, 60);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0]!.split(/\s+/).length, 400);
  assert.ok(chunks[1]!.split(/\s+/).length >= 300);
  assert.ok(chunks[0]!.split(/\s+/).slice(-60).every((word, index) => word === chunks[1]!.split(/\s+/)[index]));
});

test('cosine similarity handles matching, orthogonal and invalid vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 0]), Number.NEGATIVE_INFINITY);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), Number.NEGATIVE_INFINITY);
});

test('reciprocal rank fusion combines lexical and semantic lists without duplicates', () => {
  const lexical = [{ id: 'a', type: 'note' }, { id: 'b', type: 'task' }];
  const semantic = [{ id: 'b', type: 'task' }, { id: 'c', type: 'document' }];
  const fused = reciprocalRankFusion([lexical, semantic]);
  assert.deepEqual(fused.map((item) => `${item.result.type}:${item.result.id}`), ['task:b', 'note:a', 'document:c']);
  assert.ok(fused[0]!.score > fused[1]!.score);
});

test('semantic candidate expression quotes user text and deduplicates terms', async () => {
  const { semanticCandidateExpression } = await import('../../src/domain/vector-search.ts');
  assert.equal(semanticCandidateExpression('SQLite FTS5 sqlite "OR"'), '"sqlite" OR "fts5" OR "or"');
  assert.equal(semanticCandidateExpression('x! * $bad'), '"bad"');
});

test('semantic candidate IDs merge in order without duplicates', async () => {
  const { mergeCandidateIds } = await import('../../src/domain/vector-search.ts');
  assert.deepEqual(mergeCandidateIds(['a', 'b'], ['b', 'c'], ['a', 'd']), ['a', 'b', 'c', 'd']);
});


test('vector locality-sensitive buckets are stable and have a bounded neighborhood', async () => {
  const { vectorBandBuckets, nearbyBucketValues } = await import('../../src/domain/vector-search.ts');
  const vector = [1, 0, -0.5, 0.25];
  assert.deepEqual(vectorBandBuckets(vector), vectorBandBuckets(vector));
  const buckets = vectorBandBuckets(vector);
  assert.equal(buckets.length, 3);
  assert.ok(buckets.every((bucket) => bucket >= 0 && bucket <= 0xffff));
  assert.equal(nearbyBucketValues(buckets[0]!, 2).length, 137);
  assert.ok(nearbyBucketValues(buckets[0]!, 2).includes(buckets[0]!));
});
