import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatNotionDateLabel, getSmartDatePresets, parseSmartDate, SMART_TIME_PRESETS, SmartDateError } from '../../src/domain/smart-date.ts';
import { parseSmartDateMarkdownLink, serializeSmartDateMarkdown } from '../../src/domain/smart-date-markdown.ts';
import { buildAtSuggestions } from '../../src/domain/at-suggestions.ts';
import type { ContactRecord } from '../../src/shared/contracts.ts';

const root = join(import.meta.dirname, '../..');
const fixedNow = new Date(2026, 2, 18, 10, 0, 0); // Wednesday, 2026-03-18 10:00

test('parseSmartDate supports full Notion-style @date expressions, named months, boundaries and 12h times', () => {
  assert.deepEqual(parseSmartDate('@today', fixedNow), { kind: 'date', date: '2026-03-18', source: '@today' });
  assert.deepEqual(parseSmartDate('@tomorrow', fixedNow), { kind: 'date', date: '2026-03-19', source: '@tomorrow' });
  assert.deepEqual(parseSmartDate('@yesterday', fixedNow), { kind: 'date', date: '2026-03-17', source: '@yesterday' });
  assert.deepEqual(parseSmartDate('@friday', fixedNow), { kind: 'date', date: '2026-03-20', source: '@friday' });
  assert.deepEqual(parseSmartDate('@monday', fixedNow), { kind: 'date', date: '2026-03-23', source: '@monday' });
  assert.deepEqual(parseSmartDate('@next monday', fixedNow), { kind: 'date', date: '2026-03-30', source: '@next monday' });
  assert.deepEqual(parseSmartDate('@last friday', fixedNow), { kind: 'date', date: '2026-03-13', source: '@last friday' });
  assert.deepEqual(parseSmartDate('@last week', fixedNow), { kind: 'date', date: '2026-03-11', source: '@last week' });
  assert.deepEqual(parseSmartDate('@next week', fixedNow), { kind: 'date', date: '2026-03-25', source: '@next week' });
  assert.deepEqual(parseSmartDate('@start of week', fixedNow), { kind: 'date', date: '2026-03-16', source: '@start of week' });
  assert.deepEqual(parseSmartDate('@end of week', fixedNow), { kind: 'date', date: '2026-03-22', source: '@end of week' });
  assert.deepEqual(parseSmartDate('@start of month', fixedNow), { kind: 'date', date: '2026-03-01', source: '@start of month' });
  assert.deepEqual(parseSmartDate('@end of month', fixedNow), { kind: 'date', date: '2026-03-31', source: '@end of month' });
  assert.deepEqual(parseSmartDate('@end of year', fixedNow), { kind: 'date', date: '2026-12-31', source: '@end of year' });
  assert.deepEqual(parseSmartDate('@in 3 days', fixedNow), { kind: 'date', date: '2026-03-21', source: '@in 3 days' });
  assert.deepEqual(parseSmartDate('@3 days ago', fixedNow), { kind: 'date', date: '2026-03-15', source: '@3 days ago' });
  assert.deepEqual(parseSmartDate('@in 2 weeks', fixedNow), { kind: 'date', date: '2026-04-01', source: '@in 2 weeks' });
  assert.deepEqual(parseSmartDate('@in 2 months', fixedNow), { kind: 'date', date: '2026-05-18', source: '@in 2 months' });
  assert.deepEqual(parseSmartDate('@May 15', fixedNow), { kind: 'date', date: '2026-05-15', source: '@May 15' });
  assert.deepEqual(parseSmartDate('@15th November 2027', fixedNow), { kind: 'date', date: '2027-11-15', source: '@15th November 2027' });
  assert.deepEqual(parseSmartDate('@2026-12-18', fixedNow), { kind: 'date', date: '2026-12-18', source: '@2026-12-18' });

  const nowParsed = parseSmartDate('@now', fixedNow);
  assert.equal(nowParsed.kind, 'datetime');
  assert.equal(nowParsed.date, '2026-03-18');
  assert.equal(nowParsed.time, '10:00');

  const inHalfHour = parseSmartDate('@in 30 minutes', fixedNow);
  assert.equal(inHalfHour.kind, 'datetime');
  assert.equal(inHalfHour.time, '10:30');

  const ampm = parseSmartDate('@tomorrow at 3:30pm', fixedNow);
  assert.equal(ampm.kind, 'datetime');
  assert.equal(ampm.date, '2026-03-19');
  assert.equal(ampm.time, '15:30');

  const remind = parseSmartDate('@remind friday 9am', fixedNow);
  assert.equal(remind.kind, 'datetime');
  assert.equal(remind.date, '2026-03-20');
  assert.equal(remind.time, '09:00');
  assert.equal(remind.isReminder, true);

  assert.throws(() => parseSmartDate('@', fixedNow), SmartDateError);
  assert.throws(() => parseSmartDate('@in a few days', fixedNow), SmartDateError);
});

