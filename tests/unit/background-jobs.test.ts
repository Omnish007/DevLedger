import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
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
  BackgroundJobRunner,
  type SqliteDatabaseLike,
} from '../../src/main/services/background-jobs.ts';

class TestDatabase implements SqliteDatabaseLike {
  readonly raw = new DatabaseSync(':memory:');
  constructor() {
    this.raw.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS) this.raw.exec(migration.sql);
  }
  prepare(sql: string) {
    const statement = this.raw.prepare(sql);
    return {
      get: (...params: unknown[]) => statement.get(...params),
      all: (...params: unknown[]) => statement.all(...params),
      run: (...params: unknown[]) => statement.run(...params),
    };
  }
  transaction<T>(callback: () => T) {
    const execute = () => {
      this.raw.exec('BEGIN IMMEDIATE');
      try { const result = callback(); this.raw.exec('COMMIT'); return result; }
      catch (error) { this.raw.exec('ROLLBACK'); throw error; }
    };
    return Object.assign(execute, { immediate: execute });
  }
  close() { this.raw.close(); }
}

const fixedNow = '2026-11-23T12:00:00.000Z';

test('persistent jobs validate payloads, exclude credentials and claim only supported kinds', () => {
  const db = new TestDatabase();
  try {
    assert.throws(() => enqueueBackgroundJob(db, 'ai.summarize', 'workspace', 'local', { payload: { recoveryKey: 'secret' } }), /Sensitive credentials/);
    const queued = enqueueBackgroundJob(db, 'ai.summarize', 'workspace', 'local', { payload: { query: 'SQLite' }, idempotencyKey: 'summary:sqlite' });
    const second = enqueueBackgroundJob(db, 'ai.summarize', 'workspace', 'local', { payload: { query: 'ignored' }, idempotencyKey: 'summary:sqlite' });
    assert.equal(queued.id, second.id);
    assert.equal(claimNextBackgroundJob(db, 'test-worker', ['semantic.index'], fixedNow), null);
    const claimed = claimNextBackgroundJob(db, 'test-worker', ['ai.summarize'], fixedNow);
    assert.equal(claimed?.id, queued.id);
    assert.equal(claimed?.status, 'running');
    assert.equal(claimed?.attempts, 1);
    assert.equal(claimed?.worker_id, 'test-worker');
  } finally { db.close(); }
});

test('job progress, heartbeat and result persist against the active lease', () => {
  const db = new TestDatabase();
  try {
    const job = enqueueBackgroundJob(db, 'semantic.index', 'workspace', 'local');
    const claimed = claimNextBackgroundJob(db, 'worker-a', ['semantic.index'], fixedNow)!;
    assert.equal(heartbeatBackgroundJob(db, job.id, 'worker-a', fixedNow), true);
    reportBackgroundJobProgress(db, job.id, 'worker-a', { phase: 'embedding', percent: 42 }, fixedNow);
    const progress = db.prepare('SELECT progress_json FROM background_jobs WHERE id = ?').get(job.id) as { progress_json: string };
    assert.deepEqual(JSON.parse(progress.progress_json), { phase: 'embedding', percent: 42 });
    assert.equal(heartbeatBackgroundJob(db, job.id, 'wrong-worker', fixedNow), false);
    finishBackgroundJob(db, claimed.id, 'worker-a', { model: 'embeddinggemma', chunks: 19 }, fixedNow);
    const done = db.prepare('SELECT status, result_json, worker_id, heartbeat_at FROM background_jobs WHERE id = ?').get(job.id) as { status: string; result_json: string; worker_id: string | null; heartbeat_at: string | null };
    assert.equal(done.status, 'succeeded');
    assert.deepEqual(JSON.parse(done.result_json), { model: 'embeddinggemma', chunks: 19 });
    assert.equal(done.worker_id, null);
    assert.equal(done.heartbeat_at, null);
  } finally { db.close(); }
});

test('queued and running cancellation are explicit and cannot be mistaken for success', () => {
  const db = new TestDatabase();
  try {
    const queued = enqueueBackgroundJob(db, 'ai.summarize', 'workspace', 'local');
    assert.equal(cancelBackgroundJob(db, queued.id, fixedNow), 'cancelled');
    const queuedStatus = db.prepare('SELECT status FROM background_jobs WHERE id = ?').get(queued.id) as { status: string };
    assert.equal(queuedStatus.status, 'cancelled');

    const running = enqueueBackgroundJob(db, 'semantic.index', 'workspace', 'local');
    claimNextBackgroundJob(db, 'worker-b', ['semantic.index'], fixedNow);
    assert.equal(cancelBackgroundJob(db, running.id, fixedNow), 'requested');
    assert.equal(isBackgroundJobCancellationRequested(db, running.id, 'worker-b'), true);
    completeCancellation(db, running.id, 'worker-b', 'Cancelled for test.', fixedNow);
    const cancelled = db.prepare('SELECT status, error_message FROM background_jobs WHERE id = ?').get(running.id) as { status: string; error_message: string };
    assert.equal(cancelled.status, 'cancelled');
    assert.match(cancelled.error_message, /Cancelled for test/);
  } finally { db.close(); }
});

