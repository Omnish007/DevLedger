import { safeStorage } from 'electron';
import type { BackgroundJobRunner } from '../services/background-jobs.ts';
import { WorkspaceService } from '../services/workspace.ts';
import { DocumentStorageService } from '../services/storage.ts';
import { VaultService } from '../services/vault.ts';
import { BackupService } from '../services/backup.ts';
import { WorkspaceOperationsService } from '../services/operations.ts';
import { BackgroundJobRunner as JobRunner } from '../services/background-jobs.ts';
import { OllamaService } from '../services/ollama.ts';
import { ProjectExportService } from '../services/project-export.ts';
import { ProjectImportService } from '../services/project-import.ts';
import { auditLocalDocumentStorage, optimizeLocalDatabase, rebuildLocalSearchIndexes } from '../services/maintenance-jobs.ts';
import { NotificationInboxService } from '../services/notification-inbox.ts';
import { VaultDeviceKeyStore } from '../services/vault-device-key.ts';
import type { IpcDependencies, IpcHandlerContext } from './contracts.ts';
import { createIpcRegistrar } from './handler.ts';
import { registerWorkspaceHandlers } from './register-workspace.ts';
import { registerBackupHandlers } from './register-backup.ts';
import { registerDocumentHandlers } from './register-documents.ts';
import { registerOperationsHandlers } from './register-operations.ts';
import { registerAiHandlers } from './register-ai.ts';

export type { IpcDependencies } from './contracts.ts';

export function registerIpcHandlers(dependencies: IpcDependencies): {
  workspace: WorkspaceService;
  vault: VaultService;
  vaultDeviceKeyStore: VaultDeviceKeyStore;
  documents: DocumentStorageService;
  jobs: BackgroundJobRunner;
} {
  const workspace = new WorkspaceService(dependencies.db);
  const vault = new VaultService(dependencies.db);
  const vaultDeviceKeyStore = new VaultDeviceKeyStore(dependencies.dataDirectory, safeStorage);
  const documents = new DocumentStorageService(dependencies.db, dependencies.dataDirectory, () => vault.copyEncryptionKey());
  const backups = new BackupService(dependencies.db, dependencies.dataDirectory);
  const operations = new WorkspaceOperationsService(dependencies.db);
  const notifications = new NotificationInboxService(dependencies.db);
  const jobs = new JobRunner(dependencies.db, { concurrency: 1 });
  const ollama = new OllamaService(dependencies.db);
  const projectExports = new ProjectExportService(dependencies.db, dependencies.dataDirectory);
  const projectImports = new ProjectImportService(dependencies.db, dependencies.dataDirectory);

  jobs.register('semantic.index', async (_payload, context) => ollama.indexLocalKnowledge(context.signal, context.progress));
  jobs.register('ai.summarize', async (payload, context) => {
    context.throwIfCancelled();
    return ollama.summarize(typeof payload['query'] === 'string' ? payload['query'] : '', typeof payload['projectId'] === 'string' ? payload['projectId'] : null, context.signal);
  });
  jobs.register('project.export', async (payload, context) => {
    context.throwIfCancelled();
    if (typeof payload['projectId'] !== 'string' || typeof payload['targetPath'] !== 'string') throw new Error('Invalid project export job payload.');
    return projectExports.exportProject(payload['projectId'], payload['targetPath'], context.signal, context.progress);
  });
  jobs.register('project.import', async (payload, context) => {
    context.throwIfCancelled();
    if (typeof payload['archivePath'] !== 'string') throw new Error('Invalid project import job payload.');
    return projectImports.importProjectArchive(payload['archivePath'], context.signal, context.progress);
  });
  jobs.register('search.rebuild', async (_payload, context) => rebuildLocalSearchIndexes(dependencies.db, context));
  jobs.register('storage.audit', async (_payload, context) => auditLocalDocumentStorage(dependencies.db, dependencies.dataDirectory, context));
  jobs.register('maintenance.optimize', async (_payload, context) => optimizeLocalDatabase(dependencies.db, context));
  jobs.register('notifications.deliver', async (_payload, context) => {
    context.throwIfCancelled();
    const delivered = notifications.processDueReminders();
    return { count: delivered.notifications.length, notifications: delivered.notifications.map(({ title, body }) => ({ title, body })), hasMore: delivered.hasMore };
  });

  const context: IpcHandlerContext = { dependencies, workspace, vault, vaultDeviceKeyStore, documents, backups, operations, notifications, jobs, ollama };
  const register = createIpcRegistrar();
  registerWorkspaceHandlers(register, context);
  registerBackupHandlers(register, context);
  registerDocumentHandlers(register, context);
  registerOperationsHandlers(register, context);
  registerAiHandlers(register, context);
  return { workspace, vault, vaultDeviceKeyStore, documents, jobs };
}
