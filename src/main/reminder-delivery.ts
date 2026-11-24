import type Database from 'better-sqlite3';
import type { registerIpcHandlers } from './ipc/register.js';

type BackgroundJobs = ReturnType<typeof registerIpcHandlers>['jobs'];
type NotifyReminders = (count: number) => void;

export class ReminderDeliveryController {
  private delivering = false;
  private stopped = false;
  private continuation: NodeJS.Timeout | null = null;

  private readonly db: Database.Database;
  private readonly jobs: BackgroundJobs;
  private readonly notify: NotifyReminders;
  private readonly isShuttingDown: () => boolean;

  constructor(db: Database.Database, jobs: BackgroundJobs, notify: NotifyReminders, isShuttingDown: () => boolean) {
    this.db = db;
    this.jobs = jobs;
    this.notify = notify;
    this.isShuttingDown = isShuttingDown;
  }

  deliver = async (): Promise<void> => {
    if (this.stopped || !this.db.open || this.delivering) return;
    const due = this.db.prepare("SELECT 1 FROM reminders WHERE status IN ('scheduled', 'snoozed') AND due_at <= ? LIMIT 1")
      .get(new Date().toISOString());
    if (!due) return;
    this.delivering = true;
    let hasMoreDue = false;
    try {
      const result = await this.jobs.enqueueAndWait<{ count: number; hasMore: boolean }>(
        'notifications.deliver', 'system', 'reminders', {}, { timeoutMs: 20_000 },
      );
      hasMoreDue = Boolean(result?.hasMore);
      if (!this.stopped && !this.isShuttingDown() && result?.count) this.notify(result.count);
    } catch (error) {
      console.error('[DevLedger] Reminder delivery job failed:', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.delivering = false;
      if (hasMoreDue && !this.stopped && !this.isShuttingDown()) {
        this.continuation = setTimeout(() => { this.continuation = null; void this.deliver(); }, 100);
        this.continuation.unref();
      }
    }
  };

  stop(): void {
    this.stopped = true;
    if (this.continuation) clearTimeout(this.continuation);
    this.continuation = null;
  }
}
