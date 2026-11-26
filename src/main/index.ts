import { app, BrowserWindow, Menu, powerMonitor } from 'electron';
import { resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { initializeWorkspaceDatabase } from './workspace-database-startup.js';
import { resolveWorkspaceDatabasePath } from './workspace-database-startup-core.js';
import { migrateLegacyUserDataDirectory } from './legacy-user-data-migration.js';
import { registerIpcHandlers } from './ipc/register.js';
import { AutomaticBackupManager } from './services/automatic-backup.js';
import { isQuickCaptureShortcut } from '../domain/keyboard-shortcuts.js';
import { DesktopWindowManager } from './desktop-window-manager.js';
import { resolveAppIconPath } from './app-icon.js';
import { DocumentWorkerSupervisor } from './document-worker-supervisor.js';
import { ReminderDeliveryController } from './reminder-delivery.js';
import { dispatchDeliveredNotifications } from './notification-dispatcher.js';
import { AutomaticBackupJobScheduler } from './automatic-backup-job-scheduler.js';
import { hasStagedRestore, promoteStagedRestore } from './services/restore-activation.js';

const APP_ID = 'com.devledger.desktop';
// Isolated user data for Playwright only; this cannot be enabled in packaged builds.
if (!app.isPackaged && process.env['DEVLEDGER_E2E'] === '1' && process.env['DEVLEDGER_TEST_USER_DATA']) {
    app.setPath('userData', resolve(process.env['DEVLEDGER_TEST_USER_DATA']));
}
app.setAppUserModelId(APP_ID);
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const windowManager = new DesktopWindowManager();
const documentWorkerSupervisor = new DocumentWorkerSupervisor();
let database: Database.Database | null = null;
let reminderInterval: NodeJS.Timeout | null = null;
let backupInterval: NodeJS.Timeout | null = null;
let reminderDelivery: ReminderDeliveryController | null = null;
let backupJobScheduler: AutomaticBackupJobScheduler | null = null;
let timerHeartbeatInterval: NodeJS.Timeout | null = null;
let vaultAutoLockInterval: NodeJS.Timeout | null = null;
let vaultService: ReturnType<typeof registerIpcHandlers>['vault'] | null = null;
let workspaceService: ReturnType<typeof registerIpcHandlers>['workspace'] | null = null;
let documentStorage: ReturnType<typeof registerIpcHandlers>['documents'] | null = null;
let backgroundJobs: ReturnType<typeof registerIpcHandlers>['jobs'] | null = null;
let isShuttingDown = false;
let automaticBackups: AutomaticBackupManager | null = null;
let shutdownAfterBackup = false;
let shutdownScheduled = false;
let shutdownRestoreCheckScheduled = false;
let shutdownRestoreCheckComplete = false;

function deliverDueReminders(): void {
    void reminderDelivery?.deliver();
}

function notifyVaultLocked(): void {
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('vault:auto-locked');
    }
}

function lockVaultForScreenLock(): void {
    if (!vaultService?.status().unlocked) return;
    vaultService.lock();
    void documentStorage?.cleanupDecryptedTemporaryFiles();
    notifyVaultLocked();
    console.info('[DevLedger] Protected notes vault locked because the operating system locked the session.');
}

function autoLockVault(): void {
    if (!vaultService?.status().unlocked || !database?.open) return;
    let timeoutMinutes = 15;
    try {
        const setting = database
            .prepare("SELECT value_json FROM app_settings WHERE key = 'vault.autoLockMinutes'")
            .get() as { value_json: string } | undefined;
        if (setting) timeoutMinutes = Number(JSON.parse(setting.value_json));
    } catch {
        return;
    }
    if (
        !Number.isInteger(timeoutMinutes) ||
        timeoutMinutes < 0 ||
        timeoutMinutes > 240 ||
        timeoutMinutes === 0
    )
        return;
    if (powerMonitor.getSystemIdleTime() < timeoutMinutes * 60) return;
    vaultService.lock();
    void documentStorage?.cleanupDecryptedTemporaryFiles();
    notifyVaultLocked();
    console.info('[DevLedger] Protected notes vault auto-locked after system inactivity.');
}

