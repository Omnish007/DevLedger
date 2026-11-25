export interface SnapshotCandidate {
    path: string;
    createdAt: string;
}

function validTime(snapshot: SnapshotCandidate): number | null {
    const value = Date.parse(snapshot.createdAt);
    return Number.isFinite(value) ? value : null;
}

/** Keep all snapshots from the last 24 hours (48 half-hour points), then one per day, week and month. */
export function selectRetainedSnapshots(
    snapshots: readonly SnapshotCandidate[],
    now = new Date(),
): Set<string> {
    const sorted = snapshots
        .map((item) => ({ item, time: validTime(item) }))
        .filter(
            (entry): entry is { item: SnapshotCandidate; time: number } =>
                entry.time !== null && entry.time <= now.getTime(),
        )
        .sort((a, b) => b.time - a.time);
    const keep = new Set<string>();
    const addNewestPerBucket = (
        entries: typeof sorted,
        bucket: (date: Date) => string,
        maxBuckets: number,
    ) => {
        const seen = new Set<string>();
        for (const entry of entries) {
            const key = bucket(new Date(entry.time));
            if (seen.has(key)) continue;
            seen.add(key);
            keep.add(entry.item.path);
            if (seen.size >= maxBuckets) break;
        }
    };

    for (const entry of sorted.slice(0, 48)) keep.add(entry.item.path);
    addNewestPerBucket(sorted, (date) => date.toISOString().slice(0, 10), 7);
    addNewestPerBucket(
        sorted,
        (date) => {
            const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
            const offset = (monday.getUTCDay() + 6) % 7;
            monday.setUTCDate(monday.getUTCDate() - offset);
            return monday.toISOString().slice(0, 10);
        },
        4,
    );
    addNewestPerBucket(sorted, (date) => `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`, 6);
    return keep;
}
