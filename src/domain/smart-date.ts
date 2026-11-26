import {
    atLocalTime,
    extractTimeSuffix,
    formatNotionDateLabel,
    localDate,
    MONTHS,
    parseRelativeDateExpression,
    resolveUpcomingYearDate,
    toDateString,
} from './smart-date-notion.ts';
import { SmartDateError, type SmartDateDisplayFormat, type SmartDateResult } from './smart-date-types.ts';

export { SmartDateError, formatNotionDateLabel };
export type { SmartDateDisplayFormat, SmartDateResult };

function formatSmartDateResult(
    date: Date,
    source: string,
    hour: number | null,
    minute: number | null,
    timeText: string | null,
    isReminder = false,
): SmartDateResult {
    const reminderAttr = isReminder ? { isReminder: true } : {};
    if (hour === null || minute === null || !timeText) {
        return { kind: 'date', date: toDateString(date), source, ...reminderAttr };
    }
    const dateTime = atLocalTime(date, hour, minute);
    return {
        kind: 'datetime',
        date: toDateString(date),
        time: timeText,
        isoUtc: dateTime.toISOString(),
        source,
        ...reminderAttr,
    };
}

export function parseSmartDate(input: string, now = new Date()): SmartDateResult {
    const value = input.trim();
    if (!value) throw new SmartDateError('Enter a date or a supported Notion expression.');

    const compact = /^@(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
    if (compact) {
        const [, dayText, monthText, yearText, hourText, minuteText] = compact;
        const date = localDate(2000 + Number(yearText), Number(monthText), Number(dayText));
        return formatSmartDateResult(
            date,
            value,
            Number(hourText),
            Number(minuteText),
            `${hourText}:${minuteText}`,
        );
    }

    const withoutAt = value.startsWith('@') ? value.slice(1).trim() : value;
    if (!withoutAt)
        throw new SmartDateError('Enter a date after @ (e.g. @today, @May 15, @remind tomorrow 9am).');

    let body = withoutAt;
    let isReminder = false;
    if (/^remind(?:\s+me)?\b/i.test(body) || /^r\s+/i.test(body)) {
        isReminder = true;
        body = body.replace(/^(?:remind(?:\s+me)?|r)\b/i, '').trim();
        if (!body) throw new SmartDateError('Enter when to remind you (e.g. @r tomorrow 9am).');
    }

    const extracted = extractTimeSuffix(body);
    const { datePart } = extracted;
    let { hour, minute, timeText } = extracted;

    const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(datePart);
    if (iso) {
        return formatSmartDateResult(
            localDate(Number(iso[1]), Number(iso[2]), Number(iso[3])),
            value,
            hour,
            minute,
            timeText,
            isReminder,
        );
    }

    const numeric = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/.exec(datePart);
    if (numeric) {
        const date = resolveUpcomingYearDate(Number(numeric[2]), Number(numeric[1]), numeric[3], now);
        return formatSmartDateResult(date, value, hour, minute, timeText, isReminder);
    }

    const monthFirst = /^([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/i.exec(datePart);
    if (monthFirst && monthFirst[1]!.toLowerCase() in MONTHS) {
        const month = MONTHS[monthFirst[1]!.toLowerCase()]!;
        const date = resolveUpcomingYearDate(month, Number(monthFirst[2]), monthFirst[3], now);
        return formatSmartDateResult(date, value, hour, minute, timeText, isReminder);
    }

    const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:,?\s*(\d{4}))?$/i.exec(datePart);
    if (dayFirst && dayFirst[2]!.toLowerCase() in MONTHS) {
        const month = MONTHS[dayFirst[2]!.toLowerCase()]!;
        const date = resolveUpcomingYearDate(month, Number(dayFirst[1]), dayFirst[3], now);
        return formatSmartDateResult(date, value, hour, minute, timeText, isReminder);
    }

    const relative = parseRelativeDateExpression(datePart.toLowerCase(), now);
    if (relative) {
        if (relative.timeOverride && hour === null) {
            hour = relative.timeOverride.hour;
            minute = relative.timeOverride.minute;
            timeText = relative.timeOverride.text;
        }
        return formatSmartDateResult(relative.date, value, hour, minute, timeText, isReminder);
    }

    if (!datePart && hour !== null && minute !== null && timeText !== null) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
        return formatSmartDateResult(today, value, hour, minute, timeText, isReminder);
    }

    throw new SmartDateError(
        'Unsupported date. Try @today, @May 15, @last friday, @in 2 weeks, @3 days ago, or @remind tomorrow 9am.',
    );
}

export interface SmartDatePreset {
    id: string;
    label: string;
    token: string;
    shortcut?: string;
    result: SmartDateResult;
}

export const SMART_TIME_PRESETS = ['09:00', '12:00', '15:00', '18:00'] as const;

export function getSmartDatePresets(now = new Date()): SmartDatePreset[] {
    const candidates = [
        { id: 'today', label: 'Today', token: '@today', shortcut: '@t' },
        { id: 'tomorrow', label: 'Tomorrow', token: '@tomorrow', shortcut: '@tom' },
        { id: 'friday', label: 'Next Friday', token: '@friday', shortcut: '@f' },
        { id: 'monday', label: 'Next Monday', token: '@monday', shortcut: '@m' },
        { id: 'next-week', label: 'Next week', token: '@next week', shortcut: '@nw' },
        { id: 'end-of-month', label: 'End of month', token: '@end of month', shortcut: '@eom' },
        {
            id: 'remind-today-eve',
            label: 'Remind today 6pm',
            token: '@remind today 18:00',
            shortcut: '@r t 6pm',
        },
        {
            id: 'remind-tomorrow',
            label: 'Remind tomorrow 9am',
            token: '@remind tomorrow 9am',
            shortcut: '@r tom 9am',
        },
    ];
    return candidates.map((item) => ({ ...item, result: parseSmartDate(item.token, now) }));
}
