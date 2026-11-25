import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
    assertBackupArchiveBudget,
    assertBackupCompressedArchiveSize,
    createBackupEntryExpansionGuard,
    MAX_BACKUP_ARCHIVE_ENTRIES,
    MAX_BACKUP_COMPRESSED_BYTES,
    MAX_BACKUP_MANIFEST_BYTES,
    MAX_BACKUP_UNCOMPRESSED_BYTES,
} from '../../src/main/services/backup-archive-limits.ts';
import { normalizeObjectRelativePath } from '../../src/main/services/object-paths.ts';
import {
    assertProjectArchiveBudget,
    assertProjectCompressedArchiveSize,
    MAX_PROJECT_ARCHIVE_ENTRIES,
    MAX_PROJECT_COMPRESSED_BYTES,
    MAX_PROJECT_MANIFEST_BYTES,
    MAX_PROJECT_UNCOMPRESSED_BYTES,
} from '../../src/main/services/project-archive-limits.ts';

test('workspace backup budget accepts the exact entry, expanded-size and manifest boundaries', () => {
    assert.doesNotThrow(() =>
        assertBackupArchiveBudget(
            MAX_BACKUP_ARCHIVE_ENTRIES - 1,
            MAX_BACKUP_UNCOMPRESSED_BYTES - MAX_BACKUP_MANIFEST_BYTES,
            MAX_BACKUP_MANIFEST_BYTES,
        ),
    );
    assert.doesNotThrow(() => assertBackupCompressedArchiveSize(MAX_BACKUP_COMPRESSED_BYTES));
});

test('workspace backup budget rejects excessive entries, expanded size and compressed archives', () => {
    assert.throws(() => assertBackupArchiveBudget(MAX_BACKUP_ARCHIVE_ENTRIES, 0, 0), /too many files/);
    assert.throws(
        () => assertBackupArchiveBudget(1, MAX_BACKUP_UNCOMPRESSED_BYTES, 1),
        /expanded backup size/,
    );
    assert.throws(() => assertBackupArchiveBudget(1, 0, MAX_BACKUP_MANIFEST_BYTES + 1), /manifest exceeds/);
    assert.throws(
        () => assertBackupCompressedArchiveSize(MAX_BACKUP_COMPRESSED_BYTES + 1),
        /compressed archive/,
    );
});

test('project export and import share identical archive budget boundaries', () => {
    assert.doesNotThrow(() =>
        assertProjectArchiveBudget(
            [MAX_PROJECT_UNCOMPRESSED_BYTES - MAX_PROJECT_MANIFEST_BYTES],
            MAX_PROJECT_MANIFEST_BYTES,
        ),
    );
    assert.doesNotThrow(() => assertProjectCompressedArchiveSize(MAX_PROJECT_COMPRESSED_BYTES));
    assert.throws(
        () => assertProjectArchiveBudget(Array(MAX_PROJECT_ARCHIVE_ENTRIES).fill(0), 0),
        /too many files/,
    );
    assert.throws(
        () => assertProjectArchiveBudget([MAX_PROJECT_UNCOMPRESSED_BYTES], 1),
        /expanded archive limit/,
    );
    assert.throws(() => assertProjectArchiveBudget([], MAX_PROJECT_MANIFEST_BYTES + 1), /manifest exceeds/);
    assert.throws(
        () => assertProjectCompressedArchiveSize(MAX_PROJECT_COMPRESSED_BYTES + 1),
        /compressed archive limit/,
    );
});

test('backup restore rejects actual streamed bytes beyond per-entry and aggregate limits', async () => {
    const sink = () =>
        new Writable({
            write(_chunk, _encoding, callback) {
                callback();
            },
        });
    await assert.rejects(
        pipeline(
            Readable.from([Buffer.from('four')]),
            createBackupEntryExpansionGuard(3, { total: 0 }, 100),
            sink(),
        ),
        /expanded beyond its declared or allowed size/,
    );
    const total = { total: 0 };
    await pipeline(Readable.from([Buffer.from('abc')]), createBackupEntryExpansionGuard(3, total, 5), sink());
    await assert.rejects(
        pipeline(Readable.from([Buffer.from('def')]), createBackupEntryExpansionGuard(3, total, 5), sink()),
        /expanded beyond its declared or allowed size/,
    );
});

test('archive path safety rejects host-absolute paths after Windows separator normalization', () => {
    assert.equal(normalizeObjectRelativePath(String.raw`objects\aa\file`), 'objects/aa/file');
    assert.throws(() => normalizeObjectRelativePath(String.raw`C:\objects\file`), /unsafe object path/);
});
