import Mention from '@tiptap/extension-mention';
import { Node } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import type { ContactRecord } from '@shared/contracts';
import { parseContactMentionMarkdownLink, serializeContactMentionMarkdown } from '@domain/contact-mention-markdown';
import { parseSmartDateMarkdownLink, serializeSmartDateMarkdown, type SmartDateReference } from '@domain/smart-date-markdown';

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
    parseHTML() { return [{ tag: 'a[data-type=\"mention\"][data-contact-id]' }]; },
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
      minQueryLength: 1,
      debounce: 180,
      allowedPrefixes: [' ', '\n', '(', '['],
      items: async ({ query }: { query: string }) => {
        const contacts = await searchContacts(query, getProjectId());
        return contacts.slice(0, 8).map((contact) => ({ id: contact.id, label: contact.name, role: contact.role }));
      },
      render: () => {
        let popup: HTMLDivElement | null = null;
        let activeIndex = 0;
        let currentItems: Array<{ id: string; label: string; role: string }> = [];
        let currentCommand: ((item: { id: string; label: string }) => void) | null = null;

        const paint = (props: { items: Array<{ id: string; label: string; role: string }>; command: (item: { id: string; label: string }) => void; clientRect?: (() => DOMRect | null) | null }) => {
          currentItems = props.items;
          currentCommand = props.command;
          if (!popup) {
            popup = document.createElement('div');
            popup.setAttribute('role', 'listbox');
            popup.setAttribute('aria-label', 'Contact suggestions');
            popup.className = 'fixed z-[100] min-w-56 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl';
            document.body.appendChild(popup);
          }
          popup.replaceChildren();
          const rect = props.clientRect?.();
          if (rect) {
            popup.style.left = `${Math.max(8, rect.left)}px`;
            popup.style.top = `${Math.min(window.innerHeight - 16, rect.bottom + 6)}px`;
          }
          if (!currentItems.length) {
            const empty = document.createElement('div');
            empty.className = 'px-3 py-2 text-xs text-muted-foreground';
            empty.textContent = 'No matching contacts';
            popup.append(empty);
            return;
          }
          currentItems.forEach((item, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', String(index === activeIndex));
            button.className = `flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs ${index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`;
            const name = document.createElement('span');
            name.className = 'font-medium';
            name.textContent = item.label;
            const role = document.createElement('span');
            role.className = 'text-[10px] text-muted-foreground';
            role.textContent = item.role || 'Contact';
            button.append(name, role);
            button.addEventListener('mousedown', (event) => event.preventDefault());
            button.addEventListener('click', () => currentCommand?.({ id: item.id, label: item.label }));
            popup?.append(button);
          });
        };

        return {
          onStart: (props: Parameters<typeof paint>[0]) => { activeIndex = 0; paint(props); },
          onUpdate: (props: Parameters<typeof paint>[0]) => { activeIndex = Math.min(activeIndex, Math.max(0, props.items.length - 1)); paint(props); },
          onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'Escape') { popup?.remove(); popup = null; return true; }
            if (!currentItems.length) return false;
            if (event.key === 'ArrowDown') { activeIndex = (activeIndex + 1) % currentItems.length; const button = popup?.querySelectorAll<HTMLButtonElement>('button')[activeIndex]; popup?.querySelectorAll('button').forEach((item) => item.setAttribute('aria-selected', 'false')); button?.setAttribute('aria-selected', 'true'); button?.scrollIntoView({ block: 'nearest' }); return true; }
            if (event.key === 'ArrowUp') { activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length; const button = popup?.querySelectorAll<HTMLButtonElement>('button')[activeIndex]; popup?.querySelectorAll('button').forEach((item) => item.setAttribute('aria-selected', 'false')); button?.setAttribute('aria-selected', 'true'); button?.scrollIntoView({ block: 'nearest' }); return true; }
            if (event.key === 'Enter') { const item = currentItems[activeIndex]; if (item) currentCommand?.({ id: item.id, label: item.label }); return true; }
            return false;
          },
          onExit: () => { popup?.remove(); popup = null; currentItems = []; currentCommand = null; },
        };
      },
    },
  });

  return [TaskList, TaskItem.configure({ nested: true }), TableKit.configure({ table: { resizable: false } }), mention, smartDate];
}
