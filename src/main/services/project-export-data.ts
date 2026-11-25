import { createHash } from 'node:crypto';
import { constants as fsConstants, createReadStream, createWriteStream } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { lstat, mkdir, open, rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type Database from 'better-sqlite3';
import { stripControlCharacters } from '../../domain/validation.ts';
import type { StreamedFile } from './project-export-streams.ts';
import { pagedExportRows } from './project-export-streams.ts';

export interface AttachmentEntry extends StreamedFile {
    id: string;
}
export interface ProjectRow extends Record<string, unknown> {
    id: string;
    name: string;
}

export function inside(parent: string, candidate: string): boolean {
    const value = relative(resolve(parent), resolve(candidate));
    return value === '' || (value !== '..' && !value.startsWith(`..${sep}`) && !value.startsWith(sep));
}

export function safeFilename(value: string): string {
    return (
        stripControlCharacters(value, '_')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\.\.+/g, '_')
            .slice(0, 140) || 'document'
    );
}

export function fileHash(path: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolveHash, reject) => {
        const hash = createHash('sha256');
        const input = createReadStream(path, signal ? { signal } : {});
        input.on('data', (chunk: string | Buffer) => hash.update(chunk));
        input.on('error', reject);
        input.on('end', () => resolveHash(hash.digest('hex')));
    });
}

/** Copy an object to export staging while hashing the exact bytes that will enter the archive.
 * This avoids a hash-then-open race if a source object changes during export.
 */
export async function copyVerifiedObject(
    sourcePath: string,
    destinationPath: string,
    expectedSha256: string,
    signal?: AbortSignal,
): Promise<Omit<StreamedFile, 'path' | 'filePath'>> {
    const sourceInfo = await lstat(sourcePath);
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink())
        throw new Error('A document object is not a regular file.');
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    const handle = await open(sourcePath, fsConstants.O_RDONLY | noFollow);
    try {
        const openedInfo = await handle.stat();
        if (
            !openedInfo.isFile() ||
            (sourceInfo.ino !== 0 && openedInfo.ino !== sourceInfo.ino) ||
            sourceInfo.dev !== openedInfo.dev
        ) {
            throw new Error('A document object changed while it was being opened.');
        }
        await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
        const hash = createHash('sha256');
        let size = 0;
        const meter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                size += chunk.length;
                hash.update(chunk);
                callback(null, chunk);
            },
        });
        const output = createWriteStream(destinationPath, { flags: 'wx', mode: 0o600 });
        try {
            const input = handle.createReadStream({ autoClose: false });
            await pipeline(input, meter, output, signal ? { signal } : {});
            const digest = hash.digest('hex');
            const finalInfo = await handle.stat();
            if (
                size !== openedInfo.size ||
                finalInfo.size !== openedInfo.size ||
                finalInfo.mtimeMs !== openedInfo.mtimeMs ||
                digest !== expectedSha256
            ) {
                throw new Error('Document object integrity check failed during export.');
            }
            return { size, sha256: digest };
        } catch (error) {
            output.destroy();
            await rm(destinationPath, { force: true }).catch(() => undefined);
            throw error;
        }
    } finally {
        await handle.close();
    }
}

/** Reject symlinks in every path component, not just at the final object path. */
export async function assertRegularObjectPath(objectRoot: string, sourcePath: string): Promise<void> {
    if (!inside(objectRoot, sourcePath) || resolve(objectRoot) === resolve(sourcePath)) {
        throw new Error('A document object path failed export validation.');
    }
    const parts = relative(resolve(objectRoot), resolve(sourcePath)).split(sep);
    let current = resolve(objectRoot);
    for (let index = 0; index < parts.length; index += 1) {
        current = resolve(current, parts[index]!);
        const info = await lstat(current);
        if (info.isSymbolicLink()) throw new Error('A document object path contains a symbolic link.');
        const isLast = index === parts.length - 1;
        if (isLast ? !info.isFile() : !info.isDirectory()) {
            throw new Error('A document object path contains an invalid filesystem entry.');
        }
    }
}

export function exportEntityIndex(db: Database.Database, projectId: string): void {
    db.exec(
        `CREATE TEMP TABLE export_entities (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, PRIMARY KEY(entity_type, entity_id));`,
    );
    const insert = db.prepare('INSERT OR IGNORE INTO export_entities(entity_type, entity_id) VALUES (?, ?)');
    insert.run('project', projectId);
    db.prepare(
        `INSERT OR IGNORE INTO export_entities SELECT 'contact', c.id FROM contacts c
    JOIN project_contacts pc ON pc.contact_id = c.id WHERE pc.project_id = ? AND c.deleted_at IS NULL`,
    ).run(projectId);
    db.prepare(
        `INSERT OR IGNORE INTO export_entities SELECT 'note', id FROM notes
    WHERE project_id = ? AND deleted_at IS NULL AND locked = 0`,
    ).run(projectId);
    db.prepare(
        `INSERT OR IGNORE INTO export_entities SELECT 'task', id FROM tasks
    WHERE project_id = ? AND deleted_at IS NULL`,
    ).run(projectId);
    db.prepare(
        `INSERT OR IGNORE INTO export_entities SELECT 'document', id FROM documents
    WHERE project_id = ? AND deleted_at IS NULL AND is_encrypted = 0`,
    ).run(projectId);
}

