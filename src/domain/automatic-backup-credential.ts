const AUTO_SNAPSHOT_NAME = /^snapshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.nsbackup$/;

/** Only timestamped local snapshots belong to DevLedger's automatic retention set. */
export function isAutomaticSnapshotName(name: string): boolean {
    return AUTO_SNAPSHOT_NAME.test(name);
}

/**
 * A missing OS-protected key must never be silently replaced when snapshots
 * already exist: doing so would permanently strand those encrypted backups.
 */
export function assertCredentialCanBeInitialized(snapshotNames: readonly string[]): void {
    if (snapshotNames.some(isAutomaticSnapshotName)) {
        throw new Error(
            'The OS-protected automatic-backup key is missing while automatic snapshots still exist. Automatic backups are paused to preserve those snapshots; restore the original key or manually recover the backups before reinitializing automatic backups.',
        );
    }
}
