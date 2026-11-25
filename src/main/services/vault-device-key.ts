import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface SafeStoragePort {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  getSelectedStorageBackend?: () => string;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

export interface VaultKeyReceiver {
  unlockWithDeviceKey(key: Buffer): void;
}

/** Stores only an OS-protected copy of the random vault key, never the user passphrase. */
export class VaultDeviceKeyStore {
  private readonly keyPath: string;
  private readonly storage: SafeStoragePort;

  constructor(dataDirectory: string, storage: SafeStoragePort) {
    this.storage = storage;
    this.keyPath = join(dataDirectory, 'vault-device-key.bin');
  }

  isAvailable(platform = process.platform): boolean {
    // Note: isAsyncEncryptionAvailable() is async; callers that need a quick synchronous
    // gate should use this method only after awaiting checkAvailability() first.
    const backend = this.storage.getSelectedStorageBackend?.() ?? 'unknown';
    return platform !== 'linux' || (backend !== 'basic_text' && backend !== 'unknown');
  }

  async checkAvailability(platform = process.platform): Promise<boolean> {
    if (!(await this.storage.isAsyncEncryptionAvailable())) return false;
    return this.isAvailable(platform);
  }

  async save(key: Buffer): Promise<void> {
    if (!(await this.checkAvailability())) throw new Error('A secure OS credential backend is unavailable. Device unlock was not enabled.');
    if (key.length !== 32) throw new Error('Invalid vault key material.');
    const encrypted = await this.storage.encryptStringAsync(key.toString('base64url'));
    const temporary = `${this.keyPath}.${randomUUID()}.partial`;
    await mkdir(dirname(this.keyPath), { recursive: true, mode: 0o700 });
    try {
      await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.keyPath);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async unlock(vault: VaultKeyReceiver): Promise<boolean> {
    if (!(await this.checkAvailability())) return false;
    let encrypted: Buffer;
    try { encrypted = await readFile(this.keyPath); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
      throw error;
    }
    let key: Buffer | undefined;
    try {
      const { result: encoded } = await this.storage.decryptStringAsync(encrypted);
      if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw new Error('The stored device key has an invalid format.');
      key = Buffer.from(encoded, 'base64url');
      if (key.length !== 32) throw new Error('The stored device key has an invalid length.');
      vault.unlockWithDeviceKey(key);
      return true;
    } finally { key?.fill(0); }
  }

  async remove(): Promise<void> {
    await rm(this.keyPath, { force: true });
  }
}
