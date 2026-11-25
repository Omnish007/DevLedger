/** Returns a stable local-calendar date key without converting through UTC. */
export function toLocalCalendarDateKey(value: Date): string {
    if (!Number.isFinite(value.getTime())) throw new Error('Invalid calendar date.');
    const year = String(value.getFullYear()).padStart(4, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Compare calendar days, intentionally ignoring the time-of-day on both values. */
export function compareLocalCalendarDates(left: Date, right: Date): -1 | 0 | 1 {
    const leftKey = toLocalCalendarDateKey(left);
    const rightKey = toLocalCalendarDateKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

export function isLocalCalendarDateDisabled(date: Date, minDate?: Date, maxDate?: Date): boolean {
    if (minDate && compareLocalCalendarDates(date, minDate) < 0) return true;
    if (maxDate && compareLocalCalendarDates(date, maxDate) > 0) return true;
    return false;
}
