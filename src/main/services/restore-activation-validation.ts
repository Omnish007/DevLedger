import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const MARKER_NAME = '.restore-activation.json';
const ROLLBACK_ROOT = '.restore-rollback';
const RESTORE_OBJECT_BATCH_SIZE = 200;
type RestorePhase = 'staged' | 'promoting' | 'promoted' | 'rollback-requested';
export interface RestoreMarker {
  version: 1;
  phase: RestorePhase;
  restoreDirectory: string;
  rollbackDirectory: string;
  hasDatabase: boolean;
  hasObjects: boolean;
  restoreHasObjects: boolean;
  createdAt: string;
}

export async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
export function isInside(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
export function assertRestoreDirectory(dataDirectory: string, restoreDirectory: string): string {
  const root = resolve(dataDirectory, 'restore-copies');
  const candidate = resolve(restoreDirectory);
  if (!isInside(root, candidate) || candidate === root) throw new Error('The selected restore copy must be inside DevLedger restore-copies.');
  return candidate;
}
export async function writeMarker(dataDirectory: string, marker: RestoreMarker): Promise<void> {
  const markerPath = join(dataDirectory, MARKER_NAME);
  const temporaryPath = `${markerPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await rename(temporaryPath, markerPath);
}
export async function readMarker(dataDirectory: string): Promise<RestoreMarker | null> {
  const path = join(dataDirectory, MARKER_NAME);
  const markerInfo = await lstat(path).catch(() => null);
  if (!markerInfo) return null;
  if (!markerInfo.isFile() || markerInfo.isSymbolicLink()) throw new Error('The restore activation marker is not a regular file. The workspace was not changed.');
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<RestoreMarker>;
  if (parsed.version !== 1 || !['staged', 'promoting', 'promoted', 'rollback-requested'].includes(String(parsed.phase))
    || typeof parsed.restoreDirectory !== 'string' || typeof parsed.rollbackDirectory !== 'string'
    || typeof parsed.hasDatabase !== 'boolean' || typeof parsed.hasObjects !== 'boolean' || typeof parsed.restoreHasObjects !== 'boolean') {
    throw new Error('The pending restore activation marker is invalid. The workspace was not changed.');
  }
  const restoreDirectory = assertRestoreDirectory(dataDirectory, parsed.restoreDirectory);
  const rollbackDirectory = resolve(dataDirectory, parsed.rollbackDirectory);
  if (!isInside(resolve(dataDirectory, ROLLBACK_ROOT), rollbackDirectory) || rollbackDirectory === resolve(dataDirectory, ROLLBACK_ROOT)) {
    throw new Error('The restore rollback path failed safety validation.');
  }
  return { ...parsed, restoreDirectory, rollbackDirectory } as RestoreMarker;
}

export async function assertNoSymlinks(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('The restore copy contains a symbolic link and cannot be activated.');
    if (entry.isDirectory()) await assertNoSymlinks(path);
    else if (!entry.isFile()) throw new Error('The restore copy contains an unsupported filesystem entry.');
  }
}

export async function validateRestoreDatabase(path: string): Promise<void> {
  const { default: DatabaseConstructor } = await import('better-sqlite3');
  const database = new DatabaseConstructor(path, { readonly: true, fileMustExist: true });
  try {
    const quick = database.pragma('quick_check', { simple: true });
    const integrity = database.pragma('integrity_check', { simple: true });
    const foreignKeys = database.pragma('foreign_key_check') as unknown[];
    if (quick !== 'ok' || integrity !== 'ok' || foreignKeys.length) throw new Error('The staged restore database failed SQLite integrity validation.');
  } finally { database.close(); }
}

interface RestoreDocumentReference {
  id: string;
  object_relative_path: string;
  sha256: string;
  stored_sha256: string | null;
}
interface RestoreReadDatabase {
  prepare(sql: string): { all(...parameters: unknown[]): unknown[] };
  close(): void;
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolveHash(hash.digest('hex')));
  });
}

/** Verify that every non-deleted document still points to its exact restored object bytes. */
export async function validateRestoreObjectStore(
  databasePath: string,
  restoreDirectory: string,
  openDatabase?: (path: string) => Promise<RestoreReadDatabase> | RestoreReadDatabase,
): Promise<void> {
  let database: RestoreReadDatabase;
  if (openDatabase) database = await openDatabase(databasePath);
  else {
    const { default: DatabaseConstructor } = await import('better-sqlite3');
    database = new DatabaseConstructor(databasePath, { readonly: true, fileMustExist: true }) as unknown as RestoreReadDatabase;
  }
  try {
    const selectPage = database.prepare(`SELECT id, object_relative_path, sha256, stored_sha256
      FROM documents WHERE deleted_at IS NULL AND id > ? ORDER BY id LIMIT ?`);
    const objectsRoot = resolve(restoreDirectory, 'objects');
    let lastId = '';
    while (true) {
      const references = selectPage.all(lastId, RESTORE_OBJECT_BATCH_SIZE) as RestoreDocumentReference[];
      if (!references.length) break;
      for (const reference of references) {
        const relativePath = String(reference.object_relative_path ?? '');
        const normalized = relativePath.replace(/\\/g, '/');
        const parts = normalized.split('/');
        if (!normalized.startsWith('objects/') || parts.some((part) => !part || part === '.' || part === '..') || isAbsolute(normalized)) {
          throw new Error('The restored database contains an unsafe document object path.');
        }
        const objectPath = resolve(restoreDirectory, normalized.split('/').join(sep));
        if (!isInside(objectsRoot, objectPath) || objectPath === objectsRoot) throw new Error('The restored database references a file outside object storage.');
        const info = await lstat(objectPath).catch(() => null);
        if (!info?.isFile() || info.isSymbolicLink()) throw new Error(`A restored document object is missing or unsafe: ${basename(objectPath)}.`);
        const expectedHash = String(reference.stored_sha256 || reference.sha256 || '').toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(expectedHash) || await sha256File(objectPath) !== expectedHash) {
          throw new Error(`A restored document object failed its checksum: ${basename(objectPath)}.`);
        }
        lastId = String(reference.id);
      }
    }
  } finally { database.close(); }
}

export async function stageRestoreCopy(
  dataDirectory: string,
  restoreDirectory: string,
  validateDatabase: (path: string) => Promise<void> = validateRestoreDatabase,
  validateObjects: (databasePath: string, restoreDirectory: string) => Promise<void> = validateRestoreObjectStore,
): Promise<void> {
  const existing = await readMarker(dataDirectory);
  if (existing) throw new Error('A restore activation is already pending. Finish or cancel it before staging another copy.');
  const restoreRoot = join(dataDirectory, 'restore-copies');
  const restoreRootInfo = await lstat(restoreRoot).catch(() => null);
  if (restoreRootInfo?.isSymbolicLink() || (restoreRootInfo && !restoreRootInfo.isDirectory())) throw new Error('The restore-copies directory is not a safe directory.');
  const source = assertRestoreDirectory(dataDirectory, restoreDirectory);
  const sourceInfo = await lstat(source).catch(() => null);
  if (!sourceInfo?.isDirectory() || sourceInfo.isSymbolicLink()) throw new Error('The selected restore copy is not a safe directory.');
  await assertNoSymlinks(source);
  const databasePath = join(source, 'northstar.sqlite');
  const objectsPath = join(source, 'objects');
  const dbInfo = await lstat(databasePath).catch(() => null);
  const objectsInfo = await lstat(objectsPath).catch(() => null);
  if (!dbInfo?.isFile() || dbInfo.isSymbolicLink()) throw new Error('The selected restore copy does not contain a valid database file.');
  if (objectsInfo && (!objectsInfo.isDirectory() || objectsInfo.isSymbolicLink())) throw new Error('The selected restore copy contains an unsafe object directory.');
  await validateDatabase(databasePath);
  if (objectsInfo?.isDirectory()) await assertNoSymlinks(objectsPath);
  await validateObjects(databasePath, source);
  const rollbackDirectory = join(ROLLBACK_ROOT, randomUUID());
  await mkdir(join(dataDirectory, ROLLBACK_ROOT), { recursive: true, mode: 0o700 });
  await writeMarker(dataDirectory, {
    version: 1,
    phase: 'staged',
    restoreDirectory: source,
    rollbackDirectory,
    hasDatabase: await exists(join(dataDirectory, 'northstar.sqlite')),
    hasObjects: await exists(join(dataDirectory, 'objects')),
    restoreHasObjects: Boolean(objectsInfo?.isDirectory()),
    createdAt: new Date().toISOString(),
  });
}
