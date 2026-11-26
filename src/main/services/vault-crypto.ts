import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export const VAULT_AAD = Buffer.from('northstar-vault-master-key-v1');
export const NOTE_AAD_PREFIX = 'northstar-protected-note-v1:';

export interface EncryptedValue {
    nonce: string;
    ciphertext: string;
    tag: string;
}

export interface WrappedKeyRow {
    pass_salt: string;
    pass_nonce: string;
    pass_wrapped_key: string;
    pass_tag: string;
    recovery_salt: string;
    recovery_nonce: string;
    recovery_wrapped_key: string;
    recovery_tag: string;
}

export type VaultKeyPurpose = 'passphrase' | 'recovery';
export type VaultKeyDeriver = (secret: string, salt: Buffer, purpose: VaultKeyPurpose) => Promise<Buffer>;

export function encryptVaultPayload(key: Buffer, plaintext: Buffer, aad: Buffer): EncryptedValue {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
        nonce: nonce.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
    };
}

export function decryptVaultPayload(key: Buffer, payload: EncryptedValue, aad: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.nonce, 'base64'));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]);
}

/** Load the native KDF only when a vault operation actually needs it. */
export async function deriveArgon2Key(
    secret: string,
    salt: Buffer,
    purpose: VaultKeyPurpose,
): Promise<Buffer> {
    const { default: argon2 } = await import('argon2');
    return argon2.hash(secret, {
        type: argon2.argon2id,
        salt,
        hashLength: 32,
        memoryCost: purpose === 'passphrase' ? 65_536 : 32_768,
        timeCost: purpose === 'passphrase' ? 3 : 2,
        parallelism: 1,
        raw: true,
    });
}
