import type { Editor } from '@tiptap/core';
import { formatNotionDateLabel, parseSmartDate, type SmartDateDisplayFormat } from '@domain/smart-date';
import type { SmartDateReference } from '@domain/smart-date-markdown';
import { atLocalTime, toDateString } from '@domain/smart-date-notion';

export function attachSyncedReminderId(
    editor: Editor | null | undefined,
    date: string,
    reminderId: string | null,
    time?: string | null,
): void {
    if (!editor || editor.isDestroyed || !reminderId) return;
    editor.state.doc.descendants((node, pos) => {
        const matchesDate = node.attrs['date'] === date;
        const matchesTime = time === undefined || (node.attrs['time'] ?? null) === (time ?? null);
        if (
            node.type.name === 'smartDate' &&
            matchesDate &&
            matchesTime &&
            node.attrs['isReminder'] &&
            !node.attrs['reminderId']
        ) {
            editor.view.dispatch(
                editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, reminderId }),
            );
            return false;
        }
        return true;
    });
}

export function isoDateToLocalDate(isoDate?: string | null): Date | undefined {
    if (!isoDate) return undefined;
    const parsed = new Date(`${isoDate}T12:00:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

export function buildDateAttrsFromSelection(params: {
    date: string;
    endDate?: string | null;
    time?: string | null;
    format?: SmartDateDisplayFormat;
    isReminder?: boolean;
    reminderId?: string | null;
}): SmartDateReference {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let time: string | null = null;
    let isoUtc: string | null = null;
    if (params.time && /^([01]\d|2[0-3]):([0-5]\d)$/.test(params.time)) {
        const [hourText, minuteText] = params.time.split(':');
        const local = isoDateToLocalDate(params.date);
        if (local) {
            time = params.time;
            isoUtc = atLocalTime(local, Number(hourText), Number(minuteText)).toISOString();
        }
    }
    const endDate =
        params.endDate && params.endDate >= params.date && params.endDate !== params.date
            ? params.endDate
            : null;
    const format = params.format ?? 'relative';
    const source = formatNotionDateLabel({ date: params.date, time, endDate, format });
    return {
        date: params.date,
        time,
        isoUtc,
        timezone,
        source,
        endDate,
        format,
        isReminder: Boolean(params.isReminder),
        reminderId: params.reminderId ?? null,
    };
}

export function parseIntoDateAttrs(
    input: string,
    options: {
        format?: SmartDateDisplayFormat | undefined;
        endDate?: string | null | undefined;
        forceReminder?: boolean | undefined;
        reminderId?: string | null | undefined;
    } = {},
): SmartDateReference {
    const parsed = parseSmartDate(input);
    return buildDateAttrsFromSelection({
        date: parsed.date,
        endDate: options.endDate ?? null,
        time: parsed.kind === 'datetime' ? parsed.time : null,
        format: options.format ?? 'relative',
        isReminder: options.forceReminder ?? Boolean(parsed.isReminder),
        reminderId: options.reminderId ?? null,
    });
}

export function computeReminderDueIso(date: string, time: string | null, offsetMinutes = 0): string {
    const base = isoDateToLocalDate(date) ?? new Date();
    const [hour, minute] =
        time && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time) ? time.split(':').map(Number) : [9, 0];
    const target = atLocalTime(base, hour!, minute!);
    return new Date(target.getTime() - offsetMinutes * 60_000).toISOString();
}

export { toDateString };
