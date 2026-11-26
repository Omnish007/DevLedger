import { useCallback, useEffect, useRef, useState } from 'react';

/** Resolve human-readable project names for record lists without race conditions. */
export function useProjectNames(projectIds: readonly (string | null | undefined)[] = []) {
    const [projectNames, setProjectNames] = useState<Record<string, string>>({});
    const requestRef = useRef(0);

    const resolveProjectNames = useCallback(async (ids: readonly (string | null | undefined)[]) => {
        const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))].slice(0, 200);
        if (!unique.length) return;
        const requestId = ++requestRef.current;
        try {
            const names = await window.devLedger.projects.getNames(unique);
            if (requestId === requestRef.current) {
                setProjectNames((current) => ({ ...current, ...names }));
            }
        } catch {
            /* Project name resolution is best-effort metadata for list rows. */
        }
    }, []);

    const idsKey = [...new Set(projectIds.filter((id): id is string => Boolean(id)))].slice(0, 200).join(',');

    useEffect(() => {
        if (!idsKey) return;
        void resolveProjectNames(idsKey.split(','));
    }, [idsKey, resolveProjectNames]);

    return { projectNames, resolveProjectNames };
}
