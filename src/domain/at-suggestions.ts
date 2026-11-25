import { getSmartDatePresets, parseSmartDate, type SmartDateResult } from './smart-date.ts';
import type { SmartDateReference } from './smart-date-markdown.ts';
import type { ContactRecord } from '../shared/contracts.js';

export type AtSuggestionItem =
  | { kind: 'date'; id: string; label: string; detail: string; attrs: SmartDateReference }
  | { kind: 'contact'; id: string; label: string; detail: string };

export function formatSmartDateDisplay(result: SmartDateResult): string {
  const dateText = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${result.date}T12:00:00`));
  return result.kind === 'datetime' ? `${dateText} ${result.time}` : dateText;
}

export function toSmartDateReference(result: SmartDateResult, sourceLabel?: string): SmartDateReference {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    date: result.date,
    time: result.kind === 'datetime' ? result.time : null,
    isoUtc: result.kind === 'datetime' ? result.isoUtc : null,
    timezone,
    source: sourceLabel ?? formatSmartDateDisplay(result),
  };
}

export async function buildAtSuggestions(
  rawQuery: string,
  searchContacts: (query: string, projectId: string) => Promise<ContactRecord[]>,
  projectId: string,
  now = new Date(),
): Promise<AtSuggestionItem[]> {
  const query = rawQuery.trim();
  const normalized = query.toLowerCase();
  const dateItems: AtSuggestionItem[] = [];
  const seenDates = new Set<string>();

  if (query) {
    try {
      const parsed = parseSmartDate(query, now);
      const formatted = formatSmartDateDisplay(parsed);
      const key = `${parsed.date}|${parsed.kind === 'datetime' ? parsed.time : ''}`;
      seenDates.add(key);
      dateItems.push({
        kind: 'date',
        id: `date:parsed:${key}`,
        label: `@${query.replace(/^@/, '')}`,
        detail: new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${parsed.date}T12:00:00`)) + (parsed.kind === 'datetime' ? ` · ${parsed.time}` : ''),
        attrs: toSmartDateReference(parsed, formatted),
      });
    } catch { /* Not a complete date expression yet; fall through to prefix matches. */ }
  }

  for (const preset of getSmartDatePresets(now)) {
    const tokenText = preset.token.slice(1);
    if (!normalized || preset.label.toLowerCase().includes(normalized) || tokenText.includes(normalized)) {
      const key = `${preset.result.date}|`;
      if (seenDates.has(key)) continue;
      seenDates.add(key);
      dateItems.push({
        kind: 'date',
        id: `date:${preset.id}`,
        label: preset.label,
        detail: `${preset.token} · ${formatSmartDateDisplay(preset.result)}`,
        attrs: toSmartDateReference(preset.result, formatSmartDateDisplay(preset.result)),
      });
    }
  }

  let contacts: ContactRecord[] = [];
  try {
    contacts = await searchContacts(query, projectId);
  } catch {
    contacts = [];
  }
  const contactItems: AtSuggestionItem[] = contacts.slice(0, 6).map((contact) => ({
    kind: 'contact',
    id: contact.id,
    label: contact.name,
    detail: contact.role ? contact.role.replaceAll('_', ' ') : 'Contact',
  }));
  return [...dateItems.slice(0, 5), ...contactItems];
}
