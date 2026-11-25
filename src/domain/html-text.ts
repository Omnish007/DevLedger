const MARK_OPEN = '\uE001';
const MARK_CLOSE = '\uE002';

function decodeBasicEntities(value: string): string {
    return value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'");
}

/** Replaces ASCII control characters (U+0000–U+001F) with spaces without triggering control-regex lint rules. */
export function stripControlChars(value: string): string {
    let result = '';
    for (let index = 0; index < value.length; index += 1) {
        result += value.charCodeAt(index) < 32 ? ' ' : value[index];
    }
    return result;
}

/** Converts rich-text note HTML (including truncated SQLite FTS snippets) into clean plain text. */
export function stripHtmlToPlainText(value: string, options: { preserveMark?: boolean } = {}): string {
    if (!value) return '';
    let text = value.replaceAll(MARK_OPEN, '').replaceAll(MARK_CLOSE, '');
    if (options.preserveMark) {
        text = text.replace(/<mark>/gi, MARK_OPEN).replace(/<\/mark>/gi, MARK_CLOSE);
    }
    // Preserve punctuation adjacency around inline tags while separating adjacent blocks cleanly.
    text = text.replace(/<\/(?:p|div|li|tr|th|td|blockquote|h[1-6]|pre)>|<br\s*\/?>/gi, ' ');
    text = text.replace(/<\/?(?:a|span|strong|b|em|i|u|code|input|label)(?:\s[^<>]*?)?\/?>/gi, '');
    // Strip truncated HTML tags immediately preceding an FTS5 ellipsis separator (` … `).
    text = text.replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^<>…]*)?(?=\s*…)/g, ' ');
    // Match tag names beginning with an ASCII letter or '/'/'!' so math like `a < b` is untouched.
    text = text.replace(/<\/?[a-zA-Z!][a-zA-Z0-9:-]*(?:\s[^<>]*?)?\/?>/g, ' ');
    // Strip incomplete trailing HTML tags cut off by SQLite snippet() or substr() truncation.
    text = text.replace(
        new RegExp(`<\\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\\s+[^<>…${MARK_OPEN}${MARK_CLOSE}]*)?$`, 'g'),
        ' ',
    );
    text = decodeBasicEntities(text);
    if (options.preserveMark) {
        text = text.replace(new RegExp(`${MARK_OPEN}([\\s\\S]*?)${MARK_CLOSE}`, 'g'), '<mark>$1</mark>');
        text = text.replaceAll(MARK_OPEN, '').replaceAll(MARK_CLOSE, '');
    }
    return text
        .replace(/\s+([.,;:!?])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}
