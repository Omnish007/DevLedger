import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';

test('migrated workspace records survive close/reopen and remain FTS searchable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'devledger-sqlite-test-'));
    const file = join(directory, 'workspace.sqlite');
    try {
        let db = new DatabaseSync(file);
        db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
        for (const migration of MIGRATIONS) {
            db.exec('BEGIN IMMEDIATE');
            try {
                db.exec(migration.sql);
                db.exec(`PRAGMA user_version = ${migration.version}`);
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
        }
        const now = new Date().toISOString();
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('p-1', 'Local migration project', 'ongoing', now, now);
        db.prepare(
            'INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('t-1', 'p-1', 'Verify persistence after restart', now, now);
        db.close();

        db = new DatabaseSync(file);
        db.exec('PRAGMA foreign_keys = ON');
        assert.equal(
            db.prepare('SELECT name FROM projects WHERE id = ?').get('p-1')?.name,
            'Local migration project',
        );
        assert.equal(
            db.prepare('SELECT count(*) AS n FROM task_search WHERE task_search MATCH ?').get('"persistence"')
                ?.n,
            1,
        );
        assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
        db.close();
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
