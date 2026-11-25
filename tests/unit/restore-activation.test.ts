import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    stageRestoreCopy,
    promoteStagedRestore,
    recoverInterruptedRestore,
    rollbackPromotedRestore,
    commitPromotedRestore,
    validateRestoreObjectStore,
} from '../../src/main/services/restore-activation.ts';

async function exists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}
async function fixture() {
    const data = await mkdtemp(join(tmpdir(), 'devledger-restore-test-'));
    const restore = join(data, 'restore-copies', 'restore-test');
    await mkdir(join(restore, 'objects'), { recursive: true });
    await mkdir(join(data, 'objects'), { recursive: true });
    await writeFile(join(data, 'northstar.sqlite'), 'live-db');
    await writeFile(join(data, 'objects', 'live-object'), 'live-object');
    await writeFile(join(restore, 'northstar.sqlite'), 'restored-db');
    await writeFile(join(restore, 'objects', 'restored-object'), 'restored-object');
    return { data, restore };
}

test('restore promotion is staged, switches the database and objects, then commits', async () => {
    const { data, restore } = await fixture();
    try {
        await stageRestoreCopy(
            data,
            restore,
            async () => undefined,
            async () => undefined,
        );
        assert.equal(await readFile(join(data, 'northstar.sqlite'), 'utf8'), 'live-db');
        assert.equal(await promoteStagedRestore(data, async () => undefined), true);
        assert.equal(await readFile(join(data, 'northstar.sqlite'), 'utf8'), 'restored-db');
        assert.equal(await readFile(join(data, 'objects', 'restored-object'), 'utf8'), 'restored-object');
        assert.equal(await recoverInterruptedRestore(data), 'awaiting-validation');
        await commitPromotedRestore(data);
        assert.equal(await exists(join(data, '.restore-activation.json')), false);
        assert.equal(await exists(join(data, '.restore-rollback')), true);
    } finally {
        await rm(data, { recursive: true, force: true });
    }
});

test('a promoted restore can be rolled back to the previous live workspace', async () => {
    const { data, restore } = await fixture();
    try {
        await stageRestoreCopy(
            data,
            restore,
            async () => undefined,
            async () => undefined,
        );
        await promoteStagedRestore(data, async () => undefined);
        await rollbackPromotedRestore(data);
        assert.equal(await readFile(join(data, 'northstar.sqlite'), 'utf8'), 'live-db');
        assert.equal(await readFile(join(data, 'objects', 'live-object'), 'utf8'), 'live-object');
        assert.equal(await exists(join(data, '.restore-activation.json')), false);
    } finally {
        await rm(data, { recursive: true, force: true });
    }
});

test('an interrupted mid-promotion is automatically rolled back on startup', async () => {
    const { data, restore } = await fixture();
    try {
        await stageRestoreCopy(
            data,
            restore,
            async () => undefined,
            async () => undefined,
        );
        await promoteStagedRestore(data, async () => undefined);
        // Simulate restart after promotion has started but before success marker is persisted.
        const markerPath = join(data, '.restore-activation.json');
        const marker = JSON.parse(await readFile(markerPath, 'utf8')) as { phase: string };
        marker.phase = 'promoting';
        await writeFile(markerPath, JSON.stringify(marker));
        assert.equal(await recoverInterruptedRestore(data), 'rolled-back');
        assert.equal(await readFile(join(data, 'northstar.sqlite'), 'utf8'), 'live-db');
        assert.equal(await readFile(join(data, 'objects', 'live-object'), 'utf8'), 'live-object');
    } finally {
        await rm(data, { recursive: true, force: true });
    }
});

test('restore activation rejects paths outside restore-copies', async () => {
    const { data } = await fixture();
    try {
        await assert.rejects(
            stageRestoreCopy(data, join(data, 'northstar.sqlite')),
            /inside DevLedger restore-copies/,
        );
    } finally {
        await rm(data, { recursive: true, force: true });
    }
});

