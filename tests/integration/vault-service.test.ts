import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { VaultService, type VaultKeyDeriver, type VaultKeyPurpose } from '../../src/main/services/vault.ts';

const PASSPHRASE = 'correct horse battery staple';

function createDatabase(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    Object.defineProperty(db, 'transaction', {
        configurable: true,
        value: (callback: () => unknown) => {
            const run = (() => {
                db.exec('BEGIN IMMEDIATE');
                try {
                    const result = callback();
                    db.exec('COMMIT');
                    return result;
                } catch (error) {
                    db.exec('ROLLBACK');
                    throw error;
                }
            }) as (() => unknown) & {
                immediate: () => unknown;
                deferred: () => unknown;
                exclusive: () => unknown;
            };
            run.immediate = run;
            run.deferred = run;
            run.exclusive = run;
            return run;
        },
    });
    Object.defineProperty(db, 'pragma', {
        configurable: true,
        value: (statement: string) => db.prepare(`PRAGMA ${statement}`).all(),
    });
    return db;
}

function fastTestDeriver(): VaultKeyDeriver {
    return async (secret: string, salt: Buffer, purpose: VaultKeyPurpose) =>
        createHash('sha256').update(purpose).update('\0').update(secret).update(salt).digest();
}

function makeControlledDeriver() {
    let blocked = false;
    let notifyStarted: (() => void) | undefined;
    let release: (() => void) | undefined;
    let started = Promise.resolve();
    let gate = Promise.resolve();
    const derive: VaultKeyDeriver = async (secret, salt, purpose) => {
        if (blocked) {
            blocked = false;
            notifyStarted?.();
            await gate;
        }
        return fastTestDeriver()(secret, salt, purpose);
    };
    return {
        derive,
        blockNext() {
            blocked = true;
            started = new Promise<void>((resolve) => {
                notifyStarted = resolve;
            });
            gate = new Promise<void>((resolve) => {
                release = resolve;
            });
        },
        waitUntilStarted: () => started,
        release: () => {
            release?.();
            notifyStarted = undefined;
            release = undefined;
        },
    };
}

