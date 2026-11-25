import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type Database from 'better-sqlite3';
import type { MaintenanceJobContext } from './maintenance-shared.ts';

function pathInside(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function hashFile(filePath: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolveHash, reject) => {
    if (signal.aborted) { reject(signal.reason ?? new Error('Storage audit cancelled.')); return; }
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => stream.destroy(signal.reason instanceof Error ? signal.reason : new Error('Storage audit cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    stream.on('data', (chunk: string | Buffer) => hash.update(chunk));
    stream.on('error', (error) => { cleanup(); reject(error); });
    stream.on('end', () => { cleanup(); resolveHash(hash.digest('hex')); });
  });
}

export async function auditLocalDocumentStorage(db: Database.Database, dataDirectory: string, context: MaintenanceJobContext): Promise<{ total: number; verified: number; issueCount: number; issues: Array<{ documentId: string; reason: string }>; issuesTruncated: boolean }> {
  const total = Number((db.prepare('SELECT count(*) AS total FROM documents WHERE deleted_at IS NULL').get() as { total: number }).total);
  const pageSize = 200;
  const issueLimit = 500;
  const selectPage = db.prepare(`SELECT id, object_relative_path, sha256, stored_sha256, is_encrypted
    FROM documents WHERE deleted_at IS NULL AND id > ? ORDER BY id LIMIT ?`);
  const objectRoot = resolve(dataDirectory, 'objects');
  let verified = 0;
  let checked = 0;
  let issueCount = 0;
  const issues: Array<{ documentId: string; reason: string }> = [];
  let lastId = '';

  while (checked < total) {
    context.signal.throwIfAborted();
    const rows = selectPage.all(lastId, pageSize) as Array<{ id: string; object_relative_path: string; sha256: string; stored_sha256: string | null; is_encrypted: number }>;
    if (!rows.length) break;
    for (const row of rows) {
      context.signal.throwIfAborted();
      lastId = row.id;
      const target = resolve(dataDirectory, row.object_relative_path);
      let reason: string | null = null;
      if (!pathInside(objectRoot, target) || target === objectRoot) {
        reason = 'Object path escaped the store.';
      } else {
        const info = await lstat(target).catch(() => null);
        if (!info?.isFile() || info.isSymbolicLink()) reason = 'Object is missing or not a regular file.';
        else {
          const storedHash = await hashFile(target, context.signal);
          const expectedHash = row.is_encrypted ? row.stored_sha256 : row.sha256;
          if (!expectedHash || storedHash !== expectedHash) reason = 'Object SHA-256 integrity check failed.';
          else verified += 1;
        }
      }
      if (reason) {
        issueCount += 1;
        if (issues.length < issueLimit) issues.push({ documentId: row.id, reason });
      }
      checked += 1;
      if (checked % 25 === 0 || checked === total) context.progress({ phase: 'checking-objects', checked, total, verified, issues: issueCount });
    }
  }
  return { total, verified, issueCount, issues, issuesTruncated: issueCount > issues.length };
}
