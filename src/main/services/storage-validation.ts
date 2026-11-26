import { lstat, open } from 'node:fs/promises';
import { extname } from 'node:path';
import { safeDisplayName } from '../../domain/validation.ts';
import type { WrappedAttachmentKey } from './attachment-crypto.ts';
import { ALLOWED_EXTENSIONS, MAX_IMPORT_BYTES } from './storage-helpers.ts';

export interface ValidatedDocumentSource {
    originalName: string;
    extension: string;
    sizeBytes: number;
}

export interface EncryptedDocumentMetadata {
    version: number;
    algorithm: string;
    nonce: string;
    tag: string;
    wrappedKey: WrappedAttachmentKey;
    plaintextSha256: string;
    plaintextBytes: number;
}

export async function validateDocumentImportSource(sourcePath: string): Promise<ValidatedDocumentSource> {
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
        !(signature[0] === 0x50 && signature[1] === 0x4b && [0x03, 0x05, 0x07].includes(signature[2] ?? -1))
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

    return { originalName, extension, sizeBytes: info.size };
}

export function parseEncryptedDocumentMetadata(
    rawMeta: unknown,
    expectedSha256: string,
    expectedBytes: number,
): EncryptedDocumentMetadata {
    if (!rawMeta) throw new Error('Protected document encryption metadata is missing.');
    const meta = JSON.parse(String(rawMeta)) as EncryptedDocumentMetadata;
    if (
        meta.version !== 2 ||
        meta.algorithm !== 'aes-256-gcm' ||
        meta.plaintextSha256 !== expectedSha256 ||
        meta.plaintextBytes !== expectedBytes
    ) {
        throw new Error('This protected document uses unsupported or inconsistent encryption metadata.');
    }
    return meta;
}
