import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type Database from 'better-sqlite3';
import {
    createProjectImportStaging,
    extractProjectArchive,
    removeProjectImportStaging,
} from './project-import-archive.ts';
import { writeProjectRecords } from './project-import-writer.ts';
import {
    asProjectImportRow as row,
    asProjectImportRows as rows,
    importText as text,
    safeArchivePath,
    isInside,
    sha256File as sha256,
    pathExists as exists,
    assertAcyclicImportEdges as assertAcyclic,
} from './project-import-helpers.ts';

type Row = Record<string, unknown>;
export interface ProjectImportResult {
    projectId: string;
    projectName: string;
    lockedNotesSkipped: number;
    imported: {
        contacts: number;
        notes: number;
        tasks: number;
        documents: number;
        tags: number;
        links: number;
        timeEntries: number;
        reminders: number;
    };
}

/** Imports a project as a separate, remapped copy. Protected notes are intentionally skipped. */
export class ProjectImportService {
    private readonly db: Database.Database;
    private readonly dataDirectory: string;

    constructor(db: Database.Database, dataDirectory: string) {
        this.db = db;
        this.dataDirectory = dataDirectory;
    }

    async importProjectArchive(
        archivePath: string,
        signal?: AbortSignal,
        onProgress?: (progress: Record<string, unknown>) => void,
    ): Promise<ProjectImportResult> {
        const staging = await createProjectImportStaging(this.dataDirectory);
        try {
            const exportData = await extractProjectArchive(archivePath, staging, signal, onProgress);
            return await importProjectSnapshot(
                this.db,
                this.dataDirectory,
                exportData,
                staging,
                signal,
                onProgress,
            );
        } finally {
            await removeProjectImportStaging(staging);
        }
    }
}

