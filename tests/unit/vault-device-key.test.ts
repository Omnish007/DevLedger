import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VaultDeviceKeyStore, type SafeStoragePort } from '../../src/main/services/vault-device-key.ts';

function fakeStorage(backend = 'test-keyring'): SafeStoragePort {
  return {
    isAsyncEncryptionAvailable: () => Promise.resolve(true),
    getSelectedStorageBackend: () => backend,
    encryptStringAsync: (value: string) => Promise.resolve(Buffer.from(`protected:${Buffer.from(value, 'utf8').toString('base64')}`, 'utf8')),
    decryptStringAsync: (value: Buffer) => {
      const encoded = value.toString('utf8');
      if (!encoded.startsWith('protected:')) return Promise.reject(new Error('Invalid protected payload.'));
      const result = Buffer.from(encoded.slice('protected:'.length), 'base64').toString('utf8');
      return Promise.resolve({ result, shouldReEncrypt: false });
    },
  };
}

test('device vault key is stored as a protected payload and unlocks without storing a passphrase', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devledger-vault-device-'));
  const store = new VaultDeviceKeyStore(directory, fakeStorage());
  const key = Buffer.alloc(32, 7);
  const recovered: Buffer[] = [];
  try {
    await store.save(key);
    const file = await readFile(join(directory, 'vault-device-key.bin'));
    assert.ok(!file.toString('utf8').includes(key.toString('base64url')));
    const unlocked = await store.unlock({ unlockWithDeviceKey: (value) => recovered.push(Buffer.from(value)) });
    assert.equal(unlocked, true);
    assert.deepEqual(recovered[0], key);
    await store.remove();
    assert.equal(await store.unlock({ unlockWithDeviceKey: () => assert.fail('removed key must not unlock') }), false);
  } finally {
    key.fill(0); recovered.forEach((value) => value.fill(0));
    await rm(directory, { recursive: true, force: true });
  }
});

test('device unlock fails closed for insecure Linux key storage and rejects malformed keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devledger-vault-device-'));
  try {
    const insecure = new VaultDeviceKeyStore(directory, fakeStorage('basic_text'));
    assert.equal(insecure.isAvailable('linux'), false);
    await assert.rejects(() => insecure.save(Buffer.alloc(32, 1)), /secure OS credential backend/);
    const secure = new VaultDeviceKeyStore(directory, fakeStorage());
    await assert.rejects(() => secure.save(Buffer.alloc(31, 1)), /Invalid vault key material/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
