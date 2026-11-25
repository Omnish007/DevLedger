import {
    formatNotionDateLabel,
    getSmartDatePresets,
    parseSmartDate,
    type SmartDateDisplayFormat,
    type SmartDateResult,
} from './smart-date.ts';
import type { SmartDateReference } from './smart-date-markdown.ts';
import type { ContactRecord } from '../shared/contracts.js';

export type AtSuggestionItem =
    | {
          kind: 'date';
          id: string;
          label: string;
          detail: string;
          shortcut?: string;
          openPicker?: boolean;
          attrs: SmartDateReference;
      }
    | {
          kind: 'contact';
          id: string;
          label: string;
          detail: string;
          company?: string;
      };

export function formatSmartDateDisplay(
    result: SmartDateResult,
    format: SmartDateDisplayFormat = 'full',
): string {
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
        source:
            sourceLabel ??
            formatNotionDateLabel({
                date: result.date,
                time: result.kind === 'datetime' ? result.time : null,
                format,
            }),
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
    const wantsReminder = normalized === 'r' || normalized.startsWith('r ') || normalized.startsWith('rem');
    const dateItems: AtSuggestionItem[] = [];
    const seenKeys = new Set<string>();
    let firstParsedResult: SmartDateResult | null = null;

    if (query) {
        try {
            const parsed = parseSmartDate(query, now);
            firstParsedResult = parsed;
            const key = `${parsed.date}|${parsed.kind === 'datetime' ? parsed.time : ''}|${Boolean(parsed.isReminder)}`;
            seenKeys.add(key);
            const weekday = new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            }).format(new Date(`${parsed.date}T12:00:00`));
            dateItems.push({
                kind: 'date',
                id: `date:parsed:${key}`,
                label: parsed.isReminder
                    ? `Remind · ${formatSmartDateDisplay(parsed, 'relative')}`
                    : `@${query.replace(/^@/, '')}`,
                detail: `${weekday}${parsed.kind === 'datetime' ? ` · ${parsed.time}` : ''}`,
                shortcut: parsed.isReminder ? 'Reminder' : 'Custom',
                attrs: toSmartDateReference(
                    parsed,
                    formatNotionDateLabel({
                        date: parsed.date,
                        time: parsed.kind === 'datetime' ? parsed.time : null,
                        format: 'relative',
                        now,
                    }),
                    parsed.isReminder ? { isReminder: true } : {},
                ),
            });
        } catch {
            /* Partial expression while typing; fall through to matching presets. */
        }
    }

    const presets = getSmartDatePresets(now);
    const orderedPresets = wantsReminder
        ? [...presets.filter((p) => p.result.isReminder), ...presets.filter((p) => !p.result.isReminder)]
        : presets;

    for (const preset of orderedPresets) {
        const tokenText = preset.token.slice(1);
        const shortcutText = preset.shortcut?.slice(1) ?? '';
        if (
            !normalized ||
            (wantsReminder && preset.result.isReminder) ||
            preset.label.toLowerCase().includes(normalized) ||
            tokenText.includes(normalized) ||
            shortcutText.startsWith(normalized)
        ) {
            const time = preset.result.kind === 'datetime' ? preset.result.time : '';
            const key = `${preset.result.date}|${time}|${Boolean(preset.result.isReminder)}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            dateItems.push({
                kind: 'date',
                id: `date:${preset.id}`,
                label: preset.label,
                detail: formatSmartDateDisplay(preset.result),
                ...(preset.shortcut ? { shortcut: preset.shortcut } : {}),
                attrs: toSmartDateReference(
                    preset.result,
                    formatNotionDateLabel({
                        date: preset.result.date,
                        time: time || null,
                        format: 'relative',
                        now,
                    }),
                    preset.result.isReminder ? { isReminder: true } : {},
                ),
            });
        }
    }

    const pickerKeywords = ['calendar', 'date', 'range', 'time', 'pick', 'custom', 'schedule', 'remind'];
    const pickerMatches =
        !normalized || wantsReminder || pickerKeywords.some((word) => word.includes(normalized));
    let pickerItem: AtSuggestionItem | null = null;
    if (pickerMatches) {
        const seed =
            firstParsedResult ?? parseSmartDate(wantsReminder ? '@remind tomorrow 9am' : '@today', now);
        pickerItem = {
            kind: 'date',
            id: 'date:open-calendar-picker',
            label: wantsReminder ? 'Schedule reminder…' : 'Pick on calendar…',
            detail: 'Date or range',
            shortcut: 'Calendar',
            openPicker: true,
            attrs: toSmartDateReference(
                seed,
                formatNotionDateLabel({
                    date: seed.date,
                    time: seed.kind === 'datetime' ? seed.time : null,
                    format: 'relative',
                    now,
                }),
                wantsReminder || seed.isReminder ? { isReminder: true } : {},
            ),
        };
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
        ...(contact.company ? { company: contact.company } : {}),
    }));
    const visibleDateLimit = normalized ? 5 : 4;
    const pinnedReminder = !normalized
        ? dateItems.find((item) => item.kind === 'date' && item.attrs.isReminder)
        : undefined;
    const initialDates =
        !normalized && pinnedReminder
            ? [
                  ...dateItems.filter((item) => item.kind === 'date' && !item.attrs.isReminder).slice(0, 3),
                  pinnedReminder,
              ]
            : dateItems.slice(0, visibleDateLimit);
    return [...initialDates, ...(pickerItem ? [pickerItem] : []), ...contactItems];
}
