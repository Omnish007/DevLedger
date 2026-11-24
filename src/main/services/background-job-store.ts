import { randomUUID } from 'node:crypto';

export interface SqliteStatementLike {
  get(...parameters: unknown[]): unknown;
  all(...parameters: unknown[]): unknown[];
  run(...parameters: unknown[]): { changes: number };
}
export interface SqliteDatabaseLike {
  prepare(sql: string): SqliteStatementLike;
  transaction<T>(callback: () => T): (() => T) & { immediate: () => T };
}

export interface BackgroundJobRow {
  id: string;
  kind: string;
  target_type: string;
  target_id: string;
  priority: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  attempts: number;
  max_attempts: number;
  payload_json: string;
  progress_json: string;
  error_message: string | null;
  worker_id: string | null;
  heartbeat_at: string | null;
  cancel_requested_at: string | null;
  result_json: string | null;
  available_at: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface EnqueueJobOptions {
  priority?: number;
  maxAttempts?: number;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
}

function timestamp(): string { return new Date().toISOString(); }
export function decodeJson(value: string, label: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch { throw new Error(`Background job ${label} must be a JSON object.`); }
}

export function enqueueBackgroundJob(db: SqliteDatabaseLike, kind: string, targetType: string, targetId: string, options: EnqueueJobOptions = {}): BackgroundJobRow {
  if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(kind) || !/^[a-z][a-z0-9_.-]{1,31}$/.test(targetType)) throw new Error('Invalid background job type.');
  const priority = options.priority ?? 5;
  const maxAttempts = options.maxAttempts ?? 4;
  if (!Number.isInteger(priority) || priority < 0 || priority > 10) throw new Error('Job priority must be from 0 to 10.');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new Error('Job retry limit must be from 1 to 20.');
  const payload = options.payload ?? {};
  const payloadJson = JSON.stringify(payload);
  if (Buffer.byteLength(payloadJson, 'utf8') > 64 * 1024) throw new Error('Background job payload exceeds 64 KB.');
  // Credentials and key material must be held outside persisted job payloads.
  const secretKeyPattern = /passphrase|password|recovery.?key|secret|token|credential|private.?key/i;
  if (Object.keys(payload).some((key) => secretKeyPattern.test(key))) throw new Error('Sensitive credentials must never be stored in a background job payload.');
  decodeJson(payloadJson, 'payload');
  const id = randomUUID();
  const createdAt = timestamp();
  db.prepare(`INSERT INTO background_jobs
    (id, kind, target_type, target_id, priority, status, max_attempts, idempotency_key, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING`)
    .run(id, kind, targetType, targetId, priority, maxAttempts, options.idempotencyKey ?? null, payloadJson, createdAt, createdAt);
  const row = options.idempotencyKey
    ? db.prepare('SELECT * FROM background_jobs WHERE idempotency_key = ?').get(options.idempotencyKey)
    : db.prepare('SELECT * FROM background_jobs WHERE id = ?').get(id);
  if (!row) throw new Error('Background job enqueue could not be verified.');
  return row as BackgroundJobRow;
}

export function claimNextBackgroundJob(db: SqliteDatabaseLike, workerId: string, supportedKinds: readonly string[], at = timestamp()): BackgroundJobRow | null {
  if (!workerId || workerId.length > 128 || !supportedKinds.length) throw new Error('A worker ID and at least one supported job kind are required.');
  const placeholders = supportedKinds.map(() => '?').join(',');
  const claim = db.transaction(() => {
    const row = db.prepare(`SELECT * FROM background_jobs
      WHERE status = 'queued' AND attempts < max_attempts AND available_at <= ?
        AND kind IN (${placeholders})
      ORDER BY priority DESC, created_at ASC LIMIT 1`).get(at, ...supportedKinds) as BackgroundJobRow | undefined;
    if (!row) return null;
    const changed = db.prepare(`UPDATE background_jobs
      SET status = 'running', attempts = attempts + 1, worker_id = ?, heartbeat_at = ?,
          cancel_requested_at = NULL, started_at = ?, completed_at = NULL, updated_at = ?
      WHERE id = ? AND status = 'queued'`).run(workerId, at, at, at, row.id);
    if (changed.changes !== 1) return null;
    return db.prepare('SELECT * FROM background_jobs WHERE id = ?').get(row.id) as BackgroundJobRow;
  });
  return claim.immediate();
}

export function heartbeatBackgroundJob(db: SqliteDatabaseLike, jobId: string, workerId: string, at = timestamp()): boolean {
  return db.prepare(`UPDATE background_jobs SET heartbeat_at = ?, updated_at = ?
    WHERE id = ? AND status = 'running' AND worker_id = ?`).run(at, at, jobId, workerId).changes === 1;
}

export function reportBackgroundJobProgress(db: SqliteDatabaseLike, jobId: string, workerId: string, progress: Record<string, unknown>, at = timestamp()): void {
  const progressJson = JSON.stringify(progress);
  if (Buffer.byteLength(progressJson, 'utf8') > 16 * 1024) throw new Error('Background job progress exceeds 16 KB.');
  db.prepare(`UPDATE background_jobs SET progress_json = ?, heartbeat_at = ?, updated_at = ?
    WHERE id = ? AND status = 'running' AND worker_id = ?`).run(progressJson, at, at, jobId, workerId);
}

