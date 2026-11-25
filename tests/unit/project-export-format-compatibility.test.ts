import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveEntryIsSymlink,
  archiveEntryUncompressedSize,
  isSupportedBackupManifestFormat,
  isSupportedProjectExportFormat,
} from '../../src/main/services/archive-format-compatibility.ts';

test('project archive reader accepts both the legacy and DevLedger format identifiers', () => {
  assert.equal(isSupportedProjectExportFormat('northstar-project-export'), true);
  assert.equal(isSupportedProjectExportFormat('devledger-project-export'), true);
  assert.equal(isSupportedProjectExportFormat('other-project-export'), false);
});

test('backup archive reader accepts both the legacy and DevLedger format identifiers', () => {
  assert.equal(isSupportedBackupManifestFormat('northstar-workspace-backup'), true);
  assert.equal(isSupportedBackupManifestFormat('devledger-workspace-backup'), true);
  assert.equal(isSupportedBackupManifestFormat('other-workspace-backup'), false);
});

test('archive entry helpers handle unzipper Open.file entries without entry.vars', () => {
  const regularFile = { versionMadeBy: (3 << 8) | 20, externalFileAttributes: (0o100644 << 16) >>> 0, uncompressedSize: 421 };
  const symlinkFile = { versionMadeBy: (3 << 8) | 20, externalFileAttributes: (0o120777 << 16) >>> 0, uncompressedSize: 12 };
  const windowsFile = { versionMadeBy: 20, externalFileAttributes: 0x20, uncompressedSize: 99 };
  assert.equal(archiveEntryIsSymlink(regularFile), false);
  assert.equal(archiveEntryIsSymlink(symlinkFile), true);
  assert.equal(archiveEntryIsSymlink(windowsFile), false);
  assert.equal(archiveEntryUncompressedSize(regularFile), 421);
});
