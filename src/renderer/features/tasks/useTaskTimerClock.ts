import { useEffect, useState } from 'react';
import type { ActiveTimerRecord, TaskRecord } from '@shared/contracts';
import { toDateTimeLocalInput } from '@/lib/utils';

export function useTaskTimerClock(activeTimer: ActiveTimerRecord | null, pageTasks: TaskRecord[]) {
    const [clockNow, setClockNow] = useState(Date.now());
    const [recoveryEndAt, setRecoveryEndAt] = useState(() => toDateTimeLocalInput(new Date()));
    const [fetchedTimerTitle, setFetchedTimerTitle] = useState('');

    const activeTaskId = activeTimer?.taskId ?? null;
    const activeStartedAt = activeTimer?.startedAt ?? null;
    const recoveryRequired = Boolean(activeTimer?.recoveryRequired);

    useEffect(() => {
        if (recoveryRequired) setRecoveryEndAt(toDateTimeLocalInput(new Date()));
    }, [activeTaskId, recoveryRequired]);

    useEffect(() => {
        if (!activeTaskId || !activeStartedAt) return;
        const id = window.setInterval(() => setClockNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [activeTaskId, activeStartedAt]);

    const visibleTimerTitle = activeTaskId ? pageTasks.find((t) => t.id === activeTaskId)?.title : undefined;

    useEffect(() => {
        if (!activeTaskId) {
            setFetchedTimerTitle('');
            return;
        }
        if (visibleTimerTitle) {
            setFetchedTimerTitle(visibleTimerTitle);
            return;
        }
        let active = true;
        void window.devLedger.tasks
            .listPage({ limit: 200, offset: 0, includeCompleted: true })
            .then((page) => {
                if (!active) return;
                const found = page.items.find((t) => t.id === activeTaskId);
                if (found) setFetchedTimerTitle(found.title);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [activeTaskId, visibleTimerTitle]);

    const elapsedEnd = recoveryRequired
        ? Date.parse(activeTimer?.lastHeartbeatAt ?? activeStartedAt ?? '')
        : clockNow;
    const elapsedMs = activeStartedAt ? Math.max(0, elapsedEnd - Date.parse(activeStartedAt)) : 0;
    const elapsedHours = elapsedMs / 3_600_000;
    const crossedLocalDay = Boolean(
        activeStartedAt && new Date(activeStartedAt).toDateString() !== new Date(elapsedEnd).toDateString(),
    );
    const elapsedLabel = `${String(Math.floor(elapsedMs / 3_600_000)).padStart(2, '0')}:${String(Math.floor((elapsedMs % 3_600_000) / 60_000)).padStart(2, '0')}:${String(Math.floor((elapsedMs % 60_000) / 1_000)).padStart(2, '0')}`;

    return {
        recoveryEndAt,
        setRecoveryEndAt,
        elapsedHours,
        crossedLocalDay,
        elapsedLabel,
        timerTitle: visibleTimerTitle ?? (fetchedTimerTitle || 'Focus task'),
    };
}
