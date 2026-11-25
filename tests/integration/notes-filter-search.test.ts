import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceNotesService } from '../../src/main/services/workspace/notes.ts';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { addTransactionAdapter } from './sqlite-transaction-adapter.ts';

function createNotesDb(): DatabaseSync {
  const db = addTransactionAdapter(new DatabaseSync(':memory:'));
  db.exec('PRAGMA foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(migration.sql);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('p-1', 'Core Platform', 'greenfield', now, now);
  db.prepare('INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('p-2', 'Mobile App', 'ongoing', now, now);
  db.prepare('INSERT INTO notes (id, project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('n-1', 'p-1', 'Release Readiness Checklist', '<p>Verify database backups before rollout.</p>', now, now);
  db.prepare('INSERT INTO notes (id, project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('n-2', 'p-1', 'API timeout triage', '<p>Applied exponential backoff for gateway calls.</p>', now, now);
  db.prepare('INSERT INTO notes (id, project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('n-3', 'p-2', 'Weekly Sync', '<p>Discussed release schedule.</p>', now, now);
  db.prepare("INSERT INTO notes (id, project_id, title, content, locked, encrypted_payload, created_at, updated_at) VALUES (?, ?, 'Locked note', '', 1, ?, ?, ?)").run('n-locked', 'p-1', JSON.stringify({ secret: 'topsecret_ciphertext' }), now, now);
  return db;
}

test('listNotesPage filters reliably across title substrings, single chars, special chars and FTS body terms', () => {
  const db = createNotesDb();
  try {
    const notes = new WorkspaceNotesService(db as never);

    const midWord = notes.listNotesPage({ query: 'adiness' });
    assert.deepEqual(midWord.items.map((item) => item.id), ['n-1']);

    const singleChar = notes.listNotesPage({ query: 'w' });
    assert.deepEqual(singleChar.items.map((item) => item.id), ['n-3']);

    const bodyMatch = notes.listNotesPage({ query: 'backoff' });
    assert.deepEqual(bodyMatch.items.map((item) => item.id), ['n-2']);

    const scoped = notes.listNotesPage({ query: 'release', projectId: 'p-1' });
    assert.deepEqual(scoped.items.map((item) => item.id), ['n-1']);

    const wildcardSafe = notes.listNotesPage({ query: '%' });
    assert.equal(wildcardSafe.total, 0);

    const lockedLeak = notes.listNotesPage({ query: 'topsecret', includeLocked: true });
    assert.equal(lockedLeak.total, 0);
  } finally {
    db.close();
  }
});
