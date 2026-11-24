import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { exportEntityIndex, projectExportRows } from '../../src/main/services/project-export-data.ts';
import { addTransactionAdapter } from './sqlite-transaction-adapter.ts';

function createDatabase(): DatabaseSync {
  const db = addTransactionAdapter(new DatabaseSync(':memory:'));
  db.exec('PRAGMA foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(migration.sql);
  return db;
}

async function collect(db: DatabaseSync, projectId: string, kind: string): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for await (const row of projectExportRows(db as never, projectId, kind)) rows.push(row);
  return rows;
}

test('project export query registry selects only the project graph and excludes protected records', async () => {
  const db = createDatabase();
  try {
    const now = new Date().toISOString();
    const insertProject = db.prepare('INSERT INTO projects(id,name,type,created_at,updated_at) VALUES(?,?,?,?,?)');
    insertProject.run('p1', 'Project one', 'greenfield', now, now);
    insertProject.run('p2', 'Project two', 'ongoing', now, now);
    const insertContact = db.prepare('INSERT INTO contacts(id,name,created_at,updated_at) VALUES(?,?,?,?)');
    insertContact.run('c1', 'Contact one', now, now);
    insertContact.run('c2', 'Contact two', now, now);
    db.prepare('INSERT INTO project_contacts(project_id,contact_id) VALUES(?,?)').run('p1', 'c1');
    db.prepare('INSERT INTO project_contacts(project_id,contact_id) VALUES(?,?)').run('p2', 'c2');

    const insertNote = db.prepare('INSERT INTO notes(id,project_id,title,content,locked,encrypted_payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
    insertNote.run('n1', 'p1', 'Public note', 'Body', 0, null, now, now);
    insertNote.run('n-locked', 'p1', 'Protected note', '', 1, Buffer.from('ciphertext'), now, now);
    insertNote.run('n2', 'p2', 'Other note', 'Other', 0, null, now, now);
    db.prepare('INSERT INTO note_versions(id,note_id,content_version,title,content,created_at) VALUES(?,?,?,?,?,?)').run('v1', 'n1', 1, 'Earlier title', 'Earlier body', now);

    const insertTask = db.prepare('INSERT INTO tasks(id,project_id,title,created_at,updated_at) VALUES(?,?,?,?,?)');
    insertTask.run('t1', 'p1', 'Task one', now, now);
    insertTask.run('t2', 'p1', 'Task two', now, now);
    insertTask.run('t3', 'p2', 'Other task', now, now);
    db.prepare('INSERT INTO task_dependencies(task_id,depends_on_task_id,created_at) VALUES(?,?,?)').run('t2', 't1', now);
    db.prepare('INSERT INTO time_entries(id,task_id,started_at,ended_at,duration_seconds,created_at) VALUES(?,?,?,?,?,?)').run('time-1', 't1', now, now, 60, now);
    db.prepare('INSERT INTO task_blockers(id,task_id,reason,created_at) VALUES(?,?,?,?)').run('block-1', 't1', 'Waiting', now);

    const insertDocument = db.prepare(`INSERT INTO documents(id,project_id,title,original_name,media_type,extension,size_bytes,sha256,object_relative_path,status,created_at,updated_at,is_encrypted)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insertDocument.run('d1', 'p1', 'Doc one', 'one.txt', 'text/plain', '.txt', 1, 'a'.repeat(64), 'objects/a', 'indexed', now, now, 0);
    insertDocument.run('d-enc', 'p1', 'Private doc', 'private.txt', 'text/plain', '.txt', 1, 'b'.repeat(64), 'objects/b', 'indexed', now, now, 1);
    insertDocument.run('d2', 'p2', 'Other doc', 'other.txt', 'text/plain', '.txt', 1, 'c'.repeat(64), 'objects/c', 'indexed', now, now, 0);

    db.prepare('INSERT INTO tags(id,name,created_at) VALUES(?,?,?)').run('tag1', 'Project tag', now);
    db.prepare('INSERT INTO tags(id,name,created_at) VALUES(?,?,?)').run('tag2', 'Other tag', now);
    const insertTag = db.prepare('INSERT INTO entity_tags(tag_id,entity_type,entity_id,created_at) VALUES(?,?,?,?)');
    for (const [type, id] of [['project', 'p1'], ['contact', 'c1'], ['note', 'n1'], ['task', 't1'], ['document', 'd1']] as const) insertTag.run('tag1', type, id, now);
    insertTag.run('tag2', 'task', 't3', now);

    const insertLink = db.prepare('INSERT INTO entity_links(id,source_type,source_id,target_type,target_id,relationship,created_at) VALUES(?,?,?,?,?,?,?)');
    insertLink.run('link1', 'note', 'n1', 'task', 't1', 'tracks', now);
    insertLink.run('link-external', 'task', 't3', 'note', 'n1', 'external', now);
    db.prepare('INSERT INTO reminders(id,entity_type,entity_id,due_at,message,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('rem1', 'task', 't1', now, 'Reminder', now, now);
    db.prepare('INSERT INTO reminders(id,entity_type,entity_id,due_at,message,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('rem2', 'task', 't3', now, 'Other reminder', now, now);
    db.prepare('INSERT INTO activity_events(id,entity_type,entity_id,event_type,summary,created_at) VALUES(?,?,?,?,?,?)').run('act1', 'project', 'p1', 'created', 'Project created', now);
    db.prepare('INSERT INTO activity_events(id,entity_type,entity_id,event_type,summary,created_at) VALUES(?,?,?,?,?,?)').run('act2', 'project', 'p2', 'created', 'Other created', now);

    exportEntityIndex(db as never, 'p1');
    const counts: Record<string, number> = {};
    for (const kind of ['contacts', 'projectContacts', 'notes', 'tasks', 'documents', 'entityTags', 'tags', 'links', 'taskDependencies', 'timeEntries', 'blockers', 'reminders', 'activity', 'versions']) {
      counts[kind] = (await collect(db, 'p1', kind)).length;
    }
    assert.deepEqual(counts, {
      contacts: 1, projectContacts: 1, notes: 1, tasks: 2, documents: 1, entityTags: 5, tags: 1,
      links: 1, taskDependencies: 1, timeEntries: 1, blockers: 1, reminders: 1, activity: 1, versions: 1,
    });
    assert.equal((await collect(db, 'p1', 'notes'))[0]?.id, 'n1');
    assert.equal((await collect(db, 'p1', 'documents'))[0]?.id, 'd1');
    assert.equal((await collect(db, 'p1', 'links'))[0]?.id, 'link1');
    await assert.rejects(async () => collect(db, 'p1', 'unsupported'), /Unsupported project export query/);
  } finally {
    db.close();
  }
});
