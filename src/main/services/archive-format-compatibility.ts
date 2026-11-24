export const LEGACY_PROJECT_EXPORT_FORMAT = 'northstar-project-export';
export const CURRENT_PROJECT_EXPORT_FORMAT = 'devledger-project-export';
export const LEGACY_BACKUP_MANIFEST_FORMAT = 'northstar-workspace-backup';
export const CURRENT_BACKUP_MANIFEST_FORMAT = 'devledger-workspace-backup';

export function isSupportedProjectExportFormat(value: unknown): boolean {
  return value === LEGACY_PROJECT_EXPORT_FORMAT || value === CURRENT_PROJECT_EXPORT_FORMAT;
}

export function isSupportedBackupManifestFormat(value: unknown): boolean {
  return value === LEGACY_BACKUP_MANIFEST_FORMAT || value === CURRENT_BACKUP_MANIFEST_FORMAT;
}
