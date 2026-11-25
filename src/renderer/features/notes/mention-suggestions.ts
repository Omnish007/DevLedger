import type { AtSuggestionItem } from '@domain/at-suggestions';

export {
    buildAtSuggestions,
    formatSmartDateDisplay,
    toSmartDateReference,
    type AtSuggestionItem,
} from '@domain/at-suggestions';

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvgIcon(kind: 'date' | 'reminder' | 'picker'): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'size-3.5 shrink-0');

    const paths =
        kind === 'reminder'
            ? [
                  'M10.268 21a2 2 0 0 0 3.464 0',
                  'M22 8c0-2.3-.8-4.3-2-6',
                  'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
                  'M4 2C2.8 3.7 2 5.7 2 8',
              ]
            : kind === 'picker'
              ? [
                    'M8 2v4',
                    'M16 2v4',
                    'M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8',
                    'M3 10h18',
                    'M16 19h6',
                    'M19 16v6',
                ]
              : [
                    'M8 2v4',
                    'M16 2v4',
                    'M3 10h18',
                    'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
                ];

    for (const d of paths) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        svg.append(path);
    }
    return svg;
}

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '@';
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

export function createAtSuggestionRenderer() {
    let popup: HTMLDivElement | null = null;
    let listEl: HTMLDivElement | null = null;
    let activeIndex = 0;
    let currentItems: AtSuggestionItem[] = [];
    let currentCommand: ((item: AtSuggestionItem) => void) | null = null;

    const optionClass = (selected: boolean) =>
        `flex w-full items-center justify-between gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
            selected ? 'bg-accent text-accent-foreground ring-1 ring-border/70' : 'hover:bg-accent/55'
        }`;

    const updateActiveSelection = () => {
        const buttons = listEl?.querySelectorAll<HTMLButtonElement>('button[role="option"]');
        buttons?.forEach((button, index) => {
            const selected = index === activeIndex;
            button.setAttribute('aria-selected', String(selected));
            button.className = optionClass(selected);
            if (selected) button.scrollIntoView({ block: 'nearest' });
        });
    };

    const positionPopup = (rect: DOMRect) => {
        if (!popup || !listEl) return;
        const margin = 10;
        const width = Math.min(388, window.innerWidth - margin * 2);
        popup.style.width = `${width}px`;
        listEl.style.maxHeight = 'none';
        const naturalHeight = Math.min(416, Math.max(88, popup.scrollHeight));
        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;
        const placeAbove = spaceBelow < naturalHeight + 8 && spaceAbove > spaceBelow;
        const available = placeAbove ? spaceAbove : spaceBelow;
        const maxTotalH = Math.max(160, Math.min(416, available - 8));
        listEl.style.maxHeight = `${Math.max(108, maxTotalH - 36)}px`;
        const clampedHeight = Math.min(naturalHeight, maxTotalH);
        const left = Math.min(window.innerWidth - width - margin, Math.max(margin, rect.left));
        const top = placeAbove
            ? Math.max(margin, rect.top - clampedHeight - 8)
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
                'fixed z-[100] overflow-hidden rounded-xl border border-border/90 bg-popover text-popover-foreground shadow-[0_18px_46px_-14px_rgba(0,0,0,0.52),0_4px_14px_-4px_rgba(0,0,0,0.22)]';
            listEl = document.createElement('div');
            listEl.className = 'overflow-y-auto overscroll-contain p-1.5';
            const footer = document.createElement('div');
            footer.className =
                'flex items-center justify-between gap-2 border-t border-border/70 bg-surface-subtle/50 px-2.5 py-1.5 text-[10px] text-muted-foreground';
            footer.textContent = '↑↓ Navigate · ↵ Insert · @r Remind · Esc';
            popup.append(listEl, footer);
            document.body.appendChild(popup);
        }
        if (!listEl) return;
        listEl.replaceChildren();

        if (!currentItems.length) {
            const empty = document.createElement('div');
            empty.className = 'px-2.5 py-2.5 text-xs text-muted-foreground';
            empty.textContent = 'No dates or contacts match';
            listEl.append(empty);
        } else {
            let lastSection: string | null = null;
            currentItems.forEach((item, index) => {
                const section = item.kind === 'date' ? 'dates' : 'contacts';
                if (section !== lastSection) {
                    if (lastSection !== null) {
                        const divider = document.createElement('div');
                        divider.className = 'my-1 border-t border-border/60';
                        listEl?.append(divider);
                    }
                    lastSection = section;
                    const heading = document.createElement('div');
                    heading.className =
                        'px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-0.5';
                    heading.textContent = section === 'dates' ? 'Dates & reminders' : 'People & contacts';
                    listEl?.append(heading);
                }

                const button = document.createElement('button');
                button.type = 'button';
                button.setAttribute('role', 'option');
                button.setAttribute('aria-selected', String(index === activeIndex));
                button.className = optionClass(index === activeIndex);

                const left = document.createElement('span');
                left.className = 'inline-flex min-w-0 flex-1 items-center gap-2.5';

                const badge = document.createElement('span');
                if (item.kind === 'date') {
                    const isReminder = Boolean(item.attrs.isReminder);
                    const iconKind = item.openPicker ? 'picker' : isReminder ? 'reminder' : 'date';
                    badge.className = `grid size-6 shrink-0 place-items-center rounded-md ring-1 ${
                        isReminder
                            ? 'bg-amber-500/15 text-amber-600 ring-amber-500/35 dark:bg-amber-400/18 dark:text-amber-300 dark:ring-amber-400/40'
                            : item.openPicker
                              ? 'bg-sky-500/15 text-sky-700 ring-sky-500/35 dark:bg-sky-400/18 dark:text-sky-300 dark:ring-sky-400/40'
                              : 'bg-sky-500/12 text-sky-600 ring-sky-500/25 dark:bg-sky-400/14 dark:text-sky-300 dark:ring-sky-400/30'
                    }`;
                    badge.append(makeSvgIcon(iconKind));
                } else {
                    badge.className =
                        'grid size-6 shrink-0 place-items-center rounded-full bg-violet-500/16 text-[10px] font-bold text-violet-700 ring-1 ring-violet-500/35 dark:bg-violet-400/20 dark:text-violet-200 dark:ring-violet-400/40';
                    badge.textContent = initialsFromName(item.label);
                }

                const textCol = document.createElement('span');
                textCol.className = 'min-w-0 flex-1';
                const labelEl = document.createElement('span');
                labelEl.className = 'block truncate font-medium text-foreground';
                labelEl.textContent = item.label;
                textCol.append(labelEl);
                left.append(badge, textCol);

                const right = document.createElement('span');
                right.className = 'inline-flex shrink-0 items-center gap-1.5 text-[11px]';
                if (item.kind === 'date') {
                    const detailEl = document.createElement('span');
                    detailEl.className = item.attrs.isReminder
                        ? 'font-medium text-amber-600 dark:text-amber-300'
                        : 'text-sky-700/85 dark:text-sky-300/85';
                    detailEl.textContent = item.detail;
                    right.append(detailEl);
                    if (item.shortcut) {
                        const kbd = document.createElement('kbd');
                        kbd.className =
                            'rounded border border-border/80 bg-surface-subtle px-1 py-0.5 font-mono text-[10px] text-muted-foreground';
                        kbd.textContent = item.shortcut;
                        right.append(kbd);
                    }
                } else {
                    const roleBadge = document.createElement('span');
                    roleBadge.className =
                        'rounded-full bg-violet-500/12 px-2 py-0.5 text-[10px] font-medium capitalize text-violet-700 dark:bg-violet-400/15 dark:text-violet-200';
                    roleBadge.textContent = item.company ? `${item.detail} · ${item.company}` : item.detail;
                    right.append(roleBadge);
                }

                button.append(left, right);
                button.addEventListener('mousedown', (event) => event.preventDefault());
                button.addEventListener('click', () => currentCommand?.(item));
                listEl?.append(button);
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
                listEl = null;
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
            listEl = null;
            currentItems = [];
            currentCommand = null;
        },
    };
}
