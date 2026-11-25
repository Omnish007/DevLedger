import type Database from 'better-sqlite3';

const EMBED_NAME_RE = /(embed|minilm|bge[-_:]|e5[-_:]|arctic-embed|snowflake-arctic)/i;
const DEFAULT_CHAT_CANDIDATES = [
    'llama3.2:3b',
    'qwen3.5:2b-q4_K_M',
    'qwen3.5:2b',
    'qwen2.5:3b',
    'llama3.2:1b',
];
const DEFAULT_EMBED_CANDIDATES = [
    'nomic-embed-text:latest',
    'nomic-embed-text',
    'embeddinggemma',
    'embeddinggemma:latest',
    'mxbai-embed-large:latest',
    'mxbai-embed-large',
    'all-minilm:latest',
    'all-minilm',
];

export function isEmbeddingModelName(name: string): boolean {
    return EMBED_NAME_RE.test(name);
}

export function matchInstalledModel(preferred: string, installed: readonly string[]): string | null {
    if (installed.includes(preferred)) return preferred;
    const withoutLatest = preferred.endsWith(':latest') ? preferred.slice(0, -7) : preferred;
    const withLatest = `${withoutLatest}:latest`;
    if (installed.includes(withLatest)) return withLatest;
    if (installed.includes(withoutLatest)) return withoutLatest;
    return null;
}

function readConfiguredModel(db: Database.Database, key: string): string | null {
    const row = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key) as
        { value_json: string } | undefined;
    if (!row) return null;
    try {
        const parsed = String(JSON.parse(row.value_json)).trim();
        return parsed || null;
    } catch {
        return null;
    }
}

export function resolveChatModel(
    db: Database.Database,
    installed: readonly string[] = [],
): { model: string; explicit: boolean } {
    const configured = readConfiguredModel(db, 'ai.chatModel');
    if (configured) {
        if (!/^[A-Za-z0-9._:/-]{1,128}$/.test(configured)) {
            throw new Error('The configured local AI model name is invalid.');
        }
        return {
            model: matchInstalledModel(configured, installed) ?? configured,
            explicit: true,
        };
    }
    for (const candidate of DEFAULT_CHAT_CANDIDATES) {
        const hit = matchInstalledModel(candidate, installed);
        if (hit) return { model: hit, explicit: false };
    }
    const firstNonEmbed = installed.find((name) => !isEmbeddingModelName(name));
    return { model: firstNonEmbed ?? 'qwen3.5:2b-q4_K_M', explicit: false };
}

export function resolveEmbeddingModel(
    db: Database.Database,
    installed: readonly string[] = [],
): { model: string; explicit: boolean } {
    const configured = readConfiguredModel(db, 'ai.embeddingModel');
    if (configured) {
        if (!/^[A-Za-z0-9._:/-]{1,128}$/.test(configured)) {
            throw new Error('The configured embedding model name is invalid.');
        }
        return {
            model: matchInstalledModel(configured, installed) ?? configured,
            explicit: true,
        };
    }
    for (const candidate of DEFAULT_EMBED_CANDIDATES) {
        const hit = matchInstalledModel(candidate, installed);
        if (hit) return { model: hit, explicit: false };
    }
    const firstEmbed = installed.find((name) => isEmbeddingModelName(name));
    return { model: firstEmbed ?? 'nomic-embed-text:latest', explicit: false };
}

export function formatTextForEmbeddingModel(text: string, model: string, role: 'document' | 'query'): string {
    const trimmed = text.trim();
    if (!trimmed) return '';
    if (!/^nomic-embed/i.test(model)) return trimmed;
    const prefix = role === 'document' ? 'search_document: ' : 'search_query: ';
    if (/^search_(?:document|query):\s/i.test(trimmed)) return trimmed;
    return `${prefix}${trimmed}`;
}
