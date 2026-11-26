import { app } from 'electron';
import { z } from 'zod';
import { readAppSettingJson } from '../services/app-settings-store.ts';
import {
    stageRestoreCopy,
    hasPromotedRestore,
    requestRollbackPromotedRestore,
    commitPromotedRestore,
} from '../services/restore-activation.ts';
import {
    validateDistinctExternalBackupDirectory,
    validateExternalBackupDirectory,
} from '../services/external-backup.ts';
import type { IpcHandlerContext, IpcRegistrar } from './contracts.ts';
import { showOpenDialogForEvent, showSaveDialogForEvent } from './dialogs.ts';
import { noInput } from './schemas.ts';

export function registerBackupHandlers(register: IpcRegistrar, context: IpcHandlerContext): void {
    const { dependencies, workspace, backups } = context;
    register('backup:create', z.string().min(12).max(1024), async (passphrase, event) => {
        const selection = await showSaveDialogForEvent(event, {
            title: 'Create encrypted DevLedger backup',
            defaultPath: `DevLedger-${new Date().toISOString().slice(0, 10)}.nsbackup`,
            filters: [{ name: 'DevLedger encrypted backup', extensions: ['nsbackup'] }],
        });
        if (selection.canceled || !selection.filePath) return null;
        return backups.createEncryptedBackup(selection.filePath, passphrase);
    });
    register(
        'backup:restoreAsCopy',
        z.tuple([z.string().min(1).max(1024), z.boolean()]),
        async ([secret, recovery], event) => {
            const selection = await showOpenDialogForEvent(event, {
                title: 'Choose encrypted DevLedger backup',
                properties: ['openFile'],
                filters: [{ name: 'DevLedger encrypted backup', extensions: ['nsbackup'] }],
            });
            if (selection.canceled || selection.filePaths.length === 0) return null;
            return backups.restoreAsCopy(selection.filePaths[0]!, secret, recovery);
        },
    );
    register('backup:activateRestoreCopy', z.string().min(1).max(4096), async (restorePath) => {
        await stageRestoreCopy(dependencies.dataDirectory, restorePath);
        setTimeout(() => {
            app.relaunch();
            app.quit();
        }, 350);
        return { staged: true, restartRequired: true };
    });
    register('backup:restoreActivationStatus', noInput, () => hasPromotedRestore(dependencies.dataDirectory));
    register('backup:rollbackRestoreActivation', noInput, async () => {
        await requestRollbackPromotedRestore(dependencies.dataDirectory);
        setTimeout(() => {
            app.relaunch();
            app.quit();
        }, 350);
    });
    register('backup:commitRestoreActivation', noInput, async () =>
        commitPromotedRestore(dependencies.dataDirectory),
    );

    register('backup:chooseExternalDestination', noInput, async (_input, event) => {
        const selection = await showOpenDialogForEvent(event, {
            title: 'Choose an independent backup destination',
            properties: ['openDirectory'],
            message: 'Choose an external drive or a directory on a separate storage device.',
        });
        if (selection.canceled || selection.filePaths.length === 0) return null;
        const destination = await validateExternalBackupDirectory(
            selection.filePaths[0]!,
            dependencies.dataDirectory,
        );
        if (destination.sameVolume)
            throw new Error(
                'Choose a different physical storage volume from DevLedger data for an independent copy.',
            );
        workspace.setSetting('backup.externalDirectory', destination.directory);
        workspace.setSetting('backup.externalSameVolume', destination.sameVolume);
        workspace.setSetting('backup.externalLastError', null);
        return destination;
    });
    register('backup:clearExternalDestination', noInput, () => {
        workspace.setSetting('backup.externalDirectory', null);
        workspace.setSetting('backup.externalSameVolume', null);
        workspace.setSetting('backup.externalLastError', null);
    });
    register('backup:chooseOfflineDestination', noInput, async (_input, event) => {
        const selection = await showOpenDialogForEvent(event, {
            title: 'Choose a separate removable/offline backup drive',
            properties: ['openDirectory'],
            message:
                'Choose another drive that is physically separate from both the computer and the first backup destination.',
        });
        if (selection.canceled || selection.filePaths.length === 0) return null;
        const externalDirectory = readAppSettingJson<unknown>(dependencies.db, 'backup.externalDirectory');
        if (externalDirectory === undefined)
            throw new Error(
                'Configure the first independent backup destination before adding a second drive.',
            );
        if (typeof externalDirectory !== 'string' || !externalDirectory)
            throw new Error('The first backup destination is not configured.');
        const destination = await validateDistinctExternalBackupDirectory(
            selection.filePaths[0]!,
            dependencies.dataDirectory,
            externalDirectory,
        );
        if (destination.sameVolume)
            throw new Error(
                'The second destination must be on a different storage volume from DevLedger data.',
            );
        workspace.setSetting('backup.offlineDirectory', destination.directory);
        workspace.setSetting('backup.offlineSameVolume', false);
        workspace.setSetting('backup.offlineLastError', null);
        return destination;
    });
    register('backup:clearOfflineDestination', noInput, () => {
        workspace.setSetting('backup.offlineDirectory', null);
        workspace.setSetting('backup.offlineSameVolume', null);
        workspace.setSetting('backup.offlineLastError', null);
    });
}
