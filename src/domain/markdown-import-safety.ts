export const MAX_MARKDOWN_IMPORT_BYTES = 2 * 1024 * 1024;

function removeCodeExamples(markdown: string): string {
    const retained: string[] = [];
    let fence: { marker: '`' | '~'; length: number } | null = null;
    for (const line of markdown.split(/\r?\n/)) {
        const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
        if (fence) {
            if (marker && marker[0] === fence.marker && marker.length >= fence.length) fence = null;
            continue;
        }
        if (marker) {
            fence = { marker: marker[0] as '`' | '~', length: marker.length };
            continue;
        }
        if (/^(?: {4,}|\t)/.test(line)) continue;
        retained.push(line);
    }
    return retained.join('\n');
}

/** Validates imports before the Markdown parser is allowed to process embedded HTML. */
export function validateMarkdownImport(markdown: string): string | null {
    if (new TextEncoder().encode(markdown).byteLength > MAX_MARKDOWN_IMPORT_BYTES) {
        return 'Markdown files must be 2 MB or smaller.';
    }
    const activeContent = removeCodeExamples(markdown);
    const dangerous =
        /<\s*(?:script|style|iframe|object|embed|svg|math|form|input|button|video|audio|link|meta)\b|\son[a-z][a-z0-9_-]*\s*=|javascript\s*:|data\s*:\s*text\/html/i;
    if (dangerous.test(activeContent)) {
        return 'Markdown import contains potentially active HTML or an unsafe URL. Remove it and try again.';
    }
    return null;
}