export function isBackgroundJobCancellationRequested(db: SqliteDatabaseLike, jobId: string, workerId: string): boolean {
  const row = db.prepare(`SELECT cancel_requested_at FROM background_jobs
    WHERE id = ? AND status = 'running' AND worker_id = ?`).get(jobId, workerId) as { cancel_requested_at: string | null } | undefined;
  return !row || row.cancel_requested_at !== null;
}

export function finishBackgroundJob(db: SqliteDatabaseLike, jobId: string, workerId: string, result: unknown = {}, at = timestamp()): void {
  const resultJson = JSON.stringify(result);
  if (Buffer.byteLength(resultJson, 'utf8') > 64 * 1024) throw new Error('Background job result exceeds 64 KB.');
  const changed = db.prepare(`UPDATE background_jobs SET status = 'succeeded', progress_json = ?, result_json = ?,
    error_message = NULL, worker_id = NULL, heartbeat_at = NULL, completed_at = ?, updated_at = ?
    WHERE id = ? AND status = 'running' AND worker_id = ? AND cancel_requested_at IS NULL`)
    .run(JSON.stringify({ phase: 'complete' }), resultJson, at, at, jobId, workerId);
  if (changed.changes !== 1) throw new Error('Background job could not be marked successful; it may have been cancelled or reclaimed.');
}

export function cancelBackgroundJob(db: SqliteDatabaseLike, jobId: string, at = timestamp()): 'cancelled' | 'requested' | 'not-cancellable' {
  const row = db.prepare('SELECT status FROM background_jobs WHERE id = ?').get(jobId) as { status: string } | undefined;
  if (!row) throw new Error('Background job not found.');
  if (row.status === 'queued') {
    db.prepare(`UPDATE background_jobs SET status = 'cancelled', cancel_requested_at = ?, error_message = 'Cancelled by user.', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'queued'`).run(at, at, at, jobId);
    return 'cancelled';
  }
  if (row.status === 'running') {
    db.prepare(`UPDATE background_jobs SET cancel_requested_at = ?, updated_at = ? WHERE id = ? AND status = 'running'`).run(at, at, jobId);
    return 'requested';
  }
  return 'not-cancellable';
}

export function completeCancellation(db: SqliteDatabaseLike, jobId: string, workerId: string, message = 'Cancelled by user.', at = timestamp()): void {
  db.prepare(`UPDATE background_jobs SET status = 'cancelled', error_message = ?, worker_id = NULL,
    heartbeat_at = NULL, completed_at = ?, updated_at = ?
    WHERE id = ? AND status = 'running' AND worker_id = ? AND cancel_requested_at IS NOT NULL`)
    .run(message.slice(0, 2000), at, at, jobId, workerId);
}

export function failBackgroundJob(db: SqliteDatabaseLike, job: BackgroundJobRow, workerId: string, message: string, retryable = true, at = timestamp()): 'queued' | 'failed' | 'cancelled' {
  const cancellation = isBackgroundJobCancellationRequested(db, job.id, workerId);
  if (cancellation) { completeCancellation(db, job.id, workerId, 'Cancelled by user.', at); return 'cancelled'; }
  const retry = retryable && job.attempts < job.max_attempts;
  const delayMs = Math.min(15 * 60_000, 2_000 * (2 ** Math.max(0, job.attempts - 1)));
  const availableAt = retry ? new Date(Date.parse(at) + delayMs).toISOString() : at;
  db.prepare(`UPDATE background_jobs SET status = ?, error_message = ?, available_at = ?, completed_at = ?,
    worker_id = NULL, heartbeat_at = NULL, updated_at = ?
    WHERE id = ? AND status = 'running' AND worker_id = ?`)
    .run(retry ? 'queued' : 'failed', message.slice(0, 2000), availableAt, retry ? null : at, at, job.id, workerId);
  return retry ? 'queued' : 'failed';
}

export function recoverStaleBackgroundJobs(db: SqliteDatabaseLike, leaseTimeoutMs = 90_000, at = timestamp()): number {
  if (!Number.isInteger(leaseTimeoutMs) || leaseTimeoutMs < 10_000) throw new Error('Worker lease timeout must be at least 10 seconds.');
  const cutoff = new Date(Date.parse(at) - leaseTimeoutMs).toISOString();
  // Use the caller's recovery instant for deterministic leases and immediate restart claims.
  const recoveredAt = at;
  const recover = db.transaction(() => {
    const result = db.prepare(`UPDATE background_jobs
      SET status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
          error_message = 'Recovered after a worker lease expired.',
          available_at = ?, completed_at = CASE WHEN attempts < max_attempts THEN NULL ELSE ? END,
          worker_id = NULL, heartbeat_at = NULL, started_at = CASE WHEN attempts < max_attempts THEN NULL ELSE started_at END,
          updated_at = ?
      WHERE status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < ?)`)
      .run(recoveredAt, recoveredAt, recoveredAt, cutoff);
    return result.changes;
  });
  return recover.immediate();
}

