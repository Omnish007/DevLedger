import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { claimNextBackgroundJob, completeCancellation, failBackgroundJob, finishBackgroundJob, heartbeatBackgroundJob, isBackgroundJobCancellationRequested, recoverStaleBackgroundJobs, reportBackgroundJobProgress, type BackgroundJobRow } from '../services/background-job-store.js';
import { extractDocument, type DocumentRow } from './document-extractors.js';

const databasePath = String((workerData as { databasePath: string }).databasePath);
const db = new Database(databasePath, { timeout: 5000 });
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('journal_mode = WAL');

type Job = BackgroundJobRow;

const workerId = `document:${process.pid}:${randomUUID()}`;

function recoverInterruptedJobs(): void {
  const timestamp = new Date().toISOString();
  db.prepare(`UPDATE documents SET status = 'queued', extraction_error = 'Requeued after interrupted extraction.', updated_at = ?
    WHERE status = 'extracting' AND deleted_at IS NULL`).run(timestamp);
  db.prepare(`UPDATE documents SET status = 'failed', extraction_error = 'Maximum extraction attempts reached before the last application shutdown.', updated_at = ?
    WHERE status = 'queued' AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM background_jobs j WHERE j.target_type = 'document' AND j.target_id = documents.id AND j.kind = 'document.extract' AND j.status = 'failed')`).run(timestamp);
}

function claimJob(): Job | null {
  const job = claimNextBackgroundJob(db, workerId, ['document.extract']);
  if (!job) return null;
  const timestamp = new Date().toISOString();
  const changed = db.prepare(`UPDATE documents SET status = 'extracting', extraction_error = NULL, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL AND is_encrypted = 0`).run(timestamp, job.target_id);
  if (changed.changes !== 1) {
    db.prepare(`UPDATE background_jobs SET status = 'cancelled', error_message = 'Target document no longer exists or is protected.',
      worker_id = NULL, heartbeat_at = NULL, completed_at = ?, updated_at = ? WHERE id = ? AND worker_id = ?`)
      .run(timestamp, timestamp, job.id, workerId);
    return null;
  }
  return job;
}

async function processJob(job: Job, dataDirectory: string): Promise<void> {
  const document = db.prepare('SELECT id, extension, object_relative_path, sha256, size_bytes FROM documents WHERE id = ? AND deleted_at IS NULL AND is_encrypted = 0').get(job.target_id) as DocumentRow | undefined;
  if (!document) {
    db.prepare(`UPDATE background_jobs SET status = 'cancelled', error_message = 'Target document no longer exists.', worker_id = NULL,
      heartbeat_at = NULL, completed_at = ?, updated_at = ? WHERE id = ? AND worker_id = ?`).run(new Date().toISOString(), new Date().toISOString(), job.id, workerId);
    return;
  }
  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    try {
      if (isBackgroundJobCancellationRequested(db, job.id, workerId)) {
        controller.abort(new Error('Document extraction cancellation requested.'));
        return;
      }
      heartbeatBackgroundJob(db, job.id, workerId);
    } catch (error) { controller.abort(error instanceof Error ? error : new Error('Document worker heartbeat failed.')); }
  }, 10_000);
  heartbeat.unref();
  try {
    reportBackgroundJobProgress(db, job.id, workerId, { phase: 'extracting', percent: 5 });
    const output = await extractDocument(document, dataDirectory, controller.signal);
    controller.signal.throwIfAborted();
    if (isBackgroundJobCancellationRequested(db, job.id, workerId)) throw new Error('Document extraction was cancelled.');
    const timestamp = new Date().toISOString();
    db.transaction(() => {
      db.prepare('UPDATE documents SET status = ?, extracted_text = ?, extraction_error = NULL, updated_at = ? WHERE id = ? AND sha256 = ?')
        .run(output.status, output.text, timestamp, document.id, document.sha256);
      finishBackgroundJob(db, job.id, workerId, { phase: 'complete', characters: output.text.length, outcome: output.status });
    }).immediate();
  } catch (error) {
    const timestamp = new Date().toISOString();
    const message = error instanceof Error ? error.message.slice(0, 2000) : 'Document extraction failed.';
    const cancellation = controller.signal.aborted || isBackgroundJobCancellationRequested(db, job.id, workerId);
    if (cancellation) {
      db.prepare(`UPDATE documents SET status = 'needs_attention', extraction_error = ?, updated_at = ? WHERE id = ?`).run('Extraction cancelled.', timestamp, document.id);
      completeCancellation(db, job.id, workerId, 'Document extraction cancelled.');
    } else {
      const needsOcr = message.toLowerCase().includes('ocr') || message.includes('Poppler') || message.toLowerCase().includes('scanned');
      // OCR-required and missing-tool failures are deterministic on this machine; do not retry them pointlessly.
      const state = failBackgroundJob(db, job, workerId, message, !needsOcr);
      db.prepare('UPDATE documents SET status = ?, extraction_error = ?, updated_at = ? WHERE id = ?')
        .run(needsOcr ? 'ocr_required' : state === 'queued' ? 'queued' : 'failed', message, timestamp, document.id);
    }
  } finally { clearInterval(heartbeat); }
}

async function run(): Promise<void> {
  const dataDirectory = dirname(databasePath);
  recoverInterruptedJobs();
  parentPort?.postMessage({ type: 'ready' });
  let stopping = false;
  let lastLeaseSweep = 0;
  parentPort?.on('message', (message: unknown) => { if (message === 'stop') stopping = true; });
  while (!stopping) {
    if (Date.now() - lastLeaseSweep > 5_000) { recoverStaleBackgroundJobs(db, 30_000); lastLeaseSweep = Date.now(); }
    const job = claimJob();
    if (!job) { await new Promise((resolveWait) => setTimeout(resolveWait, 1_000)); continue; }
    await processJob(job, dataDirectory);
  }
}

void run().catch((error: unknown) => {
  parentPort?.postMessage({ type: 'fatal', message: error instanceof Error ? error.message : 'Document worker stopped unexpectedly.' });
  db.close();
  process.exitCode = 1;
});

parentPort?.on('close', () => { if (db.open) db.close(); });
