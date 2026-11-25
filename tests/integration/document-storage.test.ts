import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DocumentStorageService } from '../../src/main/services/storage.ts';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { addTransactionAdapter } from './sqlite-transaction-adapter.ts';

function createDatabase(): DatabaseSync {
    const db = addTransactionAdapter(new DatabaseSync(':memory:'));
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
        'p-1',
        'Storage Test',
        'greenfield',
        now,
        now,
    );
    return db;
}

test('document storage atomically imports a validated text file and queues extraction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'devledger-storage-test-'));
    const db = createDatabase();
    try {
        const source = join(root, 'source.md');
        const contents = Buffer.from('# Storage test\nA developer project knowledge file.\n', 'utf8');
        await writeFile(source, contents);
        const service = new DocumentStorageService(db as never, join(root, 'data'));
        const result = await service.importFromPath(source, 'p-1');
        assert.equal(result.document.status, 'queued');
        assert.equal(result.document.extension, '.md');
        const stored = db
            .prepare('SELECT object_relative_path, sha256 FROM documents WHERE id = ?')
            .get(result.document.id) as { object_relative_path: string; sha256: string };
        const object = await readFile(join(root, 'data', stored.object_relative_path));
        assert.deepEqual(object, contents);
        assert.equal(stored.sha256, createHash('sha256').update(contents).digest('hex'));
        assert.equal(
            (
                db
                    .prepare(
                        "SELECT count(*) AS count FROM background_jobs WHERE target_id = ? AND kind = 'document.extract'",
                    )
                    .get(result.document.id) as { count: number }
            ).count,
            1,
        );
    } finally {
        db.close();
        await rm(root, { recursive: true, force: true });
    }
});

test('document storage rejects misleading extensions and symbolic links', async () => {
    const root = await mkdtemp(join(tmpdir(), 'devledger-storage-security-'));
    const db = createDatabase();
    try {
        const misleading = join(root, 'not-a-pdf.pdf');
        await writeFile(misleading, 'This is not a PDF file.');
        const service = new DocumentStorageService(db as never, join(root, 'data'));
        await assert.rejects(() => service.importFromPath(misleading, 'p-1'), /PDF signature/i);
        const source = join(root, 'source.txt');
        const link = join(root, 'linked.txt');
        await writeFile(source, 'plain text');
        const { symlink } = await import('node:fs/promises');
        await symlink(source, link);
        await assert.rejects(() => service.importFromPath(link, 'p-1'), /symbolic-link/i);
    } finally {
        db.close();
        await rm(root, { recursive: true, force: true });
    }
});

test('document import removes a newly written object when the database transaction fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'devledger-storage-rollback-'));
    const db = createDatabase();
    try {
        const source = join(root, 'rollback.txt');
        await writeFile(source, 'A document whose database insert will fail.');
        db.exec(
            `CREATE TRIGGER fail_document_insert BEFORE INSERT ON documents BEGIN SELECT RAISE(ABORT, 'injected insert failure'); END;`,
        );
        const dataDirectory = join(root, 'data');
        const service = new DocumentStorageService(db as never, dataDirectory);
        await assert.rejects(() => service.importFromPath(source, 'p-1'), /injected insert failure/);
        const objectHash = createHash('sha256')
            .update('A document whose database insert will fail.')
            .digest('hex');
        const objectPath = join(dataDirectory, 'objects', objectHash.slice(0, 2), objectHash);
        const { access } = await import('node:fs/promises');
        await assert.rejects(() => access(objectPath));
        assert.equal(
            (db.prepare('SELECT count(*) AS count FROM documents').get() as { count: number }).count,
            0,
        );
        assert.equal(
            (db.prepare('SELECT count(*) AS count FROM background_jobs').get() as { count: number }).count,
            0,
        );
    } finally {
        db.close();
        await rm(root, { recursive: true, force: true });
    }
});

test('protected documents are encrypted at rest, excluded from extraction/search and decrypted only to a private temporary file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'devledger-storage-protected-'));
    const db = createDatabase();
    const vaultKey = Buffer.alloc(32, 0x5a);
    const plaintext = Buffer.from('VERY-PRIVATE-ATTACHMENT-CONTENT\nDo not index or expose this text.');
    try {
        const source = join(root, 'private.txt');
        await writeFile(source, plaintext);
        const dataDirectory = join(root, 'data');
        const service = new DocumentStorageService(db as never, dataDirectory, () => Buffer.from(vaultKey));
        const result = await service.importFromPath(source, 'p-1', true);
        assert.equal(result.document.encrypted, true);
        assert.equal(result.document.status, 'needs_attention');
        const stored = db
            .prepare(
                'SELECT object_relative_path, sha256, stored_sha256, is_encrypted, encryption_meta FROM documents WHERE id = ?',
            )
            .get(result.document.id) as {
            object_relative_path: string;
            sha256: string;
            stored_sha256: string;
            is_encrypted: number;
            encryption_meta: string;
        };
        assert.equal(stored.is_encrypted, 1);
        assert.equal(stored.sha256, createHash('sha256').update(plaintext).digest('hex'));
        assert.notEqual(stored.sha256, stored.stored_sha256);
        const encryptedBytes = await readFile(join(dataDirectory, stored.object_relative_path));
        assert.notDeepEqual(encryptedBytes, plaintext);
        assert.equal(encryptedBytes.includes(Buffer.from('VERY-PRIVATE-ATTACHMENT-CONTENT')), false);
        assert.equal(
            (
                db
                    .prepare(
                        "SELECT count(*) AS count FROM background_jobs WHERE target_id = ? AND kind = 'document.extract'",
                    )
                    .get(result.document.id) as { count: number }
            ).count,
            0,
        );

        db.prepare("UPDATE documents SET status = 'indexed', extracted_text = ? WHERE id = ?").run(
            'VERY-PRIVATE-ATTACHMENT-CONTENT',
            result.document.id,
        );
        assert.equal(
            (
                db
                    .prepare('SELECT count(*) AS count FROM document_search WHERE document_id = ?')
                    .get(result.document.id) as { count: number }
            ).count,
            0,
        );

        const lockedService = new DocumentStorageService(db as never, dataDirectory, () => {
            throw new Error('Vault is locked.');
        });
        await assert.rejects(
            () => lockedService.resolveDocumentForOpen(result.document.id, join(root, 'tmp')),
            /Vault is locked/,
        );

        const opened = await service.resolveDocumentForOpen(result.document.id, join(root, 'tmp'));
        assert.equal(opened.temporary, true);
        assert.deepEqual(await readFile(opened.path), plaintext);
        await service.cleanupDecryptedTemporaryFiles();
        await assert.rejects(() => readFile(opened.path));

        // The wrapped key's authenticated metadata binds it to the immutable document ID.
        const alteredId = '00000000-0000-4000-8000-000000000001';
        db.prepare('UPDATE documents SET id = ? WHERE id = ?').run(alteredId, result.document.id);
        await assert.rejects(
            () => service.resolveDocumentForOpen(alteredId, join(root, 'tmp')),
            /authenticate|damaged|invalid/i,
        );
    } finally {
        vaultKey.fill(0);
        db.close();
        await rm(root, { recursive: true, force: true });
    }
});
