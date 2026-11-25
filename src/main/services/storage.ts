import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { unwrapAttachmentKey, wrapAttachmentKey, type WrappedAttachmentKey } from './attachment-crypto.ts';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, chmod, lstat, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type Database from 'better-sqlite3';
import type { DocumentRecord, ImportResult, PageRequest, PageResult } from '../../shared/contracts.js';
import { normalizePage, escapeLikeQuery } from '../../domain/pagination.ts';
import { safeDisplayName } from '../../domain/validation.ts';

import {
    ALLOWED_EXTENSIONS,
    MAX_IMPORT_BYTES,
    MIME_BY_EXTENSION,
    isPathInside,
    sha256File,
} from './storage-helpers.ts';
import { mapDocumentRecord } from './storage-mappers.ts';
import { normalizeObjectRelativePath } from './object-paths.ts';

export class DocumentStorageService {
    private readonly db: Database.Database;
    private readonly dataDirectory: string;
    private readonly getVaultKey: (() => Buffer) | undefined;
    private readonly decryptedTemporaryFiles = new Set<string>();
    private readonly temporaryCleanupTimers = new Map<string, NodeJS.Timeout>();

    constructor(db: Database.Database, dataDirectory: string, getVaultKey?: () => Buffer) {
        this.db = db;
        this.dataDirectory = dataDirectory;
        this.getVaultKey = getVaultKey;
    }

    async importFromPath(
        sourcePath: string,
        projectId: string | null,
        protectWithVault = false,
    ): Promise<ImportResult> {
        const info = await lstat(sourcePath);
        if (!info.isFile() || info.isSymbolicLink())
            throw new Error('Only regular, non-symbolic-link files can be imported.');
        if (info.size > MAX_IMPORT_BYTES) throw new Error('This file exceeds the 250 MB import limit.');

        const originalName = safeDisplayName(sourcePath.split(/[\\/]/).at(-1) ?? 'document');
        const extension = extname(originalName).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(extension))
            throw new Error('Supported formats: PDF, DOCX, XLSX, CSV, TXT and Markdown.');
        const signature = Buffer.alloc(16);
        const sourceHandle = await open(sourcePath, 'r');
        try {
            await sourceHandle.read(signature, 0, signature.length, 0);
        } finally {
            await sourceHandle.close();
        }
        if (extension === '.pdf' && signature.subarray(0, 5).toString('ascii') !== '%PDF-')
            throw new Error('The selected file does not contain a valid PDF signature.');
        if (
            (extension === '.docx' || extension === '.xlsx') &&
            !(
                signature[0] === 0x50 &&
                signature[1] === 0x4b &&
                [0x03, 0x05, 0x07].includes(signature[2] ?? -1)
            )
        )
            throw new Error('The selected Office document is not a valid ZIP-based DOCX/XLSX file.');
        if (['.txt', '.md', '.csv'].includes(extension)) {
            const sample = Buffer.alloc(Math.min(info.size, 8192));
            const sampleHandle = await open(sourcePath, 'r');
            try {
                await sampleHandle.read(sample, 0, sample.length, 0);
            } finally {
                await sampleHandle.close();
            }
            if (sample.includes(0)) throw new Error('The selected text or CSV file contains binary data.');
        }
        if (projectId) {
            const project = this.db
                .prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL')
                .get(projectId);
            if (!project) throw new Error('The selected project no longer exists.');
        }

