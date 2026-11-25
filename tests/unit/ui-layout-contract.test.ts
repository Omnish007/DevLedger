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

test('Notes editing, protected-note, import/export and navigation-flush workflows remain wired', () => {
  const notes = source('src/renderer/features/notes/NotesPage.tsx');
  for (const contract of [
    'onCreate', 'onUpdate', 'onSaveLocked', 'onLock', 'onUnlock', 'onDelete',
    'flushBeforeNavigation', 'importMarkdownFile', 'exportMarkdownFile',
    'loadRelatedLinks', 'addRelatedRecord', 'removeRelatedRecord',
  ]) assert.ok(notes.includes(contract), `Missing Notes workflow contract: ${contract}`);
});

test('App shell preserves all main routes, quick capture and the command-palette shortcut', () => {
  const shell = source('src/renderer/components/shared/AppShell.tsx');
  for (const view of ['dashboard', 'projects', 'notes', 'tasks', 'documents', 'contacts', 'operations', 'search', 'settings']) {
    assert.ok(shell.includes(`id: '${view}'`), `Missing navigation route: ${view}`);
  }
  assert.match(shell, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(shell, /setCommandOpen\(true\)/);
  assert.match(shell, /onQuickCapture/);
});

test('major workspace routes share the same page-heading component', () => {
  for (const route of ['projects', 'contacts', 'tasks', 'documents', 'operations', 'search', 'settings']) {
    const page = source(`src/renderer/features/${route}/${route[0]!.toUpperCase()}${route.slice(1)}Page.tsx`);
    assert.ok(page.includes("@/components/shared/PageHeader"), `Missing shared PageHeader in ${route}`);
  }
  const dashboard = source('src/renderer/features/dashboard/DashboardPage.tsx');
  assert.match(dashboard, /title="Overview"/);
});
