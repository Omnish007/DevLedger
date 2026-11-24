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

export function parseSmartDate(input: string, now = new Date()): SmartDateResult {
  const value = input.trim();
  if (!value) throw new SmartDateError('Enter a date or a supported relative date.');

  const compact = /^@(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (compact) {
    const [, dayText, monthText, yearText, hourText, minuteText] = compact;
    const year = 2000 + Number(yearText);
    const day = Number(dayText);
    const month = Number(monthText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const date = localDate(year, month, day);
    const dateTime = atLocalTime(date, hour, minute);
    return {
      kind: 'datetime',
      date: toDateString(date),
      time: `${hourText}:${minuteText}`,
      isoUtc: dateTime.toISOString(),
      source: value,
    };
  }

  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value);
  if (numeric) {
    const [, dayText, monthText, yearText] = numeric;
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    const date = localDate(year, Number(monthText), Number(dayText));
    return { kind: 'date', date: toDateString(date), source: value };
  }

  const normalized = value.toLowerCase();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  if (normalized === 'today') return { kind: 'date', date: toDateString(base), source: value };
  if (normalized === 'tomorrow') {
    base.setDate(base.getDate() + 1);
    return { kind: 'date', date: toDateString(base), source: value };
  }

  const nextWeekday = /^next\s+([a-z]+)$/.exec(normalized);
  const plainWeekday = /^([a-z]+)$/.exec(normalized);
  const token = nextWeekday?.[1] ?? plainWeekday?.[1];
  if (token && token in WEEKDAYS) {
    const target = WEEKDAYS[token];
    const current = base.getDay();
    let delta = (target - current + 7) % 7;
    if (nextWeekday || delta === 0) delta += 7;
    base.setDate(base.getDate() + delta);
    return { kind: 'date', date: toDateString(base), source: value };
  }

  throw new SmartDateError('Unsupported or ambiguous date. Try dd/mm/yyyy, today, tomorrow, Friday, or @DDMMYYHHmm.');
}
