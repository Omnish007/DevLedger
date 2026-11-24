import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listExternalSnapshots, mirrorEncryptedBackup, validateDistinctExternalBackupDirectory, validateExternalBackupDirectory } from '../../src/main/services/external-backup.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'devledger-external-backup-'));
  const data = join(root, 'workspace-data');
  const external = join(root, 'external-drive');
  await mkdir(data); await mkdir(external);
  const source = join(data, 'snapshot-2026-11-22T23-03-00.000Z.nsbackup');
  await writeFile(source, Buffer.from('already-encrypted-test-backup'));
  return { root, data, external, source };
}

test('external backup directory must be separate from app data and writable', async () => {
  const paths = await fixture();
  try {
    const verified = await validateExternalBackupDirectory(paths.external, paths.data);
    assert.equal(verified.directory, paths.external);
    assert.equal(typeof verified.sameVolume, 'boolean');
    await assert.rejects(() => validateExternalBackupDirectory(paths.data, paths.data), /outside DevLedger/);
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test('encrypted snapshot mirror is copied atomically and verified by SHA-256', async () => {
  const paths = await fixture();
  try {
    const result = await mirrorEncryptedBackup(paths.source, paths.external, paths.data);
    assert.match(result.destinationPath, /\.nsbackup$/);
    assert.equal(await readFile(result.destinationPath, 'utf8'), 'already-encrypted-test-backup');
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.sameVolume, true);
    assert.match((await readdir(paths.external))[0], /^snapshot-2026-11-22T23-03-00\.000Z-[a-f0-9]{8}\.nsbackup$/);
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

 test('automatic external retention only lists DevLedger timestamped auto snapshots', async () => {
  const paths = await fixture();
  try {
    const mirrored = await mirrorEncryptedBackup(paths.source, paths.external, paths.data);
    const unrelated = join(paths.external, 'manual-archive.nsbackup');
    const malformed = join(paths.external, 'snapshot-not-a-timestamp-12345678.nsbackup');
    await writeFile(unrelated, 'keep manual backup');
    await writeFile(malformed, 'keep other archive');
    const listed = await listExternalSnapshots(paths.external);
    assert.deepEqual(listed.map((entry) => entry.path), [mirrored.destinationPath]);
    assert.equal(await readFile(unrelated, 'utf8'), 'keep manual backup');
    assert.equal(await readFile(malformed, 'utf8'), 'keep other archive');
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});


test('second backup destination must be a separate storage volume and not the same directory', async () => {
  const paths = await fixture();
  try {
    await assert.rejects(() => validateDistinctExternalBackupDirectory(paths.external, paths.data, paths.external), /different physical storage volume/);
    await assert.rejects(() => validateDistinctExternalBackupDirectory(paths.external, paths.data, join(paths.root, 'missing-drive')), /Mount the first backup destination/);
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});


test('mirroring the offline destination revalidates that it is on another device', async () => {
  const paths = await fixture();
  try {
    await assert.rejects(
      () => mirrorEncryptedBackup(paths.source, paths.external, paths.data, paths.external),
      /different physical storage volume/,
    );
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});
