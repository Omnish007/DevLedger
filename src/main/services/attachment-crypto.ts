import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface WrappedAttachmentKey {
  nonce: string;
  ciphertext: string;
  tag: string;
}

function aad(attachmentId: string, plaintextSha256: string): Buffer {
  if (!attachmentId || !/^[a-f0-9]{64}$/.test(plaintextSha256)) throw new Error('Protected attachment identity is invalid.');
  return Buffer.from(`northstar-attachment-key-wrap-v2:${attachmentId}:${plaintextSha256}`, 'utf8');
}

export function wrapAttachmentKey(masterKey: Buffer, dataKey: Buffer, attachmentId: string, plaintextSha256: string): WrappedAttachmentKey {
  if (masterKey.length !== 32 || dataKey.length !== 32) throw new Error('Protected attachment keys must be 256 bits.');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, nonce);
  cipher.setAAD(aad(attachmentId, plaintextSha256));
  const ciphertext = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  return { nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function unwrapAttachmentKey(masterKey: Buffer, wrapped: WrappedAttachmentKey, attachmentId: string, plaintextSha256: string): Buffer {
  if (masterKey.length !== 32) throw new Error('The vault key is invalid.');
  const nonce = Buffer.from(wrapped.nonce, 'base64');
  const ciphertext = Buffer.from(wrapped.ciphertext, 'base64');
  const tag = Buffer.from(wrapped.tag, 'base64');
  if (nonce.length !== 12 || ciphertext.length !== 32 || tag.length !== 16) throw new Error('Protected attachment key metadata is malformed.');
  const decipher = createDecipheriv('aes-256-gcm', masterKey, nonce);
  decipher.setAAD(aad(attachmentId, plaintextSha256));
  decipher.setAuthTag(tag);
  const dataKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (dataKey.length !== 32) {
    dataKey.fill(0);
    throw new Error('Protected attachment key material is invalid.');
  }
  return dataKey;
}
