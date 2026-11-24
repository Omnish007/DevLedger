import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import argon2 from 'argon2';

export const MAGIC_V1 = Buffer.from('NSBACKUP');
export const MAGIC_V2 = Buffer.from('NSBKP002');
export const HEADER_V1_BYTES = MAGIC_V1.length + 16 + 12;
export const HEADER_PREFIX_V2 = MAGIC_V2.length + 1 + 4;
export const MAX_HEADER_BYTES = 8 * 1024;
export const TAG_BYTES = 16;
export const BACKUP_AAD_V1 = Buffer.from('northstar-encrypted-backup-v1');
export const BACKUP_AAD_V2 = Buffer.from('northstar-encrypted-backup-v2');


export interface BackupManifest {
  format: 'northstar-workspace-backup' | 'devledger-workspace-backup';
  version: 1;
  createdAt: string;
  schemaVersion: number;
  files: Array<{ path: string; size: number; sha256: string }>;
}

export function safeArchivePath(value: string): boolean {
  if (!value || value.includes('\\') || value.startsWith('/') || isAbsolute(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..') && !value.includes('\0');
}

export function pathInside(parent: string, candidate: string): boolean {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

export async function* iterateRegularFiles(root: string, current = root): AsyncGenerator<string> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = join(current, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) yield* iterateRegularFiles(root, absolute);
    else if (entry.isFile()) yield absolute;
  }
}

export async function deriveBackupKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  if (passphrase.length < 12 || passphrase.length > 1024) throw new Error('Use a backup passphrase between 12 and 1024 characters.');
  return argon2.hash(passphrase, { type: argon2.argon2id, salt, hashLength: 32, memoryCost: 65_536, timeCost: 3, parallelism: 1, raw: true });
}

export function backupDataAad(backupId: string): Buffer {
  return Buffer.from(`${BACKUP_AAD_V2.toString('utf8')}:data:${backupId}`, 'utf8');
}

export async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
