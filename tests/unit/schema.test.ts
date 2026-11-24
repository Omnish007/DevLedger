import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS } from '../../src/main/database/schema.ts';

test('all schema migrations execute and FTS5 triggers maintain searchable records', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
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
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, CURRENT_SCHEMA_VERSION);

    const now = new Date().toISOString();
    db.prepare(`INSERT INTO projects (id, name, description, type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run('project-1', 'Retail POS', 'Point of sale rollout', 'greenfield', now, now);
    db.prepare(`INSERT INTO notes (id, project_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run('note-1', 'project-1', 'Architecture decision', 'Use SQLite FTS5 for exact technical retrieval.', now, now);
    assert.equal(db.prepare(`SELECT count(*) AS n FROM note_search WHERE note_search MATCH ?`).get('"SQLite"')?.n, 1);

    db.prepare(`UPDATE notes SET locked = 1, title = 'Locked note', content = '', encrypted_payload = ?, encryption_meta = ? WHERE id = ?`)
      .run(Buffer.from('ciphertext'), JSON.stringify({ nonce: 'AA==', tag: 'AA==', version: 1 }), 'note-1');
    assert.equal(db.prepare('SELECT count(*) AS n FROM note_search').get()?.n, 0);

    db.prepare(`INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run('task-1', 'project-1', 'Integrate payment gateway', now, now);
    assert.equal(db.prepare(`SELECT count(*) AS n FROM task_search WHERE task_search MATCH ?`).get('"payment"')?.n, 1);

    db.prepare(`INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes, sha256,
      object_relative_path, status, extracted_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('document-1', 'project-1', 'Scope', 'scope.txt', 'text/plain', '.txt', 12, '0'.repeat(64),
        'objects/00/example', 'indexed', 'The scope includes inventory reconciliation.', now, now);
    assert.equal(db.prepare(`SELECT count(*) AS n FROM document_search WHERE document_search MATCH ?`).get('"inventory"')?.n, 1);

    assert.equal((db.prepare('PRAGMA foreign_key_check').all()).length, 0);
  } finally {
    db.close();
  }
});
