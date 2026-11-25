import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { importNumber as number, importText as text } from './project-import-helpers.ts';
import type { ProjectImportRow } from './project-import-helpers.ts';

type Rows = ProjectImportRow[];
export interface ProjectImportWriteContext {
  sourceProject: ProjectImportRow;
  sourceProjectId: string;
  newProjectId: string;
  lockedNotesSkipped: number;
  contacts: Rows;
  projectContacts: Rows;
  normalNotes: Rows;
  tasks: Rows;
  documents: Rows;
  tags: Rows;
  entityTags: Rows;
  links: Rows;
  dependencies: Rows;
  timeEntries: Rows;
  blockers: Rows;
  reminders: Rows;
  activity: Rows;
  versions: Rows;
  idMap: Map<string, string>;
  tagIdMap: Map<string, string>;
  sourceIdsByType: Map<string, Set<string>>;
  documentObjects: Map<string, string>;
}

export function writeProjectRecords(db: Database.Database, context: ProjectImportWriteContext): void {
  const { sourceProject, newProjectId, lockedNotesSkipped, contacts, projectContacts, normalNotes, tasks, documents,
    tags, entityTags, links, dependencies, timeEntries, blockers, reminders, activity, versions, idMap, tagIdMap,
    sourceIdsByType, documentObjects } = context;
  const insertAll = db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO projects (id, name, description, type, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)`).run(newProjectId, `${text(sourceProject['name']).trim()} (Imported)`.slice(0, 160), text(sourceProject['description']), sourceProject['type'] === 'ongoing' ? 'ongoing' : 'greenfield', now, now);

    for (const contact of contacts) {
      const id = idMap.get(text(contact['id']));
      if (!id) continue;
      db.prepare(`INSERT INTO contacts (id, name, role, company, email, phone, notes, custom_attributes_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, text(contact['name'], 'Imported contact').slice(0, 160), text(contact['role'], 'other'),
        text(contact['company']), text(contact['email']), text(contact['phone']), text(contact['notes']), text(contact['custom_attributes_json'], '{}'),
        text(contact['created_at'], now), text(contact['updated_at'], now));
    }
    for (const association of projectContacts) {
      const contactId = idMap.get(text(association['contact_id']));
      if (!contactId) continue;
      db.prepare('INSERT OR IGNORE INTO project_contacts (project_id, contact_id, relationship_role, is_primary) VALUES (?, ?, ?, ?)')
        .run(newProjectId, contactId, text(association['relationship_role'], 'other'), number(association['is_primary']) ? 1 : 0);
    }
    for (const note of normalNotes) {
      const id = idMap.get(text(note['id']));
      if (!id) continue;
      db.prepare(`INSERT INTO notes (id, project_id, title, content, content_version, locked, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)`).run(id, newProjectId, text(note['title'], 'Imported note').slice(0, 240), text(note['content']),
        Math.max(1, number(note['content_version'], 1)), text(note['created_at'], now), text(note['updated_at'], now));
    }
    for (const task of tasks) {
      const id = idMap.get(text(task['id']));
      if (!id) continue;
      db.prepare(`INSERT INTO tasks (id, project_id, parent_id, title, description, status, priority, due_at, due_date, estimate_minutes, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, newProjectId, text(task['title'], 'Imported task').slice(0, 240), text(task['description']),
        ['not_started', 'in_progress', 'blocked', 'waiting', 'completed', 'cancelled'].includes(text(task['status'])) ? text(task['status']) : 'not_started',
        ['low', 'medium', 'high', 'urgent'].includes(text(task['priority'])) ? text(task['priority']) : 'medium',
        task['due_at'] === null ? null : text(task['due_at'], '') || null, task['due_date'] === null ? null : text(task['due_date'], '') || null,
        task['estimate_minutes'] === null ? null : number(task['estimate_minutes']), text(task['created_at'], now), text(task['updated_at'], now));
    }
    for (const task of tasks) {
      const id = idMap.get(text(task['id']));
      const parentId = task['parent_id'] ? idMap.get(text(task['parent_id'])) : null;
      if (id && parentId) db.prepare('UPDATE tasks SET parent_id = ? WHERE id = ?').run(parentId, id);
    }
    for (const document of documents) {
      const id = idMap.get(text(document['id']));
      if (!id) continue;
      const storedPath = documentObjects.get(text(document['id']));
      if (!storedPath) throw new Error('A document attachment was not copied into object storage.');
      const status = document['status'] === 'indexed' ? 'indexed' : 'queued';
      db.prepare(`INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes, sha256, object_relative_path, status, extracted_text, extraction_error, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`).run(id, newProjectId, text(document['title'], 'Imported document'),
        text(document['original_name'], 'document'), text(document['media_type'], 'application/octet-stream'), text(document['extension']),
        number(document['size_bytes']), text(document['sha256']), storedPath, status, text(document['extracted_text']), text(document['created_at'], now), text(document['updated_at'], now));
      if (status === 'queued') db.prepare(`INSERT INTO background_jobs (id, kind, target_type, target_id, priority, status, max_attempts, idempotency_key, created_at, updated_at)
        VALUES (?, 'document.extract', 'document', ?, 6, 'queued', 3, ?, ?, ?)`).run(randomUUID(), id, `project-import:${id}:${text(document['sha256'])}`, now, now);
    }
    for (const tag of tags) {
      const sourceId = text(tag['id']);
      const name = text(tag['name']).trim().slice(0, 64);
      if (!sourceId || !name) continue;
      const existing = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').get(name) as { id: string } | undefined;
      const id = existing?.id ?? randomUUID();
      if (!existing) db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(id, name, text(tag['color'], 'neutral'), text(tag['created_at'], now));
      tagIdMap.set(sourceId, id);
    }
    const mapEntity = (type: string, sourceId: string): string | undefined => {
      if (!sourceIdsByType.get(type)?.has(sourceId)) return undefined;
      return type === 'project' ? newProjectId : idMap.get(sourceId);
    };
    for (const entityTag of entityTags) {
      const entityType = text(entityTag['entity_type']);
      const entityId = mapEntity(entityType, text(entityTag['entity_id']));
      const tagId = tagIdMap.get(text(entityTag['tag_id']));
      if (entityId && tagId && ['project', 'contact', 'note', 'task', 'document'].includes(entityType)) {
        db.prepare('INSERT OR IGNORE INTO entity_tags (tag_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?)')
          .run(tagId, entityType, entityId, text(entityTag['created_at'], now));
      }
    }
    for (const dependency of dependencies) {
      const taskId = idMap.get(text(dependency['task_id']));
      const dependsOn = idMap.get(text(dependency['depends_on_task_id']));
      if (taskId && dependsOn && taskId !== dependsOn) db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, created_at) VALUES (?, ?, ?)')
        .run(taskId, dependsOn, text(dependency['created_at'], now));
    }
    for (const entry of timeEntries) {
      const taskId = idMap.get(text(entry['task_id']));
      if (!taskId) continue;
      const startedAt = text(entry['started_at'], now);
      const endedAt = text(entry['ended_at'], now);
      const duration = entry['duration_seconds'] === null || entry['duration_seconds'] === undefined
        ? Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000)) : Math.max(0, number(entry['duration_seconds']));
      db.prepare(`INSERT INTO time_entries (id, task_id, started_at, ended_at, duration_seconds, note, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)`).run(randomUUID(), taskId, startedAt, endedAt, duration, text(entry['note']), text(entry['created_at'], now));
    }
    for (const blocker of blockers) {
      const taskId = idMap.get(text(blocker['task_id']));
      if (!taskId) continue;
      const waitingContact = blocker['waiting_contact_id'] ? idMap.get(text(blocker['waiting_contact_id'])) ?? null : null;
      db.prepare(`INSERT INTO task_blockers (id, task_id, reason, waiting_contact_id, follow_up_at, created_at, resolved_at, resolution_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), taskId, text(blocker['reason'], 'Imported blocker').slice(0, 4000), waitingContact,
        blocker['follow_up_at'] ? text(blocker['follow_up_at']) : null, text(blocker['created_at'], now), blocker['resolved_at'] ? text(blocker['resolved_at']) : null, text(blocker['resolution_note']));
    }
    for (const reminder of reminders) {
      const entityType = text(reminder['entity_type']);
      const entityId = mapEntity(entityType, text(reminder['entity_id']));
      if (!entityId || !['task', 'project', 'contact', 'note'].includes(entityType)) continue;
      db.prepare(`INSERT INTO reminders (id, entity_type, entity_id, due_at, status, message, last_delivered_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), entityType, entityId, text(reminder['due_at'], now),
        ['scheduled', 'delivered', 'snoozed', 'dismissed', 'cancelled'].includes(text(reminder['status'])) ? text(reminder['status']) : 'scheduled',
        text(reminder['message']), reminder['last_delivered_at'] ? text(reminder['last_delivered_at']) : null, text(reminder['created_at'], now), text(reminder['updated_at'], now));
    }
    for (const event of activity) {
      const entityType = text(event['entity_type']);
      const entityId = mapEntity(entityType, text(event['entity_id']));
      if (!entityId) continue;
      db.prepare(`INSERT INTO activity_events (id, entity_type, entity_id, event_type, summary, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), entityType, entityId, text(event['event_type'], 'imported'),
        text(event['summary'], 'Imported project history'), text(event['metadata_json'], '{}'), text(event['created_at'], now));
    }
    for (const version of versions) {
      const noteId = idMap.get(text(version['note_id']));
      if (!noteId) continue;
      db.prepare('INSERT OR IGNORE INTO note_versions (id, note_id, content_version, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), noteId, Math.max(1, number(version['content_version'], 1)), text(version['title']), text(version['content']), text(version['created_at'], now));
    }
    for (const link of links) {
      const sourceType = text(link['source_type']);
      const targetType = text(link['target_type']);
      const sourceId = mapEntity(sourceType, text(link['source_id']));
      const targetId = mapEntity(targetType, text(link['target_id']));
      if (!['project', 'contact', 'note', 'task', 'document'].includes(sourceType) || !['project', 'contact', 'note', 'task', 'document'].includes(targetType)) continue;
      if (!sourceId || !targetId || sourceId === targetId) continue;
      db.prepare(`INSERT OR IGNORE INTO entity_links (id, source_type, source_id, target_type, target_id, relationship, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), sourceType, sourceId, targetType, targetId, text(link['relationship'], 'related'), text(link['created_at'], now));
    }
    db.prepare(`INSERT INTO activity_events (id, entity_type, entity_id, event_type, summary, metadata_json, created_at)
      VALUES (?, 'project', ?, 'imported', ?, '{}', ?)`).run(randomUUID(), newProjectId, `Imported project copy; ${lockedNotesSkipped} locked note(s) skipped`, now);
  });
  insertAll.immediate();
}
