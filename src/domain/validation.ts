export function stripControlCharacters(value: string, replaceWith = '', includeDelete = false): string {
    let result = '';
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        const isAsciiControl = code <= 0x1f || (includeDelete && code === 0x7f);
        result += isAsciiControl ? replaceWith : value[index]!;
    }
    return result;
}

export function hasControlCharacters(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code <= 0x1f || code === 0x7f) return true;
    }
    return false;
}

const OUTER_PUNCTUATION_RE = /^[.,!?;:'"()[\]{}]+|[.,!?;:'"()[\]{}]+$/g;
const SEARCH_STOPWORDS = new Set(
    'a an and are as at be by can did do does for from how in is it its of on or our that the this to was we were what when where which who why with'.split(
        ' ',
    ),
);

export function normalizeSearchTerms(query: string): string[] {
    return query
        .trim()
        .split(/\s+/)
        .map((part) => stripControlCharacters(part).trim().replace(OUTER_PUNCTUATION_RE, ''))
        .filter(Boolean)
        .slice(0, 12);
}

export function safeFtsQuery(query: string): string {
    return normalizeSearchTerms(query)
        .map((term) => `"${term.replaceAll('"', '""')}"*`)
        .join(' AND ');
}

export interface LexicalQueryPlan {
    strictFts: string;
    contentFts: string;
    relaxedFts: string;
    contentTokens: string[];
    hasUnknownOperator: boolean;
}

export function buildLexicalQueryPlan(query: string): LexicalQueryPlan {
    const rawTerms = normalizeSearchTerms(query);
    const hasUnknownOperator = rawTerms.some(
        (term) => /^[a-z][a-z0-9_-]{0,14}:[^\s/\\]+$/i.test(term) && !/^(?:https?|mailto):/i.test(term),
    );
    const strictFts = rawTerms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(' AND ');
    if (!rawTerms.length || hasUnknownOperator) {
        return {
            strictFts,
            contentFts: strictFts,
            relaxedFts: '',
            contentTokens: rawTerms,
            hasUnknownOperator,
        };
    }
    const subTokens =
        rawTerms
            .join(' ')
            .normalize('NFKC')
            .match(/[\p{L}\p{N}_]{2,}/gu)
            ?.slice(0, 16) ?? rawTerms;
    const filtered = subTokens.filter((token) => !SEARCH_STOPWORDS.has(token.toLowerCase()));
    const contentTokens = [
        ...new Set((filtered.length ? filtered : subTokens).map((t) => t.toLowerCase())),
    ].slice(0, 12);
    const toQuoted = (token: string) => `"${token.replaceAll('"', '""')}"*`;
    return {
        strictFts,
        contentFts: contentTokens.map(toQuoted).join(' AND '),
        relaxedFts: contentTokens.map(toQuoted).join(' OR '),
        contentTokens,
        hasUnknownOperator: false,
    };
}

export function safeDisplayName(value: string, maxLength = 180): string {
    const name = stripControlCharacters(value, '', true).trim();
    return name.slice(0, maxLength);
}
