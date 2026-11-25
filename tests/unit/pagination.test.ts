import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    escapeLikeQuery,
    normalizePage,
} from '../../src/domain/pagination.ts';

test('pagination applies safe defaults, integer offsets and bounded page sizes', () => {
    assert.deepEqual(normalizePage(), { limit: DEFAULT_PAGE_SIZE, offset: 0, query: '' });
    assert.deepEqual(normalizePage({ limit: 500, offset: -9, query: '  search  ' }), {
        limit: MAX_PAGE_SIZE,
        offset: 0,
        query: 'search',
    });
    assert.deepEqual(normalizePage({ limit: 0, offset: 2.8, query: 'x'.repeat(250) }), {
        limit: 1,
        offset: 2,
        query: 'x'.repeat(200),
    });
});

test('LIKE search escapes wildcard and escape characters as literals', () => {
    assert.equal(escapeLikeQuery('100%_ready\\done'), '100\\%\\_ready\\\\done');
});
