import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDateOnly } from '../../src/domain/date-only.ts';

test('date-only validation handles Gregorian leap years without timezone conversion', () => {
    assert.equal(isValidDateOnly('2024-02-29'), true);
    assert.equal(isValidDateOnly('2025-02-29'), false);
    assert.equal(isValidDateOnly('2000-02-29'), true);
    assert.equal(isValidDateOnly('1900-02-29'), false);
    assert.equal(isValidDateOnly('2026-04-31'), false);
});

test('date-only validation rejects non-canonical and impossible values', () => {
    for (const value of ['2026-2-01', '01/02/2026', '0000-01-01', '2026-13-01', '2026-00-12', '2026-02-00']) {
        assert.equal(isValidDateOnly(value), false, value);
    }
});