async function initialize(): Promise<void> {
    await app.whenReady();
    app.setAppUserModelId(APP_ID);
    const dockIcon = resolveAppIconPath();
    if (process.platform === 'darwin' && dockIcon && app.dock) app.dock.setIcon(dockIcon);
    Menu.setApplicationMenu(null);
    const dataDirectory = app.getPath('userData');
    const hasCustomTestData =
        !app.isPackaged &&
        process.env['DEVLEDGER_E2E'] === '1' &&
        Boolean(process.env['DEVLEDGER_TEST_USER_DATA']);
    if (!hasCustomTestData) {
        const migration = await migrateLegacyUserDataDirectory(app.getPath('appData'), dataDirectory);
        if (migration === 'migrated')
            console.info('[DevLedger] Existing workspace data was moved to the new application data folder.');
    }
    database = await initializeWorkspaceDatabase(dataDirectory);
    const services = registerIpcHandlers({
        db: database,
        dataDirectory,
        version: app.getVersion(),
        openQuickCapture: windowManager.openQuickCapture,
        setQuickCaptureShortcut: windowManager.setQuickCaptureShortcut,
        onRemindersChanged: () => reminderDelivery?.scheduleNext(),
        onDeliverDueReminders: () => reminderDelivery?.deliver() ?? Promise.resolve([]),
        onDispatchNotifications: (items) =>
            dispatchDeliveredNotifications(items, windowManager.openMainWindow, () => isShuttingDown),
    });
    vaultService = services.vault;
    workspaceService = services.workspace;
    documentStorage = services.documents;
    backgroundJobs = services.jobs;
    backupJobScheduler = new AutomaticBackupJobScheduler(services.jobs);
    if (!database) throw new Error('Database unavailable after initialization.');
    reminderDelivery = new ReminderDeliveryController(
        database,
        services.jobs,
        (items) => {
            dispatchDeliveredNotifications(items, windowManager.openMainWindow, () => isShuttingDown);
        },
        () => isShuttingDown,
    );
    const deviceUnlockSetting = database
        .prepare("SELECT value_json FROM app_settings WHERE key = 'vault.deviceUnlockEnabled'")
        .get() as { value_json: string } | undefined;
    if (deviceUnlockSetting) {
        try {
            if (JSON.parse(deviceUnlockSetting.value_json) === true) {
                const unlocked = await services.vaultDeviceKeyStore.unlock(services.vault);
                if (unlocked) console.info('[DevLedger] Vault unlocked using the OS credential store.');
                else
                    console.warn(
                        '[DevLedger] Device unlock is enabled but no protected key is available; unlock with the master passphrase or recovery key.',
                    );
            }
        } catch (error) {
            console.warn(
                '[DevLedger] Device unlock was unavailable; the vault remains locked.',
                error instanceof Error ? error.message : 'Unknown error',
            );
        }
    }
    backgroundJobs.start();
    automaticBackups = new AutomaticBackupManager(database, dataDirectory);
    void automaticBackups
        .start({ schedule: false, deferInitial: true })
        .then((result) => {
            backupJobScheduler?.setEnabled(result.enabled);
            if (result.enabled) {
                backgroundJobs?.register('backup.snapshot', async (_payload, context) => {
                    context.throwIfCancelled();
                    await automaticBackups?.runIfDue(true);
                    context.throwIfCancelled();
                    return { completedAt: new Date().toISOString() };
                });
                backupJobScheduler?.enqueue();
                backupInterval = setInterval(() => backupJobScheduler?.enqueue(), 30 * 60 * 1000);
                backupInterval.unref();
                console.info(
                    '[DevLedger] Encrypted local automatic backups scheduled through the persistent job runner.',
                );
            } else console.warn('[DevLedger] Automatic backups disabled:', result.reason);
        })
        .catch((error: unknown) =>
            console.error(
                '[DevLedger] Automatic backup scheduling could not start:',
                error instanceof Error ? error.message : 'Unknown error',
            ),
        );
    documentWorkerSupervisor.start(resolveWorkspaceDatabasePath(dataDirectory));
    windowManager.createMainWindow();
    reminderDelivery.scheduleNext();
    reminderInterval = setInterval(() => {
        void deliverDueReminders();
    }, 15_000);
    reminderInterval.unref();
    timerHeartbeatInterval = setInterval(() => {
        if (!isShuttingDown && database?.open) workspaceService?.heartbeatActiveTimer();
    }, 15_000);
    timerHeartbeatInterval.unref();
    powerMonitor.on('resume', deliverDueReminders);
    powerMonitor.on('lock-screen', lockVaultForScreenLock);
    vaultAutoLockInterval = setInterval(autoLockVault, 15_000);
    vaultAutoLockInterval.unref();

    let configuredShortcut = 'CommandOrControl+Shift+Space';
    try {
        const row = database
            .prepare("SELECT value_json FROM app_settings WHERE key = 'shortcuts.quickCapture'")
            .get() as { value_json: string } | undefined;
        if (row) {
            const value = JSON.parse(row.value_json) as unknown;
            if (isQuickCaptureShortcut(value)) configuredShortcut = value;
        }
    } catch {
        /* Keep the safe default shortcut if a preference cannot be read. */
    }
    if (!windowManager.setQuickCaptureShortcut(configuredShortcut)) {
        console.warn('[DevLedger] Configured global quick-capture shortcut is unavailable.');
        if (configuredShortcut !== 'CommandOrControl+Shift+Space')
            windowManager.setQuickCaptureShortcut('CommandOrControl+Shift+Space');
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) windowManager.createMainWindow();
    });
}

