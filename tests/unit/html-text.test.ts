import test from 'node:test';
import assert from 'node:assert/strict';
import { stripHtmlToPlainText } from '../../src/domain/html-text.ts';

test('stripHtmlToPlainText removes complete and truncated TipTap HTML tags cleanly', () => {
    const snippet =
        '<p>Test</p><h1>test user</h1><ul data-type="taskList"><li data-checked="false" data-type="taskItem ...';
    assert.equal(stripHtmlToPlainText(snippet), 'Test test user');
});

test('stripHtmlToPlainText preserves matched mark spans while removing tag-attribute marks', () => {
    const snippet =
        '<p><mark>Test</mark></p><span data-type="contactMention" data-label="<mark>Test</mark>">@<mark>Test</mark></span>';
    assert.equal(
        stripHtmlToPlainText(snippet, { preserveMark: true }),
        '<mark>Test</mark> @<mark>Test</mark>',
    );
});

test('stripHtmlToPlainText keeps literal math comparisons and decodes entities', () => {
    assert.equal(stripHtmlToPlainText('a < b && c > d'), 'a < b && c > d');
    assert.equal(
        stripHtmlToPlainText('<p>Array&lt;string&gt; &amp; Map&nbsp;test</p>'),
        'Array<string> & Map test',
    );
});

test('stripHtmlToPlainText strips truncated HTML before FTS ellipsis separators', () => {
    const snippet = '<p>Intro</p><li data-checked="false" data-type="taskItem … <p><mark>Done</mark></p>';
    assert.equal(stripHtmlToPlainText(snippet, { preserveMark: true }), 'Intro … <mark>Done</mark>');
});
