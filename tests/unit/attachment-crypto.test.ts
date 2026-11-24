import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { unwrapAttachmentKey, wrapAttachmentKey } from '../../src/main/services/attachment-crypto.ts';

test('attachment keys use an independently wrapped data key bound to the file identity', () => {
  const masterKey = randomBytes(32);
  const dataKey = randomBytes(32);
  const id = 'file-1';
  const hash = 'a'.repeat(64);
  const envelope = wrapAttachmentKey(masterKey, dataKey, id, hash);
  assert.deepEqual(unwrapAttachmentKey(masterKey, envelope, id, hash), dataKey);
  assert.throws(() => unwrapAttachmentKey(masterKey, envelope, 'file-2', hash));
  assert.throws(() => unwrapAttachmentKey(randomBytes(32), envelope, id, hash));
  masterKey.fill(0);
  dataKey.fill(0);
});
