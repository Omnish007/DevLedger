import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { safeStorage } from 'electron';
import type Database from 'better-sqlite3';
import { selectRetainedSnapshots } from '../../domain/backup-retention.js';
import { assertCredentialCanBeInitialized, isAutomaticSnapshotName } from '../../domain/automatic-backup-credential.js';
import { BackupService } from './backup.js';
import { listExternalSnapshots, mirrorEncryptedBackup } from './external-backup.js';
import { NotificationInboxService, backupNotificationKey } from './notification-inbox.js';

const INTERVAL_MS = 30 * 60 * 1000;
const BACKUP_DIR = 'automatic-backups';
const KEY_FILE = 'automatic-backup-key.bin';

/** Automatic backups only run when the OS can protect the local backup credential. */
export class AutomaticBackupManager {
  private interval: NodeJS.Timeout | null = null;
  private running = false;
  private readonly backups: BackupService;
  private readonly backupDirectory: string;
  private readonly keyPath: string;

  private readonly db: Database.Database;
  private readonly dataDirectory: string;

  constructor(db: Database.Database, dataDirectory: string) {
    this.db = db;
    this.dataDirectory = dataDirectory;
    this.backups = new BackupService(db, dataDirectory);
    this.backupDirectory = join(dataDirectory, BACKUP_DIR);
    this.keyPath = join(dataDirectory, KEY_FILE);
  }

