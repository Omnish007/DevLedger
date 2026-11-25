import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export interface WrappedDataKey {
    salt: string;
    nonce: string;
    ciphertext: string;
    tag: string;
}

export interface BackupHeaderV2 {
    version: 2;
    backupId: string;
    dataNonce: string;
    passphrase: WrappedDataKey;
    recovery: WrappedDataKey;
}

const WRAP_AAD_PREFIX = 'northstar-backup-key-wrap-v2';

export function wrapBackupDataKey(
    dataKey: Buffer,
    wrappingKey: Buffer,
    backupId: string,
    purpose: 'passphrase' | 'recovery',
    salt = randomBytes(16),
): WrappedDataKey {
    if (dataKey.length !== 32 || wrappingKey.length !== 32) throw new Error('Backup keys must be 256 bits.');
    if (salt.length !== 16) throw new Error('Backup key-wrap salt must be 128 bits.');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', wrappingKey, nonce);
    cipher.setAAD(Buffer.from(`${WRAP_AAD_PREFIX}:${backupId}:${purpose}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(dataKey), cipher.final()]);
    return {
        salt: salt.toString('base64'),
        nonce: nonce.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
    };
}

export function unwrapBackupDataKey(
    wrapped: WrappedDataKey,
    wrappingKey: Buffer,
    backupId: string,
    purpose: 'passphrase' | 'recovery',
): Buffer {
    if (wrappingKey.length !== 32) throw new Error('Backup wrapping key must be 256 bits.');
    const nonce = Buffer.from(wrapped.nonce, 'base64');
    const ciphertext = Buffer.from(wrapped.ciphertext, 'base64');
    const tag = Buffer.from(wrapped.tag, 'base64');
    if (nonce.length !== 12 || ciphertext.length !== 32 || tag.length !== 16)
        throw new Error('Backup key envelope is malformed.');
    const decipher = createDecipheriv('aes-256-gcm', wrappingKey, nonce);
    decipher.setAAD(Buffer.from(`${WRAP_AAD_PREFIX}:${backupId}:${purpose}`, 'utf8'));
    decipher.setAuthTag(tag);
    const dataKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (dataKey.length !== 32) {
        dataKey.fill(0);
        throw new Error('Backup data key has an invalid size.');
    }
    return dataKey;
}

export function validateBackupHeaderV2(value: unknown): BackupHeaderV2 {
    if (!value || typeof value !== 'object') throw new Error('The backup encryption header is malformed.');
    const record = value as Record<string, unknown>;
    const isWrapped = (item: unknown): item is WrappedDataKey => {
        if (!item || typeof item !== 'object') return false;
        const wrapped = item as Record<string, unknown>;
        return ['salt', 'nonce', 'ciphertext', 'tag'].every(
            (key) => typeof wrapped[key] === 'string' && (wrapped[key] as string).length <= 256,
        );
    };
    if (
        record['version'] !== 2 ||
        typeof record['backupId'] !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(record['backupId']) ||
        typeof record['dataNonce'] !== 'string' ||
        Buffer.from(record['dataNonce'], 'base64').length !== 12 ||
        !isWrapped(record['passphrase']) ||
        !isWrapped(record['recovery'])
    ) {
        throw new Error('This backup uses an unsupported or damaged encryption header.');
    }
    for (const item of [record['passphrase'], record['recovery']] as WrappedDataKey[]) {
        if (
            Buffer.from(item.salt, 'base64').length !== 16 ||
            Buffer.from(item.nonce, 'base64').length !== 12 ||
            Buffer.from(item.ciphertext, 'base64').length !== 32 ||
            Buffer.from(item.tag, 'base64').length !== 16
        ) {
            throw new Error('The backup encryption key envelope is invalid.');
        }
    }
    return value as BackupHeaderV2;
}
