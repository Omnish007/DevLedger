import { lstat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type Database from 'better-sqlite3';
import { normalizeObjectRelativePath } from './services/object-paths.ts';

export const WORKSPACE_OBJECT_VALIDATION_BATCH_SIZE = 200;

export async function validateWorkspaceObjects(db: Database.Database, dataDirectory: string): Promise<void> {
  const root = resolve(dataDirectory, 'objects');
  const selectPage = db.prepare(`SELECT id, object_relative_path FROM documents
    WHERE deleted_at IS NULL AND id > ? ORDER BY id LIMIT ?`);
  const updatePath = db.prepare('UPDATE documents SET object_relative_path = ? WHERE id = ?');
  let lastId = '';
  while (true) {
    const rows = selectPage.all(lastId, WORKSPACE_OBJECT_VALIDATION_BATCH_SIZE) as Array<{ id: string; object_relative_path: string }>;
    if (rows.length === 0) break;
    for (const row of rows) {
      const normalized = normalizeObjectRelativePath(row.object_relative_path);
      const candidate = resolve(dataDirectory, normalized.split('/').join(sep));
      const rel = relative(root, candidate);
      if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('/') || candidate === root || !candidate.startsWith(`${root}${sep}`)) {
        throw new Error('A restored document points outside its object store.');
      }
      const info = await lstat(candidate).catch(() => null);
      if (!info?.isFile() || info.isSymbolicLink()) throw new Error(`A restored document object is missing or unsafe: ${row.object_relative_path}`);
      if (normalized !== row.object_relative_path) updatePath.run(normalized, row.id);
      lastId = row.id;
    }
  }
}