test('Notion formatNotionDateLabel and Markdown range/reminder serialization round-trip', () => {
  assert.equal(formatNotionDateLabel({ date: '2026-03-18', format: 'relative', now: fixedNow }), 'Today');
  assert.equal(formatNotionDateLabel({ date: '2026-03-19', endDate: '2026-03-21', format: 'iso', now: fixedNow }), '2026-03-19 → 2026-03-21');
  assert.equal(formatNotionDateLabel({ date: '2026-03-18', time: '09:00', format: 'short', now: fixedNow }), '18/03/2026 09:00');

  const md = serializeSmartDateMarkdown({
    date: '2026-03-19',
    time: null,
    isoUtc: null,
    timezone: 'UTC',
    source: 'Tomorrow',
    endDate: '2026-03-21',
    format: 'iso',
    isReminder: true,
    reminderId: 'rem-123',
  });
  const parsed = parseSmartDateMarkdownLink(md.match(/\(([^)]+)\)/)![1]!, 'Tomorrow');
  assert.equal(parsed?.endDate, '2026-03-21');
  assert.equal(parsed?.format, 'iso');
  assert.equal(parsed?.isReminder, true);
  assert.equal(parsed?.reminderId, 'rem-123');
});

test('getSmartDatePresets and buildAtSuggestions support Notion dates, @remind and contacts', async () => {
  const presets = getSmartDatePresets(fixedNow);
  assert.ok(presets.length >= 6);
  for (const preset of presets) {
    assert.ok(preset.token.startsWith('@'));
    assert.deepEqual(parseSmartDate(preset.token, fixedNow), preset.result);
  }

  const contacts: ContactRecord[] = [{
    id: 'c-1', name: 'Aarav Patel', role: 'client', company: 'Acme Labs',
    email: 'aarav@example.test', phone: '', notes: '', customAttributes: {}, projectIds: ['p-1'],
    createdAt: '2026-03-18T10:00:00.000Z', updatedAt: '2026-03-18T10:00:00.000Z',
  }];
  const searchContacts = async () => contacts;

  const initial = await buildAtSuggestions('', searchContacts, 'p-1', fixedNow);
  assert.ok(initial.some((item) => item.kind === 'date' && item.label === 'Today'));
  assert.ok(initial.some((item) => item.kind === 'contact' && item.label === 'Aarav Patel'));

  const remind = await buildAtSuggestions('remind tomorrow 9am', searchContacts, 'p-1', fixedNow);
  assert.equal(remind[0]?.kind, 'date');
  assert.equal(remind[0]?.attrs.isReminder, true);
});

