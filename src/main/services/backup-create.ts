import { randomBytes, randomUUID, createCipheriv } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { lstat, mkdtemp, open, rename, rm, stat } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import archiver from 'archiver';
import type Database from 'better-sqlite3';
import type { BackupCreationResult } from '../../shared/contracts.js';
import { wrapBackupDataKey, type BackupHeaderV2 } from './backup-key-envelope.ts';
import { backupDataAad, deriveBackupKey, fileExists, iterateRegularFiles, MAX_HEADER_BYTES, MAGIC_V2, safeArchivePath, sha256File, HEADER_PREFIX_V2, type BackupManifest } from './backup-format.ts';
import { assertBackupArchiveBudget, MAX_BACKUP_ARCHIVE_ENTRIES, MAX_BACKUP_COMPRESSED_BYTES, MAX_BACKUP_UNCOMPRESSED_BYTES } from './backup-archive-limits.ts';
import { normalizeObjectRelativePath } from './object-paths.ts';

export async function createEncryptedBackup(db: Database.Database, dataDirectory: string, targetPath: string, passphrase: string): Promise<BackupCreationResult> {
    if (!targetPath.toLowerCase().endsWith('.nsbackup')) throw new Error('Choose a file ending in .nsbackup.');
    if (await fileExists(targetPath)) throw new Error('A file already exists at the selected destination. Choose a new filename.');
    if (passphrase.length < 12 || passphrase.length > 1024) throw new Error('Use a backup passphrase between 12 and 1024 characters.');
    const staging = await mkdtemp(join(dataDirectory, '.backup-staging-'));
    const snapshotPath = join(staging, 'northstar.sqlite');
    const partialPath = `${targetPath}.${randomUUID()}.partial`;
    const backupId = randomUUID();
    const recoveryKey = randomBytes(32).toString('base64url');
    const dataKey = randomBytes(32);
    let passphraseWrappingKey: Buffer | null = null;
    let recoveryWrappingKey: Buffer | null = null;
    try {
      await db.backup(snapshotPath);
      const objectRoot = join(dataDirectory, 'objects');
      const objectRootInfo = await lstat(objectRoot).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (objectRootInfo && (!objectRootInfo.isDirectory() || objectRootInfo.isSymbolicLink())) throw new Error('Workspace object storage must be a regular directory.');
      const objectRecords: BackupManifest['files'] = [];
      const available = new Set<string>();
      let expandedBytes = (await stat(snapshotPath)).size;
      if (!Number.isSafeInteger(expandedBytes) || expandedBytes > MAX_BACKUP_UNCOMPRESSED_BYTES) throw new Error('The workspace database snapshot exceeds the backup size limit.');
      if (objectRootInfo) {
        for await (const absolute of iterateRegularFiles(objectRoot)) {
          if (objectRecords.length + 2 >= MAX_BACKUP_ARCHIVE_ENTRIES) throw new Error('The workspace contains too many files for a DevLedger backup.');
          const rel = relative(dataDirectory, absolute).split(sep).join('/');
          if (!safeArchivePath(rel)) throw new Error('Object storage contains an invalid path.');
          const info = await stat(absolute);
          expandedBytes += info.size;
          if (!Number.isSafeInteger(info.size) || info.size < 0 || expandedBytes > MAX_BACKUP_UNCOMPRESSED_BYTES) throw new Error('The workspace exceeds the maximum expanded backup size.');
          objectRecords.push({ path: rel, size: info.size, sha256: await sha256File(absolute) });
          available.add(rel);
        }
      }

      const { default: DatabaseConstructor } = await import('better-sqlite3');
      const snapshotDb = new DatabaseConstructor(snapshotPath, { readonly: true, fileMustExist: true });
      let schemaVersion = 0;
      try {
        schemaVersion = Number(snapshotDb.pragma('user_version', { simple: true }));
        const referencedQuery = snapshotDb.prepare(`
          SELECT id, object_relative_path FROM documents
          WHERE deleted_at IS NULL AND id > ? ORDER BY id LIMIT ?
        `);
        let lastDocumentId = '';
        for (;;) {
          const page = referencedQuery.all(lastDocumentId, 200) as Array<{ id: string; object_relative_path: string }>;
          if (page.length === 0) break;
          for (const item of page) {
            const objectPath = normalizeObjectRelativePath(item.object_relative_path);
            if (!available.has(objectPath)) throw new Error(`A document object is missing: ${basename(item.object_relative_path)}`);
          }
          lastDocumentId = page[page.length - 1]!.id;
        }
      } finally {
        snapshotDb.close();
      }

      const snapshotInfo = await stat(snapshotPath);
      const manifest: BackupManifest = {
        format: 'devledger-workspace-backup', version: 1, createdAt: new Date().toISOString(),
        schemaVersion,
        files: [{ path: 'database/northstar.sqlite', size: snapshotInfo.size, sha256: await sha256File(snapshotPath) }, ...objectRecords],
      };
      const manifestPayload = Buffer.from(JSON.stringify(manifest, null, 2));
      assertBackupArchiveBudget(manifest.files.length, expandedBytes, manifestPayload.length);
      const passSalt = randomBytes(16);
      const recoverySalt = randomBytes(16);
      const dataNonce = randomBytes(12);
      passphraseWrappingKey = await deriveBackupKey(passphrase, passSalt);
      recoveryWrappingKey = await deriveBackupKey(recoveryKey, recoverySalt);
      const header: BackupHeaderV2 = {
        version: 2,
        backupId,
        dataNonce: dataNonce.toString('base64'),
        passphrase: wrapBackupDataKey(dataKey, passphraseWrappingKey, backupId, 'passphrase', passSalt),
        recovery: wrapBackupDataKey(dataKey, recoveryWrappingKey, backupId, 'recovery', recoverySalt),
      };
      const headerPayload = Buffer.from(JSON.stringify(header), 'utf8');
      if (headerPayload.length > MAX_HEADER_BYTES) throw new Error('The backup encryption header exceeded its safety limit.');
      const prefix = Buffer.alloc(HEADER_PREFIX_V2);
      MAGIC_V2.copy(prefix, 0);
      prefix[MAGIC_V2.length] = 2;
      prefix.writeUInt32BE(headerPayload.length, MAGIC_V2.length + 1);
      const completeHeader = Buffer.concat([prefix, headerPayload]);
      const cipher = createCipheriv('aes-256-gcm', dataKey, dataNonce);
      cipher.setAAD(backupDataAad(backupId));
      const output = createWriteStream(partialPath, { flags: 'wx', mode: 0o600 });
      const archive = archiver('zip', { zlib: { level: 6 } });
      let compressedBytes = 0;
      const compressedLimit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          compressedBytes += chunk.length;
          if (compressedBytes > MAX_BACKUP_COMPRESSED_BYTES) {
            callback(new Error('The workspace backup exceeds the 5 GB compressed archive limit.'));
            return;
          }
          callback(null, chunk);
        },
      });
      await new Promise<void>((resolveDone, rejectDone) => {
        let settled = false;
        const fail = (error: Error) => { if (settled) return; settled = true; archive.abort(); compressedLimit.destroy(); cipher.destroy(); output.destroy(); rejectDone(error); };
        output.on('error', fail);
        archive.on('error', fail);
        compressedLimit.on('error', fail);
        cipher.on('error', fail);
        output.on('finish', () => { if (!settled) { settled = true; resolveDone(); } });
        output.write(completeHeader);
        archive.pipe(compressedLimit).pipe(cipher);
        cipher.pipe(output, { end: false });
        cipher.on('end', () => output.end(cipher.getAuthTag()));
        archive.file(snapshotPath, { name: 'database/northstar.sqlite' });
        for (const item of objectRecords) archive.file(join(dataDirectory, item.path), { name: item.path });
        archive.append(manifestPayload, { name: 'manifest.json' });
        void archive.finalize().catch(fail);
      });
      const completed = await open(partialPath, 'r+');
      try { await completed.sync(); } finally { await completed.close(); }
      await rename(partialPath, targetPath);
      return { path: targetPath, recoveryKey };
    } catch (error) {
      await rm(partialPath, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      dataKey.fill(0);
      passphraseWrappingKey?.fill(0);
      recoveryWrappingKey?.fill(0);
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
  }

