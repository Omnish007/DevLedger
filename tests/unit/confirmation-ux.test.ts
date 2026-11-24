import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
function collect(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path) : /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : [];
  });
}

test('renderer feature flows use the shared accessible confirmation provider, not native window.confirm', () => {
  const featureSource = collect(join(root, 'src/renderer/features')).map((path) => readFileSync(path, 'utf8')).join('\n');
  const mainSource = readFileSync(join(root, 'src/renderer/main.tsx'), 'utf8');
  const providerSource = readFileSync(join(root, 'src/renderer/components/shared/ConfirmProvider.tsx'), 'utf8');
  assert.equal(featureSource.includes('window.confirm('), false);
  assert.match(mainSource, /<ConfirmProvider>\s*<App\s*\/>\s*<\/ConfirmProvider>/);
  assert.match(providerSource, /AlertDialogContent/);
  assert.match(providerSource, /settle\(true\)/);
  assert.match(providerSource, /settle\(false\)/);
});