export function projectExportRows(
    db: Database.Database,
    projectId: string,
    kind: string,
    signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
    const queries: Record<string, { sql: string; parameters: unknown[] }> = {
        contacts: {
            sql: `SELECT c.rowid AS __export_cursor, c.* FROM contacts c JOIN project_contacts pc ON pc.contact_id = c.id
      WHERE pc.project_id = ? AND c.deleted_at IS NULL AND c.rowid > ? ORDER BY c.rowid LIMIT ?`,
            parameters: [projectId],
        },
        projectContacts: {
            sql: `SELECT pc.rowid AS __export_cursor, pc.project_id, pc.contact_id, pc.relationship_role, pc.is_primary
      FROM project_contacts pc JOIN contacts c ON c.id = pc.contact_id WHERE pc.project_id = ? AND c.deleted_at IS NULL
      AND pc.rowid > ? ORDER BY pc.rowid LIMIT ?`,
            parameters: [projectId],
        },
        notes: {
            sql: `SELECT n.rowid AS __export_cursor, n.* FROM notes n WHERE n.project_id = ? AND n.deleted_at IS NULL AND n.locked = 0
      AND n.rowid > ? ORDER BY n.rowid LIMIT ?`,
            parameters: [projectId],
        },
        tasks: {
            sql: `SELECT t.rowid AS __export_cursor, t.* FROM tasks t WHERE t.project_id = ? AND t.deleted_at IS NULL
      AND t.rowid > ? ORDER BY t.rowid LIMIT ?`,
            parameters: [projectId],
        },
        documents: {
            sql: `SELECT d.rowid AS __export_cursor, d.* FROM documents d WHERE d.project_id = ? AND d.deleted_at IS NULL AND d.is_encrypted = 0
      AND d.rowid > ? ORDER BY d.rowid LIMIT ?`,
            parameters: [projectId],
        },
        entityTags: {
            sql: `SELECT et.rowid AS __export_cursor, et.* FROM entity_tags et WHERE EXISTS
      (SELECT 1 FROM export_entities e WHERE e.entity_type = et.entity_type AND e.entity_id = et.entity_id)
      AND et.rowid > ? ORDER BY et.rowid LIMIT ?`,
            parameters: [],
        },
        tags: {
            sql: `SELECT t.rowid AS __export_cursor, t.* FROM tags t WHERE EXISTS
      (SELECT 1 FROM entity_tags et JOIN export_entities e ON e.entity_type = et.entity_type AND e.entity_id = et.entity_id WHERE et.tag_id = t.id)
      AND t.rowid > ? ORDER BY t.rowid LIMIT ?`,
            parameters: [],
        },
        links: {
            sql: `SELECT l.rowid AS __export_cursor, l.* FROM entity_links l WHERE EXISTS
      (SELECT 1 FROM export_entities e WHERE e.entity_type = l.source_type AND e.entity_id = l.source_id)
      AND EXISTS (SELECT 1 FROM export_entities e WHERE e.entity_type = l.target_type AND e.entity_id = l.target_id)
      AND l.rowid > ? ORDER BY l.rowid LIMIT ?`,
            parameters: [],
        },
        taskDependencies: {
            sql: `SELECT td.rowid AS __export_cursor, td.* FROM task_dependencies td WHERE EXISTS
      (SELECT 1 FROM export_entities e WHERE e.entity_type = 'task' AND e.entity_id = td.task_id)
      AND EXISTS (SELECT 1 FROM export_entities e WHERE e.entity_type = 'task' AND e.entity_id = td.depends_on_task_id)
      AND td.rowid > ? ORDER BY td.rowid LIMIT ?`,
            parameters: [],
        },
        timeEntries: {
            sql: `SELECT te.rowid AS __export_cursor, te.* FROM time_entries te WHERE EXISTS
      (SELECT 1 FROM export_entities e WHERE e.entity_type = 'task' AND e.entity_id = te.task_id)
      AND te.rowid > ? ORDER BY te.rowid LIMIT ?`,
            parameters: [],
        },
        blockers: {
            sql: `SELECT b.rowid AS __export_cursor, b.* FROM task_blockers b WHERE EXISTS
      (SELECT 1 FROM export_entities e WHERE e.entity_type = 'task' AND e.entity_id = b.task_id)
      AND b.rowid > ? ORDER BY b.rowid LIMIT ?`,
            parameters: [],
        },
        reminders: {
            sql: `SELECT r.rowid AS __export_cursor, r.* FROM reminders r WHERE EXISTS
      (SELECT 1 FROM export_entities e WHERE e.entity_type = r.entity_type AND e.entity_id = r.entity_id)
      AND r.rowid > ? ORDER BY r.rowid LIMIT ?`,
            parameters: [],
        },
        activity: {
            sql: `SELECT a.rowid AS __export_cursor, a.* FROM activity_events a WHERE EXISTS
      (SELECT 1 FROM export_entities e WHERE e.entity_type = a.entity_type AND e.entity_id = a.entity_id)
      AND a.rowid > ? ORDER BY a.rowid LIMIT ?`,
            parameters: [],
        },
        versions: {
            sql: `SELECT nv.rowid AS __export_cursor, nv.* FROM note_versions nv JOIN notes n ON n.id = nv.note_id
      WHERE n.deleted_at IS NULL AND n.locked = 0 AND EXISTS
      (SELECT 1 FROM export_entities e WHERE e.entity_type = 'note' AND e.entity_id = nv.note_id)
      AND nv.rowid > ? ORDER BY nv.rowid LIMIT ?`,
            parameters: [],
        },
    };
    const spec = queries[kind];
    if (!spec) throw new Error(`Unsupported project export query: ${kind}`);
    return pagedExportRows(db, spec.sql, spec.parameters, signal);
}

export function projectExportTableHeaders(db: Database.Database, table: 'tasks' | 'time_entries'): string[] {
    return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
        (column) => column.name,
    );
}
