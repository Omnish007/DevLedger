import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageResult } from '@shared/contracts';
import { friendlyError } from '@/lib/utils';

interface UsePaginatedFetchOptions<T> {
    fetcher: (offset: number) => Promise<PageResult<T>>;
    offset: number;
    errorFallback: string;
    clearOnError?: boolean;
    onLoaded?: ((page: PageResult<T>) => void) | undefined;
}

/** Shared race-guarded pagination loader for list pages. */
export function usePaginatedFetch<T>({
    fetcher,
    offset,
    errorFallback,
    clearOnError = false,
    onLoaded,
}: UsePaginatedFetchOptions<T>) {
    const [items, setItems] = useState<T[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const requestRef = useRef(0);
    const onLoadedRef = useRef(onLoaded);
    onLoadedRef.current = onLoaded;

    const loadPage = useCallback(
        async (requestedOffset = offset): Promise<PageResult<T> | null> => {
            const requestId = ++requestRef.current;
            setLoading(true);
            if (clearOnError) setError('');
            try {
                const page = await fetcher(requestedOffset);
                if (requestId === requestRef.current) {
                    setItems(page.items);
                    setTotal(page.total);
                    setError('');
                    onLoadedRef.current?.(page);
                    return page;
                }
                return null;
            } catch (cause) {
                if (requestId === requestRef.current) {
                    if (clearOnError) {
                        setItems([]);
                        setTotal(0);
                    }
                    setError(friendlyError(cause, errorFallback));
                }
                return null;
            } finally {
                if (requestId === requestRef.current) setLoading(false);
            }
        },
        [fetcher, offset, errorFallback, clearOnError],
    );

    useEffect(() => {
        void loadPage();
    }, [loadPage]);

    return { items, setItems, total, loading, error, setError, loadPage };
}
