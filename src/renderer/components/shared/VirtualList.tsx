import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface Props<T> {
    items: T[];
    itemHeight: number;
    renderItem: (item: T, index: number) => ReactNode;
    itemKey: (item: T) => string;
    className?: string;
    overscan?: number;
    empty?: ReactNode;
    label: string;
}

/** Fixed-height list virtualization. Only visible rows plus a small overscan are mounted. */
export function VirtualList<T>({
    items,
    itemHeight,
    renderItem,
    itemKey,
    className = '',
    overscan = 6,
    empty,
    label,
}: Props<T>) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(480);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const measure = () => setViewportHeight(Math.max(itemHeight, viewport.clientHeight));
        measure();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [itemHeight]);

    // Preserve scroll position when a row is updated, but return to the top when the
    // identity/order of the result set changes (filter, page, or project switch).
    const itemIdentity = useMemo(() => items.map(itemKey).join('\u001f'), [items, itemKey]);
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.scrollTop = 0;
        setScrollTop(0);
    }, [itemIdentity]);

    const range = useMemo(() => {
        const firstVisible = Math.floor(scrollTop / itemHeight);
        const start = Math.max(0, firstVisible - overscan);
        const visibleCount = Math.ceil(viewportHeight / itemHeight);
        const end = Math.min(items.length, firstVisible + visibleCount + overscan);
        return { start, end };
    }, [items.length, itemHeight, overscan, scrollTop, viewportHeight]);

    if (items.length === 0) return <>{empty}</>;
    const visibleItems = items.slice(range.start, range.end);

    return (
        <div
            ref={viewportRef}
            role="list"
            aria-label={label}
            className={`min-h-0 overflow-auto overscroll-contain ${className}`}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            style={{ overflowAnchor: 'none', contain: 'layout paint style' }}
        >
            <div style={{ height: items.length * itemHeight, position: 'relative' }}>
                <div style={{ position: 'absolute', insetInline: 0, top: range.start * itemHeight }}>
                    {visibleItems.map((item, index) => (
                        <div
                            key={itemKey(item)}
                            role="listitem"
                            style={{ height: itemHeight, overflow: 'hidden' }}
                        >
                            {renderItem(item, range.start + index)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
