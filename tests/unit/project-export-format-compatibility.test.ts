import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedBackupManifestFormat, isSupportedProjectExportFormat } from '../../src/main/services/archive-format-compatibility.ts';

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
