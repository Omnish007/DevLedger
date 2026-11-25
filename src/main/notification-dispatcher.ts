import { BrowserWindow, Notification } from 'electron';
import type { InboxNotification } from './services/notification-inbox.js';

const entityRouteMap: Record<string, 'projects' | 'notes' | 'tasks' | 'documents' | 'contacts'> = {
    project: 'projects',
    note: 'notes',
    task: 'tasks',
    document: 'documents',
    contact: 'contacts',
};

export function dispatchDeliveredNotifications(
    items: InboxNotification[],
    openMainWindow: () => BrowserWindow,
    isShuttingDown: () => boolean,
): boolean {
    if (!items.length || isShuttingDown()) return false;
    let nativeShown = false;
    if (Notification.isSupported()) {
        nativeShown = true;
        const batch = items.slice(0, 3);
        for (const item of batch) {
            const toastNotification = new Notification({
                title: item.title || 'DevLedger Reminder',
                body: item.body || 'Reminder is due.',
                silent: false,
            });
            toastNotification.on('click', () => {
                const win = openMainWindow();
                const view = entityRouteMap[item.entityType];
                if (view && item.entityId) {
                    const sendTarget = () => {
                        if (!win.isDestroyed()) {
                            win.webContents.send('notifications:open-target', {
                                view,
                                recordId: item.entityId,
                            });
                        }
                    };
                    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', sendTarget);
                    else sendTarget();
                }
            });
            toastNotification.show();
        }
        if (items.length > 3) {
            const overflow = new Notification({
                title: 'DevLedger',
                body: `${items.length - 3} more reminder${items.length - 3 === 1 ? '' : 's'} added to your inbox.`,
                silent: true,
            });
            overflow.on('click', openMainWindow);
            overflow.show();
        }
    }
    const payload = { notifications: items, nativeShown };
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && !win.webContents.isLoading()) {
            win.webContents.send('notifications:delivered', payload);
        }
    }
    return nativeShown;
}
