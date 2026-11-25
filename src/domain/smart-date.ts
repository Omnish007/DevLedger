export type SmartDateResult =
  | { kind: 'date'; date: string; source: string }
  | { kind: 'datetime'; date: string; time: string; isoUtc: string; source: string };

export class SmartDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmartDateError';
  }
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function localDate(year: number, month: number, day: number): Date {
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new SmartDateError('That calendar date does not exist.');
  }
  return date;
}

function toDateString(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function atLocalTime(date: Date, hour: number, minute: number): Date {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new SmartDateError('Time must use a valid 24-hour HH:mm value.');
  }
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
  if (result.getHours() !== hour || result.getMinutes() !== minute) {
    throw new SmartDateError('That local time is invalid because of a timezone transition.');
  }
  return result;
}

function parseOptionalTime(raw: string): { datePart: string; hour: number | null; minute: number | null; timeText: string | null } {
  const timeMatch = /^(.*?)\s+(\d{1,2}):(\d{2})$/.exec(raw);
  if (!timeMatch) return { datePart: raw, hour: null, minute: null, timeText: null };
  const hour = Number(timeMatch[2]);
  const minute = Number(timeMatch[3]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new SmartDateError('Time must use a valid 24-hour HH:mm value.');
  }
  return { datePart: timeMatch[1]!.trim(), hour, minute, timeText: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function formatSmartDateResult(date: Date, source: string, hour: number | null, minute: number | null, timeText: string | null): SmartDateResult {
  if (hour === null || minute === null || !timeText) {
    return { kind: 'date', date: toDateString(date), source };
  }
  const dateTime = atLocalTime(date, hour, minute);
  return { kind: 'datetime', date: toDateString(date), time: timeText, isoUtc: dateTime.toISOString(), source };
}

export function parseSmartDate(input: string, now = new Date()): SmartDateResult {
  const value = input.trim();
  if (!value) throw new SmartDateError('Enter a date or a supported relative date.');

  const compact = /^@(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (compact) {
    const [, dayText, monthText, yearText, hourText, minuteText] = compact;
    const date = localDate(2000 + Number(yearText), Number(monthText), Number(dayText));
    return formatSmartDateResult(date, value, Number(hourText), Number(minuteText), `${hourText}:${minuteText}`);
  }

  // Support Notion-style leading '@' on natural and numeric date tokens (`@today`, `@friday`, `@18/12/2026`).
  const withoutAt = value.startsWith('@') ? value.slice(1).trim() : value;
  if (!withoutAt) throw new SmartDateError('Enter a date after @ (for example @today or @friday).');
  const { datePart, hour, minute, timeText } = parseOptionalTime(withoutAt);

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (iso) {
    const date = localDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return formatSmartDateResult(date, value, hour, minute, timeText);
  }

  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(datePart);
  if (numeric) {
    const [, dayText, monthText, yearText] = numeric;
    const year = yearText!.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    const date = localDate(year, Number(monthText), Number(dayText));
    return formatSmartDateResult(date, value, hour, minute, timeText);
  }

  const normalized = datePart.toLowerCase();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  if (normalized === 'today') return formatSmartDateResult(base, value, hour, minute, timeText);
  if (normalized === 'tomorrow') {
    base.setDate(base.getDate() + 1);
    return formatSmartDateResult(base, value, hour, minute, timeText);
  }
  if (normalized === 'yesterday') {
    base.setDate(base.getDate() - 1);
    return formatSmartDateResult(base, value, hour, minute, timeText);
  }
  if (normalized === 'next week') {
    base.setDate(base.getDate() + 7);
    return formatSmartDateResult(base, value, hour, minute, timeText);
  }
  const relativeOffset = /^in\s+(\d{1,3})\s+(days?|weeks?)$/.exec(normalized);
  if (relativeOffset) {
    const count = Number(relativeOffset[1]);
    if (count < 1 || count > 365) throw new SmartDateError('Relative date offset must be between 1 and 365.');
    const days = relativeOffset[2]!.startsWith('week') ? count * 7 : count;
    if (days > 365) throw new SmartDateError('Relative week offset must stay within one year.');
    base.setDate(base.getDate() + days);
    return formatSmartDateResult(base, value, hour, minute, timeText);
  }

  const nextWeekday = /^(?:next|this)\s+([a-z]+)$/.exec(normalized);
  const plainWeekday = /^([a-z]+)$/.exec(normalized);
  const token = nextWeekday?.[1] ?? plainWeekday?.[1];
  if (token && token in WEEKDAYS) {
    const target = WEEKDAYS[token]!;
    const current = base.getDay();
    let delta = (target - current + 7) % 7;
    if (normalized.startsWith('next ') || delta === 0) delta += 7;
    base.setDate(base.getDate() + delta);
    return formatSmartDateResult(base, value, hour, minute, timeText);
  }

  throw new SmartDateError('Unsupported or ambiguous date. Try @today, @tomorrow, @friday, dd/mm/yyyy, or @DDMMYYHHmm.');
}

export interface SmartDatePreset {
  id: string;
  label: string;
  token: string;
  result: SmartDateResult;
}

export function getSmartDatePresets(now = new Date()): SmartDatePreset[] {
  const candidates = [
    { id: 'today', label: 'Today', token: '@today' },
    { id: 'tomorrow', label: 'Tomorrow', token: '@tomorrow' },
    { id: 'friday', label: 'Next Friday', token: '@friday' },
    { id: 'monday', label: 'Next Monday', token: '@monday' },
    { id: 'next-week', label: 'Next week', token: '@next week' },
  ];
  return candidates.map((item) => ({ ...item, result: parseSmartDate(item.token, now) }));
}
