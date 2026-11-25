import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isTrustedRendererFrame } from '../../src/main/ipc/trust.ts';

test('development renderer trust is restricted to the configured origin and entry document', () => {
    const devUrl = 'http://127.0.0.1:5173';
    assert.equal(isTrustedRendererFrame({ url: 'http://127.0.0.1:5173/', parent: null }, devUrl, []), true);
    assert.equal(
        isTrustedRendererFrame({ url: 'http://127.0.0.1:5173/index.html?debug=1', parent: null }, devUrl, []),
        true,
    );
    assert.equal(
        isTrustedRendererFrame({ url: 'http://127.0.0.1:5173/settings', parent: null }, devUrl, []),
        false,
    );
    assert.equal(isTrustedRendererFrame({ url: 'http://localhost:5173/', parent: null }, devUrl, []), false);
    assert.equal(isTrustedRendererFrame({ url: 'https://127.0.0.1:5173/', parent: null }, devUrl, []), false);
});

test('production renderer trust requires the exact bundled file and rejects child frames', () => {
    const expected = resolve('/app/out/renderer/index.html');
    const url = pathToFileURL(expected).href;
    assert.equal(isTrustedRendererFrame({ url, parent: null }, undefined, [expected]), true);
    assert.equal(
        isTrustedRendererFrame(
            { url: pathToFileURL('/app/out/renderer/settings.html').href, parent: null },
            undefined,
            [expected],
        ),
        false,
    );
    assert.equal(
        isTrustedRendererFrame({ url, parent: { url: 'https://untrusted.example' } }, undefined, [expected]),
        false,
    );
    assert.equal(
        isTrustedRendererFrame({ url: 'https://example.com/', parent: null }, undefined, [expected]),
        false,
    );
    assert.equal(isTrustedRendererFrame({ url: 'not a url', parent: null }, undefined, [expected]), false);
});
