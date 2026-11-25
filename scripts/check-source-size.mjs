import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['src'];
// Calibrated for 4-space Prettier formatting across TypeScript/TSX modules.
const maximumLines = 900;
const files = [];

async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await collect(path);
        else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
    }
}

for (const root of roots) await collect(root);
const oversized = [];
for (const file of files) {
    const source = await readFile(file, 'utf8');
    const lines = source.length === 0 ? 0 : source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
    if (lines > maximumLines) oversized.push({ file, lines });
}

if (oversized.length) {
    for (const item of oversized)
        console.error(`${item.file}: ${item.lines} lines (maximum ${maximumLines})`);
    process.exitCode = 1;
} else {
    console.log(
        `Source-size audit passed: ${files.length} TypeScript/TSX files; all are at most ${maximumLines} lines.`,
    );
}