/** Database/filesystem phase is exported for integration tests using a real in-memory SQLite database. */
export async function importProjectSnapshot(
    db: Database.Database,
    dataDirectory: string,
    exportData: Row,
    extractedRoot: string,
    signal?: AbortSignal,
    onProgress?: (progress: Record<string, unknown>) => void,
): Promise<ProjectImportResult> {
    signal?.throwIfAborted();
    const sourceProject = row(exportData['project']);
    const sourceProjectId = text(sourceProject['id']);
    if (!sourceProjectId || !text(sourceProject['name']).trim())
        throw new Error('Project details are incomplete.');

    const contacts = rows(exportData['contacts']);
    const projectContacts = rows(exportData['projectContacts']);
    const notes = rows(exportData['notes']);
    const tasks = rows(exportData['tasks']);
    const documents = rows(exportData['documents']);
    const tags = rows(exportData['tags']);
    const entityTags = rows(exportData['entityTags']);
    const links = rows(exportData['links']);
    const dependencies = rows(exportData['taskDependencies']);
    const timeEntries = rows(exportData['timeEntries']);
    const blockers = rows(exportData['blockers']);
    const reminders = rows(exportData['reminders']);
    const activity = rows(exportData['activity']);
    const versions = rows(exportData['noteVersions']);
    const attachments = rows(exportData['attachments']);

    const lockedNotesSkipped = notes.filter((item) => Boolean(item['locked'])).length;
    const normalNotes = notes.filter((item) => !item['locked']);
    const taskIds = new Set(tasks.map((item) => text(item['id'])).filter(Boolean));
    const parentEdges = new Map<string, string[]>();
    const dependencyEdges = new Map<string, string[]>();
    for (const task of tasks) {
        const id = text(task['id']);
        if (!id) throw new Error('The project archive contains a task without an identifier.');
        const parentId = task['parent_id'] ? text(task['parent_id']) : '';
        if (parentId && !taskIds.has(parentId))
            throw new Error('A task refers to a parent task outside the project archive.');
        parentEdges.set(id, parentId ? [parentId] : []);
        dependencyEdges.set(id, []);
    }
    for (const dependency of dependencies) {
        const taskId = text(dependency['task_id']);
        const dependsOn = text(dependency['depends_on_task_id']);
        if (!taskIds.has(taskId) || !taskIds.has(dependsOn))
            throw new Error('A task dependency refers outside the project archive.');
        dependencyEdges.get(taskId)!.push(dependsOn);
    }
    assertAcyclic(parentEdges, 'task hierarchy');
    assertAcyclic(dependencyEdges, 'task dependency');

    const sourceIdsByType = new Map<string, Set<string>>([
        ['project', new Set([sourceProjectId])],
        ['contact', new Set(contacts.map((item) => text(item['id'])))],
        ['note', new Set(normalNotes.map((item) => text(item['id'])))],
        ['task', taskIds],
        ['document', new Set(documents.map((item) => text(item['id'])))],
    ]);
    const idMap = new Map<string, string>();
    idMap.set(sourceProjectId, randomUUID());
    for (const collection of [contacts, normalNotes, tasks, documents]) {
        for (const item of collection) {
            const sourceId = text(item['id']);
            if (!sourceId) throw new Error('The project archive contains a record without an identifier.');
            if (idMap.has(sourceId))
                throw new Error('The project archive contains colliding record identifiers.');
            idMap.set(sourceId, randomUUID());
        }
    }

    const tagIdMap = new Map<string, string>();
    const importedObjects: string[] = [];
    const objectDirectory = join(dataDirectory, 'objects');
    const attachmentById = new Map(attachments.map((item) => [text(item['id']), text(item['path'])]));
    const documentObjects = new Map<string, string>();
    try {
        for (const [documentIndex, document] of documents.entries()) {
            signal?.throwIfAborted();
            const sourceId = text(document['id']);
            const archiveRelative = attachmentById.get(sourceId);
            const objectHash = text(document['sha256']);
            if (
                !archiveRelative ||
                !safeArchivePath(archiveRelative) ||
                !/^([a-f0-9]{64})$/.test(objectHash)
            ) {
                throw new Error(
                    `Document ${text(document['original_name'], sourceId)} has no valid attachment reference.`,
                );
            }
            const sourcePath = resolve(extractedRoot, archiveRelative);
            if (!isInside(extractedRoot, sourcePath)) throw new Error('An attachment path is unsafe.');
            const sourceInfo = await lstat(sourcePath);
            if (
                !sourceInfo.isFile() ||
                sourceInfo.isSymbolicLink() ||
                (await sha256(sourcePath, signal)) !== objectHash
            ) {
                throw new Error(
                    `Attachment integrity check failed for ${text(document['original_name'], sourceId)}.`,
                );
            }
            const relativeObject = join('objects', objectHash.slice(0, 2), objectHash);
            const destination = resolve(dataDirectory, relativeObject);
            if (!isInside(objectDirectory, destination))
                throw new Error('The object storage path is invalid.');
            await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
            if (await exists(destination)) {
                if ((await sha256(destination)) !== objectHash)
                    throw new Error('An existing object failed its content checksum.');
            } else {
                const partial = `${destination}.${randomUUID()}.partial`;
                try {
                    const input = createReadStream(sourcePath, signal ? { signal } : {});
                    const output = createWriteStream(partial, { flags: 'wx', mode: 0o600 });
                    if (signal) await pipeline(input, output, { signal });
                    else await pipeline(input, output);
                    const partialHandle = await open(partial, 'r+');
                    try {
                        await partialHandle.sync();
                    } finally {
                        await partialHandle.close();
                    }
                    signal?.throwIfAborted();
                    await rename(partial, destination);
                    importedObjects.push(destination);
                } catch (error) {
                    await rm(partial, { force: true }).catch(() => undefined);
                    throw error;
                }
            }
            documentObjects.set(sourceId, relativeObject.split(sep).join('/'));
            onProgress?.({
                phase: 'copying-attachments',
                completed: documentIndex + 1,
                total: documents.length,
                percent: 45 + Math.round(((documentIndex + 1) / Math.max(documents.length, 1)) * 40),
            });
        }

        signal?.throwIfAborted();
        const newProjectId = idMap.get(sourceProjectId)!;
        writeProjectRecords(db, {
            sourceProject,
            sourceProjectId,
            newProjectId,
            lockedNotesSkipped,
            contacts,
            projectContacts,
            normalNotes,
            tasks,
            documents,
            tags,
            entityTags,
            links,
            dependencies,
            timeEntries,
            blockers,
            reminders,
            activity,
            versions,
            idMap,
            tagIdMap,
            sourceIdsByType,
            documentObjects,
        });
        signal?.throwIfAborted();
        onProgress?.({ phase: 'writing-database', completed: 1, total: 1, percent: 95 });

        return {
            projectId: idMap.get(sourceProjectId)!,
            projectName: `${text(sourceProject['name']).trim()} (Imported)`.slice(0, 160),
            lockedNotesSkipped,
            imported: {
                contacts: contacts.length,
                notes: normalNotes.length,
                tasks: tasks.length,
                documents: documents.length,
                tags: tagIdMap.size,
                links: links.length,
                timeEntries: timeEntries.length,
                reminders: reminders.length,
            },
        };
    } catch (error) {
        for (const path of importedObjects) {
            const relativePath = relative(dataDirectory, path).split(sep).join('/');
            const referenced = db
                .prepare('SELECT 1 AS present FROM documents WHERE object_relative_path = ? LIMIT 1')
                .get(relativePath);
            if (!referenced) await rm(path, { force: true }).catch(() => undefined);
        }
        throw error;
    }
}
