import { contextBridge, ipcRenderer } from 'electron';
import type { DevLedgerApi } from '../shared/contracts.js';

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    try {
        return (await ipcRenderer.invoke(channel, ...args)) as T;
    } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        const cleaned = raw
            .replace(/^(?:Error:\s*)?Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
            .trim();
        throw new Error(cleaned || 'The local request failed.');
    }
}

const api: DevLedgerApi = {
    app: { getMetadata: () => invoke('app:metadata') },
    dashboard: { getSummary: () => invoke('dashboard:summary') },
    contacts: {
        listPage: (input) => invoke('contacts:listPage', input ?? {}),
        get: (id) => invoke('contacts:get', id),
        create: (input) => invoke('contacts:create', input),
        update: (id, input) => invoke('contacts:update', [id, input]),
        remove: (id) => invoke('contacts:remove', id),
    },
    projects: {
        listPage: (input) => invoke('projects:listPage', input ?? {}),
        getNames: (ids) => invoke('projects:getNames', ids),
        create: (input) => invoke('projects:create', input),
        update: (id, input) => invoke('projects:update', [id, input]),
        archive: (id) => invoke('projects:archive', id),
        restore: (id) => invoke('projects:restore', id),
        export: (id) => invoke('projects:export', id),
        import: () => invoke('projects:import'),
    },
    notes: {
        listPage: (input) => invoke('notes:listPage', input ?? {}),
        get: (id) => invoke('notes:get', id),
        lock: (id) => invoke('notes:lock', id),
        unlock: (id) => invoke('notes:unlock', id),
        saveLocked: (id, input) => invoke('notes:saveLocked', [id, input]),
        create: (input) => invoke('notes:create', input),
        update: (id, input) => invoke('notes:update', [id, input]),
        remove: (id) => invoke('notes:remove', id),
    },
    tasks: {
        listPage: (input) => invoke('tasks:listPage', input ?? {}),
        getTitles: (ids) => invoke('tasks:getTitles', ids),
        relationSummaries: (ids) => invoke('tasks:relationSummaries', ids),
        create: (input) => invoke('tasks:create', input),
        update: (id, input) => invoke('tasks:update', [id, input]),
        remove: (id) => invoke('tasks:remove', id),
        startTimer: (taskId) => invoke('tasks:startTimer', taskId),
        stopTimer: (taskId) => invoke('tasks:stopTimer', taskId),
        getActiveTimer: () => invoke('tasks:activeTimer'),
        resolveTimerRecovery: (taskId, action, endedAt) =>
            invoke('tasks:resolveTimerRecovery', [taskId, action, endedAt]),
    },
    documents: {
        listPage: (input) => invoke('documents:listPage', input ?? {}),
        import: (projectId, protectWithVault = false) =>
            invoke('documents:import', [projectId ?? null, protectWithVault]),
        open: (id) => invoke('documents:open', id),
    },
    search: { query: (input) => invoke('search:query', input) },
    ai: {
        status: () => invoke('ai:status'),
        summarize: (query, projectId) => invoke('ai:summarize', [query, projectId ?? null]),
        indexSemanticKnowledge: () => invoke('ai:indexSemantic'),
        hybridSearch: (query, projectId) => invoke('ai:hybridSearch', [query, projectId ?? null]),
    },
    capture: {
        save: (input) => invoke('capture:save', input),
        open: () => invoke('capture:open'),
    },
    vault: {
        status: () => invoke('vault:status'),
        setup: (passphrase) => invoke('vault:setup', passphrase),
        unlock: (passphrase, recovery = false) => invoke('vault:unlock', [passphrase, recovery]),
        lock: () => invoke('vault:lock'),
        changePassphrase: (passphrase) => invoke('vault:changePassphrase', passphrase),
        configureDeviceUnlock: (enabled) => invoke('vault:configureDeviceUnlock', enabled),
        onAutoLock: (handler) => {
            const listener = () => handler();
            ipcRenderer.on('vault:auto-locked', listener);
            return () => ipcRenderer.removeListener('vault:auto-locked', listener);
        },
    },
    settings: {
        getAll: () => invoke('settings:list'),
        set: (key, value) => invoke('settings:set', [key, value]),
    },
    backups: {
        create: (passphrase) => invoke('backup:create', passphrase),
        restoreAsCopy: (secret, recovery = false) => invoke('backup:restoreAsCopy', [secret, recovery]),
        activateRestoreCopy: (path) => invoke('backup:activateRestoreCopy', path),
        getRestoreActivationStatus: () => invoke('backup:restoreActivationStatus'),
        rollbackRestoreActivation: () => invoke('backup:rollbackRestoreActivation'),
        commitRestoreActivation: () => invoke('backup:commitRestoreActivation'),
        chooseExternalDestination: () => invoke('backup:chooseExternalDestination'),
        clearExternalDestination: () => invoke('backup:clearExternalDestination'),
        chooseOfflineDestination: () => invoke('backup:chooseOfflineDestination'),
        clearOfflineDestination: () => invoke('backup:clearOfflineDestination'),
    },
    notifications: {
        list: (filter = 'all', limit = 100, before) => invoke('notifications:list', [filter, limit, before]),
        unreadCount: () => invoke('notifications:unreadCount'),
        markRead: (id) => invoke('notifications:markRead', id),
        snooze: (id, minutes) => invoke('notifications:snooze', [id, minutes]),
        dismiss: (id) => invoke('notifications:dismiss', id),
        markAllRead: () => invoke('notifications:markAllRead'),
        deliverDue: () => invoke('notifications:deliverDue'),
        sendTest: () => invoke('notifications:sendTest'),
        onDelivered: (handler) => {
            const listener = (_event: unknown, payload: Parameters<typeof handler>[0]) => handler(payload);
            ipcRenderer.on('notifications:delivered', listener);
            return () => ipcRenderer.removeListener('notifications:delivered', listener);
        },
        onOpenTarget: (handler) => {
            const listener = (_event: unknown, target: Parameters<typeof handler>[0]) => handler(target);
            ipcRenderer.on('notifications:open-target', listener);
            return () => ipcRenderer.removeListener('notifications:open-target', listener);
        },
    },
    operations: {
        listTagsPage: (input) => invoke('operations:tags:listPage', input),
        createTag: (name, color) => invoke('operations:tags:create', [name, color]),
        deleteTag: (tagId) => invoke('operations:tags:delete', tagId),
        listEntityTags: (type, id) => invoke('operations:tags:forEntity', [type, id]),
        assignTag: (type, id, tagId) => invoke('operations:tags:assign', [type, id, tagId]),
        unassignTag: (type, id, tagId) => invoke('operations:tags:unassign', [type, id, tagId]),
        createLink: (sourceType, sourceId, targetType, targetId, relationship) =>
            invoke('operations:links:create', [sourceType, sourceId, targetType, targetId, relationship]),
        listLinksPage: (type, id, input) => invoke('operations:links:listPage', [type, id, input]),
        removeLink: (linkId) => invoke('operations:links:remove', linkId),
        addDependency: (taskId, dependsOnTaskId) =>
            invoke('operations:dependencies:add', [taskId, dependsOnTaskId]),
        removeDependency: (taskId, dependsOnTaskId) =>
            invoke('operations:dependencies:remove', [taskId, dependsOnTaskId]),
        listDependencies: (taskId, input) => invoke('operations:dependencies:list', [taskId, input]),
        createBlocker: (taskId, reason, waitingContactId, followUpAt) =>
            invoke('operations:blockers:create', [taskId, reason, waitingContactId, followUpAt]),
        listBlockersPage: (input) => invoke('operations:blockers:listPage', input),
        resolveBlocker: (id, note) => invoke('operations:blockers:resolve', [id, note]),
        createReminder: (type, id, dueAt, message) =>
            invoke('operations:reminders:create', [type, id, dueAt, message]),
        listRemindersPage: (input) => invoke('operations:reminders:listPage', input),
        updateReminder: (id, action, dueAt, snoozeMinutes) =>
            invoke('operations:reminders:update', [id, action, dueAt, snoozeMinutes]),
        resolveRecordSummaries: (refs) => invoke('operations:records:summaries', refs),
        listTimeEntriesPage: (taskId, input) => invoke('operations:time:listPage', [taskId, input]),
        addManualTimeEntry: (taskId, startedAt, endedAt, note) =>
            invoke('operations:time:add', [taskId, startedAt, endedAt, note]),
        updateTimeEntry: (entryId, startedAt, endedAt, note) =>
            invoke('operations:time:update', [entryId, startedAt, endedAt, note]),
        deleteTimeEntry: (entryId) => invoke('operations:time:delete', entryId),
        listActivityPage: (input) => invoke('operations:activity:listPage', input),
        listJobsPage: (input) => invoke('operations:jobs:listPage', input),
        enqueueJob: (kind) => invoke('operations:jobs:enqueue', kind),
        cancelJob: (id) => invoke('operations:jobs:cancel', id),
    },
};

contextBridge.exposeInMainWorld('devLedger', api);
