export const MAX_PROJECT_ARCHIVE_ENTRIES = 100_000;
export const MAX_PROJECT_UNCOMPRESSED_BYTES = 25 * 1024 * 1024 * 1024;
export const MAX_PROJECT_COMPRESSED_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_PROJECT_MANIFEST_BYTES = 10 * 1024 * 1024;
/** project.json is parsed as one validated JSON document by the current import path. */
export const MAX_PROJECT_DATA_JSON_BYTES = 128 * 1024 * 1024;

export function assertProjectArchiveBudget(fileSizes: readonly number[], manifestBytes: number): void {
  if (!Number.isSafeInteger(fileSizes.length) || fileSizes.length + 1 > MAX_PROJECT_ARCHIVE_ENTRIES) {
    throw new Error('The project export contains too many files.');
  }
  if (!Number.isSafeInteger(manifestBytes) || manifestBytes < 0 || manifestBytes > MAX_PROJECT_MANIFEST_BYTES) {
    throw new Error('The project export manifest exceeds the 10 MB safety limit.');
  }
  let expandedBytes = manifestBytes;
  for (const size of fileSizes) {
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('The project export contains an invalid file size.');
    expandedBytes += size;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > MAX_PROJECT_UNCOMPRESSED_BYTES) {
      throw new Error('The project export exceeds the 25 GB expanded archive limit.');
    }
  }
}

export function assertProjectCompressedArchiveSize(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_PROJECT_COMPRESSED_BYTES) {
    throw new Error('The project export exceeds the 5 GB compressed archive limit.');
  }
}
