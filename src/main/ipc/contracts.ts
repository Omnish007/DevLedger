import type { IpcMainInvokeEvent } from 'electron';
import type Database from 'better-sqlite3';
import type { ZodType } from 'zod';
import type { WorkspaceService } from '../services/workspace.ts';
import type { DocumentStorageService } from '../services/storage.ts';
import type { VaultService } from '../services/vault.ts';
import type { BackupService } from '../services/backup.ts';
import type { WorkspaceOperationsService } from '../services/operations.ts';
import type { BackgroundJobRunner } from '../services/background-jobs.ts';
import type { OllamaService } from '../services/ollama.ts';
import type { InboxNotification, NotificationInboxService } from '../services/notification-inbox.ts';
import type { VaultDeviceKeyStore } from '../services/vault-device-key.ts';

export interface IpcDependencies {
    db: Database.Database;
    dataDirectory: string;
    version: string;
    openQuickCapture?: () => void;
    setQuickCaptureShortcut?: (accelerator: string) => boolean;
    onRemindersChanged?: () => void;
    onDeliverDueReminders?: () => Promise<InboxNotification[]>;
    onDispatchNotifications?: (items: InboxNotification[]) => boolean;
}

export type IpcRegistrar = <T>(
    channel: string,
    schema: ZodType<T>,
    action: (input: T, event: IpcMainInvokeEvent) => unknown | Promise<unknown>,
) => void;

export interface IpcHandlerContext {
    dependencies: IpcDependencies;
    workspace: WorkspaceService;
    vault: VaultService;
    vaultDeviceKeyStore: VaultDeviceKeyStore;
    documents: DocumentStorageService;
    backups: BackupService;
    operations: WorkspaceOperationsService;
    notifications: NotificationInboxService;
    jobs: BackgroundJobRunner;
    ollama: OllamaService;
}
