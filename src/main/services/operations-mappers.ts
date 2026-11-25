import type Database from 'better-sqlite3';
import type { RecordSummary } from '../../shared/contracts.js';
import type { EntityType, EntityLinkRecord, TaskBlockerRecord, ReminderRecord } from './operations-shared.ts';
import { ENTITY_TYPES, mapBlocker, mapReminder } from './operations-shared.ts';

const TABLE_BY_ENTITY: Record<EntityType, string> = {
  project: 'projects', note: 'notes', task: 'tasks', document: 'documents', contact: 'contacts',
};

export function assertEntityExists(db: Database.Database, type: string, id: string): void {
  if (!ENTITY_TYPES.has(type as EntityType)) throw new Error('Unsupported linked record type.');
  const table = TABLE_BY_ENTITY[type as EntityType];
  if (!db.prepare(`SELECT id FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(id)) {
    throw new Error(`${type} record not found.`);
  }
}

export function mapLink(row: Record<string, unknown>, direction: 'outgoing' | 'incoming'): EntityLinkRecord {
  return {
    id: String(row['id']), sourceType: row['source_type'] as EntityType, sourceId: String(row['source_id']),
    targetType: row['target_type'] as EntityType, targetId: String(row['target_id']),
    relationship: String(row['relationship']), createdAt: String(row['created_at']), direction,
  };
}

export function getBlocker(db: Database.Database, id: string): TaskBlockerRecord {
  const row = db.prepare('SELECT * FROM task_blockers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Blocker not found.');
  return mapBlocker(row);
}

export function getReminder(db: Database.Database, id: string): ReminderRecord {
  const row = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Reminder not found.');
  return mapReminder(row);
}

export function resolveRecordSummaries(db: Database.Database, refs: Array<{ type: EntityType; id: string }>): Record<string, RecordSummary> {
  const grouped = new Map<EntityType, Set<string>>();
  for (const ref of refs.slice(0, 200)) {
    if (!ENTITY_TYPES.has(ref.type) || !ref.id) continue;
    let bucket = grouped.get(ref.type);
    if (!bucket) { bucket = new Set(); grouped.set(ref.type, bucket); }
    bucket.add(ref.id);
  }
  const result: Record<string, RecordSummary> = {};
  const queryRows = (type: EntityType, sql: (placeholders: string) => string, mapRow: (row: Record<string, unknown>) => RecordSummary) => {
    const ids = [...(grouped.get(type) ?? [])];
    if (!ids.length) return;
    const rows = db.prepare(sql(ids.map(() => '?').join(','))).all(...ids) as Array<Record<string, unknown>>;
    for (const row of rows) result[`${type}:${String(row['id'])}`] = mapRow(row);
  };
  queryRows('project', (ph) => `SELECT id, name, status FROM projects WHERE id IN (${ph}) AND deleted_at IS NULL`,
    (row) => ({ id: String(row['id']), type: 'project', title: String(row['name']), subtitle: String(row['status'] ?? '').replaceAll('_', ' '), projectId: String(row['id']) }));
  queryRows('note', (ph) => `SELECT id, title, locked, project_id FROM notes WHERE id IN (${ph}) AND deleted_at IS NULL`,
    (row) => {
      const locked = Boolean(row['locked']);
      return { id: String(row['id']), type: 'note', title: locked ? 'Locked note' : (String(row['title'] ?? '') || 'Untitled note'), subtitle: locked ? 'Protected note' : 'Note', projectId: row['project_id'] ? String(row['project_id']) : null };
    });
  queryRows('task', (ph) => `SELECT id, title, status, project_id FROM tasks WHERE id IN (${ph}) AND deleted_at IS NULL`,
    (row) => ({ id: String(row['id']), type: 'task', title: String(row['title']), subtitle: String(row['status'] ?? '').replaceAll('_', ' '), projectId: row['project_id'] ? String(row['project_id']) : null }));
  queryRows('document', (ph) => `SELECT id, title, original_name, extension, project_id FROM documents WHERE id IN (${ph}) AND deleted_at IS NULL`,
    (row) => ({ id: String(row['id']), type: 'document', title: String(row['title'] || row['original_name'] || 'Document'), subtitle: String(row['extension'] ?? '').replace('.', '').toUpperCase() || 'Document', projectId: row['project_id'] ? String(row['project_id']) : null }));
  queryRows('contact', (ph) => `SELECT id, name, role, company FROM contacts WHERE id IN (${ph}) AND deleted_at IS NULL`,
    (row) => ({ id: String(row['id']), type: 'contact', title: String(row['name']), subtitle: [row['role'], row['company']].filter(Boolean).map((item) => String(item).replaceAll('_', ' ')).join(' · ') || 'Contact', projectId: null }));
  return result;
}
