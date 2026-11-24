import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export type NotificationFilter = 'all' | 'unread' | 'read' | 'dismissed';
export interface InboxNotification {
  id: string;
  reminderId: string | null;
  entityType: 'task' | 'project' | 'contact' | 'note' | 'system';
  entityId: string | null;
  kind: 'reminder' | 'backup' | 'system';
  title: string;
  body: string;
  status: 'unread' | 'read' | 'dismissed';
  createdAt: string;
  deliveredAt: string;
  readAt: string | null;
  dismissedAt: string | null;
}

type Row = Record<string, unknown>;
const entityTables = { task: { table: 'tasks', label: 'title' }, project: { table: 'projects', label: 'name' }, contact: { table: 'contacts', label: 'name' }, note: { table: 'notes', label: 'title' } } as const;
const now = () => new Date().toISOString();

function mapNotification(row: Row): InboxNotification {
  return {
    id: String(row.id), reminderId: row.reminder_id ? String(row.reminder_id) : null,
    entityType: row.entity_type as InboxNotification['entityType'], entityId: row.entity_id ? String(row.entity_id) : null,
    kind: row.kind as InboxNotification['kind'], title: String(row.title), body: String(row.body),
    status: row.status as InboxNotification['status'], createdAt: String(row.created_at), deliveredAt: String(row.delivered_at),
    readAt: row.read_at ? String(row.read_at) : null, dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
  };
}

/** Durable inbox records are committed even when native OS notifications are unavailable. */
export class NotificationInboxService {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  processDueReminders(at = now(), requestedLimit = 100): { notifications: InboxNotification[]; hasMore: boolean } {
    const limit = Math.min(100, Math.max(1, Math.trunc(requestedLimit)));
    const deliver = this.db.transaction(() => {
      const due = this.db.prepare("SELECT * FROM reminders WHERE status IN ('scheduled', 'snoozed') AND due_at <= ? ORDER BY due_at ASC, id ASC LIMIT ?").all(at, limit) as Row[];
      const created: string[] = [];
      for (const reminder of due) {
        const reminderId = String(reminder.id);
        const dueAt = String(reminder.due_at);
        const key = `reminder:${reminderId}:${dueAt}`;
        const entityType = String(reminder.entity_type) as keyof typeof entityTables;
        const entityId = String(reminder.entity_id);
        const entityTitle = this.getEntityTitle(entityType, entityId);
        const title = 'Reminder due';
        const body = String(reminder.message || `${entityTitle} needs your attention.`).slice(0, 1000);
        const result = this.db.prepare(`INSERT OR IGNORE INTO notifications
          (id, idempotency_key, reminder_id, entity_type, entity_id, kind, title, body, status, created_at, delivered_at)
          VALUES (?, ?, ?, ?, ?, 'reminder', ?, ?, 'unread', ?, ?)`)
          .run(randomUUID(), key, reminderId, entityType, entityId, title, body, at, at);
        if (result.changes) created.push(key);
        this.db.prepare("UPDATE reminders SET status = 'delivered', last_delivered_at = ?, updated_at = ? WHERE id = ? AND status IN ('scheduled', 'snoozed')")
          .run(at, at, reminderId);
      }
      return created;
    });
    const keys = deliver.immediate() as string[];
    const notifications = keys.map((key) => mapNotification(this.db.prepare('SELECT * FROM notifications WHERE idempotency_key = ?').get(key) as Row));
    const hasMore = Boolean(this.db.prepare("SELECT 1 FROM reminders WHERE status IN ('scheduled', 'snoozed') AND due_at <= ? LIMIT 1").get(at));
    return { notifications, hasMore };
  }

  createSystemNotification(kind: 'backup' | 'system', title: string, body: string, idempotencyKey: string): void {
    const timestamp = now();
    this.db.prepare(`INSERT OR IGNORE INTO notifications
      (id, idempotency_key, entity_type, kind, title, body, status, created_at, delivered_at)
      VALUES (?, ?, 'system', ?, ?, ?, 'unread', ?, ?)`)
      .run(randomUUID(), idempotencyKey, kind, title.slice(0, 160), body.slice(0, 2000), timestamp, timestamp);
  }

  list(filter: NotificationFilter = 'all', limit = 100, before?: { createdAt: string; id: string }): InboxNotification[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const filters: string[] = [];
    const params: unknown[] = [];
    if (filter !== 'all') { filters.push('status = ?'); params.push(filter); }
    if (before) { filters.push('(created_at < ? OR (created_at = ? AND id < ?))'); params.push(before.createdAt, before.createdAt, before.id); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM notifications ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).all(...params, safeLimit) as Row[];
    return rows.map(mapNotification);
  }

  unreadCount(): number {
    const row = this.db.prepare("SELECT count(*) AS count FROM notifications WHERE status = 'unread'").get() as { count: number };
    return Number(row.count);
  }

  markRead(id: string): void {
    const result = this.db.prepare("UPDATE notifications SET status = 'read', read_at = ? WHERE id = ? AND status = 'unread'").run(now(), id);
    if (!result.changes) throw new Error('Unread notification not found.');
  }

  snooze(id: string, minutes: 15 | 60 | 240 | 1440): void {
    if (![15, 60, 240, 1440].includes(minutes)) throw new Error('Choose a supported snooze duration.');
    const snoozeAt = new Date(Date.now() + minutes * 60_000).toISOString();
    const timestamp = now();
    const action = this.db.transaction(() => {
      const notification = this.db.prepare('SELECT reminder_id, status FROM notifications WHERE id = ?').get(id) as { reminder_id: string | null; status: string } | undefined;
      if (!notification?.reminder_id) throw new Error('Only reminder notifications can be snoozed.');
      const reminder = this.db.prepare('SELECT id, status FROM reminders WHERE id = ?').get(notification.reminder_id) as { id: string; status: string } | undefined;
      if (!reminder || reminder.status !== 'delivered') throw new Error('This reminder is no longer available to snooze.');
      this.db.prepare("UPDATE reminders SET status = 'snoozed', due_at = ?, updated_at = ? WHERE id = ?").run(snoozeAt, timestamp, reminder.id);
      this.db.prepare("UPDATE notifications SET status = 'read', read_at = ? WHERE id = ? AND status IN ('unread', 'read')").run(timestamp, id);
    });
    action.immediate();
  }

  dismiss(id: string): void {
    const result = this.db.prepare("UPDATE notifications SET status = 'dismissed', dismissed_at = ? WHERE id = ? AND status IN ('unread', 'read')").run(now(), id);
    if (!result.changes) throw new Error('Notification not found or already dismissed.');
  }

  markAllRead(): number {
    return this.db.prepare("UPDATE notifications SET status = 'read', read_at = ? WHERE status = 'unread'").run(now()).changes;
  }

  private getEntityTitle(type: keyof typeof entityTables, id: string): string {
    const source = entityTables[type];
    const row = this.db.prepare(`SELECT ${source.label} AS label FROM ${source.table} WHERE id = ?`).get(id) as { label?: string } | undefined;
    return row?.label || `${type} record`;
  }
}

export function backupNotificationKey(error: string, date = new Date()): string {
  const digest = createHash('sha256').update(error).digest('hex').slice(0, 16);
  return `backup-error:${date.toISOString().slice(0, 10)}:${digest}`;
}
