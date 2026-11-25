import { join } from 'node:path';
import { WORKSPACE_DATABASE_FILENAME } from './legacy-user-data-migration.ts';

export function resolveWorkspaceDatabasePath(dataDirectory: string): string {
    return join(dataDirectory, WORKSPACE_DATABASE_FILENAME);
}

export type RestoreStartupState = 'none' | 'rolled-back' | 'awaiting-validation';

export interface StartupIntegrity {
    quickCheck: string;
    foreignKeyViolations: number;
}

export interface WorkspaceStartupDependencies<TDatabase> {
    openDatabase(path: string): TDatabase;
    closeDatabase(database: TDatabase): void;
    checkDatabaseIntegrity(database: TDatabase): StartupIntegrity;
    fullIntegrityCheck(database: TDatabase): string;
    validateWorkspaceObjects(database: TDatabase, dataDirectory: string): Promise<void>;
    recoverInterruptedRestore(dataDirectory: string): Promise<RestoreStartupState>;
    rollbackPromotedRestore(dataDirectory: string): Promise<void>;
    logWarning(message: string, detail?: string): void;
    logInfo(message: string): void;
}

/** Pure startup state machine; adapters keep Electron/native DB details outside the testable core. */
export async function initializeWorkspaceDatabaseCore<TDatabase>(
    dataDirectory: string,
    databasePath: string,
    dependencies: WorkspaceStartupDependencies<TDatabase>,
): Promise<TDatabase> {
    const state = await dependencies.recoverInterruptedRestore(dataDirectory);
    if (state === 'rolled-back')
        dependencies.logWarning(
            'An interrupted restore promotion was rolled back to the previous workspace.',
        );

    if (state === 'awaiting-validation') {
        let database = dependencies.openDatabase(databasePath);
        try {
            await dependencies.validateWorkspaceObjects(database, dataDirectory);
            const health = dependencies.checkDatabaseIntegrity(database);
            const fullIntegrity = dependencies.fullIntegrityCheck(database);
            if (health.quickCheck !== 'ok' || fullIntegrity !== 'ok' || health.foreignKeyViolations > 0) {
                throw new Error(
                    `Restored database integrity check failed: ${health.quickCheck}; ${fullIntegrity}; foreign-key violations: ${health.foreignKeyViolations}`,
                );
            }
            dependencies.logInfo(
                'Restored workspace passed startup validation. The previous workspace remains available until the user confirms or rolls back the restore in Settings.',
            );
            return database;
        } catch (restoreError) {
            dependencies.closeDatabase(database);
            await dependencies.rollbackPromotedRestore(dataDirectory);
            dependencies.logWarning(
                'Restored workspace failed startup validation. The previous workspace has been restored.',
                restoreError instanceof Error ? restoreError.message : 'Unknown error',
            );
            database = dependencies.openDatabase(databasePath);
            const rollbackHealth = dependencies.checkDatabaseIntegrity(database);
            if (rollbackHealth.quickCheck !== 'ok' || rollbackHealth.foreignKeyViolations > 0) {
                dependencies.closeDatabase(database);
                throw new Error(
                    `Workspace rollback completed, but the previous database still failed its integrity check: ${rollbackHealth.quickCheck}`,
                );
            }
            return database;
        }
    }

    const database = dependencies.openDatabase(databasePath);
    const health = dependencies.checkDatabaseIntegrity(database);
    if (health.quickCheck !== 'ok' || health.foreignKeyViolations > 0) {
        dependencies.closeDatabase(database);
        throw new Error(
            `Database integrity check failed: ${health.quickCheck}; foreign-key violations: ${health.foreignKeyViolations}`,
        );
    }
    return database;
}
