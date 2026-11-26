import type Database from 'better-sqlite3';
import { NotificationInboxService, type InboxNotification } from './services/notification-inbox.js';

type NotifyReminders = (notifications: InboxNotification[]) => void;

export class ReminderDeliveryController {
    private delivering = false;
    private stopped = false;
    private continuation: NodeJS.Timeout | null = null;
    private nextTimer: NodeJS.Timeout | null = null;

    private readonly db: Database.Database;
    private readonly inbox: NotificationInboxService;
    private readonly notify: NotifyReminders;
    private readonly isShuttingDown: () => boolean;

    constructor(db: Database.Database, notify: NotifyReminders, isShuttingDown: () => boolean) {
        this.db = db;
        this.inbox = new NotificationInboxService(db);
        this.notify = notify;
        this.isShuttingDown = isShuttingDown;
    }

    scheduleNext = (): void => {
        if (this.nextTimer) {
            clearTimeout(this.nextTimer);
            this.nextTimer = null;
        }
        if (this.stopped || this.isShuttingDown() || !this.db.open) return;
        const row = this.db
            .prepare("SELECT min(due_at) AS next_due FROM reminders WHERE status IN ('scheduled', 'snoozed')")
            .get() as { next_due: string | null } | undefined;
        if (!row?.next_due) return;
        const dueMs = Date.parse(row.next_due);
        if (!Number.isFinite(dueMs)) return;
        const delay = Math.max(15, Math.min(60_000, dueMs - Date.now() + 20));
        this.nextTimer = setTimeout(() => {
            this.nextTimer = null;
            void this.deliver();
        }, delay);
        this.nextTimer.unref();
    };

    wakeUp = (): Promise<InboxNotification[]> => {
        if (this.nextTimer) {
            clearTimeout(this.nextTimer);
            this.nextTimer = null;
        }
        return this.deliver();
    };

    deliver = async (): Promise<InboxNotification[]> => {
        if (this.stopped || !this.db.open || this.delivering) return [];
        const due = this.db
            .prepare(
                "SELECT 1 FROM reminders WHERE status IN ('scheduled', 'snoozed') AND due_at <= ? LIMIT 1",
            )
            .get(new Date().toISOString());
        if (!due) {
            this.scheduleNext();
            return [];
        }
        this.delivering = true;
        let hasMoreDue = false;
        let delivered: InboxNotification[] = [];
        try {
            const result = this.inbox.processDueReminders();
            hasMoreDue = result.hasMore;
            delivered = result.notifications;
            if (!this.stopped && !this.isShuttingDown() && delivered.length) this.notify(delivered);
        } catch (error) {
            console.error(
                '[DevLedger] Reminder delivery failed:',
                error instanceof Error ? error.message : 'Unknown error',
            );
        } finally {
            this.delivering = false;
            if (hasMoreDue && !this.stopped && !this.isShuttingDown()) {
                this.continuation = setTimeout(() => {
                    this.continuation = null;
                    void this.deliver();
                }, 50);
                this.continuation.unref();
            } else {
                this.scheduleNext();
            }
        }
        return delivered;
    };

    stop(): void {
        this.stopped = true;
        if (this.continuation) clearTimeout(this.continuation);
        if (this.nextTimer) clearTimeout(this.nextTimer);
        this.continuation = null;
        this.nextTimer = null;
    }
}
