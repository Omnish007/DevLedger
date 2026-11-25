import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
    wrapBackupDataKey,
    unwrapBackupDataKey,
    validateBackupHeaderV2,
} from '../../src/main/services/backup-key-envelope.ts';

test('backup data key has independent passphrase and recovery wrapping envelopes', () => {
    const dataKey = randomBytes(32);
    const passphraseKey = randomBytes(32);
    const recoveryKey = randomBytes(32);
    const backupId = '6e0f226a-6d74-4f4a-820d-7234e3bb3d55';
    const passphraseEnvelope = wrapBackupDataKey(dataKey, passphraseKey, backupId, 'passphrase');
    const recoveryEnvelope = wrapBackupDataKey(dataKey, recoveryKey, backupId, 'recovery');
    assert.notEqual(passphraseEnvelope.salt, recoveryEnvelope.salt);
    assert.notEqual(passphraseEnvelope.nonce, recoveryEnvelope.nonce);
    assert.deepEqual(unwrapBackupDataKey(passphraseEnvelope, passphraseKey, backupId, 'passphrase'), dataKey);
    assert.deepEqual(unwrapBackupDataKey(recoveryEnvelope, recoveryKey, backupId, 'recovery'), dataKey);
    assert.throws(() => unwrapBackupDataKey(recoveryEnvelope, passphraseKey, backupId, 'recovery'));
    assert.throws(() => unwrapBackupDataKey(recoveryEnvelope, recoveryKey, backupId, 'passphrase'));
    dataKey.fill(0);
    passphraseKey.fill(0);
    recoveryKey.fill(0);
});

test('version-two backup envelope is validated before it is used', () => {
    const key = randomBytes(32);
    const dataKey = randomBytes(32);
    const backupId = '6e0f226a-6d74-4f4a-820d-7234e3bb3d55';
    const passphrase = wrapBackupDataKey(dataKey, key, backupId, 'passphrase');
    const recovery = wrapBackupDataKey(dataKey, key, backupId, 'recovery');
    assert.equal(
        validateBackupHeaderV2({
            version: 2,
            backupId,
            dataNonce: randomBytes(12).toString('base64'),
            passphrase,
            recovery,
        }).version,
        2,
    );
    assert.throws(() => validateBackupHeaderV2({ version: 3, backupId }));
    key.fill(0);
    dataKey.fill(0);
});
