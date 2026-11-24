import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { addTransactionAdapter } from './sqlite-transaction-adapter.ts';
import { WorkspaceService } from '../../src/main/services/workspace.ts';

function createDatabase(): DatabaseSync {
  const db = addTransactionAdapter(new DatabaseSync(':memory:'));
  db.exec('PRAGMA foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(migration.sql);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('contact-attributes-project', 'Contact attributes project', 'ongoing', now, now);
  return db;
}

test('contact custom attributes persist, remain bounded, update and are full-text searchable', () => {
  const db = createDatabase();
  try {
    const service = new WorkspaceService(db as never);
    const created = service.createContact({
      name: 'Asha Patel',
      role: 'client',
      projectId: 'contact-attributes-project',
      customAttributes: { Environment: 'Staging cluster', Contract: 'Annual renewal' },
    });
    assert.deepEqual(created.customAttributes, { Environment: 'Staging cluster', Contract: 'Annual renewal' });

    const fts = db.prepare("SELECT contact_id FROM contact_search WHERE contact_search MATCH ?").all('"Staging cluster"') as Array<{ contact_id: string }>;
    assert.deepEqual(fts.map((row) => row.contact_id), [created.id]);

    const updated = service.updateContact(created.id, { customAttributes: { Environment: 'Production cluster' } });
    assert.deepEqual(updated.customAttributes, { Environment: 'Production cluster' });
    const remaining = db.prepare("SELECT contact_id FROM contact_search WHERE contact_search MATCH ?").all('"Production cluster"') as Array<{ contact_id: string }>;
    assert.deepEqual(remaining.map((row) => row.contact_id), [created.id]);

    const stored = db.prepare('SELECT custom_attributes_json FROM contacts WHERE id = ?').get(created.id) as { custom_attributes_json: string };
    assert.deepEqual(JSON.parse(stored.custom_attributes_json), { Environment: 'Production cluster' });
  } finally {
    db.close();
  }
});

test('contact custom attributes discard invalid, oversized and non-string values safely', () => {
  const db = createDatabase();
  try {
    const service = new WorkspaceService(db as never);
    const created = service.createContact({
      name: 'Invalid attributes',
      customAttributes: {
        '  Valid key  ': '  Valid value  ',
        ' ': 'ignored',
        number: 42 as never,
        oversized: 'x'.repeat(900),
      },
    });
    assert.deepEqual(created.customAttributes, { 'Valid key': 'Valid value', oversized: 'x'.repeat(500) });
  } finally {
    db.close();
  }
});
