import test from 'node:test';
import assert from 'node:assert/strict';
import {
    elapsedMinutes,
    wouldCreateDependencyCycle,
    wouldCreateParentCycle,
} from '../../src/domain/task-rules.ts';

test('dependency graph accepts acyclic edges and rejects cycles', () => {
    const edges = [
        { fromTaskId: 'a', toTaskId: 'b' },
        { fromTaskId: 'b', toTaskId: 'c' },
    ];
    assert.equal(wouldCreateDependencyCycle(edges, 'c', 'd'), false);
    assert.equal(wouldCreateDependencyCycle(edges, 'c', 'a'), true);
    assert.equal(wouldCreateDependencyCycle(edges, 'a', 'a'), true);
});

test('nested task parent changes reject self-ancestor cycles', () => {
    const parents = new Map<string, string | null>([
        ['a', null],
        ['b', 'a'],
        ['c', 'b'],
    ]);
    assert.equal(wouldCreateParentCycle(parents, 'a', 'c'), true);
    assert.equal(wouldCreateParentCycle(parents, 'c', 'a'), false);
    assert.equal(wouldCreateParentCycle(parents, 'b', 'b'), true);
});

test('elapsed time is measured in whole minutes and rejects invalid ranges', () => {
    assert.equal(elapsedMinutes('2026-01-01T10:00:00.000Z', '2026-01-01T10:05:59.000Z'), 5);
    assert.throws(() => elapsedMinutes('not-a-date', '2026-01-01T10:05:00.000Z'), RangeError);
    assert.throws(() => elapsedMinutes('2026-01-01T10:05:00.000Z', '2026-01-01T10:00:00.000Z'), RangeError);
});
