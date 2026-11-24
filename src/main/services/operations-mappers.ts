import type Database from 'better-sqlite3';
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
    id: String(row.id), sourceType: row.source_type as EntityType, sourceId: String(row.source_id),
    targetType: row.target_type as EntityType, targetId: String(row.target_id),
    relationship: String(row.relationship), createdAt: String(row.created_at), direction,
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
