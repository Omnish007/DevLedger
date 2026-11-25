import type { AtSuggestionItem } from '@domain/at-suggestions';

export {
    buildAtSuggestions,
    formatSmartDateDisplay,
    toSmartDateReference,
    type AtSuggestionItem,
} from '@domain/at-suggestions';

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
            button.className = `flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${selected ? 'bg-accent/90 text-accent-foreground' : 'hover:bg-accent/55'}`;
            if (selected) button.scrollIntoView({ block: 'nearest' });
        });
    };

    const positionPopup = (rect: DOMRect) => {
        if (!popup) return;
        const margin = 10;
        const width = Math.min(312, window.innerWidth - margin * 2);
        popup.style.width = `${width}px`;
        popup.style.maxHeight = 'none';
        const naturalHeight = Math.min(288, Math.max(48, popup.scrollHeight));
        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;
        const placeAbove = spaceBelow < naturalHeight + 6 && spaceAbove > spaceBelow;
        const available = placeAbove ? spaceAbove : spaceBelow;
        const maxH = Math.max(120, Math.min(288, available - 6));
        const clampedHeight = Math.min(naturalHeight, maxH);
        popup.style.maxHeight = `${maxH}px`;
        const left = Math.min(window.innerWidth - width - margin, Math.max(margin, rect.left));
        const top = placeAbove
            ? Math.max(margin, rect.top - clampedHeight - 6)
            : Math.min(window.innerHeight - clampedHeight - margin, Math.max(margin, rect.bottom + 6));
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
    };

    const paint = (props: {
        items: AtSuggestionItem[];
        command: (item: AtSuggestionItem) => void;
        clientRect?: (() => DOMRect | null) | null;
    }) => {
        currentItems = props.items;
        currentCommand = props.command;
        if (!popup) {
            popup = document.createElement('div');
            popup.setAttribute('role', 'listbox');
            popup.setAttribute('aria-label', 'Date and contact suggestions');
            popup.className =
                'fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border border-border/85 bg-popover p-1.5 text-popover-foreground shadow-[0_16px_40px_-12px_rgba(0,0,0,0.45),0_2px_10px_-2px_rgba(0,0,0,0.18)]';
            document.body.appendChild(popup);
        }
        popup.replaceChildren();
        if (!currentItems.length) {
            const empty = document.createElement('div');
            empty.className = 'px-2.5 py-2 text-xs text-muted-foreground';
            empty.textContent = 'No dates or contacts match';
            popup.append(empty);
        } else {
            let lastKind: string | null = null;
            currentItems.forEach((item, index) => {
                if (item.kind !== lastKind) {
                    lastKind = item.kind;
                    const heading = document.createElement('div');
                    heading.className =
                        'px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-0.5';
                    heading.textContent = item.kind === 'date' ? 'Date & reminders' : 'Project contacts';
                    popup?.append(heading);
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.setAttribute('role', 'option');
                button.setAttribute('aria-selected', String(index === activeIndex));
                button.className = `flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${index === activeIndex ? 'bg-accent/90 text-accent-foreground' : 'hover:bg-accent/55'}`;
                const left = document.createElement('span');
                left.className = 'inline-flex min-w-0 items-center gap-2 truncate font-medium';
                const glyph = document.createElement('span');
                glyph.className = `grid size-4 shrink-0 place-items-center rounded text-[10px] font-semibold ${item.kind === 'date' && item.attrs.isReminder ? 'bg-warning/15 text-warning' : item.kind === 'date' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`;
                glyph.textContent = item.kind === 'date' ? (item.attrs.isReminder ? '!' : '#') : '@';
                const text = document.createElement('span');
                text.className = 'truncate';
                text.textContent = item.label;
                left.append(glyph, text);
                const right = document.createElement('span');
                right.className = 'shrink-0 text-[11px] text-muted-foreground';
                right.textContent = item.detail;
                button.append(left, right);
                button.addEventListener('mousedown', (event) => event.preventDefault());
                button.addEventListener('click', () => currentCommand?.(item));
                popup?.append(button);
            });
        }
        const rect = props.clientRect?.();
        if (rect) positionPopup(rect);
    };

    return {
        onStart: (props: Parameters<typeof paint>[0]) => {
            activeIndex = 0;
            paint(props);
        },
        onUpdate: (props: Parameters<typeof paint>[0]) => {
            activeIndex = Math.min(activeIndex, Math.max(0, props.items.length - 1));
            paint(props);
        },
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'Escape') {
                popup?.remove();
                popup = null;
                return true;
            }
            if (!currentItems.length) return false;
            if (event.key === 'ArrowDown') {
                activeIndex = (activeIndex + 1) % currentItems.length;
                updateActiveSelection();
                return true;
            }
            if (event.key === 'ArrowUp') {
                activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length;
                updateActiveSelection();
                return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
                const item = currentItems[activeIndex];
                if (item) {
                    event.preventDefault();
                    currentCommand?.(item);
                    return true;
                }
            }
            return false;
        },
        onExit: () => {
            popup?.remove();
            popup = null;
            currentItems = [];
            currentCommand = null;
        },
    };
}