test('connected architecture drawers, checkbox layout, and interactive Notion NodeView contracts hold', () => {
  const tasksPage = readFileSync(join(root, 'src/renderer/features/tasks/TasksPage.tsx'), 'utf8');
  assert.match(tasksPage, /<TaskCreateDialog\b/);
  assert.match(tasksPage, /<TaskInspectorSheet\b/);
  assert.doesNotMatch(tasksPage, /\+ Add a task/);

  const projectsPage = readFileSync(join(root, 'src/renderer/features/projects/ProjectsPage.tsx'), 'utf8');
  assert.match(projectsPage, /<ProjectDetailSheet\b/);

  const settingsPage = readFileSync(join(root, 'src/renderer/features/settings/SettingsPage.tsx'), 'utf8');
  assert.match(settingsPage, /<SettingsSystemTab\b/);

  const extensions = readFileSync(join(root, 'src/renderer/features/notes/extensions.ts'), 'utf8');
  assert.match(extensions, /ReactNodeViewRenderer\(SmartDateChipView/);
  assert.match(extensions, /TaskItem\.configure\(\{\s*nested:\s*true,\s*HTMLAttributes:\s*\{\s*'data-type':\s*'taskItem'/);

  const globalsCss = readFileSync(join(root, 'src/renderer/styles/globals.css'), 'utf8');
  assert.match(globalsCss, /\.prose-editor li\[data-checked\]\s*\{\s*display:\s*flex;/);
  assert.doesNotMatch(globalsCss, /\.text-\\\[10px\\\]\s*\{\s*font-size:\s*\.72rem;/);
  assert.match(globalsCss, /@import "@daypicker\/react\/style\.css" layer\(base\);/);
  assert.match(globalsCss, /\.smart-date-pill\.is-reminder/);

  const mainIndex = readFileSync(join(root, 'src/main/index.ts'), 'utf8');
  assert.match(mainIndex, /if \(shutdownRestoreCheckComplete\) return;/);
  assert.match(mainIndex, /if \(!isShuttingDown && database\?\.open\) workspaceService\?\.heartbeatActiveTimer\(\)/);

  const calendar = readFileSync(join(root, 'src/renderer/components/ui/calendar.tsx'), 'utf8');
  assert.match(calendar, /ChevronLeft/);
  assert.match(calendar, /z-20/);
  assert.match(calendar, /pointer-events-auto/);

  const chipView = readFileSync(join(root, 'src/renderer/features/notes/SmartDateChipView.tsx'), 'utf8');
  const dateInsert = readFileSync(join(root, 'src/renderer/features/notes/SmartDateInsert.tsx'), 'utf8');
  for (const src of [chipView, dateInsert]) {
    assert.match(src, /BellRing/);
    assert.match(src, /CalendarDays/);
    assert.match(src, /resetOnSelect/);
    assert.match(src, /captionLayout="dropdown"/);
    assert.match(src, /onMonthChange=\{setDisplayMonth\}/);
  }

  const contactsPage = readFileSync(join(root, 'src/renderer/features/contacts/ContactsPage.tsx'), 'utf8');
  const profilePane = readFileSync(join(root, 'src/renderer/features/contacts/ContactProfilePane.tsx'), 'utf8');
  assert.match(contactsPage, /<ContactProfilePane\b/);
  assert.doesNotMatch(contactsPage, /contact-directory/);
  assert.match(profilePane, /<RecordConnectionsPanel\b/);
  assert.match(tasksPage, /<TaskRow\b/);

  const isoWithTime = parseSmartDate('2026-11-26 15:30', fixedNow);
  assert.equal(isoWithTime.kind, 'datetime');
  assert.equal(isoWithTime.date, '2026-11-26');
  assert.equal(isoWithTime.time, '15:30');
  assert.ok(SMART_TIME_PRESETS.includes('09:00'));

  const smartDateField = readFileSync(join(root, 'src/renderer/components/shared/SmartDateField.tsx'), 'utf8');
  assert.match(smartDateField, /<Calendar\b/);
  assert.match(smartDateField, /type="time"/);
  assert.match(smartDateField, /SMART_TIME_PRESETS/);

  const taskCreateDialog = readFileSync(join(root, 'src/renderer/features/tasks/TaskCreateDialog.tsx'), 'utf8');
  const taskEditDialog = readFileSync(join(root, 'src/renderer/features/tasks/TaskEditDialog.tsx'), 'utf8');
  assert.match(taskCreateDialog, /<SmartDateField\b/);
  assert.match(taskEditDialog, /<SmartDateField\b/);
  assert.doesNotMatch(taskCreateDialog, /Optional details/);
});
