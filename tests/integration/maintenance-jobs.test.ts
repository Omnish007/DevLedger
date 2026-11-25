import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import {
    auditLocalDocumentStorage,
    optimizeLocalDatabase,
    rebuildLocalSearchIndexes,
} from '../../src/main/services/maintenance-jobs.ts';
import { addTransactionAdapter } from './sqlite-transaction-adapter.ts';

function fixtureDatabase() {
    const db = addTransactionAdapter(new DatabaseSync(':memory:'));
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
        'p-1',
        'Maintenance project',
        'greenfield',
        now,
        now,
    );
    db.prepare(
        'INSERT INTO notes (id, project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('n-1', 'p-1', 'Search repair note', 'repairable local search content', now, now);
    db.prepare(
        'INSERT INTO notes (id, project_id, title, content, locked, encrypted_payload, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
    ).run('n-locked', 'p-1', 'Protected search note', '', Buffer.from('ciphertext'), now, now);
    return db;
}

function context(signal = new AbortController().signal) {
    const reports: Array<Record<string, unknown>> = [];
    return {
        value: { signal, progress: (report: Record<string, unknown>) => reports.push(report) },
        reports,
    };
}

test('search-index repair rebuilds FTS records without exposing locked notes', async () => {
    const db = fixtureDatabase();
    try {
        db.prepare('DELETE FROM note_search').run();
        const task = context();
        const result = await rebuildLocalSearchIndexes(db as never, task.value);
        assert.deepEqual(result, { indexesRebuilt: 5 });
        const hits = db
            .prepare("SELECT note_id FROM note_search WHERE note_search MATCH 'repairable'")
            .all() as Array<{ note_id: string }>;
        assert.deepEqual(
            hits.map((row) => row.note_id),
            ['n-1'],
        );
        assert.ok(task.reports.some((report) => report.current === 'semantic_chunk_search'));
    } finally {
        db.close();
    }
});

