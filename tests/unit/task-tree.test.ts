import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskRecord } from '../../src/shared/contracts.ts';
import { orderVisibleTasks } from '../../src/renderer/features/tasks/task-tree.ts';

function task(id: string, parentId: string | null = null): TaskRecord {
  return {
    id, projectId: 'project-1', parentId, title: id, description: '', status: 'not_started',
    priority: 'medium', dueAt: null, dueDate: null, estimateMinutes: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

test('task hierarchy includes ancestor context and preserves parent-before-child order', () => {
  const rows = [task('root'), task('child', 'root'), task('leaf', 'child')];
  const result = orderVisibleTasks([rows[2]!], rows, new Set());
  assert.deepEqual(result.map((row) => [row.task.id, row.depth, row.contextOnly]), [
    ['root', 0, true], ['child', 1, true], ['leaf', 2, false],
  ]);
});

test('collapsing a parent hides every descendant instead of detaching them as roots', () => {
  const rows = [task('root'), task('child', 'root'), task('leaf', 'child'), task('sibling')];
  const result = orderVisibleTasks(rows, rows, new Set(['root']));
  assert.deepEqual(result.map((row) => row.task.id), ['root', 'sibling']);
});

test('missing parent references are rendered as safe root rows', () => {
  const rows = [task('orphan', 'missing-parent')];
  const result = orderVisibleTasks(rows, rows, new Set());
  assert.deepEqual(result.map((row) => row.task.id), ['orphan']);
});
