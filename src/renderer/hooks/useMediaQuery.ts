import { useEffect, useState } from 'react';

/** Subscribe to a CSS media query and return its current match state. */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() =>
        typeof window !== 'undefined' ? (window.matchMedia?.(query).matches ?? false) : false,
    );

    useEffect(() => {
        const mediaQuery = window.matchMedia?.(query);
        if (!mediaQuery) return;
        const sync = () => setMatches(mediaQuery.matches);
        sync();
        mediaQuery.addEventListener?.('change', sync);
        return () => mediaQuery.removeEventListener?.('change', sync);
    }, [query]);

    return matches;
}