  private saveSetting(key: string, value: unknown): void {
    const timestamp = new Date().toISOString();
    this.db.prepare(`INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
      .run(key, JSON.stringify(value), timestamp);
    if (typeof value === 'string' && key.endsWith('LastError')) {
      const isExternal = key.startsWith('backup.external');
      const isOffline = key.startsWith('backup.offline');
      const title = isExternal ? 'External backup copy needs attention' : isOffline ? 'Offline backup copy needs attention' : 'Automatic backup needs attention';
      new NotificationInboxService(this.db).createSystemNotification('backup', title, value, backupNotificationKey(`${key}:${value}`));
    }
  }

  private secureBackendAvailable(): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false;
    const storage = safeStorage as typeof safeStorage & { getSelectedStorageBackend?: () => string };
    const backend = storage.getSelectedStorageBackend?.() ?? 'unknown';
    // Electron explicitly identifies basic_text as unencrypted on Linux. Unknown is also fail-closed there.
    if (process.platform === 'linux') return backend !== 'basic_text' && backend !== 'unknown';
    return true;
  }

  private async getBackupCredential(): Promise<string> {
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.keyPath);
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        throw new Error('The OS-protected automatic-backup key file cannot be read. Automatic backups are paused to protect existing snapshots.');
      }
      const entries = await readdir(this.backupDirectory, { withFileTypes: true });
      assertCredentialCanBeInitialized(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
      const secret = randomBytes(32).toString('base64url');
      const protectedValue = safeStorage.encryptString(secret);
      const temporary = `${this.keyPath}.${randomUUID()}.partial`;
      await writeFile(temporary, protectedValue, { mode: 0o600, flag: 'wx' });
      try {
        const { rename } = await import('node:fs/promises');
        await rename(temporary, this.keyPath);
      } catch (writeError) {
        await rm(temporary, { force: true });
        throw writeError;
      }
      return secret;
    }
    try { return safeStorage.decryptString(encrypted); }
    catch { throw new Error('The OS-protected automatic-backup key cannot be decrypted. Automatic backups are paused to avoid making existing snapshots unrecoverable.'); }
  }

  async start(options: { schedule?: boolean; deferInitial?: boolean } = {}): Promise<{ enabled: boolean; reason?: string }> {
    if (!this.secureBackendAvailable()) {
      const reason = 'A secure OS credential backend is unavailable. Automatic backups are disabled; create manual encrypted backups instead.';
      this.saveSetting('backup.autoEnabled', false); this.saveSetting('backup.autoLastError', reason);
      return { enabled: false, reason };
    }
    await mkdir(this.backupDirectory, { recursive: true, mode: 0o700 });
    try {
      await this.getBackupCredential();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The automatic-backup key could not be opened.';
      this.saveSetting('backup.autoEnabled', false); this.saveSetting('backup.autoLastError', reason);
      return { enabled: false, reason };
    }
    this.saveSetting('backup.autoEnabled', true); this.saveSetting('backup.autoLastError', null);
    if (!options.deferInitial) await this.runIfDue();
    if (options.schedule !== false) {
      this.interval = setInterval(() => { void this.runIfDue(); }, INTERVAL_MS);
      this.interval.unref();
    }
    return { enabled: true };
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  get isBusy(): boolean { return this.running; }

  async waitForIdle(): Promise<void> {
    while (this.running) await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }

  async runIfDue(throwOnError = false): Promise<void> {
    if (this.running || !this.secureBackendAvailable()) return;
    this.running = true;
    try {
      await mkdir(this.backupDirectory, { recursive: true, mode: 0o700 });
      const entries = await readdir(this.backupDirectory, { withFileTypes: true });
      const snapshots: Array<{ path: string; createdAt: string }> = [];
      for (const entry of entries) {
        if (!entry.isFile() || !isAutomaticSnapshotName(entry.name)) continue;
        const path = join(this.backupDirectory, entry.name);
        const details = await stat(path);
        snapshots.push({ path, createdAt: details.mtime.toISOString() });
      }
      const last = snapshots.map((item) => Date.parse(item.createdAt)).filter(Number.isFinite).sort((a, b) => b - a)[0];
      if (last !== undefined && Date.now() - last < INTERVAL_MS - 60_000) return;

      const credential = await this.getBackupCredential();
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const target = join(this.backupDirectory, `snapshot-${timestamp}.nsbackup`);
      await this.backups.createEncryptedBackup(target, credential);
      let verifiedCopy: string;
      try {
        verifiedCopy = await this.backups.restoreAsCopy(target, credential);
      } catch (error) {
        await rm(target, { force: true });
        throw error;
      }
      const restoreRoot = resolve(this.dataDirectory, 'restore-copies');
      const safeRestoreCopy = resolve(verifiedCopy);
      const restoreRelative = relative(restoreRoot, safeRestoreCopy);
      if (restoreRelative === '..' || restoreRelative.startsWith(`..${sep}`) || isAbsolute(restoreRelative)) throw new Error('Backup verification produced an unexpected recovery path.');
      await rm(safeRestoreCopy, { recursive: true, force: true });

      await this.mirrorConfiguredDestination(target, 'backup.externalDirectory', 'backup.externalLastRun', 'backup.externalLastError', 'backup.externalSameVolume');
      await this.mirrorConfiguredDestination(target, 'backup.offlineDirectory', 'backup.offlineLastRun', 'backup.offlineLastError', 'backup.offlineSameVolume', 'backup.externalDirectory');

      const retained = selectRetainedSnapshots([...snapshots, { path: target, createdAt: new Date().toISOString() }]);
      for (const snapshot of snapshots) {
        if (!retained.has(snapshot.path)) await rm(snapshot.path, { force: true });
      }
      this.saveSetting('backup.autoLastRun', new Date().toISOString());
      this.saveSetting('backup.autoLastError', null);
    } catch (error) {
      // Do not delete older snapshots when a new backup or verification fails.
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown backup failure';
      this.saveSetting('backup.autoLastError', message);
      console.error('[DevLedger] Automatic backup failed:', message);
      if (throwOnError) throw error instanceof Error ? error : new Error(message);
    } finally {
      this.running = false;
    }
  }
  private async mirrorConfiguredDestination(sourcePath: string, directoryKey: string, lastRunKey: string, errorKey: string, sameVolumeKey: string, distinctFromKey?: string): Promise<void> {
    const setting = this.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(directoryKey) as { value_json: string } | undefined;
    if (!setting) return;
    let directory: unknown;
    try { directory = JSON.parse(setting.value_json) as unknown; } catch { directory = null; }
    if (typeof directory !== 'string' || !directory.trim()) return;
    try {
      let otherDirectory: string | undefined;
      if (distinctFromKey) {
        const other = this.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(distinctFromKey) as { value_json: string } | undefined;
        try { otherDirectory = other ? JSON.parse(other.value_json) as string : undefined; } catch { otherDirectory = undefined; }
        if (!otherDirectory) throw new Error('The first external backup destination is no longer configured.');
      }
      const mirrored = await mirrorEncryptedBackup(sourcePath, directory, this.dataDirectory, otherDirectory);
      if (mirrored.sameVolume) {
        await rm(mirrored.destinationPath, { force: true });
        throw new Error('The configured backup path is currently on the same physical volume as DevLedger data. Mount the intended drive; no same-volume copy was retained.');
      }
      this.saveSetting(lastRunKey, new Date().toISOString());
      this.saveSetting(errorKey, null);
      this.saveSetting(sameVolumeKey, mirrored.sameVolume);
      const snapshots = await listExternalSnapshots(mirrored.directory);
      const retained = selectRetainedSnapshots(snapshots);
      for (const snapshot of snapshots) if (!retained.has(snapshot.path)) await rm(snapshot.path, { force: true });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Backup destination copy failed.';
      this.saveSetting(errorKey, message);
    }
  }

}
