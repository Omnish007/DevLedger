import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const readJson = async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
const [light, dark, spacing, typography, radii] = await Promise.all([
    readJson('design-system/tokens/semantic/light.json'),
    readJson('design-system/tokens/semantic/dark.json'),
    readJson('design-system/tokens/primitive/spacing.json'),
    readJson('design-system/tokens/primitive/typography.json'),
    readJson('design-system/tokens/primitive/radii.json'),
]);
const cssValue = (token) => {
    if (!token || typeof token.$value !== 'string')
        throw new Error('Invalid token: expected a string $value.');
    return token.$value;
};
const variables = (tokens) =>
    Object.entries(tokens)
        .map(([name, token]) => `  --${name}: ${cssValue(token)};`)
        .join('\n');
const theme = Object.keys(light)
    .map((name) => `  --color-${name}: var(--${name});`)
    .join('\n');
const spacingVars = Object.entries(spacing)
    .map(([name, token]) => `  --space-${name}: ${cssValue(token)};`)
    .join('\n');
const css = `/* Generated from design-system/tokens. Run npm run tokens:build. */\n:root {\n  color-scheme: light;\n${variables(light)}\n  --radius: ${cssValue(radii.default)};\n  --font-ui: ${cssValue(typography['font-family'].ui)};\n  --font-code: ${cssValue(typography['font-family'].mono)};\n${spacingVars}\n}\n\n.dark {\n  color-scheme: dark;\n${variables(dark)}\n}\n\n@theme inline {\n${theme}\n  --radius-sm: calc(var(--radius) - 4px);\n  --radius-md: calc(var(--radius) - 2px);\n  --radius-lg: var(--radius);\n  --font-sans: var(--font-ui);\n  --font-mono: var(--font-code);\n}\n`;
const output = resolve(root, 'src/renderer/styles/generated-tokens.css');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, css);
process.stdout.write(`Generated ${output}\n`);
