import Mention from '@tiptap/extension-mention';
import { Node } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import type { ContactRecord } from '@shared/contracts';
import { parseContactMentionMarkdownLink, serializeContactMentionMarkdown } from '@domain/contact-mention-markdown';
import { parseSmartDateMarkdownLink, serializeSmartDateMarkdown, type SmartDateReference } from '@domain/smart-date-markdown';
import { buildAtSuggestions, createAtSuggestionRenderer, type AtSuggestionItem } from './mention-suggestions';

export function createNoteExtensions(searchContacts: (query: string, projectId: string) => Promise<ContactRecord[]>, getProjectId: () => string) {
  const smartDate = Node.create({
    name: 'smartDate',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
      return {
        date: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('data-date') },
        time: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('data-time') || null },
        isoUtc: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('data-utc') || null },
        timezone: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-timezone') || '' },
        source: { default: '', parseHTML: (element: HTMLElement) => element.textContent || '' },
      };
    },
    parseHTML() { return [{ tag: 'span[data-type="smart-date"]' }]; },
    renderHTML({ node }) {
      const reference: SmartDateReference = {
        date: String(node.attrs.date ?? ''),
        time: node.attrs.time ? String(node.attrs.time) : null,
        isoUtc: node.attrs.isoUtc ? String(node.attrs.isoUtc) : null,
        timezone: String(node.attrs.timezone ?? ''),
        source: String(node.attrs.source ?? ''),
      };
      return ['span', {
        'data-type': 'smart-date', 'data-date': reference.date, 'data-time': reference.time ?? '',
        'data-utc': reference.isoUtc ?? '', 'data-timezone': reference.timezone, class: 'smart-date-reference',
      }, reference.source || reference.date];
    },
    markdownTokenName: 'link',
    parseMarkdown(token) {
      const fields = token as unknown as Record<string, unknown>;
      const reference = parseSmartDateMarkdownLink(typeof fields.href === 'string' ? fields.href : '', typeof fields.text === 'string' ? fields.text : '');
      return reference ? { type: 'smartDate', attrs: reference } : null;
    },
    renderMarkdown({ attrs }) {
      return serializeSmartDateMarkdown({
        date: String(attrs.date ?? ''), time: attrs.time ? String(attrs.time) : null,
        isoUtc: attrs.isoUtc ? String(attrs.isoUtc) : null, timezone: String(attrs.timezone ?? ''),
        source: String(attrs.source ?? ''),
      });
    },
  });
  const mention = Mention.extend({
    markdownTokenName: 'link',
    parseHTML() { return [{ tag: 'a[data-type="mention"][data-contact-id]' }]; },
    parseMarkdown(token) {
      const fields = token as unknown as Record<string, unknown>;
      const href = typeof fields.href === 'string' ? fields.href : '';
      const text = typeof fields.text === 'string' ? fields.text : '';
      const mention = parseContactMentionMarkdownLink(href, text);
      return mention ? { type: 'mention', attrs: mention } : null;
    },
    renderMarkdown({ attrs }) {
      return serializeContactMentionMarkdown({ id: String(attrs.id ?? ''), label: String(attrs.label ?? attrs.id ?? 'contact') });
    },
  }).configure({
    HTMLAttributes: { class: 'note-contact-mention' },
    deleteTriggerWithBackspace: true,
    renderText({ node }) {
      return `@${String(node.attrs.label ?? node.attrs.id)}`;
    },
    renderHTML({ node, options }) {
      const contactId = String(node.attrs.id ?? '');
      return [
        'a',
        {
          ...options.HTMLAttributes,
          href: '#devledger-contact',
          'data-type': 'mention',
          'data-id': contactId,
          'data-label': String(node.attrs.label ?? contactId),
          'data-contact-id': contactId,
          contenteditable: 'false',
        },
        `@${String(node.attrs.label ?? contactId)}`,
      ];
    },
    suggestion: {
      char: '@',
      minQueryLength: 0,
      allowSpaces: true,
      debounce: 100,
      allowedPrefixes: [' ', '\n', '(', '['],
      command: ({ editor, range, props }) => {
        const item = props as unknown as AtSuggestionItem;
        if (item.kind === 'date') {
          editor.chain().focus().insertContentAt(range, [{ type: 'smartDate', attrs: item.attrs }, { type: 'text', text: ' ' }]).run();
          return;
        }
        editor.chain().focus().insertContentAt(range, [{ type: 'mention', attrs: { id: item.id, label: item.label } }, { type: 'text', text: ' ' }]).run();
      },
      items: ({ query }: { query: string }) => buildAtSuggestions(query, searchContacts, getProjectId()),
      render: createAtSuggestionRenderer,
    },
  });

  return [
    TaskList.configure({ HTMLAttributes: { 'data-type': 'taskList' } }),
    TaskItem.configure({ nested: true, HTMLAttributes: { 'data-type': 'taskItem' } }),
    TableKit.configure({ table: { resizable: false } }),
    mention,
    smartDate,
  ];
}
