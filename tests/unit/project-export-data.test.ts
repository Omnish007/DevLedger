import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { assertRegularObjectPath, copyVerifiedObject } from '../../src/main/services/project-export-data.ts';

test('copyVerifiedObject stages and hashes exactly the bytes that will be archived', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'devledger-export-object-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source.bin');
  const destination = join(root, 'staging', 'attachment.bin');
  const bytes = Buffer.alloc(1024 * 64, 0x5a);
  await writeFile(source, bytes);
  const expected = createHash('sha256').update(bytes).digest('hex');
  const measured = await copyVerifiedObject(source, destination, expected);
  assert.equal(measured.size, bytes.length);
  assert.equal(measured.sha256, expected);
  assert.deepEqual(await readFile(destination), bytes);
});

test('copyVerifiedObject rejects mismatched hashes and removes partial staging files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'devledger-export-hash-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source.bin');
  const destination = join(root, 'staging', 'attachment.bin');
  await writeFile(source, 'original bytes');
  await assert.rejects(() => copyVerifiedObject(source, destination, '0'.repeat(64)), /integrity check failed/i);
  await assert.rejects(() => readFile(destination), { code: 'ENOENT' });
});

test('object path validation rejects symlinks in parent directories', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'devledger-export-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const objects = join(root, 'objects');
  const outside = join(root, 'outside');
  await mkdir(objects);
  await mkdir(outside);
  await writeFile(join(outside, 'secret.txt'), 'not exportable');
  await symlink(outside, join(objects, 'linked-directory'), 'dir');
  await assert.rejects(() => assertRegularObjectPath(objects, join(objects, 'linked-directory', 'secret.txt')), /symbolic link/i);
});
