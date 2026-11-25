import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseContactMentionMarkdownLink,
    serializeContactMentionMarkdown,
} from '../../src/domain/contact-mention-markdown.ts';

test('contact mentions round-trip through a stable Markdown link target', () => {
    const encoded = serializeContactMentionMarkdown({ id: 'contact:123', label: 'A]lice' });
    assert.equal(encoded, '[@A\\]lice](devledger-contact:contact%3A123)');
    assert.deepEqual(parseContactMentionMarkdownLink('northstar-contact:contact%3A123', '@A]lice'), {
        id: 'contact:123',
        label: 'A]lice',
    });
});

test('ordinary Markdown links are not converted into contact mentions', () => {
    assert.equal(parseContactMentionMarkdownLink('https://example.com', 'Example'), null);
});

test('malformed or control-character contact identifiers are rejected', () => {
    assert.equal(parseContactMentionMarkdownLink('devledger-contact:%E0%A4%A', '@Bad'), null);
    assert.equal(parseContactMentionMarkdownLink('devledger-contact:bad%00id', '@Bad'), null);
});

test('new contact mention scheme is emitted and remains parseable', () => {
    const value = serializeContactMentionMarkdown({ id: 'c-1', label: 'Ada' });
    assert.equal(value, '[@Ada](devledger-contact:c-1)');
    assert.deepEqual(parseContactMentionMarkdownLink('devledger-contact:c-1', '@Ada'), {
        id: 'c-1',
        label: 'Ada',
    });
});
