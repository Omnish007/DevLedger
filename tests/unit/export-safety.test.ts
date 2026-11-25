import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../../src/domain/export-safety.ts';

test('CSV cells quote commas and escaped quotes', () => {
    assert.equal(csvCell('client, "quoted"'), '"client, ""quoted"""');
});

test('CSV cells neutralize spreadsheet formula prefixes', () => {
    for (const value of [
        '=1+1',
        '+SUM(A1:A2)',
        '-2+3',
        '@SUM(A1)',
        '  =HYPERLINK("https://example.invalid")',
        '\t=cmd',
    ]) {
        assert.ok(csvCell(value).startsWith('"\''));
    }
});

test('CSV cells preserve ordinary values as text', () => {
    assert.equal(csvCell('Retail POS'), '"Retail POS"');
    assert.equal(csvCell(null), '""');
});
