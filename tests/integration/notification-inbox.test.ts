import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { NotificationInboxService } from '../../src/main/services/notification-inbox.ts';
import { addTransactionAdapter } from './sqlite-transaction-adapter.ts';

function createDatabase(): DatabaseSync {
    const db = addTransactionAdapter(new DatabaseSync(':memory:'));
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    return db;
}

test('due reminders become durable, idempotent inbox notifications even without OS delivery', () => {
    const db = createDatabase();
    try {
        const timestamp = '2026-11-23T10:00:00.000Z';
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('project-inbox', 'Inbox project', 'ongoing', timestamp, timestamp);
        db.prepare(
            'INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('task-inbox', 'project-inbox', 'Prepare release', timestamp, timestamp);
        db.prepare(
            `INSERT INTO reminders (id, entity_type, entity_id, due_at, status, message, created_at, updated_at)
      VALUES (?, 'task', ?, ?, 'scheduled', ?, ?, ?)`,
        ).run(
            'reminder-inbox',
            'task-inbox',
            '2026-11-23T09:00:00.000Z',
            'Prepare the release checklist',
            timestamp,
            timestamp,
        );
        const inbox = new NotificationInboxService(db as never);
        const delivered = inbox.processDueReminders('2026-11-23T10:00:00.000Z');
        assert.equal(delivered.notifications.length, 1);
        assert.equal(delivered.hasMore, false);
        assert.equal(delivered.notifications[0]?.body, 'Prepare the release checklist');
        assert.equal(inbox.unreadCount(), 1);
        assert.equal(inbox.processDueReminders('2026-11-23T10:01:00.000Z').notifications.length, 0);
        assert.equal(inbox.list('unread').length, 1);
        inbox.markRead(delivered.notifications[0]!.id);
        assert.equal(inbox.list('read').length, 1);
        assert.equal(inbox.unreadCount(), 0);
        inbox.dismiss(delivered.notifications[0]!.id);
        assert.equal(inbox.list('all').length, 0);
        assert.equal(inbox.list('dismissed').length, 1);
    } finally {
        db.close();
    }
});

test('snoozed reminder gets a new idempotent inbox item when it becomes due again', () => {
    const db = createDatabase();
    try {
        const timestamp = '2026-11-23T10:00:00.000Z';
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('project-snooze', 'Snooze project', 'ongoing', timestamp, timestamp);
        db.prepare(
            'INSERT INTO reminders (id, entity_type, entity_id, due_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run('reminder-snooze', 'project', 'project-snooze', timestamp, 'scheduled', timestamp, timestamp);
        const inbox = new NotificationInboxService(db as never);
        assert.equal(inbox.processDueReminders(timestamp).notifications.length, 1);
        db.prepare("UPDATE reminders SET status = 'snoozed', due_at = ?, updated_at = ? WHERE id = ?").run(
            '2026-11-23T11:00:00.000Z',
            timestamp,
            'reminder-snooze',
        );
        assert.equal(inbox.processDueReminders('2026-11-23T11:00:00.000Z').notifications.length, 1);
        assert.equal(inbox.list('all').length, 2);
        assert.equal(inbox.markAllRead(), 2);
        assert.equal(inbox.unreadCount(), 0);
    } finally {
        db.close();
    }
});

test('snoozing an inbox reminder schedules it again and clears unread state', () => {
    const db = createDatabase();
    try {
        const timestamp = new Date(Date.now() - 60_000).toISOString();
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('project-inbox-snooze', 'Inbox snooze project', 'ongoing', timestamp, timestamp);
        db.prepare(
            'INSERT INTO reminders (id, entity_type, entity_id, due_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
            'reminder-inbox-snooze',
            'project',
            'project-inbox-snooze',
            timestamp,
            'scheduled',
            timestamp,
            timestamp,
        );
        const inbox = new NotificationInboxService(db as never);
        const { notifications: delivered } = inbox.processDueReminders(new Date().toISOString());
        const notification = delivered[0];
        assert.ok(notification);
        inbox.snooze(notification.id, 15);
        assert.equal(inbox.unreadCount(), 0);
        assert.equal(inbox.list('read').length, 1);
        const reminder = db
            .prepare('SELECT status, due_at FROM reminders WHERE id = ?')
            .get('reminder-inbox-snooze') as { status: string; due_at: string };
        assert.equal(reminder.status, 'snoozed');
        assert.ok(Date.parse(reminder.due_at) > Date.now());
        assert.throws(() => inbox.snooze(notification.id, 60), /no longer available/);
    } finally {
        db.close();
    }
});

test('notification history supports stable keyset pagination without duplicates', () => {
    const db = createDatabase();
    try {
        const inbox = new NotificationInboxService(db as never);
        for (let index = 0; index < 7; index += 1) {
            inbox.createSystemNotification(
                'system',
                `Notification ${index}`,
                'History item',
                `history:${index}`,
            );
        }
        const first = inbox.list('all', 3);
        assert.equal(first.length, 3);
        const last = first.at(-1)!;
        const second = inbox.list('all', 3, { createdAt: last.createdAt, id: last.id });
        assert.equal(second.length, 3);
        assert.equal(new Set([...first, ...second].map((item) => item.id)).size, 6);
        assert.ok(first.at(-1)!.createdAt >= second[0]!.createdAt);
        const third = inbox.list('all', 3, { createdAt: second.at(-1)!.createdAt, id: second.at(-1)!.id });
        assert.equal(third.length, 1);
    } finally {
        db.close();
    }
});

test('due reminder delivery is bounded and exposes remaining work for continuation', () => {
    const db = createDatabase();
    try {
        const timestamp = '2026-11-23T10:00:00.000Z';
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('project-batch', 'Batch delivery', 'ongoing', timestamp, timestamp);
        const insert =
            db.prepare(`INSERT INTO reminders (id, entity_type, entity_id, due_at, status, message, created_at, updated_at)
      VALUES (?, 'project', ?, ?, 'scheduled', '', ?, ?)`);
        for (let index = 0; index < 245; index += 1) {
            insert.run(
                `reminder-batch-${String(index).padStart(3, '0')}`,
                'project-batch',
                timestamp,
                timestamp,
                timestamp,
            );
        }
        const inbox = new NotificationInboxService(db as never);
        const first = inbox.processDueReminders(timestamp, 100);
        assert.equal(first.notifications.length, 100);
        assert.equal(first.hasMore, true);
        const second = inbox.processDueReminders(timestamp, 100);
        assert.equal(second.notifications.length, 100);
        assert.equal(second.hasMore, true);
        const third = inbox.processDueReminders(timestamp, 100);
        assert.equal(third.notifications.length, 45);
        assert.equal(third.hasMore, false);
        assert.equal(inbox.unreadCount(), 245);
        assert.equal(
            inbox.processDueReminders(timestamp).notifications.length,
            0,
            're-running delivery is idempotent',
        );
    } finally {
        db.close();
    }
});
