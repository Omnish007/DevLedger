import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const required = [
  'accordion', 'alert', 'alert-dialog', 'avatar', 'badge', 'breadcrumb', 'button', 'button-group', 'calendar', 'card',
  'checkbox', 'collapsible', 'combobox', 'command', 'context-menu', 'date-picker', 'dialog', 'drawer', 'dropdown-menu', 'empty',
  'field', 'hover-card', 'input', 'input-group', 'kbd', 'label', 'menubar', 'native-select', 'pagination', 'popover', 'progress',
  'radio-group', 'resizable', 'scroll-area', 'select', 'separator', 'sheet', 'sidebar', 'skeleton', 'slider', 'sonner', 'spinner',
  'switch', 'table', 'tabs', 'textarea', 'toggle', 'toggle-group', 'tooltip',
];

test('all required shadcn source components are present in the renderer UI source tree', () => {
  const directory = join(root, 'src/renderer/components/ui');
  const missing = required.filter((component) => !existsSync(join(directory, `${component}.tsx`)));
  assert.deepEqual(missing, [], `Missing shadcn source files: ${missing.join(', ')}`);
  const config = JSON.parse(readFileSync(join(root, 'components.json'), 'utf8')) as { style?: string; tailwind?: { css?: string } };
  assert.equal(config.style, 'new-york');
  assert.ok(config.tailwind?.css?.includes('globals.css'));
});
