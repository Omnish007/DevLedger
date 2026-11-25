import { openDatabase, checkDatabaseIntegrity } from './database/connection.js';
import { validateWorkspaceObjects } from './workspace-validation.js';
import { recoverInterruptedRestore, rollbackPromotedRestore } from './services/restore-activation.js';
import {
    initializeWorkspaceDatabaseCore,
    resolveWorkspaceDatabasePath,
} from './workspace-database-startup-core.js';

/** Opens the workspace only after any interrupted restore has been resolved and validated. */
export async function initializeWorkspaceDatabase(dataDirectory: string) {
    const databasePath = resolveWorkspaceDatabasePath(dataDirectory);
    return initializeWorkspaceDatabaseCore(dataDirectory, databasePath, {
        openDatabase,
        closeDatabase: (database) => database.close(),
        checkDatabaseIntegrity,
        fullIntegrityCheck: (database) => String(database.pragma('integrity_check', { simple: true })),
        validateWorkspaceObjects,
        recoverInterruptedRestore,
        rollbackPromotedRestore,
        logWarning: (message, detail) => console.warn('[DevLedger]', message, detail ?? ''),
        logInfo: (message) => console.info('[DevLedger]', message),
    });
}
