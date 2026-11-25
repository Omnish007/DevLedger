import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const light = JSON.parse(
    readFileSync(new URL('../../design-system/tokens/semantic/light.json', import.meta.url), 'utf8'),
) as Record<string, { $value: string }>;
const dark = JSON.parse(
    readFileSync(new URL('../../design-system/tokens/semantic/dark.json', import.meta.url), 'utf8'),
) as Record<string, { $value: string }>;
const css = readFileSync(new URL('../../src/renderer/styles/generated-tokens.css', import.meta.url), 'utf8');

const required = [
    'background',
    'foreground',
    'card',
    'card-foreground',
    'popover',
    'popover-foreground',
    'primary',
    'primary-foreground',
    'secondary',
    'secondary-foreground',
    'muted',
    'muted-foreground',
    'accent',
    'accent-foreground',
    'destructive',
    'destructive-foreground',
    'border',
    'input',
    'ring',
    'sidebar-background',
    'sidebar-foreground',
    'sidebar-primary',
    'sidebar-primary-foreground',
    'sidebar-accent',
    'sidebar-accent-foreground',
    'sidebar-border',
    'sidebar-ring',
];

test('light and dark themes define the complete shadcn semantic token contract', () => {
    for (const token of required) {
        assert.ok(light[token]?.$value, `light theme is missing ${token}`);
        assert.ok(dark[token]?.$value, `dark theme is missing ${token}`);
    }
    assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort());
});

test('muted is a surface token and muted-foreground remains a readable text token', () => {
    assert.notEqual(light.muted.$value, light['muted-foreground'].$value);
    assert.match(light.muted.$value, /^oklch\(/);
    assert.match(light['muted-foreground'].$value, /^oklch\(/);
});

test('generated Tailwind v4 theme exposes every semantic color token', () => {
    for (const token of required) {
        assert.ok(css.includes(`--color-${token}: var(--${token});`), `generated CSS is missing ${token}`);
    }
});
