import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRecordChoices, RECORD_PICKER_PAGE_SIZE } from '../../src/renderer/features/operations/record-search.ts';

type Api = Parameters<typeof loadRecordChoices>[0];

function createApi(items: unknown[] = []) {
  const calls: Array<{ entity: string; input: Record<string, unknown> }> = [];
  const listPage = (entity: string) => async (input: Record<string, unknown>) => {
    calls.push({ entity, input });
    return { items, total: items.length, limit: Number(input.limit ?? 0), offset: Number(input.offset ?? 0), hasMore: false };
  };
  const api = {
    projects: { listPage: listPage('project') },
    notes: { listPage: listPage('note') },
    tasks: { listPage: listPage('task') },
    documents: { listPage: listPage('document') },
    contacts: { listPage: listPage('contact') },
  } as unknown as Api;
  return { api, calls };
}

test('remote record search requests only the first bounded page and normalizes the query', async () => {
  const { api, calls } = createApi([{ id: 'p1', name: 'DevLedger', status: 'on_hold' }]);
  const rows = await loadRecordChoices(api, 'project', `  ${'x'.repeat(250)}  `);
  assert.equal(RECORD_PICKER_PAGE_SIZE, 30);
  assert.deepEqual(calls, [{ entity: 'project', input: { limit: 30, offset: 0, query: 'x'.repeat(200), includeArchived: true } }]);
  assert.deepEqual(rows, [{ id: 'p1', label: 'DevLedger', description: 'on hold' }]);
});

test('record search covers all entity kinds and includes completed tasks', async () => {
  const checks: Array<{ type: 'note' | 'task' | 'document' | 'contact'; item: unknown; expectedLabel: string }> = [
    { type: 'note', item: { id: 'n1', title: 'Architecture', updatedAt: '2026-11-23T10:00:00.000Z' }, expectedLabel: 'Architecture' },
    { type: 'task', item: { id: 't1', title: 'Ship release', status: 'completed', priority: 'high' }, expectedLabel: 'Ship release' },
    { type: 'document', item: { id: 'd1', title: 'API Spec', originalName: 'api-spec.pdf', status: 'indexed' }, expectedLabel: 'API Spec' },
    { type: 'contact', item: { id: 'c1', name: 'Ada Lovelace', role: 'client', company: 'Analytical Engines' }, expectedLabel: 'Ada Lovelace' },
  ];
  for (const check of checks) {
    const { api, calls } = createApi([check.item]);
    const rows = await loadRecordChoices(api, check.type, 'release');
    assert.equal(rows[0]?.label, check.expectedLabel);
    assert.equal(calls[0]?.input.query, 'release');
    assert.equal(calls[0]?.input.limit, RECORD_PICKER_PAGE_SIZE);
    if (check.type === 'task') assert.equal(calls[0]?.input.includeCompleted, true);
  }
});


test('task parent search is project-scoped, excludes the current task and can omit completed tasks', async () => {
  const { api, calls } = createApi([
    { id: 'parent', title: 'Parent task', status: 'in_progress', priority: 'high' },
    { id: 'self', title: 'Current task', status: 'in_progress', priority: 'medium' },
  ]);
  const rows = await loadRecordChoices(api, 'task', 'parent', { projectId: 'project-id', includeCompleted: false, excludeId: 'self' });
  assert.deepEqual(rows.map((row) => row.id), ['parent']);
  assert.deepEqual(calls[0]?.input, { limit: 30, offset: 0, query: 'parent', projectId: 'project-id', includeCompleted: false });
});
