import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, lstat, open, realpath, rename, rm, stat, type FileHandle } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

function isInside(parent: string, candidate: string): boolean {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function syncDirectory(directory: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    // Some filesystems and Windows do not expose directory fsync. File data is
    // already flushed before rename; tolerate only known unsupported cases.
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EACCES'].includes(code)) throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export interface ExternalBackupDestination {
  directory: string;
  sameVolume: boolean;
}

export async function validateExternalBackupDirectory(directory: string, dataDirectory: string): Promise<ExternalBackupDestination> {
  const input = directory.trim();
  if (!input || input.length > 4096 || !isAbsolute(input)) throw new Error('Choose an absolute external backup directory.');
  const linkInfo = await lstat(input);
  if (linkInfo.isSymbolicLink()) throw new Error('Choose the mounted backup directory itself, not a symbolic link.');
  if (!linkInfo.isDirectory()) throw new Error('The selected backup destination is not a directory.');
  const [destination, dataRoot] = await Promise.all([realpath(input), realpath(dataDirectory)]);
  if (isInside(dataRoot, destination)) throw new Error('The independent backup destination must be outside DevLedger application storage.');
  const [destinationInfo, dataInfo] = await Promise.all([stat(destination), stat(dataRoot)]);
  const probePath = join(destination, `.devledger-write-check-${randomUUID()}`);
  const probe = await open(probePath, 'wx', 0o600);
  try { await probe.writeFile('DevLedger backup destination check'); await probe.sync(); }
  finally { await probe.close(); await rm(probePath, { force: true }); }
  return { directory: destination, sameVolume: destinationInfo.dev === dataInfo.dev };
}

export async function validateDistinctExternalBackupDirectory(directory: string, dataDirectory: string, otherDirectory: string): Promise<ExternalBackupDestination> {
  const destination = await validateExternalBackupDirectory(directory, dataDirectory);
  let otherPath: string;
  try { otherPath = await realpath(otherDirectory); }
  catch { throw new Error('Mount the first backup destination before configuring a second physical drive.'); }
  const [selectedInfo, otherInfo] = await Promise.all([stat(destination.directory), stat(otherPath)]);
  if (destination.directory === otherPath || selectedInfo.dev === otherInfo.dev) {
    throw new Error('The second backup destination must be a different physical storage volume from the first destination.');
  }
  return destination;
}

/** Mirrors an already encrypted, verified snapshot. It never overwrites an older copy. */
export async function mirrorEncryptedBackup(sourcePath: string, destinationDirectory: string, dataDirectory: string, distinctFromDirectory?: string): Promise<ExternalBackupDestination & { destinationPath: string; sha256: string }> {
  const destination = distinctFromDirectory
    ? await validateDistinctExternalBackupDirectory(destinationDirectory, dataDirectory, distinctFromDirectory)
    : await validateExternalBackupDirectory(destinationDirectory, dataDirectory);
  const sourceInfo = await stat(sourcePath);
  if (!sourceInfo.isFile() || sourceInfo.size <= 0) throw new Error('The local backup snapshot is empty or unavailable.');

  const sourceHash = await hashFile(sourcePath);
  const extension = basename(sourcePath).endsWith('.nsbackup') ? '.nsbackup' : '.backup';
  const fileName = `${basename(sourcePath, extension)}-${randomUUID().slice(0, 8)}${extension}`;
  const finalPath = join(destination.directory, fileName);
  const partialPath = join(destination.directory, `${fileName}.partial`);
  try {
    await pipeline(createReadStream(sourcePath), createWriteStream(partialPath, { flags: 'wx', mode: 0o600 }));
    const partial = await open(partialPath, 'r+');
    try { await partial.sync(); } finally { await partial.close(); }
    const copiedHash = await hashFile(partialPath);
    if (copiedHash !== sourceHash) throw new Error('The external backup copy failed its SHA-256 verification.');
    await rename(partialPath, finalPath);
    await syncDirectory(destination.directory);
    return { ...destination, destinationPath: finalPath, sha256: sourceHash };
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function listExternalSnapshots(directory: string): Promise<Array<{ path: string; createdAt: string }>> {
  await access(directory);
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(directory, { withFileTypes: true });
  const snapshots: Array<{ path: string; createdAt: string }> = [];
  for (const entry of entries) {
    // Only manage timestamped snapshots created by DevLedger's automatic-backup flow.
    // Never include manually named archives or other applications' .nsbackup files
    // in automatic retention, because retention is allowed to delete its input set.
    if (!entry.isFile() || !/^snapshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-f0-9]{8}\.nsbackup$/.test(entry.name)) continue;
    const path = join(directory, entry.name);
    const details = await stat(path);
    snapshots.push({ path, createdAt: details.mtime.toISOString() });
  }
  return snapshots;
}
