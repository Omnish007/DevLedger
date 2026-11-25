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

export function normalizeSearchTerms(query: string): string[] {
    return query
        .trim()
        .split(/\s+/)
        .map((part) => stripControlCharacters(part).trim())
        .filter(Boolean)
        .slice(0, 12);
}

export function safeFtsQuery(query: string): string {
    return normalizeSearchTerms(query)
        .map((term) => `"${term.replaceAll('"', '""')}"*`)
        .join(' AND ');
}

export function safeDisplayName(value: string, maxLength = 180): string {
    const name = stripControlCharacters(value, '', true).trim();
    return name.slice(0, maxLength);
}
