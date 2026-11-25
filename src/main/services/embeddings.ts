export interface EmbeddingAdapter {
    embed(texts: string[], model: string, signal?: AbortSignal): Promise<number[][]>;
}

const LOCAL_OLLAMA = 'http://127.0.0.1:11434';

/** Replaceable local embedding adapter; it never sends requests outside loopback. */
export class OllamaEmbeddingAdapter implements EmbeddingAdapter {
    async embed(texts: string[], model: string, signal?: AbortSignal): Promise<number[][]> {
        if (!texts.length || texts.length > 64)
            throw new Error('Embedding batches must contain between 1 and 64 text chunks.');
        if (!/^[A-Za-z0-9._:/-]{1,128}$/.test(model))
            throw new Error('The configured embedding model name is invalid.');
        const response = await fetch(`${LOCAL_OLLAMA}/api/embed`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model, input: texts, truncate: false, keep_alive: '5m' }),
            signal: signal ?? AbortSignal.timeout(120_000),
        });
        if (!response.ok) throw new Error(`Ollama embedding request failed (HTTP ${response.status}).`);
        const payload: unknown = await response.json();
        if (
            !payload ||
            typeof payload !== 'object' ||
            !('embeddings' in payload) ||
            !Array.isArray(payload.embeddings)
        ) {
            throw new Error('Ollama returned an invalid embedding response.');
        }
        const embeddings = payload.embeddings as unknown[];
        if (embeddings.length !== texts.length)
            throw new Error('Ollama returned a different number of embeddings than requested.');
        const result = embeddings.map((entry) => {
            if (!Array.isArray(entry) || entry.length < 1 || entry.length > 8192)
                throw new Error('Ollama returned an invalid vector dimension.');
            const vector = entry.map((value) => Number(value));
            if (vector.some((value) => !Number.isFinite(value)))
                throw new Error('Ollama returned a non-finite embedding value.');
            return vector;
        });
        const dimensions = result[0]!.length;
        if (result.some((vector) => vector.length !== dimensions))
            throw new Error('Ollama returned inconsistent embedding dimensions.');
        return result;
    }
}
