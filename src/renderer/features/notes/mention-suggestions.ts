import type { AtSuggestionItem } from '@domain/at-suggestions';

export { buildAtSuggestions, formatSmartDateDisplay, toSmartDateReference, type AtSuggestionItem } from '@domain/at-suggestions';

export function createAtSuggestionRenderer() {
  let popup: HTMLDivElement | null = null;
  let activeIndex = 0;
  let currentItems: AtSuggestionItem[] = [];
  let currentCommand: ((item: AtSuggestionItem) => void) | null = null;

  const updateActiveSelection = () => {
    const buttons = popup?.querySelectorAll<HTMLButtonElement>('button[role="option"]');
    buttons?.forEach((button, index) => {
      const selected = index === activeIndex;
      button.setAttribute('aria-selected', String(selected));
      button.className = `flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`;
      if (selected) button.scrollIntoView({ block: 'nearest' });
    });
  };

  const paint = (props: { items: AtSuggestionItem[]; command: (item: AtSuggestionItem) => void; clientRect?: (() => DOMRect | null) | null }) => {
    currentItems = props.items;
    currentCommand = props.command;
    if (!popup) {
      popup = document.createElement('div');
      popup.setAttribute('role', 'listbox');
      popup.setAttribute('aria-label', 'Date and contact suggestions');
      popup.className = 'fixed z-[100] w-72 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl';
      document.body.appendChild(popup);
    }
    popup.replaceChildren();
    const rect = props.clientRect?.();
    if (rect) {
      const left = Math.min(window.innerWidth - 296, Math.max(8, rect.left));
      const top = rect.bottom + 296 > window.innerHeight ? Math.max(8, rect.top - 220) : rect.bottom + 6;
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    }
    if (!currentItems.length) {
      const empty = document.createElement('div');
      empty.className = 'px-2.5 py-2 text-xs text-muted-foreground';
      empty.textContent = 'No dates or contacts match';
      popup.append(empty);
      return;
    }
    let lastKind: string | null = null;
    currentItems.forEach((item, index) => {
      if (item.kind !== lastKind) {
        lastKind = item.kind;
        const heading = document.createElement('div');
        heading.className = 'px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-0.5';
        heading.textContent = item.kind === 'date' ? 'Date reference' : 'Project contacts';
        popup?.append(heading);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === activeIndex));
      button.className = `flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`;
      const left = document.createElement('span');
      left.className = 'inline-flex min-w-0 items-center gap-1.5 truncate font-medium';
      const iconText = item.kind === 'date' ? (item.attrs.isReminder ? '🔔' : '📅') : '@';
      const glyph = document.createElement('span');
      glyph.className = `shrink-0 text-[11px] ${item.kind === 'date' && item.attrs.isReminder ? 'text-warning' : 'text-muted-foreground'}`;
      glyph.textContent = iconText;
      const text = document.createElement('span');
      text.className = 'truncate';
      text.textContent = item.label;
      left.append(glyph, text);
      const right = document.createElement('span');
      right.className = 'shrink-0 text-[10px] text-muted-foreground';
      right.textContent = item.detail;
      button.append(left, right);
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => currentCommand?.(item));
      popup?.append(button);
    });
  };

  return {
    onStart: (props: Parameters<typeof paint>[0]) => { activeIndex = 0; paint(props); },
    onUpdate: (props: Parameters<typeof paint>[0]) => { activeIndex = Math.min(activeIndex, Math.max(0, props.items.length - 1)); paint(props); },
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'Escape') { popup?.remove(); popup = null; return true; }
      if (!currentItems.length) return false;
      if (event.key === 'ArrowDown') { activeIndex = (activeIndex + 1) % currentItems.length; updateActiveSelection(); return true; }
      if (event.key === 'ArrowUp') { activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length; updateActiveSelection(); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = currentItems[activeIndex];
        if (item) { event.preventDefault(); currentCommand?.(item); return true; }
      }
      return false;
    },
    onExit: () => { popup?.remove(); popup = null; currentItems = []; currentCommand = null; },
  };
}
