import { isValidDateOnly } from './date-only.ts';
import type { SmartDateDisplayFormat } from './smart-date.ts';

export interface SmartDateReference {
  date: string;
  time: string | null;
  isoUtc: string | null;
  timezone: string;
  source: string;
  endDate?: string | null;
  format?: SmartDateDisplayFormat;
  isReminder?: boolean;
  reminderId?: string | null;
}

const VALID_FORMATS = new Set<SmartDateDisplayFormat>(['relative', 'full', 'short', 'iso']);

/** Validate that the displayed local date/time describes the stored UTC instant. */
export function isValidSmartDateReference(reference: SmartDateReference): boolean {
  if (!isValidDateOnly(reference.date)) return false;
  if (reference.endDate && (!isValidDateOnly(reference.endDate) || reference.endDate < reference.date)) return false;
  if (reference.format && !VALID_FORMATS.has(reference.format)) return false;
  if (reference.source.length > 120 || reference.timezone.length > 100) return false;
  if (!reference.time && !reference.isoUtc) return true;
  if (!reference.time || !reference.isoUtc || !reference.timezone) return false;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(reference.time)) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(reference.isoUtc)) return false;

  const instant = new Date(reference.isoUtc);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== reference.isoUtc) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: reference.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values['year']}-${values['month']}-${values['day']}` === reference.date
      && `${values['hour']}:${values['minute']}` === reference.time;
  } catch {
    return false;
  }
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

export function serializeSmartDateMarkdown(reference: SmartDateReference): string {
  if (!isValidSmartDateReference(reference)) throw new Error('Cannot export an invalid date reference.');
  const params = new URLSearchParams();
  if (reference.time) params.set('time', reference.time);
  if (reference.isoUtc) params.set('utc', reference.isoUtc);
  if (reference.timezone) params.set('tz', reference.timezone);
  if (reference.endDate) params.set('end', reference.endDate);
  if (reference.format && reference.format !== 'relative') params.set('fmt', reference.format);
  if (reference.isReminder) params.set('rem', '1');
  if (reference.reminderId) params.set('remId', reference.reminderId);
  return `[${escapeMarkdownLabel(reference.source || reference.date)}](devledger-date:${encodeURIComponent(reference.date)}?${params.toString()})`;
}

export function parseSmartDateMarkdownLink(href: string, text: string): SmartDateReference | null {
  const prefix = ['devledger-date:', 'northstar-date:'].find((candidate) => href.startsWith(candidate));
  if (!prefix || text.length > 120) return null;
  try {
    const [datePart, query = ''] = href.slice(prefix.length).split('?', 2);
    const date = decodeURIComponent(datePart ?? '');
    const params = new URLSearchParams(query);
    const formatParam = params.get('fmt') as SmartDateDisplayFormat | null;
    const reference: SmartDateReference = {
      date,
      time: params.get('time'),
      isoUtc: params.get('utc'),
      timezone: params.get('tz') ?? '',
      source: text.slice(0, 120) || date,
      ...(params.get('end') ? { endDate: params.get('end') } : {}),
      ...(formatParam && VALID_FORMATS.has(formatParam) ? { format: formatParam } : {}),
      ...(params.get('rem') === '1' ? { isReminder: true } : {}),
      ...(params.get('remId') ? { reminderId: params.get('remId') } : {}),
    };
    return isValidSmartDateReference(reference) ? reference : null;
  } catch {
    return null;
  }
}
