import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDisplayName, safeFtsQuery } from '../../src/domain/validation.ts';

test('FTS query terms are quoted and bounded', () => {
    assert.equal(safeFtsQuery('SQLite FTS5'), '"SQLite"* AND "FTS5"*');
    assert.equal(safeFtsQuery('  '), '');
    assert.ok(safeFtsQuery('x '.repeat(40)).split(' AND ').length <= 12);
});

test('display names remove control characters and limit length', () => {
    assert.equal(safeDisplayName('  scope\nfile.pdf  '), 'scopefile.pdf');
    assert.equal(safeDisplayName('x'.repeat(10), 4), 'xxxx');
});
