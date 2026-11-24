export interface RankedEntity {
  id: string;
  type: string;
}

export interface RankedResult<T extends RankedEntity> {
  result: T;
  score: number;
}

/** Approximate 400-token chunks with 15% word overlap; paragraph boundaries are preferred. */
export function splitIntoChunks(value: string, targetWords = 400, overlapWords = 60): string[] {
  if (!Number.isInteger(targetWords) || targetWords < 40 || targetWords > 2_000) throw new Error('Chunk size must be between 40 and 2,000 words.');
  if (!Number.isInteger(overlapWords) || overlapWords < 0 || overlapWords >= targetWords) throw new Error('Chunk overlap must be smaller than the chunk size.');
  const normalized = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let wordCount = 0;
  const emit = () => {
    if (current.length) chunks.push(current.join(' ').trim());
  };
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let offset = 0;
    while (offset < words.length) {
      const capacity = targetWords - wordCount;
      const take = Math.min(capacity, words.length - offset);
      current.push(words.slice(offset, offset + take).join(' '));
      wordCount += take;
      offset += take;
      if (wordCount >= targetWords) {
        emit();
        const previous = current.join(' ').split(/\s+/).slice(-overlapWords);
        current = overlapWords ? [previous.join(' ')] : [];
        wordCount = previous.length;
      }
    }
  }
  emit();
  return chunks.filter((chunk, index) => chunk && (index === 0 || chunk !== chunks[index - 1]));
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (!left.length || left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!; const b = right[index]!;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NEGATIVE_INFINITY;
    dot += a * b; leftNorm += a * a; rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return Number.NEGATIVE_INFINITY;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

/** Reciprocal Rank Fusion keeps lexical and semantic ranks comparable without mixing raw score scales. */
export function reciprocalRankFusion<T extends RankedEntity>(
  rankedLists: ReadonlyArray<readonly T[]>,
  rankConstant = 60,
): RankedResult<T>[] {
  if (!Number.isInteger(rankConstant) || rankConstant < 1 || rankConstant > 1_000) throw new Error('Invalid reciprocal-rank constant.');
  const scores = new Map<string, { result: T; score: number }>();
  for (const list of rankedLists) {
    list.forEach((result, index) => {
      const key = `${result.type}:${result.id}`;
      const existing = scores.get(key);
      scores.set(key, { result: existing?.result ?? result, score: (existing?.score ?? 0) + 1 / (rankConstant + index + 1) });
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score);
}


/**
 * Builds a safe, broad FTS5 candidate expression from user prose.
 * We quote every token instead of passing raw FTS syntax through from the UI.
 */
export function semanticCandidateExpression(query: string, maxTerms = 12): string {
  const terms = query.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
  const unique = [...new Set(terms)].slice(0, Math.max(1, Math.min(maxTerms, 24)));
  return unique.map((term) => `"${term.replace(/"/g, '""')}"`).join(' OR ');
}

export function mergeCandidateIds(...groups: ReadonlyArray<ReadonlyArray<string>>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    for (const id of group) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}


/**
 * Three-band random-hyperplane locality-sensitive hashes for cosine retrieval.
 * Candidate generation is intentionally cheap; exact cosine scoring still decides rank.
 */
export function vectorBandBuckets(vector: readonly number[]): number[] {
  if (!vector.length || vector.some((value) => !Number.isFinite(value))) throw new Error('Cannot hash an empty or non-finite vector.');
  const buckets: number[] = [];
  for (let band = 0; band < 3; band += 1) {
    let bucket = 0;
    for (let bit = 0; bit < 16; bit += 1) {
      let state = (0x9e3779b9 ^ Math.imul(band + 1, 0x85ebca6b) ^ Math.imul(bit + 1, 0xc2b2ae35)) >>> 0;
      let projection = 0;
      for (let dimension = 0; dimension < vector.length; dimension += 1) {
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        projection += (state & 1 ? 1 : -1) * vector[dimension]!;
      }
      if (projection >= 0) bucket |= (1 << bit);
    }
    buckets.push(bucket);
  }
  return buckets;
}

/** Returns every bucket at Hamming distance <= maxDistance (up to 2 is 137 values). */
export function nearbyBucketValues(bucket: number, maxDistance = 2): number[] {
  if (!Number.isInteger(bucket) || bucket < 0 || bucket > 0xffff) throw new Error('Bucket must be a 16-bit unsigned integer.');
  if (!Number.isInteger(maxDistance) || maxDistance < 0 || maxDistance > 3) throw new Error('Bucket neighborhood distance must be between 0 and 3.');
  const result = [bucket];
  for (let left = 0; left < 16; left += 1) {
    result.push(bucket ^ (1 << left));
    if (maxDistance >= 2) {
      for (let right = left + 1; right < 16; right += 1) result.push(bucket ^ (1 << left) ^ (1 << right));
    }
  }
  if (maxDistance >= 3) {
    for (let a = 0; a < 16; a += 1) for (let b = a + 1; b < 16; b += 1) for (let c = b + 1; c < 16; c += 1) result.push(bucket ^ (1 << a) ^ (1 << b) ^ (1 << c));
  }
  return result;
}
