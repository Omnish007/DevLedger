import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { omitObjectPath, pagedExportRows, writeCsvFile, writeJsonFile } from '../../src/main/services/project-export-streams.ts';


test('paged export rows keyset through large tables and never expose the internal cursor', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE export_rows (id TEXT PRIMARY KEY, group_name TEXT NOT NULL, value TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO export_rows(id, group_name, value) VALUES (?, ?, ?)');
    for (let index = 0; index < 405; index += 1) {
      insert.run(`row-${String(index).padStart(4, '0')}`, index % 2 ? 'skip' : 'keep', `value-${index}`);
    }
    const query = 'SELECT rowid AS __export_cursor, id, value FROM export_rows WHERE group_name = ? AND rowid > ? ORDER BY rowid LIMIT ?';
    const received: Array<Record<string, unknown>> = [];
    for await (const row of pagedExportRows(db as never, query, ['keep'], undefined, 200)) received.push(row);
    assert.equal(received.length, 203);
    assert.equal(received.some((row) => '__export_cursor' in row), false);
    assert.equal(new Set(received.map((row) => row.id)).size, 203);
    assert.equal(received[0]?.id, 'row-0000');
    assert.equal(received.at(-1)?.id, 'row-0404');
  } finally {
    db.close();
  }
});

test('JSON export writes nested async record streams without materializing them', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'devledger-export-stream-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function* rows() {
    for (let index = 0; index < 405; index += 1) yield { id: `n-${index}`, body: `body-${index}` };
  }
  const path = join(root, 'nested', 'project.json');
  const measured = await writeJsonFile(path, { project: { id: 'p-1' }, notes: rows(), excluded: { locked: 2 } });
  const contents = await readFile(path, 'utf8');
  const parsed = JSON.parse(contents) as { project: { id: string }; notes: Array<{ id: string }>; excluded: { locked: number } };
  assert.equal(parsed.project.id, 'p-1');
  assert.equal(parsed.notes.length, 405);
  assert.equal(parsed.notes.at(-1)?.id, 'n-404');
  assert.deepEqual(parsed.excluded, { locked: 2 });
  assert.equal(measured.size, Buffer.byteLength(contents));
  assert.equal(measured.sha256, createHash('sha256').update(contents).digest('hex'));
});

test('CSV export streams rows and neutralizes spreadsheet formulas', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'devledger-export-csv-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function* rows() {
    yield { id: '1', title: '=SUM(A1:A2)' };
    yield { id: '2', title: 'Ordinary, "quoted" title' };
  }
  const path = join(root, 'tasks.csv');
  const result = await writeCsvFile(path, ['id', 'title'], rows());
  const contents = await readFile(path, 'utf8');
  assert.equal(contents, '"id","title"\r\n"1","\'=SUM(A1:A2)"\r\n"2","Ordinary, ""quoted"" title"');
  assert.equal(result.size, Buffer.byteLength(contents));
});

test('document export sanitization omits private object-store paths', async () => {
  async function* docs() {
    yield { id: 'd-1', title: 'Public metadata', object_relative_path: 'objects/secret-hash', sha256: 'abc' };
  }
  const result: Array<Record<string, unknown>> = [];
  for await (const row of omitObjectPath(docs())) result.push(row);
  assert.deepEqual(result, [{ id: 'd-1', title: 'Public metadata', sha256: 'abc' }]);
});

test('paged export rows rejects invalid page sizes before querying', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await assert.rejects(async () => {
      for await (const _row of pagedExportRows(db as never, 'SELECT 1 AS __export_cursor', [], undefined, 0)) void _row;
    }, /Invalid export page size/);
  } finally {
    db.close();
  }
});


test('JSON export fails before a project archive can contain an importer-rejected oversized project.json', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'devledger-export-limit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'project.json');
  await assert.rejects(() => writeJsonFile(path, { content: 'x'.repeat(100) }, undefined, 32), /safe import-size limit/i);
});
