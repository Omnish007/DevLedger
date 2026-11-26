import { BrowserWindow, globalShortcut, nativeTheme, session, shell } from 'electron';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isQuickCaptureShortcut } from '../domain/keyboard-shortcuts.js';
import { resolveAppIconPath } from './app-icon.js';

export class DesktopWindowManager {
    private primaryWindow: BrowserWindow | null = null;
    private activeCaptureShortcut: string | null = null;
    private permissionsConfigured = false;

    get mainWindow(): BrowserWindow | null {
        return this.primaryWindow;
    }

    private ensurePermissions(): void {
        if (this.permissionsConfigured) return;
        this.permissionsConfigured = true;
        const isTrustedOrigin = (originUrl: string): boolean => {
            try {
                const devUrl = process.env['ELECTRON_RENDERER_URL'];
                if (devUrl && originUrl.startsWith(new URL(devUrl).origin)) return true;
                return originUrl.startsWith('file://');
            } catch {
                return false;
            }
        };
        session.defaultSession.setPermissionCheckHandler(
            (_webContents, permission, requestingOrigin) =>
                permission === 'notifications' && isTrustedOrigin(requestingOrigin),
        );
        session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
            callback(permission === 'notifications' && isTrustedOrigin(webContents.getURL()));
        });
    }

    createMainWindow = (): BrowserWindow => {
        this.ensurePermissions();
        const window = this.createWindow();
        this.primaryWindow = window;
        return window;
    };

    openMainWindow = (): BrowserWindow => {
        if (!this.primaryWindow || this.primaryWindow.isDestroyed()) this.createMainWindow();
        const window = this.primaryWindow!;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
        return window;
    };

    openQuickCapture = (): void => {
        const existing = BrowserWindow.getAllWindows().find((window) =>
            window.getTitle().startsWith('Quick capture'),
        );
        if (existing) {
            existing.show();
            existing.focus();
            return;
        }
        const captureWindow = this.createWindow(true);
        captureWindow.center();
    };

    setQuickCaptureShortcut = (accelerator: string): boolean => {
        if (!isQuickCaptureShortcut(accelerator)) return false;
        if (this.activeCaptureShortcut === accelerator) return true;
        const previous = this.activeCaptureShortcut;
        if (previous) globalShortcut.unregister(previous);
        if (!globalShortcut.register(accelerator, this.openQuickCapture)) {
            if (previous && globalShortcut.register(previous, this.openQuickCapture))
                this.activeCaptureShortcut = previous;
            else this.activeCaptureShortcut = null;
            return false;
        }
        this.activeCaptureShortcut = accelerator;
        return true;
    };

    unregisterShortcuts(): void {
        globalShortcut.unregisterAll();
        this.activeCaptureShortcut = null;
    }

    private createWindow(capture = false): BrowserWindow {
        const iconPath = resolveAppIconPath();
        const window = new BrowserWindow({
            width: capture ? 620 : 1440,
            height: capture ? 460 : 940,
            minWidth: capture ? 480 : 1080,
            minHeight: capture ? 360 : 700,
            show: false,
            title: capture ? 'Quick capture — DevLedger' : 'DevLedger',
            ...(iconPath ? { icon: iconPath } : {}),
            autoHideMenuBar: true,
            backgroundColor: nativeTheme.shouldUseDarkColors ? '#111214' : '#f7f7f6',
            ...(capture ? { resizable: true, alwaysOnTop: true, minimizable: false } : { resizable: true }),
            webPreferences: {
                preload: join(__dirname, '../preload/index.cjs'),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                allowRunningInsecureContent: false,
            },
        });
        window.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith('https://')) void shell.openExternal(url);
            return { action: 'deny' };
        });
        window.webContents.on('will-navigate', (event, url) => {
            let allowed = false;
            try {
                const incoming = new URL(url);
                const devUrl = process.env['ELECTRON_RENDERER_URL'];
                if (devUrl) {
                    const expected = new URL(devUrl);
                    allowed =
                        incoming.origin === expected.origin &&
                        (incoming.pathname === '/' || incoming.pathname === '/index.html');
                } else if (incoming.protocol === 'file:') {
                    allowed =
                        resolve(fileURLToPath(incoming)) ===
                        resolve(join(__dirname, '../renderer/index.html'));
                }
            } catch {
                allowed = false;
            }
            if (!allowed) event.preventDefault();
        });
        if (process.env['ELECTRON_RENDERER_URL']) {
            const url = capture
                ? `${process.env['ELECTRON_RENDERER_URL']}?capture=1`
                : process.env['ELECTRON_RENDERER_URL'];
            void window.loadURL(url);
        } else {
            void window.loadFile(join(__dirname, '../renderer/index.html'), {
                query: capture ? { capture: '1' } : {},
            });
        }
        window.once('ready-to-show', () => window.show());
        window.on('closed', () => {
            if (this.primaryWindow === window) this.primaryWindow = null;
        });
        return window;
    }
}
