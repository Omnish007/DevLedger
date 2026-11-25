import { lstat, readdir, rename, rmdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

/** Historical database filename is intentionally retained for existing workspace and restore layouts. */
export const WORKSPACE_DATABASE_FILENAME = 'northstar.sqlite';
export const LEGACY_USER_DATA_DIRECTORY_NAMES = [
    'Northstar Workspace',
    'northstar-developer-workspace',
] as const;

export type LegacyUserDataMigrationResult = 'migrated' | 'already-current' | 'no-legacy-workspace';

function isMissing(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

async function inspectPath(path: string) {
    try {
        return await lstat(path);
    } catch (error) {
        if (isMissing(error)) return null;
        throw error;
    }
}

/**
 * Moves the previous Northstar user-data directory to DevLedger's current path.
 * The move is same-volume and atomic on supported filesystems; conflicting data
 * is never overwritten or merged implicitly.
 */
export async function migrateLegacyUserDataDirectory(
    appDataDirectory: string,
    currentUserDataDirectory: string,
): Promise<LegacyUserDataMigrationResult> {
    const currentDirectory = resolve(currentUserDataDirectory);
    const legacyDirectories = LEGACY_USER_DATA_DIRECTORY_NAMES.map((name) =>
        resolve(appDataDirectory, name),
    ).filter((path) => relative(path, currentDirectory) !== '' && relative(currentDirectory, path) !== '');
    const candidates: string[] = [];

    for (const legacyDirectory of legacyDirectories) {
        const legacyInfo = await inspectPath(legacyDirectory);
        if (!legacyInfo) continue;
        if (!legacyInfo.isDirectory() || legacyInfo.isSymbolicLink()) {
            throw new Error('A legacy DevLedger data location is not a safe directory; no data was changed.');
        }
        const legacyDatabase = await inspectPath(join(legacyDirectory, WORKSPACE_DATABASE_FILENAME));
        if (!legacyDatabase) continue;
        if (!legacyDatabase.isFile() || legacyDatabase.isSymbolicLink()) {
            throw new Error('A legacy workspace database is not a regular file; no data was changed.');
        }
        candidates.push(legacyDirectory);
    }

    if (candidates.length === 0) return 'no-legacy-workspace';
    if (candidates.length > 1) {
        throw new Error(
            'More than one legacy workspace database was found. Startup stopped without choosing or overwriting either workspace. Back up and reconcile the legacy folders before launching again.',
        );
    }
    const legacyDirectory = candidates[0]!;

    const currentInfo = await inspectPath(currentDirectory);
    if (currentInfo) {
        if (!currentInfo.isDirectory() || currentInfo.isSymbolicLink()) {
            throw new Error(
                'The new DevLedger data location is not a safe directory; the existing workspace was left untouched.',
            );
        }
        const currentDatabase = await inspectPath(join(currentDirectory, WORKSPACE_DATABASE_FILENAME));
        if (currentDatabase) {
            throw new Error(
                'Both legacy and DevLedger workspace databases exist. To protect your data, startup stopped without overwriting either workspace. Move or back up one workspace before launching again.',
            );
        }
        const currentEntries = await readdir(currentDirectory);
        if (currentEntries.length > 0) {
            throw new Error(
                'The new DevLedger data directory already contains files but no workspace database. Startup stopped to avoid mixing workspaces. Back up that folder before resolving the migration.',
            );
        }
        await rmdir(currentDirectory);
    }

    await rename(legacyDirectory, currentDirectory);
    return 'migrated';
}
