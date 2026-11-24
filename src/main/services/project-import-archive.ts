import { createWriteStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { asProjectImportRow, importText, isInside, readSafeJsonFile, safeArchivePath, sha256File } from './project-import-helpers.ts';
import { isSupportedProjectExportFormat } from './archive-format-compatibility.ts';
import { MAX_PROJECT_ARCHIVE_ENTRIES, MAX_PROJECT_COMPRESSED_BYTES, MAX_PROJECT_DATA_JSON_BYTES, MAX_PROJECT_MANIFEST_BYTES, MAX_PROJECT_UNCOMPRESSED_BYTES } from './project-archive-limits.ts';
type Row = Record<string, unknown>;
interface ManifestFile { path: string; size: number; sha256: string; }
interface ProjectManifest { format: 'northstar-project-export' | 'devledger-project-export'; version: 1; projectId: string; files: ManifestFile[]; }

export async function extractProjectArchive(
  archivePath: string,
  staging: string,
  signal?: AbortSignal,
  onProgress?: (progress: Record<string, unknown>) => void,
): Promise<Row> {
  signal?.throwIfAborted();
  const archiveInfo = await lstat(archivePath);
  if (!archiveInfo.isFile() || archiveInfo.isSymbolicLink()) throw new Error('Choose a regular ZIP file, not a symbolic link.');
  if (archiveInfo.size > MAX_PROJECT_COMPRESSED_BYTES) throw new Error('Project archive exceeds the 5 GB compressed import limit.');

  const unzipper = await import('unzipper');
  const directory = await unzipper.Open.file(archivePath);
  if (directory.files.length > MAX_PROJECT_ARCHIVE_ENTRIES) throw new Error('The project archive contains too many entries.');
  const extracted = new Set<string>();
  let totalBytes = 0;
  let streamedTotal = 0;
  for (const [entryIndex, entry] of directory.files.entries()) {
    signal?.throwIfAborted();
    if (entry.type === 'Directory') continue;
    if (entry.type !== 'File' || !safeArchivePath(entry.path)) throw new Error('The project archive contains an unsafe path or unsupported entry.');
    const mode = Number(entry.vars.mode ?? 0);
    if ((mode & 0o170000) === 0o120000) throw new Error('The project archive contains a symbolic link.');
    if (extracted.has(entry.path)) throw new Error('The project archive contains duplicate paths.');
    extracted.add(entry.path);
    const declaredSize = Number(entry.vars.uncompressedSize ?? 0);
    totalBytes += declaredSize;
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || totalBytes > MAX_PROJECT_UNCOMPRESSED_BYTES) throw new Error('The project archive exceeds the uncompressed size limit.');
    const destination = resolve(staging, entry.path);
    if (!isInside(staging, destination)) throw new Error('The project archive attempts to write outside the import directory.');
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    let streamedEntry = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        streamedEntry += chunk.length;
        streamedTotal += chunk.length;
        if (streamedEntry > declaredSize || streamedTotal > MAX_PROJECT_UNCOMPRESSED_BYTES) {
          callback(new Error('The project archive expanded beyond its declared or allowed size.'));
          return;
        }
        callback(null, chunk);
      },
    });
    const output = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
    if (signal) await pipeline(entry.stream(), limiter, output, { signal });
    else await pipeline(entry.stream(), limiter, output);
    onProgress?.({ phase: 'extracting-archive', completed: entryIndex + 1, total: directory.files.length, percent: Math.round(((entryIndex + 1) / Math.max(directory.files.length, 1)) * 45) });
    if ((await stat(destination)).size !== declaredSize) throw new Error(`Archive entry size mismatch: ${basename(entry.path)}.`);
  }

  const manifestValue = asProjectImportRow(await readSafeJsonFile(join(staging, 'manifest.json'), MAX_PROJECT_MANIFEST_BYTES));
  if (!isSupportedProjectExportFormat(manifestValue.format) || manifestValue.version !== 1 || !Array.isArray(manifestValue.files)) throw new Error('This is not a supported DevLedger project export.');
  const manifest = manifestValue as unknown as ProjectManifest;
  if (typeof manifest.projectId !== 'string' || !manifest.projectId) throw new Error('The project archive has no source project identifier.');
  const expected = new Set<string>(['manifest.json']);
  for (const item of manifest.files) {
    if (!item || !safeArchivePath(item.path) || item.path === 'manifest.json' || expected.has(item.path)) throw new Error('The project manifest contains an unsafe or duplicate path.');
    if (!Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('The project manifest contains invalid file metadata.');
    expected.add(item.path);
    const target = resolve(staging, item.path);
    if (!isInside(staging, target)) throw new Error('A manifest path is unsafe.');
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== item.size || await sha256File(target, signal) !== item.sha256) throw new Error(`Project export integrity check failed for ${basename(item.path)}.`);
  }
  if (expected.size !== extracted.size || [...extracted].some((path) => !expected.has(path))) throw new Error('Archive contents do not match the project manifest.');
  signal?.throwIfAborted();
  const exportData = asProjectImportRow(await readSafeJsonFile(join(staging, 'project.json'), MAX_PROJECT_DATA_JSON_BYTES));
  if (importText(asProjectImportRow(exportData.project).id) !== manifest.projectId) throw new Error('The manifest and exported project do not match.');
  return exportData;
}

export async function createProjectImportStaging(dataDirectory: string): Promise<string> {
  return mkdtemp(join(dataDirectory, '.project-import-'));
}

export async function removeProjectImportStaging(staging: string): Promise<void> {
  await rm(staging, { recursive: true, force: true }).catch(() => undefined);
}
