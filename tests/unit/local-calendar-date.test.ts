import test from 'node:test';
import assert from 'node:assert/strict';
import {
    compareLocalCalendarDates,
    isLocalCalendarDateDisabled,
    toLocalCalendarDateKey,
} from '../../src/domain/local-calendar-date.ts';

test('local calendar comparison ignores time-of-day on the same date', () => {
    const morning = new Date(2026, 10, 22, 0, 1);
    const evening = new Date(2026, 10, 22, 23, 59);
    assert.equal(compareLocalCalendarDates(morning, evening), 0);
    assert.equal(toLocalCalendarDateKey(evening), '2026-11-22');
});

test('date picker bounds include the min and max calendar dates regardless of time', () => {
    const min = new Date(2026, 10, 22, 17, 30);
    const max = new Date(2026, 10, 26, 8, 0);
    assert.equal(isLocalCalendarDateDisabled(new Date(2026, 10, 22, 0, 0), min, max), false);
    assert.equal(isLocalCalendarDateDisabled(new Date(2026, 10, 26, 23, 59), min, max), false);
    assert.equal(isLocalCalendarDateDisabled(new Date(2026, 10, 21, 23, 59), min, max), true);
    assert.equal(isLocalCalendarDateDisabled(new Date(2026, 10, 27, 0, 0), min, max), true);
});

test('invalid Date values are rejected instead of becoming ambiguous bounds', () => {
    assert.throws(() => toLocalCalendarDateKey(new Date(Number.NaN)), /Invalid calendar date/);
});
