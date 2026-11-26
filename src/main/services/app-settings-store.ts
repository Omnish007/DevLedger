import type Database from 'better-sqlite3';

/** Read and JSON-decode a single setting from app_settings, returning undefined if absent or invalid. */
export function readAppSettingJson<T = unknown>(db: Database.Database, key: string): T | undefined {
    const row = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key) as
        { value_json: string } | undefined;
    if (!row) return undefined;
    try {
        return JSON.parse(row.value_json) as T;
    } catch {
        return undefined;
    }
}

/** Read all persisted settings from app_settings as a key-value map. */
export function listAppSettings(db: Database.Database): Record<string, unknown> {
    const rows = db.prepare('SELECT key, value_json FROM app_settings').all() as Array<{
        key: string;
        value_json: string;
    }>;
    return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value_json) as unknown]));
}

/** Persist a single JSON-encoded setting into app_settings. */
export function writeAppSetting(
    db: Database.Database,
    key: string,
    value: unknown,
    updatedAt = new Date().toISOString(),
): void {
    db.prepare(
        `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(key, JSON.stringify(value), updatedAt);
}
