import { randomUUID } from 'node:crypto';
import {
    cancelBackgroundJob,
    claimNextBackgroundJob,
    completeCancellation,
    enqueueBackgroundJob,
    failBackgroundJob,
    finishBackgroundJob,
    heartbeatBackgroundJob,
    isBackgroundJobCancellationRequested,
    recoverStaleBackgroundJobs,
    reportBackgroundJobProgress,
    decodeJson,
    type BackgroundJobRow,
    type EnqueueJobOptions,
    type SqliteDatabaseLike,
} from './background-job-store.ts';

export interface BackgroundJobContext {
    readonly jobId: string;
    readonly signal: AbortSignal;
    progress(value: Record<string, unknown>): void;
    throwIfCancelled(): void;
}
export type BackgroundJobHandler = (
    payload: Record<string, unknown>,
    context: BackgroundJobContext,
) => Promise<unknown>;

/** Persistent lease runner. One main-process executor owns each job at a time. */
export class BackgroundJobRunner {
    private readonly db: SqliteDatabaseLike;
    private readonly workerId = `main:${process.pid}:${randomUUID()}`;
    private readonly handlers = new Map<string, BackgroundJobHandler>();
    private readonly active = new Map<string, { controller: AbortController; promise: Promise<void> }>();
    private stopping = false;
    private loop: Promise<void> | null = null;
    private readonly concurrency: number;
    private readonly leaseTimeoutMs: number;

    constructor(db: SqliteDatabaseLike, options: { concurrency?: number; leaseTimeoutMs?: number } = {}) {
        this.db = db;
        this.concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 2)));
        this.leaseTimeoutMs = Math.max(15_000, Math.floor(options.leaseTimeoutMs ?? 90_000));
    }

    register(kind: string, handler: BackgroundJobHandler): void {
        if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(kind) || this.handlers.has(kind))
            throw new Error(`Invalid or duplicate background job handler: ${kind}`);
        this.handlers.set(kind, handler);
    }

    start(): void {
        if (this.loop) return;
        this.stopping = false;
        // The single-instance lock guarantees no older process can still own these leases.
        // Advance the recovery cutoff so a fast app restart does not wait on the prior heartbeat age.
        recoverStaleBackgroundJobs(this.db, 10_000, new Date(Date.now() + 10_000).toISOString());
        this.loop = this.runLoop().finally(() => {
            this.loop = null;
        });
    }

    async stop(): Promise<void> {
        this.stopping = true;
        for (const current of this.active.values())
            current.controller.abort(new Error('Application is shutting down.'));
        await this.loop;
        await Promise.allSettled([...this.active.values()].map((current) => current.promise));
    }

    enqueue(
        kind: string,
        targetType: string,
        targetId: string,
        payload: Record<string, unknown> = {},
        options: EnqueueJobOptions = {},
    ): string {
        if (!this.handlers.has(kind)) throw new Error(`No handler is registered for ${kind}.`);
        const record = enqueueBackgroundJob(this.db, kind, targetType, targetId, { ...options, payload });
        this.start();
        return record.id;
    }

    async enqueueAndWait<T>(
        kind: string,
        targetType: string,
        targetId: string,
        payload: Record<string, unknown> = {},
        options: EnqueueJobOptions & { timeoutMs?: number } = {},
    ): Promise<T> {
        const id = this.enqueue(kind, targetType, targetId, payload, options);
        const deadline =
            Date.now() + Math.max(10_000, Math.min(options.timeoutMs ?? 15 * 60_000, 60 * 60_000));
        while (Date.now() < deadline) {
            const row = this.db
                .prepare('SELECT status, result_json, error_message FROM background_jobs WHERE id = ?')
                .get(id) as Pick<BackgroundJobRow, 'status' | 'result_json' | 'error_message'> | undefined;
            if (!row) throw new Error('The queued background job could not be found.');
            if (row.status === 'succeeded')
                return (row.result_json ? JSON.parse(row.result_json) : null) as T;
            if (row.status === 'failed' || row.status === 'cancelled')
                throw new Error(row.error_message || `The background job ${row.status}.`);
            await new Promise((resolveWait) => setTimeout(resolveWait, 250));
        }
        throw new Error(`Background job ${id} is still running. It remains available in Operations → Jobs.`);
    }

    requestCancel(jobId: string): void {
        const result = cancelBackgroundJob(this.db, jobId);
        if (result === 'requested')
            this.active.get(jobId)?.controller.abort(new Error('Cancellation requested by the user.'));
        if (result === 'not-cancellable') throw new Error('This background job has already completed.');
    }

    private async runLoop(): Promise<void> {
        while (!this.stopping) {
            while (!this.stopping && this.active.size < this.concurrency) {
                const row = claimNextBackgroundJob(this.db, this.workerId, [...this.handlers.keys()]);
                if (!row) break;
                const controller = new AbortController();
                const promise = this.execute(row, controller).finally(() => this.active.delete(row.id));
                this.active.set(row.id, { controller, promise });
            }
            await new Promise((resolveWait) => setTimeout(resolveWait, this.active.size ? 100 : 500));
        }
        await Promise.allSettled([...this.active.values()].map((current) => current.promise));
    }

    private async execute(job: BackgroundJobRow, controller: AbortController): Promise<void> {
        const heartbeat = setInterval(
            () => {
                try {
                    if (isBackgroundJobCancellationRequested(this.db, job.id, this.workerId)) {
                        controller.abort(new Error('Cancellation requested or job lease lost.'));
                        return;
                    }
                    heartbeatBackgroundJob(this.db, job.id, this.workerId);
                } catch (error) {
                    controller.abort(
                        error instanceof Error ? error : new Error('Background job heartbeat failed.'),
                    );
                }
            },
            Math.min(10_000, Math.floor(this.leaseTimeoutMs / 3)),
        );
        heartbeat.unref();
        const context: BackgroundJobContext = {
            jobId: job.id,
            signal: controller.signal,
            progress: (value) => reportBackgroundJobProgress(this.db, job.id, this.workerId, value),
            throwIfCancelled: () => {
                if (controller.signal.aborted) throw controller.signal.reason ?? new Error('Job cancelled.');
            },
        };
        try {
            const payload = decodeJson(job.payload_json, 'payload');
            const handler = this.handlers.get(job.kind);
            if (!handler) throw new Error(`No handler is registered for ${job.kind}.`);
            const result = await handler(payload, context);
            context.throwIfCancelled();
            finishBackgroundJob(this.db, job.id, this.workerId, result);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Background job failed.';
            const userCancellation = isBackgroundJobCancellationRequested(this.db, job.id, this.workerId);
            if (userCancellation) completeCancellation(this.db, job.id, this.workerId, message);
            else if (this.stopping && controller.signal.aborted) {
                const timestamp = new Date().toISOString();
                this.db
                    .prepare(
                        `UPDATE background_jobs SET status = 'queued', started_at = NULL, worker_id = NULL,
          heartbeat_at = NULL, error_message = 'Paused safely during application shutdown.', available_at = ?, updated_at = ?
          WHERE id = ? AND status = 'running' AND worker_id = ?`,
                    )
                    .run(timestamp, timestamp, job.id, this.workerId);
            } else failBackgroundJob(this.db, job, this.workerId, message, true);
        } finally {
            clearInterval(heartbeat);
        }
    }
}
