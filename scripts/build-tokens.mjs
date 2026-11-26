import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const readJson = async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
const [light, dark, spacing, typography, radii, elevation] = await Promise.all([
    readJson('design-system/tokens/semantic/light.json'),
    readJson('design-system/tokens/semantic/dark.json'),
    readJson('design-system/tokens/primitive/spacing.json'),
    readJson('design-system/tokens/primitive/typography.json'),
    readJson('design-system/tokens/primitive/radii.json'),
    readJson('design-system/tokens/primitive/elevation.json'),
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

const typeSizeVars = Object.entries(typography['font-size'])
    .map(([name, token]) => `  --text-scale-${name}: ${cssValue(token)};`)
    .join('\n');

const shadowVars = Object.entries(elevation.shadow)
    .map(([name, token]) => `  --shadow-${name}: ${cssValue(token)};`)
    .join('\n');

const motionVars = Object.entries(elevation.motion)
    .map(([name, token]) => `  --motion-${name}: ${cssValue(token)};`)
    .join('\n');

const darkShadows = `  --shadow-popover: 0 18px 46px -12px oklch(0 0 0 / 0.56), 0 4px 14px -4px oklch(0 0 0 / 0.34);\n  --shadow-modal: 0 26px 64px -12px oklch(0 0 0 / 0.68), 0 8px 24px -6px oklch(0 0 0 / 0.42);`;

const css = `/* Generated from design-system/tokens. Run npm run tokens:build. */
:root {
  color-scheme: light;
${variables(light)}
  --radius: ${cssValue(radii.default)};
  --radius-token-sm: ${cssValue(radii.sm)};
  --radius-token-md: ${cssValue(radii.md)};
  --radius-token-lg: ${cssValue(radii.lg)};
  --radius-token-xl: ${cssValue(radii.xl)};
  --font-ui: ${cssValue(typography['font-family'].ui)};
  --font-code: ${cssValue(typography['font-family'].mono)};
${typeSizeVars}
${spacingVars}
${shadowVars}
${motionVars}
}

.dark {
  color-scheme: dark;
${variables(dark)}
${darkShadows}
}

@theme inline {
${theme}
  --radius-sm: var(--radius-token-sm);
  --radius-md: var(--radius-token-md);
  --radius-lg: var(--radius-token-lg);
  --radius-xl: var(--radius-token-xl);
  --font-sans: var(--font-ui);
  --font-mono: var(--font-code);
}
`;

const output = resolve(root, 'src/renderer/styles/generated-tokens.css');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, css);
process.stdout.write(`Generated ${output}\n`);