test('retry backoff and stale lease recovery return abandoned work to the queue', () => {
  const db = new TestDatabase();
  try {
    const job = enqueueBackgroundJob(db, 'project.export', 'project', 'project-1', { maxAttempts: 3 });
    const claimed = claimNextBackgroundJob(db, 'old-worker', ['project.export'], fixedNow)!;
    assert.equal(failBackgroundJob(db, claimed, 'old-worker', 'temporary failure', true, fixedNow), 'queued');
    const retried = db.prepare('SELECT status, available_at FROM background_jobs WHERE id = ?').get(job.id) as { status: string; available_at: string };
    assert.equal(retried.status, 'queued');
    assert.equal(Date.parse(retried.available_at) - Date.parse(fixedNow), 2_000);

    const stale = enqueueBackgroundJob(db, 'project.import', 'workspace', 'local');
    claimNextBackgroundJob(db, 'stale-worker', ['project.import'], fixedNow);
    const recovered = recoverStaleBackgroundJobs(db, 60_000, '2026-11-23T12:02:00.000Z');
    assert.equal(recovered, 1);
    const staleStatus = db.prepare('SELECT status, worker_id, heartbeat_at, available_at FROM background_jobs WHERE id = ?').get(stale.id) as { status: string; worker_id: string | null; heartbeat_at: string | null; available_at: string };
    assert.equal(staleStatus.status, 'queued');
    assert.equal(staleStatus.worker_id, null);
    assert.equal(staleStatus.heartbeat_at, null);
    assert.equal(staleStatus.available_at, '2026-11-23T12:02:00.000Z', 'recovery should make the job available at the supplied recovery instant');
    const reclaimed = claimNextBackgroundJob(db, 'new-worker', ['project.import'], '2026-11-23T12:02:00.000Z');
    assert.equal(reclaimed?.id, stale.id, 'recovered work should be immediately claimable after a fast restart');
  } finally { db.close(); }
});


test('runner dispatches registered handlers, publishes progress and stores results', async () => {
  const db = new TestDatabase();
  const runner = new BackgroundJobRunner(db, { concurrency: 2, leaseTimeoutMs: 15_000 });
  runner.register('test.echo', async (payload, context) => {
    context.progress({ phase: 'working', percent: 50 });
    context.throwIfCancelled();
    return { echo: payload.value };
  });
  try {
    const result = await runner.enqueueAndWait<{ echo: string }>('test.echo', 'workspace', 'local', { value: 'hello' }, { timeoutMs: 5_000 });
    assert.deepEqual(result, { echo: 'hello' });
    const job = db.prepare("SELECT status, progress_json FROM background_jobs WHERE kind = 'test.echo'").get() as { status: string; progress_json: string };
    assert.equal(job.status, 'succeeded');
    assert.deepEqual(JSON.parse(job.progress_json), { phase: 'complete' });
  } finally { await runner.stop(); db.close(); }
});

test('runner sends an AbortSignal to handlers when a running job is cancelled', async () => {
  const db = new TestDatabase();
  const runner = new BackgroundJobRunner(db, { concurrency: 1, leaseTimeoutMs: 15_000 });
  runner.register('test.wait', async (_payload, context) => new Promise((_resolve, reject) => {
    context.signal.addEventListener('abort', () => reject(context.signal.reason ?? new Error('aborted')), { once: true });
  }));
  try {
    const jobId = runner.enqueue('test.wait', 'workspace', 'local');
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const row = db.prepare('SELECT status FROM background_jobs WHERE id = ?').get(jobId) as { status: string };
      if (row.status === 'running') break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    runner.requestCancel(jobId);
    const cancelDeadline = Date.now() + 2_000;
    let status = '';
    while (Date.now() < cancelDeadline) {
      status = (db.prepare('SELECT status FROM background_jobs WHERE id = ?').get(jobId) as { status: string }).status;
      if (status === 'cancelled') break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    assert.equal(status, 'cancelled');
  } finally { await runner.stop(); db.close(); }
});
