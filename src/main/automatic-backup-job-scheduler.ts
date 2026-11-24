import type { registerIpcHandlers } from './ipc/register.js';

type BackgroundJobs = ReturnType<typeof registerIpcHandlers>['jobs'];

export class AutomaticBackupJobScheduler {
  private enabled = false;
  private pending = false;
  private readonly jobs: BackgroundJobs;

  constructor(jobs: BackgroundJobs) {
    this.jobs = jobs;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  enqueue(): void {
    if (!this.enabled || this.pending) return;
    this.pending = true;
    void this.jobs.enqueueAndWait('backup.snapshot', 'system', 'automatic', {}, { timeoutMs: 60 * 60_000 })
      .catch((error: unknown) => console.error('[DevLedger] Automatic backup job failed:', error instanceof Error ? error.message : 'Unknown error'))
      .finally(() => { this.pending = false; });
  }
}
