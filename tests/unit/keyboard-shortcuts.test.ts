import test from 'node:test';
import assert from 'node:assert/strict';
import { isQuickCaptureShortcut, QUICK_CAPTURE_SHORTCUTS } from '../../src/domain/keyboard-shortcuts.ts';

test('quick-capture shortcut allowlist contains only intentional cross-platform accelerators', () => {
  assert.equal(isQuickCaptureShortcut('CommandOrControl+Shift+Space'), true);
  assert.equal(isQuickCaptureShortcut('Alt+Shift+N'), true);
  assert.equal(isQuickCaptureShortcut('Ctrl+Alt+Delete'), false);
  assert.equal(isQuickCaptureShortcut(''), false);
  assert.equal(isQuickCaptureShortcut(null), false);
  assert.equal(QUICK_CAPTURE_SHORTCUTS.length, 4);
});
