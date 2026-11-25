import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_MARKDOWN_IMPORT_BYTES,
    validateMarkdownImport,
} from '../../src/domain/markdown-import-safety.ts';

test('allows ordinary Markdown and HTML examples inside fenced code blocks', () => {
    const markdown = '# Notes\n\n```html\n<script>alert(1)</script>\n```\n\nUse **bold** text.';
    assert.equal(validateMarkdownImport(markdown), null);
});

test('rejects active HTML and unsafe URL schemes outside code examples', () => {
    assert.match(validateMarkdownImport('<script>alert(1)</script>') ?? '', /active HTML/);
    assert.match(validateMarkdownImport('[click](javascript:alert(1))') ?? '', /unsafe URL/);
    assert.match(validateMarkdownImport('<img src=x onerror=alert(1)>') ?? '', /active HTML/);
});

test('limits the UTF-8 byte size of Markdown imports', () => {
    assert.match(validateMarkdownImport('a'.repeat(MAX_MARKDOWN_IMPORT_BYTES + 1)) ?? '', /2 MB/);
    assert.equal(validateMarkdownImport('a'.repeat(100)), null);
});
