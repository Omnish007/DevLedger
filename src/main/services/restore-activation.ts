import { mkdir, rename, rm } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import {
    MARKER_NAME,
    assertNoSymlinks,
    assertRestoreDirectory,
    assertRollbackDirectory,
    exists,
    readMarker,
    writeMarker,
    validateRestoreDatabase,
} from './restore-activation-validation.ts';
import type { RestoreMarker } from './restore-activation-validation.ts';
export { stageRestoreCopy, validateRestoreObjectStore } from './restore-activation-validation.ts';

async function moveIfPresent(source: string, destination: string): Promise<void> {
    if (await exists(source)) {
        await mkdir(join(destination, '..'), { recursive: true });
        await rename(source, destination);
    }
}

async function rollbackMarker(dataDirectory: string, marker: RestoreMarker): Promise<void> {
    const liveDatabase = join(dataDirectory, 'northstar.sqlite');
    const liveObjects = join(dataDirectory, 'objects');
    const stagedDatabase = join(marker.restoreDirectory, 'northstar.sqlite');
    const stagedObjects = join(marker.restoreDirectory, 'objects');
    const rollbackRoot = assertRollbackDirectory(dataDirectory, marker.rollbackDirectory);
    const backupDatabase = join(rollbackRoot, 'northstar.sqlite');
    const backupObjects = join(rollbackRoot, 'objects');

    // If a staged item has moved, the corresponding staged path is absent and the
    // live path is the promoted copy. Remove only in that case; never delete the
    // untouched live workspace during recovery from an early crash.
    if (!(await exists(stagedDatabase)) && (await exists(liveDatabase)))
        await rm(liveDatabase, { force: true });
    if (marker.restoreHasObjects && !(await exists(stagedObjects)) && (await exists(liveObjects)))
        await rm(liveObjects, { recursive: true, force: true });
    if (await exists(backupDatabase)) {
        await rm(liveDatabase, { force: true });
        await rename(backupDatabase, liveDatabase);
    }
    if (await exists(backupObjects)) {
        await rm(liveObjects, { recursive: true, force: true });
        await rename(backupObjects, liveObjects);
    }
    const restoredDatabaseWasPromoted = !(await exists(stagedDatabase));
    for (const suffix of ['-wal', '-shm', '-journal']) {
        const backupSidecar = join(rollbackRoot, `northstar.sqlite${suffix}`);
        if (await exists(backupSidecar)) {
            await rm(`${liveDatabase}${suffix}`, { force: true });
            await rename(backupSidecar, `${liveDatabase}${suffix}`);
        } else if (restoredDatabaseWasPromoted) {
            await rm(`${liveDatabase}${suffix}`, { force: true });
        }
    }
    await rm(rollbackRoot, { recursive: true, force: true });
    await rm(join(dataDirectory, MARKER_NAME), { force: true });
}

export async function hasStagedRestore(dataDirectory: string): Promise<boolean> {
    const marker = await readMarker(dataDirectory);
    return marker?.phase === 'staged';
}

export async function promoteStagedRestore(
    dataDirectory: string,
    validateDatabase: (path: string) => Promise<void> = validateRestoreDatabase,
): Promise<boolean> {
    const marker = await readMarker(dataDirectory);
    if (!marker || marker.phase !== 'staged') return false;
    const restoreRoot = marker.restoreDirectory;
    await assertNoSymlinks(restoreRoot);
    await validateDatabase(join(restoreRoot, 'northstar.sqlite'));
    const rollbackRoot = assertRollbackDirectory(dataDirectory, marker.rollbackDirectory);
    const relativeRollback = relative(dataDirectory, rollbackRoot);
    await mkdir(rollbackRoot, { recursive: true, mode: 0o700 });
    const promoting = { ...marker, rollbackDirectory: relativeRollback, phase: 'promoting' as const };
    await writeMarker(dataDirectory, promoting);
    try {
        for (const suffix of ['', '-wal', '-shm', '-journal']) {
            await moveIfPresent(
                join(dataDirectory, `northstar.sqlite${suffix}`),
                join(rollbackRoot, `northstar.sqlite${suffix}`),
            );
        }
        await moveIfPresent(join(dataDirectory, 'objects'), join(rollbackRoot, 'objects'));
        await rename(join(restoreRoot, 'northstar.sqlite'), join(dataDirectory, 'northstar.sqlite'));
        if (await exists(join(restoreRoot, 'objects')))
            await rename(join(restoreRoot, 'objects'), join(dataDirectory, 'objects'));
        await writeMarker(dataDirectory, { ...promoting, phase: 'promoted' });
        return true;
    } catch (error) {
        await rollbackMarker(dataDirectory, promoting).catch((rollbackError) => {
            throw new Error(
                `Restore promotion failed (${error instanceof Error ? error.message : 'unknown error'}) and automatic rollback also failed (${rollbackError instanceof Error ? rollbackError.message : 'unknown error'}). Keep the workspace folder intact and contact support.`,
            );
        });
        throw error;
    }
}

export async function recoverInterruptedRestore(
    dataDirectory: string,
): Promise<'none' | 'rolled-back' | 'awaiting-validation'> {
    const marker = await readMarker(dataDirectory);
    if (!marker) return 'none';
    if (marker.phase === 'staged') return 'none';
    if (marker.phase === 'promoting' || marker.phase === 'rollback-requested') {
        await rollbackMarker(dataDirectory, marker);
        return 'rolled-back';
    }
    return 'awaiting-validation';
}

export async function rollbackPromotedRestore(dataDirectory: string): Promise<void> {
    const marker = await readMarker(dataDirectory);
    if (!marker || marker.phase !== 'promoted') throw new Error('There is no promoted restore to roll back.');
    await rollbackMarker(dataDirectory, marker);
}

export async function commitPromotedRestore(dataDirectory: string): Promise<void> {
    const marker = await readMarker(dataDirectory);
    if (!marker || marker.phase !== 'promoted') throw new Error('There is no promoted restore to commit.');
    const rollbackRoot = assertRollbackDirectory(dataDirectory, marker.rollbackDirectory);
    // Remove the marker first: a crash after this point leaves a valid promoted
    // workspace plus an orphan rollback folder, never an unrollbackable marker.
    await rm(join(dataDirectory, MARKER_NAME), { force: true });
    // Cleanup is best-effort after commit. A leftover recovery folder is safer
    // than reporting failure after the promoted workspace has become authoritative.
    await rm(rollbackRoot, { recursive: true, force: true }).catch(() => undefined);
    await rm(marker.restoreDirectory, { recursive: true, force: true }).catch(() => undefined);
}

export function describeStagedRestorePath(dataDirectory: string, restoreDirectory: string): string {
    const safe = assertRestoreDirectory(dataDirectory, restoreDirectory);
    return basename(safe);
}

export async function requestRollbackPromotedRestore(dataDirectory: string): Promise<void> {
    const marker = await readMarker(dataDirectory);
    if (!marker || marker.phase !== 'promoted')
        throw new Error('There is no promoted restore available to roll back.');
    const rollbackRoot = assertRollbackDirectory(dataDirectory, marker.rollbackDirectory);
    await writeMarker(dataDirectory, {
        ...marker,
        rollbackDirectory: relative(dataDirectory, rollbackRoot),
        phase: 'rollback-requested',
    });
}

export async function hasPromotedRestore(dataDirectory: string): Promise<boolean> {
    const marker = await readMarker(dataDirectory);
    return marker?.phase === 'promoted';
}
