import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { importProjectSnapshot } from '../../src/main/services/project-import.ts';
import { addTransactionAdapter } from './sqlite-transaction-adapter.ts';

function createDatabase(): DatabaseSync {
  const db = addTransactionAdapter(new DatabaseSync(':memory:'));
  db.exec('PRAGMA foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(migration.sql);
  return db;
}

test('project import restores a remapped copy with relationships, contacts, tasks, notes, history and attachments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devledger-project-import-'));
  const db = createDatabase();
  try {
    const attachmentRoot = join(root, 'attachments');
    await mkdir(attachmentRoot, { recursive: true });
    const attachment = Buffer.from('# Imported project document\nScope and milestones.\n');
    const digest = createHash('sha256').update(attachment).digest('hex');
    await writeFile(join(attachmentRoot, 'source-spec.md'), attachment);
    const now = new Date().toISOString();
    const exportData = {
      project: { id: 'src-project', name: 'Retail POS', description: 'Imported project', type: 'ongoing' },
      contacts: [{ id: 'src-contact', name: 'Asha Patel', role: 'client', company: 'Acme', email: 'asha@example.test', phone: '', notes: '', custom_attributes_json: '{"Environment":"Staging"}', created_at: now, updated_at: now }],
      projectContacts: [{ project_id: 'src-project', contact_id: 'src-contact', relationship_role: 'client', is_primary: 1 }],
      notes: [
        { id: 'src-note', title: 'Kickoff notes', content: 'Client approved the staging plan.', locked: 0, content_version: 2, created_at: now, updated_at: now },
        { id: 'src-locked-note', title: 'Encrypted credentials', content: '', locked: 1, encrypted_payload_base64: 'not-restored', created_at: now, updated_at: now },
      ],
      tasks: [
        { id: 'src-task-parent', title: 'Implement checkout', description: '', status: 'in_progress', priority: 'high', due_at: null, due_date: '2026-12-01', estimate_minutes: 180, parent_id: null, created_at: now, updated_at: now },
        { id: 'src-task-child', title: 'Add payment validation', description: '', status: 'blocked', priority: 'urgent', due_at: null, due_date: null, estimate_minutes: 45, parent_id: 'src-task-parent', created_at: now, updated_at: now },
      ],
      documents: [{ id: 'src-document', title: 'Scope', original_name: 'scope.md', media_type: 'text/markdown', extension: '.md', size_bytes: attachment.length, sha256: digest, status: 'indexed', extracted_text: 'Scope and milestones.', created_at: now, updated_at: now }],
      attachments: [{ id: 'src-document', path: 'attachments/source-spec.md' }],
      tags: [{ id: 'src-tag', name: 'scope-doc', color: 'neutral', created_at: now }],
      entityTags: [
        { tag_id: 'src-tag', entity_type: 'project', entity_id: 'src-project', created_at: now },
        { tag_id: 'src-tag', entity_type: 'task', entity_id: 'src-task-parent', created_at: now },
      ],
      links: [{ source_type: 'note', source_id: 'src-note', target_type: 'task', target_id: 'src-task-parent', relationship: 'tracks', created_at: now }],
      taskDependencies: [{ task_id: 'src-task-child', depends_on_task_id: 'src-task-parent', created_at: now }],
      timeEntries: [{ task_id: 'src-task-parent', started_at: new Date(Date.now() - 3600_000).toISOString(), ended_at: now, duration_seconds: 3600, note: 'Implementation', created_at: now }],
      blockers: [{ task_id: 'src-task-child', reason: 'Waiting for payment sandbox', waiting_contact_id: 'src-contact', follow_up_at: null, created_at: now, resolved_at: null, resolution_note: '' }],
      reminders: [{ entity_type: 'task', entity_id: 'src-task-child', due_at: new Date(Date.now() + 3600_000).toISOString(), status: 'scheduled', message: 'Follow up', created_at: now, updated_at: now }],
      activity: [{ entity_type: 'project', entity_id: 'src-project', event_type: 'decision', summary: 'Scope approved', metadata_json: '{}', created_at: now }],
      noteVersions: [{ note_id: 'src-note', content_version: 1, title: 'Early notes', content: 'Initial draft', created_at: now }],
    };

    const result = await importProjectSnapshot(db as never, join(root, 'app-data'), exportData, root);
    assert.equal(result.projectName, 'Retail POS (Imported)');
    assert.equal(result.lockedNotesSkipped, 1);
    assert.deepEqual(result.imported, { contacts: 1, notes: 1, tasks: 2, documents: 1, tags: 1, links: 1, timeEntries: 1, reminders: 1 });

    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(result.projectId) as { id: string; name: string };
    assert.notEqual(project.id, 'src-project');
    assert.equal(project.name, 'Retail POS (Imported)');
    const contact = db.prepare('SELECT id, custom_attributes_json FROM contacts WHERE name = ?').get('Asha Patel') as { id: string; custom_attributes_json: string };
    assert.deepEqual(JSON.parse(contact.custom_attributes_json), { Environment: 'Staging' });
    assert.equal((db.prepare('SELECT count(*) AS n FROM project_contacts WHERE project_id = ? AND contact_id = ?').get(result.projectId, contact.id) as { n: number }).n, 1);

    const tasks = db.prepare('SELECT id, title, parent_id, due_date FROM tasks WHERE project_id = ? ORDER BY title').all(result.projectId) as Array<{ id: string; title: string; parent_id: string | null; due_date: string | null }>;
    const parent = tasks.find((task) => task.title === 'Implement checkout')!;
    const child = tasks.find((task) => task.title === 'Add payment validation')!;
    assert.equal(child.parent_id, parent.id);
    assert.equal(parent.due_date, '2026-12-01');
    assert.equal((db.prepare('SELECT count(*) AS n FROM notes WHERE project_id = ? AND locked = 1').get(result.projectId) as { n: number }).n, 0);
    assert.equal((db.prepare('SELECT count(*) AS n FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?').get(child.id, parent.id) as { n: number }).n, 1);
    assert.equal((db.prepare('SELECT count(*) AS n FROM task_blockers WHERE task_id = ? AND resolved_at IS NULL').get(child.id) as { n: number }).n, 1);

    const document = db.prepare('SELECT object_relative_path, status FROM documents WHERE project_id = ?').get(result.projectId) as { object_relative_path: string; status: string };
    assert.equal(document.status, 'indexed');
    const stored = await readFile(join(root, 'app-data', document.object_relative_path));
    assert.deepEqual(stored, attachment);
    assert.equal((db.prepare('SELECT count(*) AS n FROM note_versions WHERE note_id = (SELECT id FROM notes WHERE project_id = ?)').get(result.projectId) as { n: number }).n, 1);
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('project import rejects unsafe task-parent cycles before writing records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devledger-project-import-cycle-'));
  const db = createDatabase();
  try {
    const exportData = {
      project: { id: 'cycle-project', name: 'Cycle project', type: 'greenfield' },
      tasks: [
        { id: 'task-a', title: 'A', parent_id: 'task-b' },
        { id: 'task-b', title: 'B', parent_id: 'task-a' },
      ],
    };
    await assert.rejects(() => importProjectSnapshot(db as never, root, exportData, root), /cycle/i);
    assert.equal((db.prepare("SELECT count(*) AS n FROM projects WHERE name LIKE '%Imported%' ").get() as { n: number }).n, 0);
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
