import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const config = JSON.parse(readFileSync(join(root, 'components.json'), 'utf8'));
const required = [
  'accordion', 'alert', 'alert-dialog', 'avatar', 'badge', 'breadcrumb', 'button',
  'button-group', 'calendar', 'card', 'checkbox', 'collapsible', 'combobox', 'command',
  'context-menu', 'date-picker', 'dialog', 'drawer', 'dropdown-menu', 'empty', 'field',
  'hover-card', 'input', 'input-group', 'kbd', 'label', 'menubar', 'native-select',
  'pagination', 'popover', 'progress', 'radio-group', 'resizable', 'scroll-area', 'select',
  'separator', 'sheet', 'sidebar', 'skeleton', 'slider', 'sonner', 'spinner', 'switch',
  'table', 'tabs', 'textarea', 'toggle', 'toggle-group', 'tooltip',
];

const uiDir = join(root, 'src/renderer/components/ui');
const present = required.filter((name) => existsSync(join(uiDir, `${name}.tsx`)));
const missing = required.filter((name) => !present.includes(name));

console.log(`shadcn style: ${config.style}`);
console.log(`base: ${config.tailwind?.baseColor ?? 'not configured'}`);
console.log(`UI source inventory: ${present.length}/${required.length}`);
if (present.length) console.log(`Present: ${present.join(', ')}`);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('All required shadcn source files are present.');
}
