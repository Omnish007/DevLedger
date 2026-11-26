import { SmartDateError, type SmartDateDisplayFormat } from './smart-date-types.ts';

export const WEEKDAYS: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
};

export const SHORT_WEEKDAYS: Record<string, number> = {
    su: 0,
    m: 1,
    tu: 2,
    w: 3,
    th: 4,
    f: 5,
    sa: 6,
};

export const MONTHS: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
};

export function localDate(year: number, month: number, day: number): Date {
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        throw new SmartDateError('That calendar date does not exist.');
    }
    return date;
}

export function toDateString(date: Date): string {
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function atLocalTime(date: Date, hour: number, minute: number): Date {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new SmartDateError('Time must use a valid 24-hour HH:mm or 12-hour am/pm value.');
    }
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
    if (result.getHours() !== hour || result.getMinutes() !== minute) {
        throw new SmartDateError('That local time is invalid because of a timezone transition.');
    }
    return result;
}

export function extractTimeSuffix(raw: string): {
    datePart: string;
    hour: number | null;
    minute: number | null;
    timeText: string | null;
} {
    const trimmed = raw.trim();
    const named = /^(.*?)(?:\s+at)?\s+(noon|midnight|morning|evening)$/i.exec(trimmed);
    const bareNamed = !named ? /^(?:at\s+)?(noon|midnight|morning|evening)$/i.exec(trimmed) : null;
    const namedKeyword = named?.[2] ?? bareNamed?.[1];
    if (namedKeyword) {
        const keyword = namedKeyword.toLowerCase();
        const hour = keyword === 'midnight' ? 0 : keyword === 'morning' ? 9 : keyword === 'noon' ? 12 : 18;
        return {
            datePart: (named?.[1] ?? '').trim(),
            hour,
            minute: 0,
            timeText: `${String(hour).padStart(2, '0')}:00`,
        };
    }
    const ampm = /^(.*?)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(trimmed);
    const bareAmpm = !ampm ? /^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(trimmed) : null;
    const ampmMatch = ampm ?? bareAmpm;
    if (ampmMatch) {
        const rawHour = Number(ampm ? ampm[2] : bareAmpm![1]);
        const minuteText = ampm ? ampm[3] : bareAmpm![2];
        const minute = minuteText ? Number(minuteText) : 0;
        const meridiem = (ampm ? ampm[4] : bareAmpm![3])!.toLowerCase();
        if (rawHour < 1 || rawHour > 12 || minute < 0 || minute > 59)
            throw new SmartDateError('Invalid 12-hour time.');
        const hour = meridiem === 'am' ? (rawHour === 12 ? 0 : rawHour) : rawHour === 12 ? 12 : rawHour + 12;
        return {
            datePart: (ampm?.[1] ?? '').trim(),
            hour,
            minute,
            timeText: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        };
    }
    const h24 = /^(.*?)(?:\s+at)?\s+(\d{1,2}):(\d{2})$/.exec(trimmed);
    const bare24h = !h24 ? /^(?:at\s+)?(\d{1,2}):(\d{2})$/.exec(trimmed) : null;
    if (h24 || bare24h) {
        const hour = Number(h24 ? h24[2] : bare24h![1]);
        const minute = Number(h24 ? h24[3] : bare24h![2]);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59)
            throw new SmartDateError('Time must use a valid 24-hour HH:mm value.');
        return {
            datePart: (h24?.[1] ?? '').trim(),
            hour,
            minute,
            timeText: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        };
    }
    return { datePart: trimmed, hour: null, minute: null, timeText: null };
}

export function resolveUpcomingYearDate(
    month: number,
    day: number,
    yearText: string | undefined,
    now: Date,
): Date {
    if (yearText) {
        const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
        return localDate(year, month, day);
    }
    const currentYear = now.getFullYear();
    const candidate = localDate(currentYear, month, day);
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 12, 0, 0, 0);
    if (candidate < cutoff) {
        try {
            return localDate(currentYear + 1, month, day);
        } catch {
            return candidate;
        }
    }
    return candidate;
}

export function addClampedMonths(base: Date, months: number): Date {
    const targetMonthIndex = base.getMonth() + months;
    const targetYear = base.getFullYear() + Math.floor(targetMonthIndex / 12);
    const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
    const maxDay = new Date(targetYear, normalizedMonth + 1, 0, 12, 0, 0, 0).getDate();
    return localDate(targetYear, normalizedMonth + 1, Math.min(base.getDate(), maxDay));
}

