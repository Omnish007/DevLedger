import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceService } from '../../src/main/services/workspace.ts';
import { WorkspaceOperationsService } from '../../src/main/services/operations.ts';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { addTransactionAdapter } from './sqlite-transaction-adapter.ts';

function createWorkspaceDb(): DatabaseSync {
  const db = addTransactionAdapter(new DatabaseSync(':memory:'));
  db.exec('PRAGMA foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(migration.sql);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO projects (id, name, status, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('p-1', 'Core Platform', 'active', 'greenfield', now, now);
  db.prepare('INSERT INTO notes (id, project_id, title, content, locked, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)').run('n-1', 'p-1', 'Release Checklist', '<p>Verify backups.</p>', now, now);
  db.prepare("INSERT INTO notes (id, project_id, title, content, locked, encrypted_payload, created_at, updated_at) VALUES (?, ?, 'Hidden secret', '', 1, ?, ?, ?)").run('n-locked', 'p-1', '{}', now, now);
  db.prepare("INSERT INTO tasks (id, project_id, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'not_started', ?, ?)").run('t-1', 'p-1', 'Configure replication', 'Setup replica lag alerts.', now, now);
  db.prepare("INSERT INTO tasks (id, project_id, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_progress', ?, ?)").run('t-2', 'p-1', 'Audit backup manifest', 'SHA-256 check', now, now);
  db.prepare("INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes, sha256, object_relative_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'application/pdf', '.pdf', 100, ?, 'objects/aa/bb', 'indexed', ?, ?)")
    .run('d-1', 'p-1', 'Architecture Spec', 'arch-spec.pdf', 'a'.repeat(64), now, now);
  db.prepare('INSERT INTO contacts (id, name, role, company, email, phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('c-1', 'Aarav Patel', 'client', 'Acme', '', '', '', now, now);
  return db;
}

test('resolveRecordSummaries resolves human labels across all entity types while shielding locked notes', () => {
  const db = createWorkspaceDb();
  try {
    const ops = new WorkspaceOperationsService(db as never);
    const summaries = ops.resolveRecordSummaries([
      { type: 'project', id: 'p-1' },
      { type: 'note', id: 'n-1' },
      { type: 'note', id: 'n-locked' },
      { type: 'task', id: 't-1' },
      { type: 'document', id: 'd-1' },
      { type: 'contact', id: 'c-1' },
    ]);
    assert.equal(summaries['project:p-1']?.title, 'Core Platform');
    assert.equal(summaries['note:n-1']?.title, 'Release Checklist');
    assert.equal(summaries['note:n-locked']?.title, 'Locked note');
    assert.equal(summaries['task:t-1']?.title, 'Configure replication');
    assert.equal(summaries['document:d-1']?.title, 'Architecture Spec');
    assert.equal(summaries['contact:c-1']?.title, 'Aarav Patel');
  } finally { db.close(); }
});

test('scoped listBlockersPage and listRemindersPage filter accurately per entity', () => {
  const db = createWorkspaceDb();
  try {
    const ops = new WorkspaceOperationsService(db as never);
    ops.createBlocker('t-1', 'Waiting for firewall', null, null);
    ops.createBlocker('t-2', 'Waiting for signoff', null, null);
    ops.createReminder('task', 't-1', new Date(Date.now() + 60_000).toISOString(), 'Ping infra');
    ops.createReminder('note', 'n-1', new Date(Date.now() + 120_000).toISOString(), 'Review note');

    const t1Blockers = ops.listBlockersPage({ taskId: 't-1' });
    assert.equal(t1Blockers.total, 1);
    assert.equal(t1Blockers.items[0]?.reason, 'Waiting for firewall');

    const noteReminders = ops.listRemindersPage({ entityType: 'note', entityId: 'n-1' });
    assert.equal(noteReminders.total, 1);
    assert.equal(noteReminders.items[0]?.message, 'Review note');
  } finally { db.close(); }
});

test('listTasksPage supports mid-word title substrings alongside FTS description matching', () => {
  const db = createWorkspaceDb();
  try {
    const workspace = new WorkspaceService(db as never);
    assert.deepEqual(workspace.listTasksPage({ query: 'plica' }).items.map((t) => t.id), ['t-1']);
    assert.deepEqual(workspace.listTasksPage({ query: 'SHA-256' }).items.map((t) => t.id), ['t-2']);
    assert.equal(workspace.listTasksPage({ query: '%' }).total, 0);
  } finally { db.close(); }
});

test('heartbeatActiveTimer updates an open timer and safely no-ops after database close', () => {
  const db = createWorkspaceDb();
  const workspace = new WorkspaceService(db as never);
  workspace.startTimer('t-1');
  const firstHeartbeat = '2026-11-25T17:15:00.000Z';
  workspace.heartbeatActiveTimer(firstHeartbeat);
  assert.equal(workspace.getActiveTimer()?.lastHeartbeatAt, firstHeartbeat);
  db.close();
  assert.doesNotThrow(() => workspace.heartbeatActiveTimer('2026-11-25T17:16:00.000Z'));
});
