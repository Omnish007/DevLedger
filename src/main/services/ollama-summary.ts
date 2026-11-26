import type Database from 'better-sqlite3';
import type { SearchResult } from '../../shared/contracts.js';
import { stripControlChars, stripHtmlToPlainText } from '../../domain/html-text.ts';

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const META_PREAMBLE_RE =
    /^(?:the\s+(?:provided\s+|supplied\s+)?(?:evidence|context|workspace\s+records?|records?)\s+(?:contains?|shows?|lists?|indicates?|describes?)\s*(?:that\s+)?|based\s+on\s+the\s+(?:provided\s+|supplied\s+)?(?:evidence|context|records?),?\s*)/i;

const TYPE_LABEL: Record<SearchResult['type'], string> = {
    project: 'Project',
    note: 'Note',
    task: 'Task',
    document: 'Document',
    contact: 'Contact',
};

export function cleanSummaryExcerpt(value: string, maxLength = 750): string {
    return stripControlChars(stripHtmlToPlainText(value))
        .replace(UUID_RE, '[ref]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

export function asOllamaObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Ollama returned an invalid response.');
    return value as Record<string, unknown>;
}

export function extractSummaryObject(rawResponse: string): Record<string, unknown> {
    const trimmed = rawResponse.trim();
    const withoutFence = trimmed
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```$/i, '')
        .trim();
    for (const candidate of [trimmed, withoutFence]) {
        try {
            return asOllamaObject(JSON.parse(candidate));
        } catch {
            /* try next */
        }
    }
    const start = withoutFence.indexOf('{');
    const end = withoutFence.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return asOllamaObject(JSON.parse(withoutFence.slice(start, end + 1)));
    }
    throw new Error('Invalid summary JSON');
}

export function sanitizeSlmSummary(raw: string): string {
    let cleaned = raw
        .replace(UUID_RE, '')
        .replace(/\s*\(\s*\)/g, '')
        .replace(/\b(?:identified by ID|unique IDs?(?:\s+and\s+update\s+timestamps?)?)\b/gi, '')
        .replace(META_PREAMBLE_RE, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
    if (cleaned && /^[a-z]/.test(cleaned)) cleaned = cleaned[0]!.toUpperCase() + cleaned.slice(1);
    return cleaned.slice(0, 4_000);
}

export function resolveCitedIds(
    generated: Record<string, unknown>,
    rawSummary: string,
    sources: SearchResult[],
): string[] {
    const byId = new Map(sources.map((s) => [s.id, s.id]));
    const ordered: string[] = [];
    const pushIndex = (n: number) => {
        if (Number.isInteger(n) && n >= 1 && n <= sources.length) {
            const id = sources[n - 1]!.id;
            if (!ordered.includes(id)) ordered.push(id);
        }
    };
    const candidates = [
        ...(Array.isArray(generated['citedSources']) ? generated['citedSources'] : []),
        ...(Array.isArray(generated['citations']) ? generated['citations'] : []),
    ];
    for (const item of candidates) {
        if (typeof item === 'number') {
            pushIndex(item);
            continue;
        }
        if (typeof item === 'string') {
            const m = /^\[?(\d{1,2})\]?$/.exec(item.trim());
            if (m) pushIndex(Number(m[1]));
            else if (byId.has(item)) ordered.push(item);
        }
    }
    for (const match of rawSummary.matchAll(/\[(\d{1,2})\]/g)) pushIndex(Number(match[1]));
    return ordered.slice(0, 8);
}

export function hydrateSummarySourceBody(db: Database.Database, source: SearchResult): string {
    try {
        if (source.type === 'note') {
            const row = db
                .prepare('SELECT content FROM notes WHERE id = ? AND locked = 0 AND deleted_at IS NULL')
                .get(source.id) as { content: string } | undefined;
            if (row?.content) return cleanSummaryExcerpt(row.content, 750);
        } else if (source.type === 'task') {
            const task = db
                .prepare(
                    'SELECT description, status, priority, due_date, due_at FROM tasks WHERE id = ? AND deleted_at IS NULL',
                )
                .get(source.id) as
                | {
                      description: string;
                      status: string;
                      priority: string;
                      due_date: string | null;
                      due_at: string | null;
                  }
                | undefined;
            const blockers = db
                .prepare(
                    `SELECT tb.reason, c.name AS contact_name, tb.follow_up_at
                     FROM task_blockers tb LEFT JOIN contacts c ON c.id = tb.waiting_contact_id
                     WHERE tb.task_id = ? AND tb.resolved_at IS NULL LIMIT 2`,
                )
                .all(source.id) as Array<{
                reason: string;
                contact_name: string | null;
                follow_up_at: string | null;
            }>;
            const blockerText = blockers
                .map(
                    (b) =>
                        `Active blocker: ${b.reason}${b.contact_name ? ` (waiting on ${b.contact_name})` : ''}${b.follow_up_at ? ` [follow up ${b.follow_up_at.slice(0, 10)}]` : ''}`,
                )
                .join('; ');
            const due = task?.due_date ?? task?.due_at?.slice(0, 16) ?? null;
            return cleanSummaryExcerpt(
                [
                    task ? `Status: ${task.status.replaceAll('_', ' ')}, Priority: ${task.priority}` : '',
                    due ? `Due: ${due}` : '',
                    task?.description ?? '',
                    blockerText,
                ]
                    .filter(Boolean)
                    .join(' | '),
                750,
            );
        } else if (source.type === 'project') {
            const row = db
                .prepare('SELECT status, description FROM projects WHERE id = ? AND deleted_at IS NULL')
                .get(source.id) as { status: string; description: string } | undefined;
            if (row) return cleanSummaryExcerpt(`Status: ${row.status}. ${row.description}`, 750);
        } else if (source.type === 'contact') {
            const row = db
                .prepare(
                    'SELECT company, role, email, notes, custom_attributes_json FROM contacts WHERE id = ? AND deleted_at IS NULL',
                )
                .get(source.id) as
                | {
                      company: string;
                      role: string;
                      email: string;
                      notes: string;
                      custom_attributes_json: string;
                  }
                | undefined;
            if (row) {
                let attrs = '';
                try {
                    attrs = Object.entries(
                        JSON.parse(row.custom_attributes_json || '{}') as Record<string, string>,
                    )
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ');
                } catch {
                    /* ignore */
                }
                return cleanSummaryExcerpt(
                    [row.role, row.company, row.email, row.notes, attrs].filter(Boolean).join(' · '),
                    750,
                );
            }
        } else if (source.type === 'document') {
            const row = db
                .prepare(
                    "SELECT extracted_text FROM documents WHERE id = ? AND status = 'indexed' AND deleted_at IS NULL AND is_encrypted = 0",
                )
                .get(source.id) as { extracted_text: string } | undefined;
            if (row?.extracted_text) return cleanSummaryExcerpt(row.extracted_text, 750);
        }
    } catch {
        /* fallback to snippet */
    }
    return cleanSummaryExcerpt(source.excerpt, 750);
}

export function formatSummaryAliasRecords(
    db: Database.Database,
    sources: SearchResult[],
    projectNames: Record<string, string>,
): string {
    return sources
        .map((source, index) => {
            const projectLabel =
                source.projectId && source.type !== 'project' ? projectNames[source.projectId] : undefined;
            const header = `[${index + 1}] ${TYPE_LABEL[source.type]} — ${cleanSummaryExcerpt(source.title, 200)}${projectLabel ? ` (Project: ${cleanSummaryExcerpt(projectLabel, 120)})` : ''}`;
            const details = hydrateSummarySourceBody(db, source);
            return details ? `${header}\nDetails: ${details}` : header;
        })
        .join('\n\n');
}