export function parseRelativeDateExpression(
    normalized: string,
    now: Date,
): { date: Date; timeOverride?: { hour: number; minute: number; text: string } } | null {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    if (normalized === 'now') {
        const hour = now.getHours();
        const minute = now.getMinutes();
        return {
            date: base,
            timeOverride: {
                hour,
                minute,
                text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
            },
        };
    }
    if (normalized === 'today' || normalized === 't') return { date: base };
    if (normalized === 'tomorrow' || normalized === 'tom' || normalized === 'tmrw' || normalized === 'tmw') {
        base.setDate(base.getDate() + 1);
        return { date: base };
    }
    if (normalized === 'yesterday' || normalized === 'y' || normalized === 'yest') {
        base.setDate(base.getDate() - 1);
        return { date: base };
    }
    if (normalized === 'this week') return { date: base };
    if (normalized === 'next week' || normalized === 'nw' || normalized === 'n') {
        base.setDate(base.getDate() + 7);
        return { date: base };
    }
    if (normalized === 'last week' || normalized === 'lw' || normalized === 'l') {
        base.setDate(base.getDate() - 7);
        return { date: base };
    }
    if (normalized === 'this month') return { date: localDate(now.getFullYear(), now.getMonth() + 1, 1) };
    if (normalized === 'next month' || normalized === 'nm') return { date: addClampedMonths(base, 1) };
    if (normalized === 'last month' || normalized === 'lm') return { date: addClampedMonths(base, -1) };
    if (normalized === 'this year') return { date: localDate(now.getFullYear(), 1, 1) };
    if (normalized === 'next year' || normalized === 'ny') return { date: addClampedMonths(base, 12) };
    if (normalized === 'last year' || normalized === 'ly') return { date: addClampedMonths(base, -12) };
    if (normalized === 'start of week' || normalized === 'sow') {
        const mondayOffset = (base.getDay() + 6) % 7;
        base.setDate(base.getDate() - mondayOffset);
        return { date: base };
    }
    if (normalized === 'end of week' || normalized === 'eow') {
        const sundayOffset = (7 - base.getDay()) % 7;
        base.setDate(base.getDate() + sundayOffset);
        return { date: base };
    }
    if (normalized === 'start of month' || normalized === 'som')
        return { date: localDate(now.getFullYear(), now.getMonth() + 1, 1) };
    if (normalized === 'end of month' || normalized === 'eom')
        return { date: new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0, 0, 0) };
    if (normalized === 'start of year' || normalized === 'soy')
        return { date: localDate(now.getFullYear(), 1, 1) };
    if (normalized === 'end of year' || normalized === 'eoy')
        return { date: localDate(now.getFullYear(), 12, 31) };

    const minutesOrHours =
        /^(?:in\s+(\d{1,4})\s*(minutes?|mins?|m|hours?|hrs?|h)|(\d{1,4})\s*(minutes?|mins?|m|hours?|hrs?|h)\s+ago)$/.exec(
            normalized,
        );
    if (minutesOrHours) {
        const forward = Boolean(minutesOrHours[1]);
        const count = Number(minutesOrHours[1] ?? minutesOrHours[3]);
        const unit = (minutesOrHours[2] ?? minutesOrHours[4])!;
        if (count < 1 || count > 5000) throw new SmartDateError('Relative time offset is out of range.');
        const deltaMs = (unit.startsWith('h') ? count * 60 : count) * 60_000 * (forward ? 1 : -1);
        const shifted = new Date(now.getTime() + deltaMs);
        const hour = shifted.getHours();
        const minute = shifted.getMinutes();
        return {
            date: localDate(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate()),
            timeOverride: {
                hour,
                minute,
                text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
            },
        };
    }

    const relativeUnit =
        /^(?:in\s+(\d{1,3})\s*(days?|d|weeks?|w|months?|mos?|years?|y)|(\d{1,3})\s*(days?|d|weeks?|w|months?|mos?|years?|y)\s+ago)$/.exec(
            normalized,
        );
    if (relativeUnit) {
        const forward = Boolean(relativeUnit[1]);
        const count = Number(relativeUnit[1] ?? relativeUnit[3]);
        const unit = (relativeUnit[2] ?? relativeUnit[4])!;
        if (count < 1 || count > 365) throw new SmartDateError('Relative offset must be between 1 and 365.');
        const signed = forward ? count : -count;
        if (unit.startsWith('d')) {
            base.setDate(base.getDate() + signed);
            return { date: base };
        }
        if (unit.startsWith('w')) {
            if (count * 7 > 3650) throw new SmartDateError('Relative week offset is too large.');
            base.setDate(base.getDate() + signed * 7);
            return { date: base };
        }
        return { date: addClampedMonths(base, unit.startsWith('m') ? signed : signed * 12) };
    }

    const modWeekday = /^(this|next|last)\s+([a-z]+)$/.exec(normalized);
    const plainWeekday = /^([a-z]+)$/.exec(normalized);
    const token = modWeekday?.[2] ?? plainWeekday?.[1];
    const resolvedWeekday = token ? (WEEKDAYS[token] ?? SHORT_WEEKDAYS[token]) : undefined;
    if (resolvedWeekday !== undefined) {
        const target = resolvedWeekday;
        const current = base.getDay();
        if (modWeekday?.[1] === 'last') {
            const back = (current - target + 7) % 7 || 7;
            base.setDate(base.getDate() - back);
            return { date: base };
        }
        let delta = (target - current + 7) % 7;
        if (modWeekday?.[1] === 'next' || delta === 0) delta += 7;
        base.setDate(base.getDate() + delta);
        return { date: base };
    }

    return null;
}

export function formatNotionDateLabel(params: {
    date: string;
    time?: string | null;
    endDate?: string | null;
    format?: SmartDateDisplayFormat;
    now?: Date;
}): string {
    const fmt = params.format ?? 'relative';
    const formatSingle = (isoDate: string): string => {
        const parsed = new Date(`${isoDate}T12:00:00`);
        if (!Number.isFinite(parsed.getTime())) return isoDate;
        if (fmt === 'iso') return isoDate;
        if (fmt === 'short') {
            const [y, m, d] = isoDate.split('-');
            return `${d}/${m}/${y}`;
        }
        if (fmt === 'relative') {
            const refNow = params.now ?? new Date();
            const today = new Date(refNow.getFullYear(), refNow.getMonth(), refNow.getDate(), 12, 0, 0, 0);
            const diffDays = Math.round((parsed.getTime() - today.getTime()) / 86_400_000);
            if (diffDays === 0) return 'Today';
            if (diffDays === 1) return 'Tomorrow';
            if (diffDays === -1) return 'Yesterday';
            if (diffDays > 1 && diffDays < 7)
                return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(parsed);
        }
        return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
            parsed,
        );
    };
    const start = formatSingle(params.date);
    const withTime = params.time ? `${start} ${params.time}` : start;
    return params.endDate ? `${withTime} → ${formatSingle(params.endDate)}` : withTime;
}
