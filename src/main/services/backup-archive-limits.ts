import { Transform } from 'node:stream';

export const MAX_BACKUP_ARCHIVE_ENTRIES = 100_000;
export const MAX_BACKUP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024 * 1024;
export const MAX_BACKUP_COMPRESSED_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_BACKUP_MANIFEST_BYTES = 10 * 1024 * 1024;

export function assertBackupArchiveBudget(
    fileCount: number,
    expandedBytes: number,
    manifestBytes: number,
): void {
    if (!Number.isSafeInteger(fileCount) || fileCount < 1 || fileCount + 1 > MAX_BACKUP_ARCHIVE_ENTRIES) {
        throw new Error('The workspace contains too many files for a DevLedger backup.');
    }
    if (
        !Number.isSafeInteger(expandedBytes) ||
        expandedBytes < 0 ||
        expandedBytes + manifestBytes > MAX_BACKUP_UNCOMPRESSED_BYTES
    ) {
        throw new Error('The workspace exceeds the maximum expanded backup size.');
    }
    if (
        !Number.isSafeInteger(manifestBytes) ||
        manifestBytes < 0 ||
        manifestBytes > MAX_BACKUP_MANIFEST_BYTES
    ) {
        throw new Error('The workspace backup manifest exceeds its 10 MB safety limit.');
    }
}

export function assertBackupCompressedArchiveSize(bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_BACKUP_COMPRESSED_BYTES) {
        throw new Error('The backup compressed archive exceeds the 5 GB safety limit.');
    }
}

export interface BackupStreamByteCounter {
    total: number;
}

export function createBackupEntryExpansionGuard(
    declaredEntryBytes: number,
    counter: BackupStreamByteCounter,
    maximumBytes = MAX_BACKUP_UNCOMPRESSED_BYTES,
): Transform {
    let entryBytes = 0;
    return new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            entryBytes += chunk.length;
            counter.total += chunk.length;
            if (
                !Number.isSafeInteger(entryBytes) ||
                entryBytes > declaredEntryBytes ||
                !Number.isSafeInteger(counter.total) ||
                counter.total > maximumBytes
            ) {
                callback(new Error('The backup expanded beyond its declared or allowed size.'));
                return;
            }
            callback(null, chunk);
        },
    });
}
