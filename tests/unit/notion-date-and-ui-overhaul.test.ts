import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSmartDatePresets, parseSmartDate, SmartDateError } from '../../src/domain/smart-date.ts';
import { buildAtSuggestions } from '../../src/domain/at-suggestions.ts';
import type { ContactRecord } from '../../src/shared/contracts.ts';

const root = join(import.meta.dirname, '../..');
const fixedNow = new Date(2026, 2, 18, 10, 0, 0); // Wednesday, 2026-03-18

test('parseSmartDate supports Notion-style @date expressions and relative intervals', () => {
  assert.deepEqual(parseSmartDate('@today', fixedNow), { kind: 'date', date: '2026-03-18', source: '@today' });
  assert.deepEqual(parseSmartDate('@tomorrow', fixedNow), { kind: 'date', date: '2026-03-19', source: '@tomorrow' });
  assert.deepEqual(parseSmartDate('@yesterday', fixedNow), { kind: 'date', date: '2026-03-17', source: '@yesterday' });
  assert.deepEqual(parseSmartDate('@friday', fixedNow), { kind: 'date', date: '2026-03-20', source: '@friday' });
  assert.deepEqual(parseSmartDate('@monday', fixedNow), { kind: 'date', date: '2026-03-23', source: '@monday' });
  assert.deepEqual(parseSmartDate('@next monday', fixedNow), { kind: 'date', date: '2026-03-30', source: '@next monday' });
  assert.deepEqual(parseSmartDate('@this friday', fixedNow), { kind: 'date', date: '2026-03-20', source: '@this friday' });
  assert.deepEqual(parseSmartDate('@next week', fixedNow), { kind: 'date', date: '2026-03-25', source: '@next week' });
  assert.deepEqual(parseSmartDate('@in 3 days', fixedNow), { kind: 'date', date: '2026-03-21', source: '@in 3 days' });
  assert.deepEqual(parseSmartDate('@in 2 weeks', fixedNow), { kind: 'date', date: '2026-04-01', source: '@in 2 weeks' });
  assert.deepEqual(parseSmartDate('@2026-12-18', fixedNow), { kind: 'date', date: '2026-12-18', source: '@2026-12-18' });
  assert.deepEqual(parseSmartDate('@18/12/2026', fixedNow), { kind: 'date', date: '2026-12-18', source: '@18/12/2026' });

  const timed = parseSmartDate('@friday 14:30', fixedNow);
  assert.equal(timed.kind, 'datetime');
  assert.equal(timed.date, '2026-03-20');
  assert.equal(timed.time, '14:30');

  assert.throws(() => parseSmartDate('@', fixedNow), SmartDateError);
  assert.throws(() => parseSmartDate('@in a few days', fixedNow), SmartDateError);
});

test('getSmartDatePresets produces valid @-prefixed tokens that round-trip through parseSmartDate', () => {
  const presets = getSmartDatePresets(fixedNow);
  assert.ok(presets.length >= 4);
  for (const preset of presets) {
    assert.ok(preset.token.startsWith('@'), `${preset.token} should start with @`);
    const parsed = parseSmartDate(preset.token, fixedNow);
    assert.deepEqual(parsed, preset.result);
  }
});

test('buildAtSuggestions combines quick date presets, parsed @dates and project contacts', async () => {
  const contacts: ContactRecord[] = [{
    id: 'c-1',
    name: 'Aarav Patel',
    role: 'client',
    company: 'Acme Labs',
    email: 'aarav@example.test',
    phone: '',
    notes: '',
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  }];
  const searchContacts = async () => contacts;

  const initial = await buildAtSuggestions('', searchContacts, 'p-1', fixedNow);
  assert.ok(initial.some((item) => item.kind === 'date' && item.label === 'Today'));
  assert.ok(initial.some((item) => item.kind === 'contact' && item.label === 'Aarav Patel'));

  const exact = await buildAtSuggestions('friday', searchContacts, 'p-1', fixedNow);
  assert.equal(exact[0]?.kind, 'date');
  assert.equal(exact[0]?.label, '@friday');

  const partial = await buildAtSuggestions('next ', searchContacts, 'p-1', fixedNow);
  assert.ok(partial.some((item) => item.kind === 'date' && /next/i.test(item.label)));
});

test('tasks modal, synchronous notes filter, @date autocomplete and modular operations contracts hold', () => {
  const tasksPage = readFileSync(join(root, 'src/renderer/features/tasks/TasksPage.tsx'), 'utf8');
  assert.match(tasksPage, /<TaskCreateDialog\b/);
  assert.match(tasksPage, /New task/);
  assert.doesNotMatch(tasksPage, /\+ Add a task/);

  const createDialog = readFileSync(join(root, 'src/renderer/features/tasks/TaskCreateDialog.tsx'), 'utf8');
  assert.match(createDialog, /Optional details/);
  assert.match(createDialog, /getSmartDatePresets/);
  assert.match(createDialog, /create-task-due-at/);

  const smartDateField = readFileSync(join(root, 'src/renderer/components/shared/SmartDateField.tsx'), 'utf8');
  assert.match(smartDateField, /getSmartDatePresets/);

  const notesPage = readFileSync(join(root, 'src/renderer/features/notes/NotesPage.tsx'), 'utf8');
  assert.match(notesPage, /setNotesOffset\(0\);\s*setFilter\(event\.target\.value\);/);
  assert.doesNotMatch(notesPage, /setNotesOffset\(0\);\s*setFilter\(event\.target\.value\);\s*setSelectedId\(null\)/);

  const extensions = readFileSync(join(root, 'src/renderer/features/notes/extensions.ts'), 'utf8');
  assert.match(extensions, /minQueryLength:\s*0/);
  assert.match(extensions, /allowSpaces:\s*true/);
  assert.match(extensions, /type:\s*'smartDate'/);
  assert.match(extensions, /TaskItem\.configure\(\{\s*nested:\s*true,\s*HTMLAttributes:\s*\{\s*'data-type':\s*'taskItem'/);

  const globalsCss = readFileSync(join(root, 'src/renderer/styles/globals.css'), 'utf8');
  assert.match(globalsCss, /\.prose-editor li\[data-type='taskItem'\]/);
  assert.match(globalsCss, /\.prose-editor li\[data-checked\]\s*\{\s*display:\s*flex;/);

  const dateInsert = readFileSync(join(root, 'src/renderer/features/notes/SmartDateInsert.tsx'), 'utf8');
  assert.match(dateInsert, /<Calendar\b/);
  assert.match(dateInsert, /getSmartDatePresets/);

  const operationsPage = readFileSync(join(root, 'src/renderer/features/operations/OperationsPage.tsx'), 'utf8');
  for (const symbol of ['OperationsInboxTab', 'OperationsTagsTab', 'OperationsLinksTab', 'OperationsDependenciesTab', 'OperationsBlockersTab', 'OperationsRemindersTab', 'OperationsTimeTab', 'OperationsActivityTab', 'OperationsJobsTab']) {
    assert.ok(operationsPage.includes(symbol), `OperationsPage should compose ${symbol}`);
  }
});
