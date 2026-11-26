import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS } from './schema.ts';

export class DatabaseHealthError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'DatabaseHealthError';
    }
}

export function openDatabase(databasePath: string): Database.Database {
    mkdirSync(dirname(databasePath), { recursive: true });
    const db = new Database(databasePath, { timeout: 5_000, fileMustExist: false });
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('secure_delete = ON');
    db.pragma('temp_store = MEMORY');

    try {
        db.exec('CREATE VIRTUAL TABLE temp.fts5_probe USING fts5(value)');
        db.exec('DROP TABLE temp.fts5_probe');
    } catch (error) {
        db.close();
        throw new DatabaseHealthError(
            'This SQLite build does not provide FTS5. The application cannot safely enable search.',
            { cause: error },
        );
    }

    applyMigrations(db);
    return db;
}

function applyMigrations(db: Database.Database): void {
    const current = Number(db.pragma('user_version', { simple: true }));
    if (current > CURRENT_SCHEMA_VERSION) {
        throw new DatabaseHealthError(
            `Database schema ${current} is newer than this application supports (${CURRENT_SCHEMA_VERSION}).`,
        );
    }

    for (const migration of MIGRATIONS) {
        if (migration.version <= current) continue;
        const apply = db.transaction(() => {
            db.exec(migration.sql);
            db.pragma(`user_version = ${migration.version}`);
        });
        apply.immediate();
    }
}

export function checkDatabaseIntegrity(db: Database.Database): {
    quickCheck: string;
    foreignKeyViolations: number;
} {
    const result = db.pragma('quick_check', { simple: true });
    const foreignKeys = db.pragma('foreign_key_check') as Array<Record<string, unknown>>;
    return { quickCheck: String(result), foreignKeyViolations: foreignKeys.length };
}