if (hasSingleInstanceLock) {
    void initialize().catch((error: unknown) => {
        console.error(
            '[DevLedger] Startup failed:',
            error instanceof Error ? error.message : 'Unknown startup error',
        );
        app.quit();
    });
}

app.on('before-quit', (event) => {
    if (shutdownRestoreCheckComplete) return;
    automaticBackups?.stop();
    if (backupInterval) clearInterval(backupInterval);
    if (!isShuttingDown && database?.open) workspaceService?.heartbeatActiveTimer();
    if (!shutdownAfterBackup && automaticBackups?.isBusy) {
        event.preventDefault();
        if (!shutdownScheduled) {
            shutdownScheduled = true;
            void automaticBackups.waitForIdle().finally(() => {
                shutdownAfterBackup = true;
                app.quit();
            });
        }
        return;
    }
    if (!shutdownRestoreCheckComplete) {
        event.preventDefault();
        isShuttingDown = true;
        if (timerHeartbeatInterval) clearInterval(timerHeartbeatInterval);
        if (!shutdownRestoreCheckScheduled) {
            shutdownRestoreCheckScheduled = true;
            void (async () => {
                windowManager.unregisterShortcuts();
                vaultService?.lock();
                await documentStorage?.cleanupDecryptedTemporaryFiles();
                reminderDelivery?.stop();
                if (reminderInterval) clearInterval(reminderInterval);
                if (backupInterval) clearInterval(backupInterval);
                if (timerHeartbeatInterval) clearInterval(timerHeartbeatInterval);
                if (vaultAutoLockInterval) clearInterval(vaultAutoLockInterval);
                powerMonitor.removeListener('resume', deliverDueReminders);
                powerMonitor.removeListener('lock-screen', lockVaultForScreenLock);
                await backgroundJobs?.stop();
                await documentWorkerSupervisor.stop();
                workspaceService = null;
                if (database?.open) {
                    database.pragma('wal_checkpoint(TRUNCATE)');
                    database.close();
                    database = null;
                }
                const dataDirectory = app.getPath('userData');
                if (await hasStagedRestore(dataDirectory)) {
                    const promoted = await promoteStagedRestore(dataDirectory);
                    if (promoted)
                        console.info(
                            '[DevLedger] Restore copy promoted safely. The next launch will validate the database and object store before committing it.',
                        );
                }
                shutdownRestoreCheckComplete = true;
                app.quit();
            })().catch((error: unknown) => {
                console.error(
                    '[DevLedger] Shutdown/restore preparation failed:',
                    error instanceof Error ? error.message : 'Unknown error',
                );
                shutdownRestoreCheckComplete = true;
                app.quit();
            });
        }
        return;
    }
});

if (hasSingleInstanceLock) {
    app.on('second-instance', () => {
        windowManager.openMainWindow();
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
