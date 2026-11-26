import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { normalizePage } from '../../domain/pagination.ts';
import type { PageResult } from '../../shared/contracts.js';
import { assertEntityExists, getReminder } from './operations-mappers.ts';
import { REMINDER_TYPES, type ReminderRecord, mapReminder, now } from './operations-shared.ts';

export function createEntityReminder(
    db: Database.Database,
    entityType: ReminderRecord['entityType'],
    entityId: string,
    dueAt: string,
    message = '',
): ReminderRecord {
    if (!REMINDER_TYPES.has(entityType)) throw new Error('Unsupported reminder target.');
    assertEntityExists(db, entityType, entityId);
    if (!Number.isFinite(Date.parse(dueAt))) throw new Error('Reminder date is invalid.');
    const id = randomUUID();
    const timestamp = now();
    db.prepare(
        `INSERT INTO reminders (id, entity_type, entity_id, due_at, status, message, created_at, updated_at) VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?)`,
    ).run(
        id,
        entityType,
        entityId,
        new Date(dueAt).toISOString(),
        message.trim().slice(0, 500),
        timestamp,
        timestamp,
    );
    return getReminder(db, id);
}

export function listEntityRemindersPage(
    db: Database.Database,
    input: {
        entityType?: ReminderRecord['entityType'] | undefined;
        entityId?: string | undefined;
        status?: ReminderRecord['status'] | undefined;
        limit?: number | undefined;
        offset?: number | undefined;
    } = {},
): PageResult<ReminderRecord> {
    const page = normalizePage(input);
    const clauses = [input.status ? 'status = ?' : "status IN ('scheduled', 'snoozed', 'delivered')"];
    const parameters: unknown[] = input.status ? [input.status] : [];
    if (input.entityType) {
        clauses.push('entity_type = ?');
        parameters.push(input.entityType);
    }
    if (input.entityId) {
        clauses.push('entity_id = ?');
        parameters.push(input.entityId);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const total = Number(
        (
            db.prepare(`SELECT count(*) AS total FROM reminders ${where}`).get(...parameters) as {
                total: number;
            }
        ).total,
    );
    const items = (
        db
            .prepare(`SELECT * FROM reminders ${where} ORDER BY due_at ASC, id ASC LIMIT ? OFFSET ?`)
            .all(...parameters, page.limit, page.offset) as Array<Record<string, unknown>>
    ).map(mapReminder);
    return {
        items,
        total,
        limit: page.limit,
        offset: page.offset,
        hasMore: page.offset + items.length < total,
    };
}

export function updateEntityReminder(
    db: Database.Database,
    id: string,
    action: 'snooze' | 'dismiss' | 'reschedule' | 'cancel',
    dueAt?: string,
    snoozeMinutes: 15 | 60 | 240 | 1440 = 60,
): ReminderRecord {
    const current = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as
        Record<string, unknown> | undefined;
    if (!current) throw new Error('Reminder not found.');
    const timestamp = now();
    if (action === 'reschedule') {
        if (!dueAt || !Number.isFinite(Date.parse(dueAt)))
            throw new Error('A valid new reminder date is required.');
        db.prepare("UPDATE reminders SET due_at = ?, status = 'scheduled', updated_at = ? WHERE id = ?").run(
            new Date(dueAt).toISOString(),
            timestamp,
            id,
        );
    } else if (action === 'snooze') {
        // Snoozing must move the due time, otherwise the scheduler would deliver it again immediately.
        if (![15, 60, 240, 1440].includes(snoozeMinutes))
            throw new Error('Choose a supported snooze duration.');
        const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000).toISOString();
        db.prepare("UPDATE reminders SET status = 'snoozed', due_at = ?, updated_at = ? WHERE id = ?").run(
            snoozedUntil,
            timestamp,
            id,
        );
    } else {
        const status = action === 'dismiss' ? 'dismissed' : 'cancelled';
        db.prepare('UPDATE reminders SET status = ?, updated_at = ? WHERE id = ?').run(status, timestamp, id);
    }
    return getReminder(db, id);
}

export function markEntityReminderDelivered(db: Database.Database, id: string): void {
    const timestamp = now();
    db.prepare(
        "UPDATE reminders SET status = 'delivered', last_delivered_at = ?, updated_at = ? WHERE id = ? AND status IN ('scheduled', 'snoozed')",
    ).run(timestamp, timestamp, id);
}
