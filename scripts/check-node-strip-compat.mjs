import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['src'];
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  }
}
for (const root of roots) await collect(root);

const findings = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  // Node's built-in strip-only TS runtime cannot erase constructor parameter properties.
  // These are deliberately disallowed because source tests import TS modules directly.
  const constructorPattern = /constructor\s*\(/g;
  let match;
  while ((match = constructorPattern.exec(source))) {
    const open = source.indexOf('(', match.index);
    let depth = 0;
    let end = -1;
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) { end = index; break; }
      }
    }
    if (end < 0) continue;
    const parameters = source.slice(open + 1, end);
    if (/\b(?:private|protected|public)\s+(?:readonly\s+)?[A-Za-z_$][\w$]*\s*\??\s*:/.test(parameters)) {
      const line = source.slice(0, match.index).split('\n').length;
      findings.push(`${file}:${line}: constructor parameter properties are unsupported by Node strip-only TypeScript`);
    }
  }
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Node strip-only compatibility audit passed: ${files.length} TypeScript/TSX files; no constructor parameter properties.`);
}