test('restore validation verifies referenced object bytes before activation', async () => {
    const { data, restore } = await fixture();
    const databasePath = join(restore, 'northstar.sqlite');
    const objectPath = join(restore, 'objects', 'protected.blob');
    const content = Buffer.from('encrypted attachment bytes');
    const digest = createHash('sha256').update(content).digest('hex');
    let db: DatabaseSync | undefined;
    try {
        await writeFile(objectPath, content);
        await rm(databasePath, { force: true });
        db = new DatabaseSync(databasePath);
        db.exec(
            'CREATE TABLE documents (id TEXT PRIMARY KEY, object_relative_path TEXT, sha256 TEXT, stored_sha256 TEXT, deleted_at TEXT)',
        );
        db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, NULL)').run(
            'doc-protected',
            'objects/protected.blob',
            'plaintext-hash-not-used',
            digest,
        );
        db.close();
        db = undefined;
        await validateRestoreObjectStore(databasePath, restore, (path) => new DatabaseSync(path) as never);
        await writeFile(objectPath, 'tampered bytes');
        await assert.rejects(
            () =>
                validateRestoreObjectStore(databasePath, restore, (path) => new DatabaseSync(path) as never),
            /checksum/i,
        );
    } finally {
        db?.close();
        await rm(data, { recursive: true, force: true });
    }
});

test('restore validation keyset-pages large document libraries in bounded batches', async () => {
    const { data, restore } = await fixture();
    const databasePath = join(restore, 'northstar.sqlite');
    const objectsDirectory = join(restore, 'objects');
    const content = Buffer.from('restore object payload');
    const digest = createHash('sha256').update(content).digest('hex');
    let db: DatabaseSync | undefined;
    const pageLengths: number[] = [];
    try {
        await rm(databasePath, { force: true });
        db = new DatabaseSync(databasePath);
        db.exec(
            'CREATE TABLE documents (id TEXT PRIMARY KEY, object_relative_path TEXT, sha256 TEXT, stored_sha256 TEXT, deleted_at TEXT)',
        );
        const insert = db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, NULL)');
        for (let index = 0; index < 405; index += 1) {
            const id = `doc-${String(index).padStart(4, '0')}`;
            const relativePath = `objects/${id}.blob`;
            await writeFile(join(objectsDirectory, `${id}.blob`), content);
            insert.run(id, relativePath, digest, null);
        }
        db.close();
        db = undefined;
        await validateRestoreObjectStore(databasePath, restore, (path) => {
            const opened = new DatabaseSync(path);
            return {
                prepare(sql: string) {
                    const statement = opened.prepare(sql);
                    return {
                        all(...parameters: unknown[]) {
                            const rows = statement.all(...parameters);
                            pageLengths.push(rows.length);
                            return rows;
                        },
                    };
                },
                close() {
                    opened.close();
                },
            } as never;
        });
        assert.deepEqual(pageLengths, [200, 200, 5, 0]);
    } finally {
        db?.close();
        await rm(data, { recursive: true, force: true });
    }
});

test('restore validation rejects document object paths outside the object store', async () => {
    const { data, restore } = await fixture();
    const databasePath = join(restore, 'northstar.sqlite');
    let db: DatabaseSync | undefined;
    try {
        await rm(databasePath, { force: true });
        db = new DatabaseSync(databasePath);
        db.exec(
            'CREATE TABLE documents (id TEXT PRIMARY KEY, object_relative_path TEXT, sha256 TEXT, stored_sha256 TEXT, deleted_at TEXT)',
        );
        db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, NULL)').run(
            'doc-unsafe',
            '../escape.bin',
            'a'.repeat(64),
            null,
        );
        db.close();
        db = undefined;
        await assert.rejects(
            () =>
                validateRestoreObjectStore(databasePath, restore, (path) => new DatabaseSync(path) as never),
            /unsafe document object path/i,
        );
    } finally {
        db?.close();
        await rm(data, { recursive: true, force: true });
    }
});
