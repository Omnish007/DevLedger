import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery } from '../../src/domain/search-query.ts';

test('parses project, tag, document type and status filters', () => {
    assert.deepEqual(parseSearchQuery('connection timeout p:"Retail POS" #urgent type:pdf is:blocked'), {
        text: 'connection timeout',
        project: 'Retail POS',
        tag: 'urgent',
        entityType: 'document',
        extension: '.pdf',
        status: 'blocked',
    });
});

test('preserves unknown operators as literal search text', () => {
    assert.equal(parseSearchQuery('error is:maybe type:unknown').text, 'error is:maybe type:unknown');
});

test('validates date filters strictly', () => {
    assert.deepEqual(parseSearchQuery('stacktrace after:2026-02-01 before:2026-02-28'), {
        text: 'stacktrace',
        after: '2026-02-01',
        before: '2026-02-28',
    });
    assert.throws(() => parseSearchQuery('after:2026-02-30'), /valid date/);
});
