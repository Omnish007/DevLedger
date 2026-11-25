import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSmartDate, SmartDateError } from '../../src/domain/smart-date.ts';

test('parses numeric dd/mm/yyyy dates strictly', () => {
    assert.deepEqual(parseSmartDate('01/02/2026', new Date('2026-01-20T12:00:00')), {
        kind: 'date',
        date: '2026-02-01',
        source: '01/02/2026',
    });
    assert.throws(() => parseSmartDate('31/02/2026'), SmartDateError);
});

test('parses compact date-time with 24-hour validation', () => {
    const result = parseSmartDate('@0102261325', new Date('2026-01-01T12:00:00'));
    assert.equal(result.kind, 'datetime');
    if (result.kind === 'datetime') {
        assert.equal(result.date, '2026-02-01');
        assert.equal(result.time, '13:25');
        assert.equal(new Date(result.isoUtc).getHours(), 13);
    }
    assert.throws(() => parseSmartDate('@0102262565'), SmartDateError);
});

test('today, tomorrow and weekdays are deterministic', () => {
    const now = new Date(2026, 0, 30, 10, 0, 0); // Friday, local time.
    assert.equal(
        parseSmartDate('today', now).kind === 'date' && parseSmartDate('today', now).date,
        '2026-01-30',
    );
    assert.equal(
        parseSmartDate('tomorrow', now).kind === 'date' && parseSmartDate('tomorrow', now).date,
        '2026-01-31',
    );
    assert.equal(
        parseSmartDate('Friday', now).kind === 'date' && parseSmartDate('Friday', now).date,
        '2026-02-06',
    );
    assert.equal(
        parseSmartDate('next Friday', now).kind === 'date' && parseSmartDate('next Friday', now).date,
        '2026-02-06',
    );
});

test('rejects unsupported and ambiguous date phrases', () => {
    assert.throws(() => parseSmartDate('in a few days'), SmartDateError);
    assert.throws(() => parseSmartDate(''), SmartDateError);
});
