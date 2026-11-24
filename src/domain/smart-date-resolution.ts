import { parseSmartDate, type SmartDateResult } from './smart-date.ts';

export interface SmartDateInstant {
  isoUtc: string;
  localDate: string;
  localTime: string;
  timezone: string;
  isDateOnly: boolean;
  source: string;
}

/** Resolve a reminder-like date to an instant. Date-only values use 09:00 local time. */
export function resolveSmartDateInstant(
  value: string,
  now = new Date(),
  dateOnlyHour = 9,
): SmartDateInstant {
  const parsed: SmartDateResult = parseSmartDate(value, now);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (parsed.kind === 'datetime') {
    return {
      isoUtc: parsed.isoUtc,
      localDate: parsed.date,
      localTime: parsed.time,
      timezone,
      isDateOnly: false,
      source: parsed.source,
    };
  }
  if (!Number.isInteger(dateOnlyHour) || dateOnlyHour < 0 || dateOnlyHour > 23) {
    throw new Error('The default reminder hour must be between 00 and 23.');
  }
  const [year, month, day] = parsed.date.split('-').map(Number);
  const local = new Date(year!, month! - 1, day!, dateOnlyHour, 0, 0, 0);
  if (local.getFullYear() !== year || local.getMonth() !== month! - 1 || local.getDate() !== day || local.getHours() !== dateOnlyHour) {
    throw new Error('The chosen date cannot be scheduled at the default local reminder time.');
  }
  return {
    isoUtc: local.toISOString(),
    localDate: parsed.date,
    localTime: `${String(dateOnlyHour).padStart(2, '0')}:00`,
    timezone,
    isDateOnly: true,
    source: parsed.source,
  };
}
