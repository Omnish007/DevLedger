import Mention from '@tiptap/extension-mention';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table/cell';
import { TableHeader } from '@tiptap/extension-table/header';
import { TableRow } from '@tiptap/extension-table/row';
import type { ContactRecord } from '@shared/contracts';
import {
    parseContactMentionMarkdownLink,
    serializeContactMentionMarkdown,
} from '@domain/contact-mention-markdown';
import {
    parseSmartDateMarkdownLink,
    serializeSmartDateMarkdown,
    type SmartDateReference,
} from '@domain/smart-date-markdown';
import { buildAtSuggestions, createAtSuggestionRenderer, type AtSuggestionItem } from './mention-suggestions';
import { SmartDateChipView, type SmartDateNodeOptions } from './SmartDateChipView';
import {
    attachSyncedReminderId,
    computeReminderDueIso,
    schedulePendingDatePicker,
} from './smart-date-ui-helpers';

export function createNoteExtensions(
    searchContacts: (query: string, projectId: string) => Promise<ContactRecord[]>,
    getProjectId: () => string,
    dateOptions: SmartDateNodeOptions = {},
) {
    const smartDate = Node.create<SmartDateNodeOptions>({
        name: 'smartDate',
        group: 'inline',
        inline: true,
        atom: true,
        addOptions() {
            return { onReminderSync: dateOptions.onReminderSync };
        },
        addAttributes() {
            return {
                date: {
                    default: null,
                    parseHTML: (element: HTMLElement) => element.getAttribute('data-date'),
                },
                time: {
                    default: null,
                    parseHTML: (element: HTMLElement) => element.getAttribute('data-time') || null,
                },
                isoUtc: {
                    default: null,
                    parseHTML: (element: HTMLElement) => element.getAttribute('data-utc') || null,
                },
                timezone: {
                    default: '',
                    parseHTML: (element: HTMLElement) => element.getAttribute('data-timezone') || '',
                },
                source: { default: '', parseHTML: (element: HTMLElement) => element.textContent || '' },
                endDate: {
                    default: null,
                    parseHTML: (element: HTMLElement) => element.getAttribute('data-end-date') || null,
                },
                format: {
                    default: 'relative',
                    parseHTML: (element: HTMLElement) => element.getAttribute('data-format') || 'relative',
                },
                isReminder: {
                    default: false,
                    parseHTML: (element: HTMLElement) => element.getAttribute('data-reminder') === '1',
                },
                reminderId: {
                    default: null,
                    parseHTML: (element: HTMLElement) => element.getAttribute('data-reminder-id') || null,
                },
            };
        },
        parseHTML() {
            return [{ tag: 'span[data-type="smart-date"]' }, { tag: 'button[data-type="smart-date"]' }];
        },
        renderHTML({ node, HTMLAttributes }) {
            const reference: SmartDateReference = {
                date: String(node.attrs['date'] ?? ''),
                time: node.attrs['time'] ? String(node.attrs['time']) : null,
                isoUtc: node.attrs['isoUtc'] ? String(node.attrs['isoUtc']) : null,
                timezone: String(node.attrs['timezone'] ?? ''),
                source: String(node.attrs['source'] ?? ''),
                endDate: node.attrs['endDate'] ? String(node.attrs['endDate']) : null,
                format: (node.attrs['format'] as SmartDateReference['format']) ?? 'relative',
                isReminder: Boolean(node.attrs['isReminder']),
                reminderId: node.attrs['reminderId'] ? String(node.attrs['reminderId']) : null,
            };
            return [
                'span',
                mergeAttributes(HTMLAttributes, {
                    'data-type': 'smart-date',
                    'data-date': reference.date,
                    'data-time': reference.time ?? '',
                    'data-utc': reference.isoUtc ?? '',
                    'data-timezone': reference.timezone,
                    'data-end-date': reference.endDate ?? '',
                    'data-format': reference.format ?? 'relative',
                    'data-reminder': reference.isReminder ? '1' : '0',
                    'data-reminder-id': reference.reminderId ?? '',
                    class: `smart-date-reference${reference.isReminder ? ' is-reminder' : ''}`,
                }),
                reference.source || reference.date,
            ];
        },
        addNodeView() {
            return ReactNodeViewRenderer(SmartDateChipView, { as: 'span' });
        },
        markdownTokenName: 'link',
        parseMarkdown(token) {
            const fields = token as unknown as Record<string, unknown>;
            const reference = parseSmartDateMarkdownLink(
                typeof fields['href'] === 'string' ? fields['href'] : '',
                typeof fields['text'] === 'string' ? fields['text'] : '',
            );
            return reference ? { type: 'smartDate', attrs: reference } : [];
        },
        renderMarkdown({ attrs }) {
            const resolved = attrs ?? {};
            return serializeSmartDateMarkdown({
                date: String(resolved['date'] ?? ''),
                time: resolved['time'] ? String(resolved['time']) : null,
                isoUtc: resolved['isoUtc'] ? String(resolved['isoUtc']) : null,
                timezone: String(resolved['timezone'] ?? ''),
                source: String(resolved['source'] ?? ''),
                endDate: resolved['endDate'] ? String(resolved['endDate']) : null,
                format: (resolved['format'] as SmartDateReference['format']) ?? 'relative',
                isReminder: Boolean(resolved['isReminder']),
                reminderId: resolved['reminderId'] ? String(resolved['reminderId']) : null,
            });
        },
    });

    const mention = Mention.extend({
        markdownTokenName: 'link',
        parseHTML() {
            return [{ tag: 'a[data-type="mention"][data-contact-id]' }];
        },
        parseMarkdown(token) {
            const fields = token as unknown as Record<string, unknown>;
            const contact = parseContactMentionMarkdownLink(
                typeof fields['href'] === 'string' ? fields['href'] : '',
                typeof fields['text'] === 'string' ? fields['text'] : '',
            );
            return contact ? { type: 'mention', attrs: contact } : [];
        },
        renderMarkdown({ attrs }) {
            const resolved = attrs ?? {};
            return serializeContactMentionMarkdown({
                id: String(resolved['id'] ?? ''),
                label: String(resolved['label'] ?? resolved['id'] ?? 'contact'),
            });
        },
    }).configure({
        HTMLAttributes: { class: 'note-contact-mention' },
        deleteTriggerWithBackspace: true,
        renderText: ({ node }) => `@${String(node.attrs['label'] ?? node.attrs['id'])}`,
        renderHTML({ node, options }) {
            const contactId = String(node.attrs['id'] ?? '');
            return [
                'a',
                {
                    ...options.HTMLAttributes,
                    href: '#devledger-contact',
                    'data-type': 'mention',
                    'data-id': contactId,
                    'data-label': String(node.attrs['label'] ?? contactId),
                    'data-contact-id': contactId,
                    contenteditable: 'false',
                },
                `@${String(node.attrs['label'] ?? contactId)}`,
            ];
        },
        suggestion: {
            char: '@',
            minQueryLength: 0,
            allowSpaces: true,
            debounce: 80,
            allowedPrefixes: [' ', '\n', '(', '['],
            command: ({ editor, range, props }) => {
                const item = props as unknown as AtSuggestionItem;
                if (item.kind === 'date') {
                    if (item.openPicker) schedulePendingDatePicker(item.attrs);
                    editor
                        .chain()
                        .focus()
                        .insertContentAt(range, [
                            { type: 'smartDate', attrs: item.attrs },
                            { type: 'text', text: ' ' },
                        ])
                        .run();
                    if (item.attrs.isReminder && !item.openPicker && dateOptions.onReminderSync) {
                        const dueIso =
                            item.attrs.isoUtc ?? computeReminderDueIso(item.attrs.date, item.attrs.time);
                        void dateOptions
                            .onReminderSync(item.attrs, dueIso)
                            .then((id) =>
                                attachSyncedReminderId(editor, item.attrs.date, id, item.attrs.time),
                            );
                    }
                    return;
                }
                editor
                    .chain()
                    .focus()
                    .insertContentAt(range, [
                        { type: 'mention', attrs: { id: item.id, label: item.label } },
                        { type: 'text', text: ' ' },
                    ])
                    .run();
            },
            items: ({ query }: { query: string }) =>
                buildAtSuggestions(query, searchContacts, getProjectId()),
            render: createAtSuggestionRenderer,
        },
    });

    const colWidthPctAttr = {
        default: null as number | null,
        parseHTML: (element: HTMLElement) => {
            const raw = element.getAttribute('data-col-width') ?? element.style.width;
            if (!raw || (raw === element.style.width && !raw.includes('%'))) return null;
            const parsed = Number.parseFloat(raw);
            return Number.isFinite(parsed) && parsed > 5 && parsed < 96 ? Number(parsed.toFixed(1)) : null;
        },
        renderHTML: (attributes: Record<string, unknown>) => {
            const pct = Number(attributes['colWidthPct']);
            if (!Number.isFinite(pct) || pct <= 5 || pct >= 96) return {};
            return { 'data-col-width': String(pct), style: `width: ${pct}%` };
        },
    };

    const customTableCell = TableCell.extend({
        addAttributes() {
            return { ...this.parent?.(), colWidthPct: colWidthPctAttr };
        },
    });

    const customTableHeader = TableHeader.extend({
        addAttributes() {
            return { ...this.parent?.(), colWidthPct: colWidthPctAttr };
        },
    });

    const customTableRow = TableRow.extend({
        addAttributes() {
            return {
                ...this.parent?.(),
                rowHeight: {
                    default: null as number | null,
                    parseHTML: (element: HTMLElement) => {
                        const raw = element.getAttribute('data-row-height') ?? element.style.height;
                        if (!raw) return null;
                        const parsed = Number.parseInt(raw, 10);
                        return Number.isFinite(parsed) && parsed >= 32 && parsed <= 480 ? parsed : null;
                    },
                    renderHTML: (attributes: Record<string, unknown>) => {
                        const height = Number(attributes['rowHeight']);
                        if (!Number.isFinite(height) || height < 32 || height > 480) return {};
                        const rounded = Math.round(height);
                        return { 'data-row-height': String(rounded), style: `height: ${rounded}px` };
                    },
                },
            };
        },
    });

    return [
        TaskList.configure({ HTMLAttributes: { 'data-type': 'taskList' } }),
        TaskItem.configure({ nested: true, HTMLAttributes: { 'data-type': 'taskItem' } }),
        TableKit.configure({
            table: { resizable: false },
            tableCell: false,
            tableHeader: false,
            tableRow: false,
        }),
        customTableRow,
        customTableCell,
        customTableHeader,
        mention,
        smartDate,
    ];
}
