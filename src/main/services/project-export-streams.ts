import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import type Database from 'better-sqlite3';
import { csvCell } from '../../domain/export-safety.ts';

export type ExportRow = Record<string, unknown>;
export interface StreamedFile {
    path: string;
    filePath: string;
    size: number;
    sha256: string;
}

async function* serializeJson(value: unknown): AsyncGenerator<string> {
    if (value && typeof value === 'object' && Symbol.asyncIterator in value) {
        yield '[';
        let first = true;
        for await (const item of value as AsyncIterable<unknown>) {
            if (!first) yield ',';
            first = false;
            yield* serializeJson(item);
        }
        yield ']';
        return;
    }
    if (Array.isArray(value)) {
        yield '[';
        for (let index = 0; index < value.length; index += 1) {
            if (index) yield ',';
            yield* serializeJson(value[index]);
        }
        yield ']';
        return;
    }
    if (value && typeof value === 'object') {
        yield '{';
        let first = true;
        for (const [key, item] of Object.entries(value)) {
            if (item === undefined) continue;
            if (!first) yield ',';
            first = false;
            yield `${JSON.stringify(key)}:`;
            yield* serializeJson(item);
        }
        yield '}';
        return;
    }
    const serialized = JSON.stringify(value);
    yield serialized === undefined ? 'null' : serialized;
}

async function writeChunks(
    filePath: string,
    chunks: AsyncIterable<string | Buffer>,
    signal?: AbortSignal,
    maximumBytes = Number.MAX_SAFE_INTEGER,
): Promise<Omit<StreamedFile, 'path' | 'filePath'>> {
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
    const hash = createHash('sha256');
    let size = 0;
    const meter = new Transform({
        transform(chunk: Buffer | string, encoding, callback) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
            size += buffer.length;
            if (!Number.isSafeInteger(size) || size > maximumBytes) {
                callback(new Error('The project JSON data file exceeds the safe import-size limit.'));
                return;
            }
            hash.update(buffer);
            callback(null, buffer);
        },
    });
    await pipeline(
        Readable.from(chunks),
        meter,
        createWriteStream(filePath, { flags: 'wx', mode: 0o600 }),
        signal ? { signal } : {},
    );
    return { size, sha256: hash.digest('hex') };
}

export async function writeJsonFile(
    filePath: string,
    value: unknown,
    signal?: AbortSignal,
    maximumBytes = Number.MAX_SAFE_INTEGER,
): Promise<Omit<StreamedFile, 'path' | 'filePath'>> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
        throw new Error('Invalid JSON export size limit.');
    return writeChunks(filePath, serializeJson(value), signal, maximumBytes);
}

export async function writeCsvFile(
    filePath: string,
    headers: readonly string[],
    rows: AsyncIterable<ExportRow>,
    signal?: AbortSignal,
): Promise<Omit<StreamedFile, 'path' | 'filePath'>> {
    async function* csvChunks(): AsyncGenerator<string> {
        if (!headers.length) return;
        yield headers.map((header) => csvCell(header)).join(',');
        for await (const row of rows) {
            signal?.throwIfAborted();
            yield `\r\n${headers.map((header) => csvCell(row[header])).join(',')}`;
        }
    }
    return writeChunks(filePath, csvChunks(), signal);
}

/** Keyset-paginate a query that selects rowid AS __export_cursor. The cursor never reaches exported JSON. */
export async function* pagedExportRows(
    db: Database.Database,
    sql: string,
    parameters: readonly unknown[] = [],
    signal?: AbortSignal,
    pageSize = 200,
): AsyncGenerator<ExportRow> {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500)
        throw new Error('Invalid export page size.');
    const statement = db.prepare(sql);
    let cursor = 0;
    while (true) {
        signal?.throwIfAborted();
        const page = statement.all(...parameters, cursor, pageSize) as Array<
            ExportRow & { __export_cursor: number }
        >;
        if (!page.length) return;
        for (const source of page) {
            signal?.throwIfAborted();
            const { __export_cursor: _cursor, ...row } = source;
            yield row;
        }
        cursor = page[page.length - 1]!.__export_cursor;
        if (!Number.isSafeInteger(cursor))
            throw new Error('The export query returned an invalid pagination cursor.');
        if (page.length < pageSize) return;
        await yieldToEventLoop();
    }
}

export async function* omitObjectPath(rows: AsyncIterable<ExportRow>): AsyncGenerator<ExportRow> {
    for await (const row of rows) {
        const { object_relative_path: _objectPath, ...safe } = row;
        yield safe;
    }
}
