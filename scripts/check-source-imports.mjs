import { builtinModules } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const roots = ['src', 'tests', '.storybook', 'design-system'];
const files = [];
function walk(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(tsx?|mts|cts|mjs|cjs)$/.test(entry.name)) files.push(path);
    }
}
roots.forEach((directory) => walk(join(root, directory)));
const unresolved = [];
const localExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];
function resolveLocal(specifier, importer) {
    let base;
    if (specifier.startsWith('@/')) base = join(root, 'src/renderer', specifier.slice(2));
    else if (specifier.startsWith('@shared/')) base = join(root, 'src/shared', specifier.slice(8));
    else if (specifier.startsWith('@domain/')) base = join(root, 'src/domain', specifier.slice(8));
    else if (specifier.startsWith('.')) base = resolve(importer, '..', specifier);
    else return null;
    const extensionless = /\.(?:js|jsx|mjs|cjs)$/.test(base)
        ? base.replace(/\.(?:js|jsx|mjs|cjs)$/, '')
        : base;
    const candidates = [
        base,
        ...localExtensions.map((extension) => `${extensionless}${extension}`),
        ...localExtensions.map((extension) => join(extensionless, `index${extension}`)),
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const imports = [...source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)].map(
        (match) => match[1],
    );
    for (const specifier of imports) {
        if (
            specifier.startsWith('.') ||
            specifier.startsWith('@/') ||
            specifier.startsWith('@shared/') ||
            specifier.startsWith('@domain/')
        ) {
            if (!resolveLocal(specifier, file))
                unresolved.push(`${file.replace(`${root}/`, '')}: unresolved ${specifier}`);
            continue;
        }
        if (specifier.startsWith('node:') || builtins.has(specifier)) continue;
        const packageName = specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : specifier.split('/')[0];
        if (!declared.has(packageName))
            unresolved.push(`${file.replace(`${root}/`, '')}: package not declared: ${packageName}`);
    }
}
if (unresolved.length) {
    console.error(unresolved.join('\n'));
    console.error(
        `Import audit failed: ${unresolved.length} unresolved or undeclared imports across ${files.length} source files.`,
    );
    process.exitCode = 1;
} else {
    console.log(
        `Import audit passed: ${files.length} source files; all local imports resolve and external packages are declared.`,
    );
}
