import { useEffect, useState } from 'react';

/** Synchronize an incoming navigation project focus prop into local filter + offset state. */
export function useInitialProjectFilter(
    initialProjectId: string | null | undefined,
    fallbackValue: string,
    onConsumeFocus?: () => void,
) {
    const [projectId, setProjectId] = useState(initialProjectId || fallbackValue);
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        if (initialProjectId) {
            setProjectId(initialProjectId);
            setOffset(0);
            onConsumeFocus?.();
        }
    }, [initialProjectId, onConsumeFocus]);

    return { projectId, setProjectId, offset, setOffset };
}