        const sha256 = await sha256File(sourcePath);
        const id = randomUUID();
        if (protectWithVault && !this.getVaultKey)
            throw new Error('Protected document storage is not available in this workspace build.');
        const relativePath = normalizeObjectRelativePath(
            (protectWithVault
                ? join('objects', 'protected', `${id}.blob`)
                : join('objects', sha256.slice(0, 2), sha256)
            )
                .split(sep)
                .join('/'),
        );
        const destination = resolve(this.dataDirectory, relativePath);
        const objectsRoot = resolve(this.dataDirectory, 'objects');
        let createdObject = false;
        let encryptionMeta: string | null = null;
        let storedSha256 = sha256;
        if (!isPathInside(objectsRoot, destination)) throw new Error('Invalid object storage path.');
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        const partialPath = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.partial`);
        let masterKey: Buffer | null = null;
        let dataKey: Buffer | null = null;
        try {
            if (protectWithVault) {
                masterKey = this.getVaultKey!();
                dataKey = randomBytes(32);
                const wrappedKey = wrapAttachmentKey(masterKey, dataKey, id, sha256);
                const nonce = randomBytes(12);
                const cipher = createCipheriv('aes-256-gcm', dataKey, nonce);
                cipher.setAAD(Buffer.from(`northstar-protected-document-data-v2:${id}:${sha256}`, 'utf8'));
                await pipeline(
                    createReadStream(sourcePath),
                    cipher,
                    createWriteStream(partialPath, { flags: 'wx', mode: 0o600 }),
                );
                if ((await sha256File(sourcePath)) !== sha256)
                    throw new Error('The selected document changed while it was being encrypted.');
                encryptionMeta = JSON.stringify({
                    version: 2,
                    algorithm: 'aes-256-gcm',
                    nonce: nonce.toString('base64'),
                    tag: cipher.getAuthTag().toString('base64'),
                    wrappedKey,
                    plaintextSha256: sha256,
                    plaintextBytes: info.size,
                });
            } else {
                await pipeline(
                    createReadStream(sourcePath),
                    createWriteStream(partialPath, { flags: 'wx', mode: 0o600 }),
                );
            }
            const partialHandle = await open(partialPath, 'r+');
            try {
                await partialHandle.sync();
            } finally {
                await partialHandle.close();
            }
            storedSha256 = await sha256File(partialPath);
            if (!protectWithVault && storedSha256 !== sha256)
                throw new Error('The imported file changed while it was being copied.');
            if (!protectWithVault) {
                try {
                    await access(destination);
                    if ((await sha256File(destination)) !== sha256)
                        throw new Error('An existing content-addressed object failed checksum validation.');
                    await rm(partialPath, { force: true });
                } catch (error) {
                    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                        await rename(partialPath, destination);
                        createdObject = true;
                    } else throw error;
                }
            } else {
                await rename(partialPath, destination);
                createdObject = true;
            }
        } catch (error) {
            await rm(partialPath, { force: true }).catch(() => undefined);
            throw error;
        } finally {
            masterKey?.fill(0);
            dataKey?.fill(0);
        }

        const extractedText = '';
        const status: DocumentRecord['status'] = protectWithVault ? 'needs_attention' : 'queued';
        const warning = protectWithVault
            ? 'Protected document encrypted at rest. Unlock the vault to open it; its contents are excluded from indexing and search.'
            : 'The original was stored safely. Background text extraction has been queued; scanned PDFs may require a separately installed local OCR engine.';
        const now = new Date().toISOString();
        try {
            const insertDocumentAndJob = this.db.transaction(() => {
                this.db
                    .prepare(
                        `
          INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes, sha256,
            object_relative_path, status, extracted_text, created_at, updated_at, is_encrypted, encryption_meta, stored_sha256)
          VALUES (@id, @projectId, @title, @originalName, @mediaType, @extension, @sizeBytes, @sha256,
            @relativePath, @status, @extractedText, @now, @now, @isEncrypted, @encryptionMeta, @storedSha256)
        `,
                    )
                    .run({
                        id,
                        projectId,
                        title: originalName.replace(/\.[^.]+$/, ''),
                        originalName,
                        mediaType: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
                        extension,
                        sizeBytes: info.size,
                        sha256,
                        relativePath,
                        status,
                        extractedText,
                        now,
                        isEncrypted: protectWithVault ? 1 : 0,
                        encryptionMeta,
                        storedSha256,
                    });
                if (status === 'queued' && !protectWithVault) {
                    this.db
                        .prepare(
                            `INSERT INTO background_jobs (id, kind, target_type, target_id, priority, status, max_attempts, idempotency_key, created_at, updated_at)
            VALUES (?, 'document.extract', 'document', ?, 6, 'queued', 3, ?, ?, ?)`,
                        )
                        .run(randomUUID(), id, `document:${id}:${sha256}`, now, now);
                }
            });
            insertDocumentAndJob.immediate();
        } catch (error) {
            if (createdObject) {
                const referenced = this.db
                    .prepare('SELECT 1 AS present FROM documents WHERE object_relative_path = ? LIMIT 1')
                    .get(relativePath);
                if (!referenced) await rm(destination, { force: true }).catch(() => undefined);
            }
            throw error;
        }
        const document = this.getById(id);
        if (!document)
            throw new Error('The document was stored but could not be read back from the database.');
        return warning ? { document, warning } : { document };
    }

    listPage(input: PageRequest = {}): PageResult<DocumentRecord> {
        const { limit, offset, query } = normalizePage(input);
        const projectId = input.projectId ?? null;
        const pattern = `%${escapeLikeQuery(query)}%`;
        const where = `deleted_at IS NULL AND (? IS NULL OR project_id = ?)
      AND (? = '' OR title LIKE ? ESCAPE '\\' OR original_name LIKE ? ESCAPE '\\')`;
        const params = [projectId, projectId, query, pattern, pattern] as const;
        const totalRow = this.db
            .prepare(`SELECT count(*) AS total FROM documents WHERE ${where}`)
            .get(...params) as { total: number };
        // List views need metadata only. Avoid copying potentially very large extracted_text values over IPC.
        const rows = this.db
            .prepare(
                `SELECT id, project_id, title, original_name, media_type, extension, size_bytes, status,
        created_at, extraction_error, is_encrypted FROM documents WHERE ${where}
      ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
            )
            .all(...params, limit, offset) as Array<Record<string, unknown>>;
        const items = rows.map((row) => mapDocumentRecord({ ...row, extracted_text: '' }));
        return {
            items,
            total: Number(totalRow.total),
            limit,
            offset,
            hasMore: offset + items.length < Number(totalRow.total),
        };
    }

    resolveDocumentPath(id: string): string {
        const row = this.db
            .prepare('SELECT object_relative_path FROM documents WHERE id = ? AND deleted_at IS NULL')
            .get(id) as { object_relative_path: string } | undefined;
        if (!row) throw new Error('Document not found.');
        const candidate = resolve(this.dataDirectory, row.object_relative_path);
        if (!isPathInside(resolve(this.dataDirectory, 'objects'), candidate))
            throw new Error('Stored document path failed validation.');
        return candidate;
    }

    async resolveDocumentForOpen(
        id: string,
        temporaryDirectory: string,
    ): Promise<{ path: string; temporary: boolean }> {
        const row = this.db
            .prepare(
                `SELECT object_relative_path, sha256, stored_sha256, size_bytes, is_encrypted, encryption_meta, extension
      FROM documents WHERE id = ? AND deleted_at IS NULL`,
            )
            .get(id) as Record<string, unknown> | undefined;
        if (!row) throw new Error('Document not found.');
        const objectPath = resolve(this.dataDirectory, String(row['object_relative_path']));
        if (!isPathInside(resolve(this.dataDirectory, 'objects'), objectPath))
            throw new Error('Stored document path failed validation.');
        const storedHash = row['stored_sha256'] ? String(row['stored_sha256']) : String(row['sha256']);
        if ((await sha256File(objectPath)) !== storedHash)
            throw new Error('The stored document failed its SHA-256 integrity check.');
        if (Number(row['is_encrypted']) !== 1) return { path: objectPath, temporary: false };
        if (!this.getVaultKey) throw new Error('Protected document decryption is unavailable.');
        if (!row['encryption_meta']) throw new Error('Protected document encryption metadata is missing.');
        const meta = JSON.parse(String(row['encryption_meta'])) as {
            version: number;
            algorithm: string;
            nonce: string;
            tag: string;
            wrappedKey: WrappedAttachmentKey;
            plaintextSha256: string;
            plaintextBytes: number;
        };
        if (
            meta.version !== 2 ||
            meta.algorithm !== 'aes-256-gcm' ||
            meta.plaintextSha256 !== String(row['sha256']) ||
            meta.plaintextBytes !== Number(row['size_bytes'])
        )
            throw new Error('This protected document uses unsupported or inconsistent encryption metadata.');
        const masterKey = this.getVaultKey();
        let dataKey: Buffer | null = null;
        const root = join(temporaryDirectory, 'devledger-protected-documents');
        const output = join(root, `${randomUUID()}${String(row['extension'])}`);
        try {
            await mkdir(root, { recursive: true, mode: 0o700 });
            await chmod(root, 0o700);
            dataKey = unwrapAttachmentKey(masterKey, meta.wrappedKey, id, String(row['sha256']));
            const decipher = createDecipheriv('aes-256-gcm', dataKey, Buffer.from(meta.nonce, 'base64'));
            decipher.setAAD(
                Buffer.from(`northstar-protected-document-data-v2:${id}:${String(row['sha256'])}`, 'utf8'),
            );
            decipher.setAuthTag(Buffer.from(meta.tag, 'base64'));
            await pipeline(
                createReadStream(objectPath),
                decipher,
                createWriteStream(output, { flags: 'wx', mode: 0o600 }),
            );
            const outputInfo = await stat(output);
            if (
                outputInfo.size !== Number(row['size_bytes']) ||
                (await sha256File(output)) !== String(row['sha256'])
            ) {
                throw new Error('The decrypted document failed its size or integrity check.');
            }
            this.decryptedTemporaryFiles.add(output);
            const timer = setTimeout(
                () => {
                    void this.removeTemporaryFile(output);
                },
                10 * 60 * 1000,
            );
            timer.unref();
            this.temporaryCleanupTimers.set(output, timer);
            return { path: output, temporary: true };
        } catch (error) {
            await rm(output, { force: true }).catch(() => undefined);
            if (
                error instanceof Error &&
                /Unsupported state|unable to authenticate|authenticate data/i.test(error.message)
            ) {
                throw new Error('The vault key is incorrect or the protected document has been damaged.');
            }
            throw error;
        } finally {
            masterKey.fill(0);
            dataKey?.fill(0);
        }
    }

    async removeTemporaryFile(path: string): Promise<void> {
        const timer = this.temporaryCleanupTimers.get(path);
        if (timer) clearTimeout(timer);
        this.temporaryCleanupTimers.delete(path);
        this.decryptedTemporaryFiles.delete(path);
        await rm(path, { force: true }).catch(() => undefined);
    }

    async cleanupDecryptedTemporaryFiles(): Promise<void> {
        await Promise.all([...this.decryptedTemporaryFiles].map((path) => this.removeTemporaryFile(path)));
    }

    private getById(id: string): DocumentRecord | undefined {
        const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
            Record<string, unknown> | undefined;
        return row ? mapDocumentRecord(row) : undefined;
    }
}
