import { formatNotionDateLabel, getSmartDatePresets, parseSmartDate, type SmartDateDisplayFormat, type SmartDateResult } from './smart-date.ts';
import type { SmartDateReference } from './smart-date-markdown.ts';
import type { ContactRecord } from '../shared/contracts.js';

export type AtSuggestionItem =
  | { kind: 'date'; id: string; label: string; detail: string; attrs: SmartDateReference }
  | { kind: 'contact'; id: string; label: string; detail: string };

export function formatSmartDateDisplay(result: SmartDateResult, format: SmartDateDisplayFormat = 'full'): string {
  return formatNotionDateLabel({
    date: result.date,
    time: result.kind === 'datetime' ? result.time : null,
    format,
  });
}

export function toSmartDateReference(
  result: SmartDateResult,
  sourceLabel?: string,
  options: { format?: SmartDateDisplayFormat; isReminder?: boolean } = {},
): SmartDateReference {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const format = options.format ?? 'relative';
  const isReminder = options.isReminder ?? Boolean(result.isReminder);
  return {
    date: result.date,
    time: result.kind === 'datetime' ? result.time : null,
    isoUtc: result.kind === 'datetime' ? result.isoUtc : null,
    timezone,
    source: sourceLabel ?? formatNotionDateLabel({ date: result.date, time: result.kind === 'datetime' ? result.time : null, format }),
    format,
    ...(isReminder ? { isReminder: true } : {}),
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
  const seenKeys = new Set<string>();

  if (query) {
    try {
      const parsed = parseSmartDate(query, now);
      const key = `${parsed.date}|${parsed.kind === 'datetime' ? parsed.time : ''}|${Boolean(parsed.isReminder)}`;
      seenKeys.add(key);
      const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${parsed.date}T12:00:00`));
      dateItems.push({
        kind: 'date',
        id: `date:parsed:${key}`,
        label: `@${query.replace(/^@/, '')}`,
        detail: `${parsed.isReminder ? 'Reminder · ' : ''}${weekday}${parsed.kind === 'datetime' ? ` · ${parsed.time}` : ''}`,
        attrs: toSmartDateReference(parsed, formatNotionDateLabel({ date: parsed.date, time: parsed.kind === 'datetime' ? parsed.time : null, format: 'relative', now }), parsed.isReminder ? { isReminder: true } : {}),
      });
    } catch { /* Partial expression while typing; fall through to matching presets. */ }
  }

  for (const preset of getSmartDatePresets(now)) {
    const tokenText = preset.token.slice(1);
    if (!normalized || preset.label.toLowerCase().includes(normalized) || tokenText.includes(normalized)) {
      const time = preset.result.kind === 'datetime' ? preset.result.time : '';
      const key = `${preset.result.date}|${time}|${Boolean(preset.result.isReminder)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      dateItems.push({
        kind: 'date',
        id: `date:${preset.id}`,
        label: preset.label,
        detail: `${preset.token} · ${formatSmartDateDisplay(preset.result)}`,
        attrs: toSmartDateReference(preset.result, formatNotionDateLabel({ date: preset.result.date, time: time || null, format: 'relative', now }), preset.result.isReminder ? { isReminder: true } : {}),
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
  return [...dateItems.slice(0, 6), ...contactItems];
}
