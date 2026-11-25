import { createDecipheriv, randomUUID, type DecipherGCM } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { archiveEntryIsSymlink, archiveEntryUncompressedSize, isSupportedBackupManifestFormat } from './archive-format-compatibility.ts';
import { mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as unzipper from 'unzipper';
import type Database from 'better-sqlite3';
import { CURRENT_SCHEMA_VERSION } from '../database/schema.js';
import { unwrapBackupDataKey, validateBackupHeaderV2 } from './backup-key-envelope.ts';
import { createEncryptedBackup } from './backup-create.ts';
import { BACKUP_AAD_V1, backupDataAad, deriveBackupKey, HEADER_PREFIX_V2, HEADER_V1_BYTES, MAGIC_V1, MAGIC_V2, MAX_HEADER_BYTES, pathInside, safeArchivePath, sha256File, TAG_BYTES, type BackupManifest } from './backup-format.ts';
import type { BackupCreationResult } from '../../shared/contracts.js';
import { assertBackupCompressedArchiveSize, createBackupEntryExpansionGuard, MAX_BACKUP_ARCHIVE_ENTRIES, MAX_BACKUP_MANIFEST_BYTES, MAX_BACKUP_UNCOMPRESSED_BYTES } from './backup-archive-limits.ts';
import { normalizeObjectRelativePath } from './object-paths.ts';

export class BackupService {
  private readonly db: Database.Database;
  private readonly dataDirectory: string;

  constructor(db: Database.Database, dataDirectory: string) {
    this.db = db;
    this.dataDirectory = dataDirectory;
  }

  createEncryptedBackup(targetPath: string, passphrase: string): Promise<BackupCreationResult> {
    return createEncryptedBackup(this.db, this.dataDirectory, targetPath, passphrase);
  }

  async restoreAsCopy(backupPath: string, secret: string, useRecoveryKey = false): Promise<string> {
    const info = await stat(backupPath);
    if (!info.isFile() || info.size <= MAGIC_V1.length + 16 + 12 + TAG_BYTES) throw new Error('The selected backup is not a valid DevLedger backup file.');
    const prefix = Buffer.alloc(Math.max(MAGIC_V2.length, HEADER_PREFIX_V2));
    const prefixHandle = await open(backupPath, 'r');
    try {
      const result = await prefixHandle.read(prefix, 0, prefix.length, 0);
      if (result.bytesRead < MAGIC_V1.length) throw new Error('The selected backup file is truncated.');
    } finally { await prefixHandle.close(); }
    const magic = prefix.subarray(0, MAGIC_V1.length);
    const version2 = magic.equals(MAGIC_V2);
    const version1 = magic.equals(MAGIC_V1);
    if (!version1 && !version2) throw new Error('This file is not a supported DevLedger encrypted backup.');
    const stageRoot = await mkdtemp(join(this.dataDirectory, '.restore-staging-'));
    const zipPath = join(stageRoot, 'decrypted.zip');
    let wrappingKey: Buffer | null = null;
    let recoveryWrappingKey: Buffer | null = null;
    let dataKey: Buffer | null = null;
    try {
      let payloadStart: number;
      const tag = Buffer.alloc(TAG_BYTES);
      const handle = await open(backupPath, 'r');
      let decipher: DecipherGCM;
      try {
        const tagRead = await handle.read(tag, 0, TAG_BYTES, info.size - TAG_BYTES);
        if (tagRead.bytesRead !== TAG_BYTES) throw new Error('The selected backup file is truncated.');
        if (version2) {
          const prefixLength = HEADER_PREFIX_V2;
          const fixedPrefix = Buffer.alloc(prefixLength);
          const readPrefix = await handle.read(fixedPrefix, 0, prefixLength, 0);
          if (readPrefix.bytesRead !== prefixLength || fixedPrefix[MAGIC_V2.length] !== 2) throw new Error('The backup encryption header is invalid.');
          const headerLength = fixedPrefix.readUInt32BE(MAGIC_V2.length + 1);
          if (headerLength < 2 || headerLength > MAX_HEADER_BYTES || prefixLength + headerLength + TAG_BYTES >= info.size) throw new Error('The backup encryption header has an invalid size.');
          const headerPayload = Buffer.alloc(headerLength);
          const headerRead = await handle.read(headerPayload, 0, headerLength, prefixLength);
          if (headerRead.bytesRead !== headerLength) throw new Error('The backup encryption header is truncated.');
          const header = validateBackupHeaderV2(JSON.parse(headerPayload.toString('utf8')));
          payloadStart = prefixLength + headerLength;
          const dataNonce = Buffer.from(header.dataNonce, 'base64');
          try {
            if (useRecoveryKey) {
              const salt = Buffer.from(header.recovery.salt, 'base64');
              recoveryWrappingKey = await deriveBackupKey(secret, salt);
              dataKey = unwrapBackupDataKey(header.recovery, recoveryWrappingKey, header.backupId, 'recovery');
            } else {
              const salt = Buffer.from(header.passphrase.salt, 'base64');
              wrappingKey = await deriveBackupKey(secret, salt);
              dataKey = unwrapBackupDataKey(header.passphrase, wrappingKey, header.backupId, 'passphrase');
            }
          } catch {
            throw new Error(useRecoveryKey ? 'The backup recovery key is incorrect, or the backup file is damaged.' : 'The backup passphrase is incorrect, or the backup file is damaged.');
          }
          decipher = createDecipheriv('aes-256-gcm', dataKey, dataNonce);
          decipher.setAAD(backupDataAad(header.backupId));
        } else {
          if (useRecoveryKey) throw new Error('This older backup format does not contain a separate recovery key. Use its passphrase.');
          const header = Buffer.alloc(HEADER_V1_BYTES);
          const headerRead = await handle.read(header, 0, HEADER_V1_BYTES, 0);
          if (headerRead.bytesRead !== HEADER_V1_BYTES) throw new Error('The backup header is truncated.');
          payloadStart = HEADER_V1_BYTES;
          const salt = header.subarray(MAGIC_V1.length, MAGIC_V1.length + 16);
          const nonce = header.subarray(MAGIC_V1.length + 16, HEADER_V1_BYTES);
          wrappingKey = await deriveBackupKey(secret, salt);
          decipher = createDecipheriv('aes-256-gcm', wrappingKey, nonce);
          decipher.setAAD(BACKUP_AAD_V1);
        }
        const compressedArchiveBytes = info.size - payloadStart - TAG_BYTES;
        assertBackupCompressedArchiveSize(compressedArchiveBytes);
        decipher.setAuthTag(tag);
      } finally { await handle.close(); }
      try {
        await pipeline(createReadStream(backupPath, { start: payloadStart, end: info.size - TAG_BYTES - 1 }), decipher, createWriteStream(zipPath, { flags: 'wx', mode: 0o600 }));
      } catch {
        throw new Error('The backup credential is incorrect, or the backup file is damaged.');
      }

      const extractRoot = join(stageRoot, 'restored-data');
      await mkdir(extractRoot, { recursive: true });
      const directory = await unzipper.Open.file(zipPath);
      if (directory.files.length > MAX_BACKUP_ARCHIVE_ENTRIES) throw new Error('The backup contains too many entries.');
      const extracted = new Set<string>(); let totalBytes = 0; const streamedBytes = { total: 0 };
      for (const entry of directory.files) {
        if (entry.type === 'Directory') continue;
        if (entry.type !== 'File' || !safeArchivePath(entry.path)) throw new Error('The backup contains an unsafe archive entry.');
        if (archiveEntryIsSymlink(entry)) throw new Error('The backup contains a symbolic link.');
        if (extracted.has(entry.path)) throw new Error('The backup contains duplicate file paths.');
        extracted.add(entry.path);
        const size = archiveEntryUncompressedSize(entry);
        totalBytes += size;
        if (!Number.isSafeInteger(size) || size < 0 || totalBytes > MAX_BACKUP_UNCOMPRESSED_BYTES) throw new Error('The backup expands beyond the allowed restore limit.');
        const destination = resolve(extractRoot, entry.path);
        if (!pathInside(extractRoot, destination)) throw new Error('The backup contains a path traversal entry.');
        await mkdir(dirname(destination), { recursive: true });
        const expansionGuard = createBackupEntryExpansionGuard(size, streamedBytes, MAX_BACKUP_UNCOMPRESSED_BYTES);
        await pipeline(entry.stream(), expansionGuard, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
        if ((await stat(destination)).size !== size) throw new Error(`Backup entry size mismatch: ${basename(entry.path)}.`);
      }

      const manifestPath = join(extractRoot, 'manifest.json');
      const manifestInfo = await stat(manifestPath);
      if (manifestInfo.size > MAX_BACKUP_MANIFEST_BYTES) throw new Error('The backup manifest is too large.');
      const manifestText = await readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestText) as BackupManifest;
      if (!isSupportedBackupManifestFormat(manifest.format) || manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('The backup manifest format is not supported.');
      if (!Number.isSafeInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) throw new Error('The backup does not contain a valid database schema version.');
      if (manifest.schemaVersion > CURRENT_SCHEMA_VERSION) throw new Error('This backup was created by a newer application version.');
      const expectedPaths = new Set<string>(['manifest.json']);
      for (const file of manifest.files) {
        if (file.path === 'manifest.json' || expectedPaths.has(file.path)) throw new Error('The backup manifest contains duplicate or reserved file paths.');
        if (!safeArchivePath(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('The backup manifest contains invalid file metadata.');
        expectedPaths.add(file.path);
        const absolute = resolve(extractRoot, file.path);
        if (!pathInside(extractRoot, absolute)) throw new Error('The backup manifest contains an unsafe path.');
        const fileInfo = await stat(absolute);
        if (fileInfo.size !== file.size || await sha256File(absolute) !== file.sha256) throw new Error(`Backup integrity check failed for ${basename(file.path)}.`);
      }
      if (expectedPaths.size !== extracted.size || [...extracted].some((item) => !expectedPaths.has(item))) throw new Error('The archive contents do not match its manifest.');
      const databasePath = join(extractRoot, 'database', 'northstar.sqlite');
      if (!manifest.files.some((file) => file.path === 'database/northstar.sqlite')) throw new Error('The backup does not contain its database snapshot.');
      const { default: DatabaseConstructor } = await import('better-sqlite3');
      // The database is still in private staging. Open it read-write so legacy Windows\-style
      // relative paths can be normalized to the portable forward-slash representation.
      const restoredDb = new DatabaseConstructor(databasePath, { fileMustExist: true });
      try {
        const quickCheck = restoredDb.pragma('quick_check', { simple: true });
        const integrityCheck = restoredDb.pragma('integrity_check', { simple: true });
        const restoredSchemaVersion = Number(restoredDb.pragma('user_version', { simple: true }));
        const foreignKeys = restoredDb.pragma('foreign_key_check') as unknown[];
        if (quickCheck !== 'ok' || integrityCheck !== 'ok' || foreignKeys.length !== 0) {
          throw new Error('The restored database failed SQLite integrity or foreign-key checks.');
        }
        if (restoredSchemaVersion !== manifest.schemaVersion) throw new Error('The backup manifest and database schema versions do not match.');
        const manifestPaths = new Set(manifest.files.map((file) => file.path));
        const updateDocumentPath = restoredDb.prepare('UPDATE documents SET object_relative_path = ? WHERE id = ?');
        const documentPage = restoredDb.prepare(`
          SELECT id, object_relative_path FROM documents
          WHERE deleted_at IS NULL AND id > ? ORDER BY id LIMIT ?
        `);
        let lastDocumentId = '';
        for (;;) {
          const page = documentPage.all(lastDocumentId, 200) as Array<{ id: string; object_relative_path: string }>;
          if (page.length === 0) break;
          for (const record of page) {
            const archivePath = normalizeObjectRelativePath(record.object_relative_path);
            const objectPath = resolve(extractRoot, archivePath.split('/').join(sep));
            if (!pathInside(extractRoot, objectPath) || !manifestPaths.has(archivePath)) {
              throw new Error('The restored database references a missing or unsafe document object.');
            }
            if (archivePath !== record.object_relative_path) updateDocumentPath.run(archivePath, record.id);
          }
          lastDocumentId = page[page.length - 1]!.id;
        }
      } finally { restoredDb.close(); }

      await rm(zipPath, { force: true });
      // Materialize the restored copy in the same layout as a live app-data root:
      // northstar.sqlite and objects/ must be siblings so stored object paths resolve.
      const nestedDatabasePath = join(extractRoot, 'database', 'northstar.sqlite');
      const liveLayoutDatabasePath = join(extractRoot, 'northstar.sqlite');
      await rename(nestedDatabasePath, liveLayoutDatabasePath);
      await rm(join(extractRoot, 'database'), { recursive: true, force: true });
      const restoredManifestPath = join(extractRoot, 'manifest.json');
      const restoredManifest = JSON.parse(await readFile(restoredManifestPath, 'utf8')) as BackupManifest;
      restoredManifest.files = restoredManifest.files.map((file) => file.path === 'database/northstar.sqlite'
        ? { ...file, path: 'northstar.sqlite' }
        : file);
      await writeFile(restoredManifestPath, `${JSON.stringify(restoredManifest, null, 2)}\n`, { mode: 0o600 });

      const restoreDirectory = join(this.dataDirectory, 'restore-copies');
      await mkdir(restoreDirectory, { recursive: true, mode: 0o700 });
      const destination = join(restoreDirectory, `restore-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
      await rename(extractRoot, destination);
      await rm(stageRoot, { recursive: true, force: true });
      return destination;
    } catch (error) {
      await rm(stageRoot, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    } finally { wrappingKey?.fill(0); recoveryWrappingKey?.fill(0); dataKey?.fill(0); }
  }
}