function insertNote(db: DatabaseSync, id = 'note-secret') {
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO notes (id, project_id, title, content, content_version, locked, created_at, updated_at)
    VALUES (?, NULL, ?, ?, 1, 0, ?, ?)`,
    ).run(id, 'Private architecture decision', 'The secret implementation detail.', now, now);
    db.prepare(
        `INSERT INTO note_versions (id, note_id, content_version, title, content, created_at)
    VALUES (?, ?, 1, ?, ?, ?)`,
    ).run('version-secret', id, 'Private architecture decision', 'The secret implementation detail.', now);
}

test('vault setup wraps a random master key and passphrase unlock rejects incorrect credentials', async () => {
    const db = createDatabase();
    try {
        const vault = new VaultService(db as never, fastTestDeriver());
        const { recoveryKey } = await vault.setup(PASSPHRASE);
        assert.match(recoveryKey, /^[A-Za-z0-9_-]{40,60}$/);
        assert.deepEqual(vault.status(), { configured: true, unlocked: true });
        const metadata = db
            .prepare(
                'SELECT pass_wrapped_key, recovery_wrapped_key FROM vault_metadata WHERE singleton_id = 1',
            )
            .get() as Record<string, string>;
        assert.notEqual(metadata.pass_wrapped_key, PASSPHRASE);
        vault.lock();
        await assert.rejects(vault.unlockWithPassphrase('incorrect passphrase'), /incorrect/);
        assert.equal(vault.status().unlocked, false);
        await vault.unlockWithPassphrase(PASSPHRASE);
        assert.equal(vault.status().unlocked, true);
    } finally {
        db.close();
    }
});

test('vault recovery key unlocks independently and passphrase rotation preserves the master key', async () => {
    const db = createDatabase();
    try {
        const vault = new VaultService(db as never, fastTestDeriver());
        const { recoveryKey } = await vault.setup(PASSPHRASE);
        const before = vault.copyEncryptionKey();
        await vault.changePassphrase('another strong passphrase');
        const after = vault.copyEncryptionKey();
        assert.deepEqual(after, before);
        before.fill(0);
        after.fill(0);
        vault.lock();
        await assert.rejects(vault.unlockWithPassphrase(PASSPHRASE), /incorrect/);
        await vault.unlockWithRecoveryKey(recoveryKey);
        vault.lock();
        await vault.unlockWithPassphrase('another strong passphrase');
        assert.equal(vault.status().unlocked, true);
    } finally {
        db.close();
    }
});

test('protected notes remove plaintext, decrypt with the vault key and reject ciphertext tampering', async () => {
    const db = createDatabase();
    try {
        insertNote(db);
        const vault = new VaultService(db as never, fastTestDeriver());
        await vault.setup(PASSPHRASE);
        vault.lockNote('note-secret');
        const stored = db
            .prepare('SELECT title, content, encrypted_payload FROM notes WHERE id = ?')
            .get('note-secret') as { title: string; content: string; encrypted_payload: Uint8Array };
        assert.equal(stored.title, 'Locked note');
        assert.equal(stored.content, '');
        assert.ok(stored.encrypted_payload.length > 0);
        assert.equal(
            db.prepare('SELECT count(*) AS count FROM note_versions WHERE note_id = ?').get('note-secret')
                ?.count,
            0,
        );
        const protectedNote = vault.unlockNote('note-secret');
        assert.equal(protectedNote.title, 'Private architecture decision');
        assert.equal(protectedNote.content, 'The secret implementation detail.');
        db.prepare('UPDATE notes SET encrypted_payload = ? WHERE id = ?').run(
            Buffer.alloc(stored.encrypted_payload.length, 0x5a),
            'note-secret',
        );
        assert.throws(() => vault.unlockNote('note-secret'));
    } finally {
        db.close();
    }
});

test('locking during asynchronous unlock cancels the stale operation', async () => {
    const db = createDatabase();
    try {
        const control = makeControlledDeriver();
        const vault = new VaultService(db as never, control.derive);
        await vault.setup(PASSPHRASE);
        vault.lock();
        control.blockNext();
        const unlocking = vault.unlockWithPassphrase(PASSPHRASE);
        await control.waitUntilStarted();
        vault.lock();
        control.release();
        await assert.rejects(unlocking, /cancelled because the vault was locked/);
        assert.equal(vault.status().unlocked, false);
    } finally {
        db.close();
    }
});

test('locking during initial setup prevents late key derivation from creating vault metadata', async () => {
    const db = createDatabase();
    try {
        const control = makeControlledDeriver();
        const vault = new VaultService(db as never, control.derive);
        control.blockNext();
        const setup = vault.setup(PASSPHRASE);
        await control.waitUntilStarted();
        vault.lock();
        control.release();
        await assert.rejects(setup, /cancelled because the vault was locked/);
        assert.equal(vault.status().configured, false);
        assert.equal(vault.status().unlocked, false);
    } finally {
        db.close();
    }
});

test('locking during passphrase rotation leaves the old wrapping envelope intact', async () => {
    const db = createDatabase();
    try {
        const control = makeControlledDeriver();
        const vault = new VaultService(db as never, control.derive);
        await vault.setup(PASSPHRASE);
        const before = db
            .prepare(
                'SELECT pass_salt, pass_nonce, pass_wrapped_key, pass_tag FROM vault_metadata WHERE singleton_id = 1',
            )
            .get();
        control.blockNext();
        const changing = vault.changePassphrase('replacement passphrase');
        await control.waitUntilStarted();
        vault.lock();
        control.release();
        await assert.rejects(changing, /cancelled because the vault was locked/);
        const after = db
            .prepare(
                'SELECT pass_salt, pass_nonce, pass_wrapped_key, pass_tag FROM vault_metadata WHERE singleton_id = 1',
            )
            .get();
        assert.deepEqual(after, before);
        assert.equal(vault.status().unlocked, false);
    } finally {
        db.close();
    }
});
