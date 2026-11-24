import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { access, mkdir, open, rename, rm, stat, mkdtemp, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import type Database from 'better-sqlite3';
import type { AttachmentEntry, ProjectRow } from './project-export-data.ts';
import type { StreamedFile } from './project-export-streams.ts';
import { omitObjectPath, writeCsvFile, writeJsonFile } from './project-export-streams.ts';
import { assertRegularObjectPath, copyVerifiedObject, exportEntityIndex, fileHash, projectExportRows, projectExportTableHeaders, safeFilename } from './project-export-data.ts';
import { assertProjectArchiveBudget, assertProjectCompressedArchiveSize, MAX_PROJECT_COMPRESSED_BYTES, MAX_PROJECT_DATA_JSON_BYTES } from './project-archive-limits.ts';
import { normalizeObjectRelativePath } from './object-paths.ts';

type ArchiveEntry = StreamedFile;

/** Portable project snapshot. Data is read from a stable SQLite backup and emitted to disk in bounded pages. */
export class ProjectExportService {
  private readonly db: Database.Database;
  private readonly dataDirectory: string;

  constructor(db: Database.Database, dataDirectory: string) {
    this.db = db;
    this.dataDirectory = dataDirectory;
  }

  async exportProject(projectId: string, targetPath: string, signal?: AbortSignal, onProgress?: (progress: Record<string, unknown>) => void): Promise<string> {
    signal?.throwIfAborted();
    if (!targetPath.toLowerCase().endsWith('.zip')) throw new Error('Choose a ZIP filename for the project export.');
    const destination = resolve(targetPath);
    try { await access(destination); throw new Error('A file already exists at this export location. Choose a different filename.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }

    await mkdir(this.dataDirectory, { recursive: true });
    const staging = await mkdtemp(join(this.dataDirectory, '.project-export-'));
    const snapshotPath = join(staging, 'workspace.sqlite');
    const payloadRoot = join(staging, 'payload');
    const partial = `${destination}.${randomUUID()}.partial`;
    let snapshotDb: Database.Database | null = null;
    let output: ReturnType<typeof createWriteStream> | null = null;
    let abortHandler: (() => void) | undefined;
    try {
      onProgress?.({ phase: 'snapshotting-records', percent: 3 });
      await this.db.backup(snapshotPath);
      const { default: DatabaseConstructor } = await import('better-sqlite3');
      snapshotDb = new DatabaseConstructor(snapshotPath, { readonly: true, fileMustExist: true });
      const project = snapshotDb.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL').get(projectId) as ProjectRow | undefined;
      if (!project) throw new Error('Project not found.');
      exportEntityIndex(snapshotDb, projectId);

      const excludedLockedNotes = Number((snapshotDb.prepare('SELECT count(*) AS count FROM notes WHERE project_id = ? AND deleted_at IS NULL AND locked = 1').get(projectId) as { count: number }).count);
      const excludedEncryptedDocuments = Number((snapshotDb.prepare('SELECT count(*) AS count FROM documents WHERE project_id = ? AND deleted_at IS NULL AND is_encrypted = 1').get(projectId) as { count: number }).count);
      const exportDocumentCount = Number((snapshotDb.prepare('SELECT count(*) AS count FROM documents WHERE project_id = ? AND deleted_at IS NULL AND is_encrypted = 0').get(projectId) as { count: number }).count);
      const attachments: AttachmentEntry[] = [];
      const objectRoot = resolve(this.dataDirectory, 'objects');
      const objectRootInfo = await lstat(objectRoot).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (objectRootInfo && (!objectRootInfo.isDirectory() || objectRootInfo.isSymbolicLink())) throw new Error('Workspace object storage must be a regular directory.');

      let documentCount = 0;
      for await (const document of projectExportRows(snapshotDb, projectId, 'documents', signal)) {
        signal?.throwIfAborted();
        documentCount += 1;
        const relativeObject = normalizeObjectRelativePath(String(document.object_relative_path));
        const sourcePath = resolve(this.dataDirectory, relativeObject);
        await assertRegularObjectPath(objectRoot, sourcePath);
        const archivePath = `attachments/${String(documentCount).padStart(6, '0')}_${safeFilename(String(document.id))}_${safeFilename(String(document.original_name))}`;
        const stagedPath = join(payloadRoot, ...archivePath.split('/'));
        const measured = await copyVerifiedObject(sourcePath, stagedPath, String(document.sha256), signal);
        attachments.push({ id: String(document.id), path: archivePath, filePath: stagedPath, ...measured });
        const progress = exportDocumentCount > 0 ? documentCount / exportDocumentCount : 1;
        onProgress?.({ phase: 'collecting-attachments', completed: documentCount, total: exportDocumentCount, percent: 10 + Math.round(progress * 25) });
      }

      const archiveEntries: ArchiveEntry[] = [];
      const addJson = async (path: string, value: unknown, maximumBytes?: number) => {
        signal?.throwIfAborted();
        const filePath = join(payloadRoot, ...path.split('/'));
        const measured = await writeJsonFile(filePath, value, signal, maximumBytes);
        archiveEntries.push({ path, filePath, ...measured });
      };
      const addCsv = async (path: string, table: 'tasks' | 'time_entries', kind: 'tasks' | 'timeEntries') => {
        signal?.throwIfAborted();
        const filePath = join(payloadRoot, ...path.split('/'));
        const measured = await writeCsvFile(filePath, projectExportTableHeaders(snapshotDb!), projectExportRows(snapshotDb!, projectId, kind, signal), signal);
        archiveEntries.push({ path, filePath, ...measured });
      };
      const rows = (kind: string) => projectExportRows(snapshotDb!, projectId, kind, signal);
      const docs = () => omitObjectPath(rows('documents'));
      const attachmentRows = async function* () {
        for (const item of attachments) yield { id: item.id, path: item.path };
      };

      const readme = `# ${String(project.name)} — project export\n\nCreated: ${new Date().toISOString()}\n\nThis archive contains ordinary project records and unencrypted original attachments. For privacy and key-separation, protected notes (locked-note ciphertext and vault key-wrapping metadata) and vault-encrypted documents are intentionally excluded. They remain in the source workspace and must be preserved through a full encrypted workspace backup.\n\nExcluded from this export: ${excludedLockedNotes} protected note(s), ${excludedEncryptedDocuments} vault-encrypted document(s). The exclusion counts are also recorded in project.json. Ordinary notes are included as plaintext. Store this archive securely.\n`;
      const readmePath = join(payloadRoot, 'README.md');
      await mkdir(dirname(readmePath), { recursive: true, mode: 0o700 });
      await writeFile(readmePath, readme, { flag: 'wx', mode: 0o600 });
      const readmeInfo = await stat(readmePath);
      archiveEntries.push({ path: 'README.md', filePath: readmePath, size: readmeInfo.size, sha256: await fileHash(readmePath, signal) });

      await addJson('project.json', {
        project,
        contacts: rows('contacts'), projectContacts: rows('projectContacts'), notes: rows('notes'), tasks: rows('tasks'), documents: docs(),
        entityTags: rows('entityTags'), tags: rows('tags'), links: rows('links'), taskDependencies: rows('taskDependencies'),
        timeEntries: rows('timeEntries'), blockers: rows('blockers'), reminders: rows('reminders'), activity: rows('activity'),
        noteVersions: rows('versions'), attachments: attachmentRows(),
        exportExclusions: { lockedNotes: excludedLockedNotes, encryptedDocuments: excludedEncryptedDocuments },
      }, MAX_PROJECT_DATA_JSON_BYTES);
      await addJson('records/contacts.json', rows('contacts'));
      await addJson('records/project-contacts.json', rows('projectContacts'));
      await addJson('records/notes.json', rows('notes'));
      await addJson('records/tasks.json', rows('tasks'));
      await addJson('records/documents.json', docs());
      await addJson('records/relationships.json', { links: rows('links'), dependencies: rows('taskDependencies'), entityTags: rows('entityTags'), tags: rows('tags') });
      await addJson('records/history.json', { blockers: rows('blockers'), timeEntries: rows('timeEntries'), reminders: rows('reminders'), activity: rows('activity'), noteVersions: rows('versions') });
      await addCsv('tables/tasks.csv', 'tasks', 'tasks');
      await addCsv('tables/time-entries.csv', 'time_entries', 'timeEntries');

      for (const attachment of attachments) archiveEntries.push(attachment);
      const manifest = {
        format: 'devledger-project-export', version: 1, projectId, createdAt: new Date().toISOString(),
        excludedRecords: { lockedNotes: excludedLockedNotes, encryptedDocuments: excludedEncryptedDocuments },
        files: archiveEntries.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
      };
      const manifestBuffer = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      assertProjectArchiveBudget(archiveEntries.map((entry) => entry.size), manifestBuffer.length);

      await mkdir(dirname(destination), { recursive: true });
      output = createWriteStream(partial, { flags: 'wx', mode: 0o600 });
      const archive = archiver('zip', { zlib: { level: 6 } });
      let compressedBytes = 0;
      const compressedLimit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          compressedBytes += chunk.length;
          if (compressedBytes > MAX_PROJECT_COMPRESSED_BYTES) {
            callback(new Error('The project export exceeds the 5 GB compressed archive limit.'));
            return;
          }
          callback(null, chunk);
        },
      });
      const completed = new Promise<void>((resolveComplete, rejectComplete) => {
        output!.once('close', resolveComplete);
        output!.once('error', rejectComplete);
        archive.once('error', rejectComplete);
        compressedLimit.once('error', (error) => { archive.abort(); output?.destroy(error); rejectComplete(error); });
      });
      abortHandler = () => { const reason = signal?.reason instanceof Error ? signal.reason : new Error('Project export cancelled.'); archive.abort(); output?.destroy(reason); };
      if (signal?.aborted) abortHandler();
      else signal?.addEventListener('abort', abortHandler, { once: true });
      archive.on('progress', (progress) => {
        const processed = progress.entries.processed; const total = progress.entries.total || archiveEntries.length + 1;
        onProgress?.({ phase: 'writing-archive', completed: processed, total, percent: 60 + Math.round((processed / Math.max(total, 1)) * 35) });
      });
      archive.on('warning', (error) => archive.emit('error', error));
      archive.pipe(compressedLimit).pipe(output);
      for (const entry of archiveEntries) archive.file(entry.filePath, { name: entry.path });
      archive.append(manifestBuffer, { name: 'manifest.json' });
      await archive.finalize();
      await completed;
      assertProjectCompressedArchiveSize((await stat(partial)).size);
      signal?.throwIfAborted();
      const handle = await open(partial, 'r+');
      try { await handle.sync(); } finally { await handle.close(); }
      await rename(partial, destination);
      onProgress?.({ phase: 'complete', percent: 100, files: archiveEntries.length + 1 });
      return destination;
    } catch (error) {
      output?.destroy();
      await rm(partial, { force: true });
      throw error;
    } finally {
      if (abortHandler) signal?.removeEventListener('abort', abortHandler);
      snapshotDb?.close();
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
