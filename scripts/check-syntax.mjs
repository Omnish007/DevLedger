import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = process.cwd();
const scanRoots = ['src', 'tests', '.storybook', 'scripts'];
const files = [];

function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolute = join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) files.push(absolute);
    }
}

for (const directory of scanRoots) walk(join(root, directory));

const failures = [];
for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const extension = extname(file);
    const scriptKind = extension === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
    for (const diagnostic of parsed.parseDiagnostics ?? []) {
        const location = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
        const line = location ? location.line + 1 : 1;
        const column = location ? location.character + 1 : 1;
        failures.push(
            `${relative(root, file)}:${line}:${column} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
        );
    }
}

if (failures.length) {
    console.error(`Syntax audit failed: ${failures.length} diagnostic(s) across ${files.length} files.`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
} else {
    console.log(`Syntax audit passed: ${files.length} TypeScript/TSX files; 0 parse diagnostics.`);
}
