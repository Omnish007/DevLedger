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

export interface ArchiveEntryMetadata {
    versionMadeBy?: number;
    externalFileAttributes?: number;
    uncompressedSize?: number;
    vars?: { mode?: number; uncompressedSize?: number };
}

/** Extracts the POSIX file mode from either Parse() entry.vars or Open.file() central-directory entries. */
export function archiveEntryUnixMode(entry: ArchiveEntryMetadata): number {
    if (entry.vars && typeof entry.vars.mode === 'number') return entry.vars.mode;
    const externalAttributes = Number(entry.externalFileAttributes ?? 0);
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    if (entry.versionMadeBy === undefined) return unixMode;
    const hostOs = entry.versionMadeBy >> 8;
    return hostOs === 3 || hostOs === 19 ? unixMode : 0;
}

export function archiveEntryIsSymlink(entry: ArchiveEntryMetadata): boolean {
    return (archiveEntryUnixMode(entry) & 0o170000) === 0o120000;
}

export function archiveEntryUncompressedSize(entry: ArchiveEntryMetadata): number {
    return Number(entry.vars?.uncompressedSize ?? entry.uncompressedSize ?? 0);
}
