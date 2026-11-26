import { randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
    type EncryptedValue,
    NOTE_AAD_PREFIX,
    VAULT_AAD,
    type VaultKeyDeriver,
    type VaultKeyPurpose,
    type WrappedKeyRow,
    decryptVaultPayload,
    deriveArgon2Key,
    encryptVaultPayload,
} from './vault-crypto.ts';

export type { VaultKeyDeriver, VaultKeyPurpose } from './vault-crypto.ts';

export interface VaultStatus {
    configured: boolean;
    unlocked: boolean;
}

export interface ProtectedNote {
    id: string;
    projectId: string | null;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    locked: true;
}

export class VaultService {
    private masterKey: Buffer | null = null;
    private generation = 0;
    private readonly db: Database.Database;
    private readonly deriveKey: VaultKeyDeriver;
    constructor(db: Database.Database, deriveKey: VaultKeyDeriver = deriveArgon2Key) {
        this.db = db;
        this.deriveKey = deriveKey;
    }

    status(): VaultStatus {
        const configured = Boolean(
            this.db.prepare('SELECT singleton_id FROM vault_metadata WHERE singleton_id = 1').get(),
        );
        return { configured, unlocked: configured && this.masterKey !== null };
    }

    async setup(passphrase: string): Promise<{ recoveryKey: string }> {
        if (this.status().configured) throw new Error('The vault has already been configured.');
        this.validatePassphrase(passphrase);
        const operationGeneration = this.generation;
        const masterKey = randomBytes(32);
        const recoveryKey = randomBytes(32).toString('base64url');
        const passSalt = randomBytes(16);
        const recoverySalt = randomBytes(16);
        let passKey: Buffer | null = null;
        let recoveryWrappingKey: Buffer | null = null;
        try {
            passKey = await this.deriveKey(passphrase, passSalt, 'passphrase');
            this.assertOperationActive(operationGeneration);
            recoveryWrappingKey = await this.deriveKey(recoveryKey, recoverySalt, 'recovery');
            this.assertOperationActive(operationGeneration);
            const passWrap = encryptVaultPayload(passKey, masterKey, VAULT_AAD);
            const recoveryWrap = encryptVaultPayload(recoveryWrappingKey, masterKey, VAULT_AAD);
            this.assertOperationActive(operationGeneration);
            const now = new Date().toISOString();
            this.db
                .prepare(
                    `INSERT INTO vault_metadata (singleton_id, pass_salt, pass_nonce, pass_wrapped_key, pass_tag,
        recovery_salt, recovery_nonce, recovery_wrapped_key, recovery_tag, created_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .run(
                    passSalt.toString('base64'),
                    passWrap.nonce,
                    passWrap.ciphertext,
                    passWrap.tag,
                    recoverySalt.toString('base64'),
                    recoveryWrap.nonce,
                    recoveryWrap.ciphertext,
                    recoveryWrap.tag,
                    now,
                    now,
                );
            this.replaceMasterKey(masterKey);
            return { recoveryKey };
        } finally {
            masterKey.fill(0);
            passKey?.fill(0);
            recoveryWrappingKey?.fill(0);
        }
    }

    private async unlockWithWrappedSecret(
        secret: string,
        purpose: VaultKeyPurpose,
        saltB64: string,
        payload: EncryptedValue,
        incorrectMessage: string,
    ): Promise<void> {
        const operationGeneration = this.generation;
        const wrappingKey = await this.deriveKey(secret, Buffer.from(saltB64, 'base64'), purpose);
        try {
            this.assertOperationActive(operationGeneration);
            const key = decryptVaultPayload(wrappingKey, payload, VAULT_AAD);
            this.assertMasterKey(key);
            this.assertOperationActive(operationGeneration);
            this.replaceMasterKey(key);
        } catch {
            if (operationGeneration !== this.generation)
                throw new Error('Vault operation cancelled because the vault was locked.');
            throw new Error(incorrectMessage);
        } finally {
            wrappingKey.fill(0);
        }
    }

    async unlockWithPassphrase(passphrase: string): Promise<void> {
        this.validatePassphrase(passphrase);
        const row = this.getMetadata();
        await this.unlockWithWrappedSecret(
            passphrase,
            'passphrase',
            row.pass_salt,
            { nonce: row.pass_nonce, ciphertext: row.pass_wrapped_key, tag: row.pass_tag },
            'The vault passphrase is incorrect.',
        );
    }

    unlockWithDeviceKey(key: Buffer): void {
        if (!this.status().configured) throw new Error('The vault has not been configured yet.');
        this.assertMasterKey(key);
        this.replaceMasterKey(key);
    }

    async unlockWithRecoveryKey(recoveryKey: string): Promise<void> {
        if (!/^[A-Za-z0-9_-]{40,60}$/.test(recoveryKey))
            throw new Error('The offline recovery key is not in a valid format.');
        const row = this.getMetadata();
        await this.unlockWithWrappedSecret(
            recoveryKey,
            'recovery',
            row.recovery_salt,
            { nonce: row.recovery_nonce, ciphertext: row.recovery_wrapped_key, tag: row.recovery_tag },
            'The offline recovery key is incorrect.',
        );
    }

    /** Returns a short-lived copy for a single cryptographic operation. Callers must zero it. */
    copyEncryptionKey(): Buffer {
        return Buffer.from(this.requireUnlocked());
    }

    lock(): void {
        this.generation += 1;
        this.masterKey?.fill(0);
        this.masterKey = null;
    }

    async changePassphrase(nextPassphrase: string): Promise<void> {
        const operationGeneration = this.generation;
        this.requireUnlocked();
        this.validatePassphrase(nextPassphrase);
        this.getMetadata();
        const masterKey = Buffer.from(this.requireUnlocked());
        const salt = randomBytes(16);
        let wrappingKey: Buffer | null = null;
        try {
            wrappingKey = await this.deriveKey(nextPassphrase, salt, 'passphrase');
            this.assertOperationActive(operationGeneration);
            const wrapped = encryptVaultPayload(wrappingKey, masterKey, VAULT_AAD);
            this.db
                .prepare(
                    `UPDATE vault_metadata SET pass_salt = ?, pass_nonce = ?, pass_wrapped_key = ?, pass_tag = ?, updated_at = ? WHERE singleton_id = 1`,
                )
                .run(
                    salt.toString('base64'),
                    wrapped.nonce,
                    wrapped.ciphertext,
                    wrapped.tag,
                    new Date().toISOString(),
                );
        } finally {
            masterKey.fill(0);
            wrappingKey?.fill(0);
        }
    }

    lockNote(noteId: string): void {
        const key = this.requireUnlocked();
        const row = this.db
            .prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL AND locked = 0')
            .get(noteId) as Record<string, unknown> | undefined;
        if (!row) throw new Error('The note is missing or already locked.');
        const plaintext = Buffer.from(
            JSON.stringify({
                title: String(row['title']),
                content: String(row['content']),
                projectId: row['project_id'] ? String(row['project_id']) : null,
            }),
            'utf8',
        );
        let encrypted: EncryptedValue;
        try {
            encrypted = encryptVaultPayload(key, plaintext, Buffer.from(`${NOTE_AAD_PREFIX}${noteId}`));
        } finally {
            plaintext.fill(0);
        }
        const update = this.db.transaction(() => {
            this.db.prepare('DELETE FROM note_versions WHERE note_id = ?').run(noteId);
            this.db
                .prepare(
                    `UPDATE activity_events SET summary = 'Protected note activity', metadata_json = '{}' WHERE entity_type = 'note' AND entity_id = ?`,
                )
                .run(noteId);
            this.db
                .prepare(
                    `UPDATE notes SET title = 'Locked note', content = '', locked = 1, encrypted_payload = ?, encryption_meta = ?,
        content_version = content_version + 1, updated_at = ? WHERE id = ? AND locked = 0`,
                )
                .run(
                    Buffer.from(encrypted.ciphertext, 'base64'),
                    JSON.stringify({ nonce: encrypted.nonce, tag: encrypted.tag, version: 1 }),
                    new Date().toISOString(),
                    noteId,
                );
            this.db
                .prepare(
                    `INSERT INTO activity_events (id, entity_type, entity_id, event_type, summary, created_at)
        VALUES (?, 'note', ?, 'locked', 'Protected note was locked', ?)`,
                )
                .run(randomUUID(), noteId, new Date().toISOString());
        });
        update.immediate();
        // secure_delete is enabled for the database. Truncate WAL frames after the lock transaction so earlier plaintext frames are not retained in the active WAL.
        this.db.pragma('wal_checkpoint(TRUNCATE)');
    }

    unlockNote(noteId: string): ProtectedNote {
        const key = this.requireUnlocked();
        const row = this.db
            .prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL AND locked = 1')
            .get(noteId) as Record<string, unknown> | undefined;
        if (!row || !row['encrypted_payload'] || !row['encryption_meta'])
            throw new Error('Locked note not found.');
        const meta = JSON.parse(String(row['encryption_meta'])) as {
            nonce: string;
            tag: string;
            version: number;
        };
        if (meta.version !== 1)
            throw new Error('This protected note uses an unsupported encryption version.');
        const encrypted: EncryptedValue = {
            nonce: meta.nonce,
            tag: meta.tag,
            ciphertext: Buffer.from(row['encrypted_payload'] as Buffer).toString('base64'),
        };
        const plain = decryptVaultPayload(key, encrypted, Buffer.from(`${NOTE_AAD_PREFIX}${noteId}`));
        try {
            const parsed = JSON.parse(plain.toString('utf8')) as {
                title: string;
                content: string;
                projectId: string | null;
            };
            return {
                id: noteId,
                title: parsed.title,
                content: parsed.content,
                projectId: parsed.projectId,
                createdAt: String(row['created_at']),
                updatedAt: String(row['updated_at']),
                locked: true,
            };
        } finally {
            plain.fill(0);
        }
    }

    saveLockedNote(
        noteId: string,
        input: { title: string; content: string; projectId: string | null },
    ): ProtectedNote {
        const key = this.requireUnlocked();
        const exists = this.db
            .prepare('SELECT id, project_id FROM notes WHERE id = ? AND deleted_at IS NULL AND locked = 1')
            .get(noteId) as { id: string; project_id: string | null } | undefined;
        if (!exists) throw new Error('Locked note not found.');
        if (input.projectId) {
            const project = this.db
                .prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL')
                .get(input.projectId);
            if (!project) throw new Error('The selected project no longer exists.');
        }
        const plaintext = Buffer.from(
            JSON.stringify({
                title: input.title.trim() || 'Untitled note',
                content: input.content,
                projectId: input.projectId,
            }),
            'utf8',
        );
        let encrypted: EncryptedValue;
        try {
            encrypted = encryptVaultPayload(key, plaintext, Buffer.from(`${NOTE_AAD_PREFIX}${noteId}`));
        } finally {
            plaintext.fill(0);
        }
        const now = new Date().toISOString();
        this.db
            .prepare(
                'UPDATE notes SET encrypted_payload = ?, encryption_meta = ?, project_id = ?, updated_at = ?, content_version = content_version + 1 WHERE id = ? AND locked = 1',
            )
            .run(
                Buffer.from(encrypted.ciphertext, 'base64'),
                JSON.stringify({ nonce: encrypted.nonce, tag: encrypted.tag, version: 1 }),
                input.projectId,
                now,
                noteId,
            );
        return {
            id: noteId,
            title: input.title.trim() || 'Untitled note',
            content: input.content,
            projectId: input.projectId,
            createdAt: '',
            updatedAt: now,
            locked: true,
        };
    }

    unprotectNote(noteId: string): Omit<ProtectedNote, 'locked'> & { locked: false } {
        const decrypted = this.unlockNote(noteId);
        let projectId = decrypted.projectId;
        if (projectId) {
            const exists = this.db
                .prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL')
                .get(projectId);
            if (!exists) projectId = null;
        }
        const safeTitle = decrypted.title.trim() || 'Untitled note';
        const now = new Date().toISOString();
        const tx = this.db.transaction(() => {
            const result = this.db
                .prepare(
                    `UPDATE notes
                     SET title = ?, content = ?, project_id = ?, locked = 0,
                         encrypted_payload = NULL, encryption_meta = NULL,
                         content_version = content_version + 1, updated_at = ?
                     WHERE id = ? AND deleted_at IS NULL AND locked = 1`,
                )
                .run(safeTitle, decrypted.content, projectId, now, noteId);
            if (result.changes !== 1) throw new Error('Locked note not found.');
            this.db
                .prepare(
                    `INSERT INTO activity_events (id, entity_type, entity_id, event_type, summary, created_at)
                     VALUES (?, 'note', ?, 'unprotected', ?, ?)`,
                )
                .run(randomUUID(), noteId, `Removed vault lock from ${safeTitle}`, now);
        });
        tx.immediate();
        return {
            id: noteId,
            projectId,
            title: safeTitle,
            content: decrypted.content,
            createdAt: decrypted.createdAt,
            updatedAt: now,
            locked: false,
        };
    }

    private getMetadata(): WrappedKeyRow {
        const row = this.db.prepare('SELECT * FROM vault_metadata WHERE singleton_id = 1').get() as
            WrappedKeyRow | undefined;
        if (!row) throw new Error('The vault has not been configured yet.');
        return row;
    }
    private assertOperationActive(generation: number): void {
        if (generation !== this.generation)
            throw new Error('Vault operation cancelled because the vault was locked.');
    }
    private validatePassphrase(value: string): void {
        if (value.length < 12 || value.length > 1024)
            throw new Error('Use a passphrase between 12 and 1024 characters.');
    }
    private requireUnlocked(): Buffer {
        if (!this.masterKey) throw new Error('Unlock the vault before accessing protected notes.');
        return this.masterKey;
    }
    private replaceMasterKey(next: Buffer): void {
        this.masterKey?.fill(0);
        this.masterKey = Buffer.from(next);
        next.fill(0);
    }
    private assertMasterKey(key: Buffer): void {
        if (key.length !== 32) throw new Error('Invalid vault key material.');
    }
}
