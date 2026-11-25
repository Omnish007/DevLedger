import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import type {
    AppMetadata,
    ContactInput,
    NoteInput,
    PageRequest,
    ProjectInput,
    ProjectStatus,
    TaskInput,
    TaskStatus,
} from '../../shared/contracts.ts';
import type { IpcHandlerContext, IpcRegistrar } from './contracts.ts';
import {
    contactInput,
    idInput,
    noInput,
    noteInput,
    noteUpdate,
    pageRequest,
    projectInput,
    projectUpdate,
    taskInput,
    taskUpdate,
} from './schemas.ts';
import { isQuickCaptureShortcut } from '../../domain/keyboard-shortcuts.ts';

export function registerWorkspaceHandlers(register: IpcRegistrar, context: IpcHandlerContext): void {
    const { dependencies, workspace, vault, vaultDeviceKeyStore, documents, jobs, notifications } = context;
    register('app:metadata', noInput, (): AppMetadata => ({
        appName: 'DevLedger',
        version: dependencies.version,
        dataDirectory: dependencies.dataDirectory,
        platform: process.platform,
    }));
    register('dashboard:summary', noInput, () => workspace.dashboardSummary());
    register(
        'notifications:list',
        z.tuple([
            z.enum(['all', 'unread', 'read', 'dismissed']).optional(),
            z.number().int().min(1).max(100).optional(),
            z.object({ createdAt: z.string().datetime(), id: idInput }).optional(),
        ]),
        ([filter, limit, before]) => notifications.list(filter ?? 'all', limit ?? 100, before),
    );
    register('notifications:unreadCount', noInput, () => notifications.unreadCount());
    register('notifications:markRead', idInput, (id) => notifications.markRead(id));
    register(
        'notifications:snooze',
        z.tuple([idInput, z.union([z.literal(15), z.literal(60), z.literal(240), z.literal(1440)])]),
        ([id, minutes]) => {
            notifications.snooze(id, minutes);
            dependencies.onRemindersChanged?.();
        },
    );
    register('notifications:dismiss', idInput, (id) => notifications.dismiss(id));
    register('notifications:markAllRead', noInput, () => notifications.markAllRead());
    register('notifications:deliverDue', noInput, async () => {
        if (dependencies.onDeliverDueReminders) {
            const delivered = await dependencies.onDeliverDueReminders();
            return { notifications: delivered, nativeShown: Boolean(delivered.length) };
        }
        const result = notifications.processDueReminders();
        const nativeShown = result.notifications.length
            ? Boolean(dependencies.onDispatchNotifications?.(result.notifications))
            : false;
        return { notifications: result.notifications, nativeShown };
    });
    register('notifications:sendTest', noInput, () => {
        const item = notifications.createSystemNotification(
            'system',
            'Reminder alert test · DevLedger',
            'In-app and desktop/web reminder notifications are active.',
            `test:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        );
        dependencies.onDispatchNotifications?.([item]);
        return item;
    });

    register('projects:listPage', pageRequest, (input) =>
        workspace.listProjectsPage((input ?? {}) as PageRequest),
    );
    register('projects:getNames', z.array(idInput).max(200), (ids) => workspace.getProjectNames(ids));
    register('contacts:listPage', pageRequest, (input) =>
        workspace.listContactsPage((input ?? {}) as PageRequest),
    );
    register('contacts:get', idInput, (id) => workspace.getContactById(id));
    register('contacts:create', contactInput, (input) => workspace.createContact(input as ContactInput));
    register('contacts:update', z.tuple([idInput, contactInput.partial()]), ([id, input]) =>
        workspace.updateContact(id, input as Partial<ContactInput>),
    );
    register('contacts:remove', idInput, (id) => workspace.removeContact(id));
    register('projects:create', projectInput, (input) => workspace.createProject(input as ProjectInput));
    register('projects:update', z.tuple([idInput, projectUpdate]), ([id, input]) =>
        workspace.updateProject(id, input as Partial<ProjectInput> & { status?: ProjectStatus | undefined }),
    );
    register('projects:archive', idInput, (id) => workspace.archiveProject(id));
    register('projects:restore', idInput, (id) => workspace.restoreProject(id));
    register('projects:export', idInput, async (id, event) => {
        const project = dependencies.db
            .prepare('SELECT name FROM projects WHERE id = ? AND deleted_at IS NULL')
            .get(id) as { name: string } | undefined;
        if (!project) throw new Error('Project not found.');
        const safeName =
            project.name
                .replace(/[^a-zA-Z0-9._-]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 80) || 'project';
        const options = {
            title: 'Export project archive',
            defaultPath: `${safeName}-${new Date().toISOString().slice(0, 10)}.zip`,
            filters: [{ name: 'DevLedger project export', extensions: ['zip'] }],
        };
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const selection = owner
            ? await dialog.showSaveDialog(owner, options)
            : await dialog.showSaveDialog(options);
        if (selection.canceled || !selection.filePath) return null;
        return jobs.enqueueAndWait<string>(
            'project.export',
            'project',
            id,
            { projectId: id, targetPath: selection.filePath },
            { priority: 6 },
        );
    });
    register('projects:import', noInput, async (_input, event) => {
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const options = {
            title: 'Import DevLedger project archive',
            properties: ['openFile'] as Array<'openFile'>,
            filters: [{ name: 'DevLedger project export', extensions: ['zip'] }],
        };
        const selection = owner
            ? await dialog.showOpenDialog(owner, options)
            : await dialog.showOpenDialog(options);
        if (selection.canceled || selection.filePaths.length === 0) return null;
        return jobs.enqueueAndWait(
            'project.import',
            'workspace',
            'local',
            { archivePath: selection.filePaths[0]! },
            { priority: 6 },
        );
    });

    register('notes:listPage', pageRequest, (input) => workspace.listNotesPage((input ?? {}) as PageRequest));
    register('notes:get', idInput, (id) => workspace.getNoteById(id));
    register('notes:lock', idInput, (id) => vault.lockNote(id));
    register('notes:unlock', idInput, (id) => vault.unlockNote(id));
    register(
        'notes:saveLocked',
        z.tuple([
            idInput,
            z.object({
                title: z.string().max(240),
                content: z.string().max(2_000_000),
                projectId: z.string().uuid().nullable(),
            }),
        ]),
        ([id, input]) => vault.saveLockedNote(id, input),
    );
    register('notes:create', noteInput, (input) => workspace.createNote(input as NoteInput));
    register('notes:update', z.tuple([idInput, noteUpdate]), ([id, input]) =>
        workspace.updateNote(id, input as Partial<NoteInput>),
    );
    register('notes:remove', idInput, (id) => workspace.removeNote(id));
    register('capture:save', noteInput, (input, event) => {
        const note = workspace.createNote(input as NoteInput);
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        if (senderWindow?.getTitle().startsWith('Quick capture')) senderWindow.close();
        return note;
    });
    register('capture:open', noInput, () => dependencies.openQuickCapture?.());

    register('tasks:listPage', pageRequest, (input) => workspace.listTasksPage((input ?? {}) as PageRequest));
    register('tasks:getTitles', z.array(idInput).max(200), (ids) => workspace.getTaskTitles(ids));
    register('tasks:create', taskInput, (input) => workspace.createTask(input as TaskInput));
    register('tasks:update', z.tuple([idInput, taskUpdate]), ([id, input]) =>
        workspace.updateTask(id, input as Partial<TaskInput> & { status?: TaskStatus | undefined }),
    );
    register('tasks:remove', idInput, (id) => workspace.removeTask(id));
    register('tasks:startTimer', idInput, (id) => workspace.startTimer(id));
    register('tasks:stopTimer', idInput, (id) => workspace.stopTimer(id));
    register('tasks:activeTimer', noInput, () => workspace.getActiveTimer());
    register(
        'tasks:resolveTimerRecovery',
        z.tuple([idInput, z.enum(['resume', 'stop', 'discard']), z.string().datetime().optional()]),
        ([taskId, action, endedAt]) => workspace.resolveTimerRecovery(taskId, action, endedAt),
    );

    register('vault:status', noInput, () => vault.status());
    register('vault:setup', z.string().min(12).max(1024), (passphrase) => vault.setup(passphrase));
    register('vault:unlock', z.tuple([z.string().min(1).max(1024), z.boolean()]), ([secret, recovery]) =>
        recovery ? vault.unlockWithRecoveryKey(secret) : vault.unlockWithPassphrase(secret),
    );
    register('vault:lock', noInput, async () => {
        vault.lock();
        await documents.cleanupDecryptedTemporaryFiles();
    });
    register('vault:changePassphrase', z.string().min(12).max(1024), (passphrase) =>
        vault.changePassphrase(passphrase),
    );
    register('vault:configureDeviceUnlock', z.boolean(), async (enabled) => {
        if (enabled) {
            const key = vault.copyEncryptionKey();
            try {
                await vaultDeviceKeyStore.save(key);
            } finally {
                key.fill(0);
            }
        } else await vaultDeviceKeyStore.remove();
        workspace.setSetting('vault.deviceUnlockEnabled', enabled);
    });

    register('settings:list', noInput, () => workspace.getSettings());
    register('settings:set', z.tuple([z.string().min(1).max(64), z.unknown()]), ([key, value]) => {
        if (key === 'shortcuts.quickCapture') {
            if (!isQuickCaptureShortcut(value))
                throw new Error('Choose one of the supported quick-capture shortcuts.');
            if (!dependencies.setQuickCaptureShortcut?.(value))
                throw new Error(
                    'That global shortcut is already in use by another application. Choose a different shortcut.',
                );
        }
        workspace.setSetting(key, value);
    });
}
