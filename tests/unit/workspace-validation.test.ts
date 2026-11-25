import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeObjectRelativePath } from '../../src/main/services/object-paths.ts';
import {
    validateWorkspaceObjects,
    WORKSPACE_OBJECT_VALIDATION_BATCH_SIZE,
} from '../../src/main/workspace-validation.ts';

test('object paths are canonical and safe across Windows and POSIX separators', () => {
    assert.equal(normalizeObjectRelativePath('objects/ab/file'), 'objects/ab/file');
    assert.equal(normalizeObjectRelativePath(String.raw`objects\ab\file`), 'objects/ab/file');
    assert.throws(() => normalizeObjectRelativePath('../secret'), /unsafe object path/);
    assert.throws(() => normalizeObjectRelativePath('objects/../secret'), /unsafe object path/);
    assert.throws(() => normalizeObjectRelativePath(String.raw`C:\objects\file`), /unsafe object path/);
    assert.throws(() => normalizeObjectRelativePath('/objects/file'), /unsafe object path/);
});

test('startup restore validation keyset-pages and canonicalizes legacy Windows object paths', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'devledger-workspace-validation-'));
    const rows = Array.from({ length: 405 }, (_, index) => ({
        id: `document-${String(index).padStart(4, '0')}`,
        object_relative_path: `objects\\${String(index % 17).padStart(2, '0')}\\document-${String(index).padStart(4, '0')}`,
    }));
    const pageSizes: number[] = [];
    const pageQuery = {
        all(lastId: string, limit: number) {
            const page = rows.filter((row) => row.id > lastId).slice(0, limit);
            pageSizes.push(page.length);
            return page;
        },
    };
    let updatedPaths = 0;
    const updateQuery = {
        run(path: string, id: string) {
            const row = rows.find((item) => item.id === id);
            assert.ok(row);
            row.object_relative_path = path;
            updatedPaths += 1;
        },
    };
    const database = {
        prepare(sql: string) {
            if (sql.includes('SELECT id, object_relative_path')) return pageQuery;
            if (sql.includes('UPDATE documents SET object_relative_path')) return updateQuery;
            throw new Error(`Unexpected SQL: ${sql}`);
        },
    };

    try {
        for (const row of rows) {
            const parts = row.object_relative_path.replace(/\\/g, '/').split('/');
            const parent = join(dataDirectory, ...parts.slice(0, -1));
            await mkdir(parent, { recursive: true });
            await writeFile(join(parent, parts.at(-1)!), 'object');
        }
        await validateWorkspaceObjects(database as never, dataDirectory);
        assert.equal(WORKSPACE_OBJECT_VALIDATION_BATCH_SIZE, 200);
        assert.deepEqual(pageSizes, [200, 200, 5, 0]);
        assert.equal(updatedPaths, 405);
        assert.ok(rows.every((row) => !row.object_relative_path.includes('\\')));
    } finally {
        await rm(dataDirectory, { recursive: true, force: true });
    }
});
