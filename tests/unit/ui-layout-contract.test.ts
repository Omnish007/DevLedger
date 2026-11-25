import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Notes workspace has bounded, pixel-based pane minimums and a compact-window layout', () => {
  const notes = source('src/renderer/features/notes/NotesPage.tsx');
  assert.match(notes, /matchMedia\('\(max-width: 1040px\)'\)/);
  assert.match(notes, /orientation=\{compactLayout \? "vertical" : "horizontal"\}/);
  assert.match(notes, /minSize=\{compactLayout \? 180 : 260\}/);
  assert.match(notes, /minSize=\{compactLayout \? 380 : 420\}/);
  assert.doesNotMatch(notes, /max-w-\[1240px\]/);
});

test('Notes editing, protected-note, import/export and inspector workflows remain wired', () => {
  const notes = source('src/renderer/features/notes/NotesPage.tsx');
  for (const contract of [
    'onCreate', 'onUpdate', 'onSaveLocked', 'onLock', 'onUnlock', 'onDelete',
    'flushBeforeNavigation', 'importMarkdownFile', 'exportMarkdownFile',
    'NoteInspectorDrawer', 'createLinkedTaskFromNote', 'syncNoteReminder',
  ]) assert.ok(notes.includes(contract), `Missing Notes workflow contract: ${contract}`);
});

test('App shell preserves unified workspace routes, global inbox, quick capture and command palette', () => {
  const shell = source('src/renderer/components/shared/AppShell.tsx');
  for (const view of ['dashboard', 'projects', 'notes', 'tasks', 'documents', 'contacts', 'search', 'settings']) {
    assert.ok(shell.includes(`id: '${view}'`), `Missing navigation route: ${view}`);
  }
  assert.doesNotMatch(shell, /id:\s*'operations'/);
  assert.ok(shell.includes('NotificationsPopover'), 'Global Inbox bell belongs in top shell bar');
  assert.match(shell, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(shell, /setCommandOpen\(true\)/);
  assert.match(shell, /onQuickCapture/);
});

test('major workspace routes share the same page-heading component', () => {
  for (const route of ['projects', 'contacts', 'tasks', 'documents', 'search', 'settings']) {
    const page = source(`src/renderer/features/${route}/${route[0]!.toUpperCase()}${route.slice(1)}Page.tsx`);
    assert.ok(page.includes('@/components/shared/PageHeader'), `Missing shared PageHeader in ${route}`);
  }
  const dashboard = source('src/renderer/features/dashboard/DashboardPage.tsx');
  assert.match(dashboard, /title="Overview"/);
});

test('global focus-visible outline lives in @layer base and NativeSelect shrink-wraps fixed widths', () => {
  const globals = source('src/renderer/styles/globals.css');
  assert.match(globals, /@layer base\s*\{[\s\S]*?:focus-visible\s*\{/);

  const nativeSelect = source('src/renderer/components/ui/native-select.tsx');
  assert.match(nativeSelect, /w-fit max-w-full shrink-0/);
  assert.match(nativeSelect, /className,\s*'pr-9'/);

  const searchPage = source('src/renderer/features/search/SearchPage.tsx');
  assert.match(searchPage, /if \(aiEnabled && lexicalCount > 0\) void requestSummary/);
  assert.match(searchPage, /stripHtmlToPlainText/);

  const sidebar = source('src/renderer/components/ui/sidebar.tsx');
  assert.match(sidebar, /overflow-y-auto overflow-x-hidden/);
  assert.match(sidebar, /group-data-\[state=collapsed\]\/sidebar-provider:hidden/);

  const shell = source('src/renderer/components/shared/AppShell.tsx');
  assert.match(shell, /group-data-\[state=collapsed\]\/sidebar-provider:sr-only/);

  const picker = source('src/renderer/components/shared/RemoteRecordPicker.tsx');
  assert.match(picker, /hasMaxOnly \? 'w-auto' : 'w-full'/);

  const pageControls = source('src/renderer/components/shared/PageControls.tsx');
  assert.match(pageControls, /if \(total <= limit && offset === 0\) return null/);
});