test('search-index repair batches large indexes and mirrors writes during the rebuild', async () => {
    const db = fixtureDatabase();
    try {
        const now = new Date().toISOString();
        const insert = db.prepare(`INSERT INTO notes (id, project_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`);
        for (let index = 0; index < 405; index += 1) {
            const id = `bulk-${String(index).padStart(4, '0')}`;
            insert.run(id, 'p-1', `Bulk note ${index}`, `initialtoken content ${index}`, now, now);
        }

        const task = context();
        let changedDuringBuild = false;
        const progress = task.value.progress;
        task.value.progress = (report) => {
            progress(report);
            if (!changedDuringBuild && report.current === 'note_search' && report.scanned === 200) {
                changedDuringBuild = true;
                db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
                    'Live update',
                    'refreshedtoken content',
                    now,
                    'bulk-0000',
                );
                insert.run('zzz-live-note', 'p-1', 'Late arriving note', 'latearrival token', now, now);
            }
        };

        const result = await rebuildLocalSearchIndexes(db as never, task.value);
        assert.deepEqual(result, { indexesRebuilt: 5 });
        assert.equal(changedDuringBuild, true);
        assert.equal(
            db
                .prepare("SELECT count(*) AS total FROM note_search WHERE note_search MATCH 'refreshedtoken'")
                .get()?.total,
            1,
        );
        assert.equal(
            db
                .prepare("SELECT count(*) AS total FROM note_search WHERE note_search MATCH 'latearrival'")
                .get()?.total,
            1,
        );
        assert.equal(
            db
                .prepare("SELECT count(*) AS total FROM note_search WHERE note_search MATCH 'initialtoken'")
                .get()?.total,
            404,
        );
        assert.ok(task.reports.some((report) => report.current === 'note_search' && report.scanned === 200));
        assert.ok(task.reports.some((report) => report.current === 'note_search' && report.scanned >= 400));
        insert.run('post-rebuild-note', 'p-1', 'Post rebuild note', 'postrebuildtoken content', now, now);
        assert.equal(
            db
                .prepare(
                    "SELECT count(*) AS total FROM note_search WHERE note_search MATCH 'postrebuildtoken'",
                )
                .get()?.total,
            1,
        );
        db.prepare(
            `INSERT INTO tasks (id, project_id, title, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
        ).run('post-rebuild-task', 'p-1', 'Post rebuild task', 'taskposttoken', now, now);
        db.prepare(
            `INSERT INTO contacts (id, name, company, role, email, phone, notes, custom_attributes_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            'post-rebuild-contact',
            'After rebuild contact',
            'DevLedger',
            'engineer',
            '',
            '',
            '',
            '{"stack":"contactposttoken"}',
            now,
            now,
        );
        db.prepare(
            `INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes, sha256,
      object_relative_path, status, extracted_text, created_at, updated_at, is_encrypted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ).run(
            'post-rebuild-document',
            'p-1',
            'Post rebuild document',
            'rebuild.txt',
            'text/plain',
            '.txt',
            1,
            'unused-test-digest',
            'objects/rebuild.txt',
            'indexed',
            'documentposttoken',
            now,
            now,
        );
        db.prepare(
            `INSERT INTO semantic_chunks (id, source_type, source_id, project_id, chunk_index, title, content, excerpt,
      source_updated_at, content_hash, model, generation_id, dimensions, vector_json, indexed_at)
      VALUES (?, 'task', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?)`,
        ).run(
            'post-rebuild-chunk',
            'post-rebuild-task',
            'p-1',
            'Semantic title',
            'semanticposttoken',
            'semanticposttoken',
            now,
            'test-hash',
            'test-model',
            'test-generation',
            '[0.1,0.2]',
            now,
        );
        assert.equal(
            db
                .prepare("SELECT count(*) AS total FROM task_search WHERE task_search MATCH 'taskposttoken'")
                .get()?.total,
            1,
        );
        assert.equal(
            db
                .prepare(
                    "SELECT count(*) AS total FROM contact_search WHERE contact_search MATCH 'contactposttoken'",
                )
                .get()?.total,
            1,
        );
        assert.equal(
            db
                .prepare(
                    "SELECT count(*) AS total FROM document_search WHERE document_search MATCH 'documentposttoken'",
                )
                .get()?.total,
            1,
        );
        assert.equal(
            db
                .prepare(
                    "SELECT count(*) AS total FROM semantic_chunk_search WHERE semantic_chunk_search MATCH 'semanticposttoken'",
                )
                .get()?.total,
            1,
        );
    } finally {
        db.close();
    }
});

test('cancelled search-index repair keeps the previous live index intact and removes staging state', async () => {
    const db = fixtureDatabase();
    try {
        const now = new Date().toISOString();
        const insert = db.prepare(`INSERT INTO notes (id, project_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`);
        for (let index = 0; index < 205; index += 1) {
            const id = `cancel-${String(index).padStart(4, '0')}`;
            insert.run(id, 'p-1', `Cancellation note ${index}`, `cancellationtoken ${index}`, now, now);
        }
        const controller = new AbortController();
        const task = context(controller.signal);
        const progress = task.value.progress;
        task.value.progress = (report) => {
            progress(report);
            if (report.current === 'note_search' && report.scanned === 200)
                controller.abort(new Error('cancel rebuild test'));
        };

        await assert.rejects(rebuildLocalSearchIndexes(db as never, task.value), /cancel rebuild test/);
        assert.equal(
            db.prepare("SELECT count(*) AS total FROM note_search WHERE note_search MATCH 'repairable'").get()
                ?.total,
            1,
        );
        assert.equal(
            db
                .prepare(
                    "SELECT count(*) AS total FROM note_search WHERE note_search MATCH 'cancellationtoken'",
                )
                .get()?.total,
            205,
        );
        assert.equal(
            db
                .prepare(
                    "SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'note_search_rebuild'",
                )
                .get()?.total,
            0,
        );

        // Temporary mirror triggers must also be gone after cancellation.
        insert.run('after-cancel', 'p-1', 'After cancellation', 'postcancel token', now, now);
        assert.equal(
            db.prepare("SELECT count(*) AS total FROM note_search WHERE note_search MATCH 'postcancel'").get()
                ?.total,
            1,
        );
    } finally {
        db.close();
    }
});

test('storage audit verifies hashes, reports tampering and observes cancellation', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'devledger-storage-audit-'));
    const db = fixtureDatabase();
    t.after(async () => {
        await rm(root, { recursive: true, force: true });
        db.close();
    });
    await mkdir(join(root, 'objects'), { recursive: true });
    const object = join(root, 'objects', 'record.txt');
    const contents = Buffer.from('local stored object');
    await writeFile(object, contents);
    const digest = createHash('sha256').update(contents).digest('hex');
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes, sha256,
    object_relative_path, status, extracted_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        'd-1',
        'p-1',
        'Audit object',
        'record.txt',
        'text/plain',
        '.txt',
        contents.length,
        digest,
        'objects/record.txt',
        'indexed',
        '',
        now,
        now,
    );
    const first = await auditLocalDocumentStorage(db as never, root, context().value);
    assert.deepEqual(
        { total: first.total, verified: first.verified, issues: first.issues.length },
        { total: 1, verified: 1, issues: 0 },
    );

    await writeFile(object, 'tampered object');
    const second = await auditLocalDocumentStorage(db as never, root, context().value);
    assert.equal(second.verified, 0);
    assert.equal(second.issues[0]?.documentId, 'd-1');
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));
    await assert.rejects(
        auditLocalDocumentStorage(db as never, root, context(controller.signal).value),
        /test cancellation/,
    );
});

test('SQLite maintenance optimizer delegates bounded statistics work to PRAGMA optimize', () => {
    const db = fixtureDatabase();
    try {
        const task = context();
        assert.deepEqual(optimizeLocalDatabase(db as never, task.value), { optimized: true });
        assert.deepEqual(task.reports, [{ phase: 'sqlite-optimized' }]);
    } finally {
        db.close();
    }
});

test('storage audit keyset-pages large document metadata and bounds stored issue details', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'devledger-storage-audit-pages-'));
    const db = fixtureDatabase();
    t.after(async () => {
        await rm(root, { recursive: true, force: true });
        db.close();
    });
    const insert =
        db.prepare(`INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes, sha256,
    object_relative_path, status, extracted_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const now = new Date().toISOString();
    for (let index = 0; index < 505; index += 1) {
        const id = `audit-${String(index).padStart(4, '0')}`;
        insert.run(
            id,
            'p-1',
            `Missing object ${index}`,
            `${id}.txt`,
            'text/plain',
            '.txt',
            1,
            'expected-hash',
            `objects/missing-${id}.txt`,
            'indexed',
            '',
            now,
            now,
        );
    }
    const task = context();
    const result = await auditLocalDocumentStorage(db as never, root, task.value);
    assert.equal(result.total, 505);
    assert.equal(result.verified, 0);
    assert.equal(result.issueCount, 505);
    assert.equal(result.issues.length, 500);
    assert.equal(result.issuesTruncated, true);
    assert.ok(task.reports.some((report) => report.checked === 200));
    assert.ok(task.reports.some((report) => report.checked === 400));
    assert.ok(task.reports.some((report) => report.checked === 505));
});
