import test from 'node:test';
import assert from 'node:assert/strict';
import { columnIndex, decodeXml, xmlText } from '../../src/main/workers/document-text.ts';

test('DOCX XML text preserves paragraphs, tabs, line breaks and decoded entities', () => {
    const xml =
        '<w:p><w:r><w:t>Release &amp; deployment</w:t></w:r><w:tab/><w:r><w:t>Ready</w:t></w:r></w:p><w:p><w:r><w:t>Second line</w:t></w:r><w:br/></w:p>';
    assert.equal(xmlText(xml), 'Release & deployment\tReady\nSecond line');
});

test('XML numeric references replace invalid Unicode values instead of crashing extraction', () => {
    assert.equal(decodeXml('A&#x1F680;B&#xD800;C&#1114112;D&#0;'), 'A🚀B�C�D�');
    assert.equal(decodeXml('&amp;lt;script&amp;gt;'), '&lt;script&gt;', 'entity decoding must not recurse');
});

test('spreadsheet column references map to zero-based indexes', () => {
    assert.equal(columnIndex('A1'), 0);
    assert.equal(columnIndex('Z9'), 25);
    assert.equal(columnIndex('AA10'), 26);
    assert.equal(columnIndex('AZ100'), 51);
    assert.equal(columnIndex('XFD1'), 16_383);
    assert.equal(columnIndex('invalid'), 0);
});
