import { app, BrowserWindow, globalShortcut, Menu, nativeTheme, session, shell } from 'electron';
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
        const existing = BrowserWindow.getAllWindows().find(
            (window) =>
                window.getTitle().startsWith('Quick capture') ||
                window.webContents.getURL().includes('capture=1'),
        );
        if (existing) {
            existing.show();
            existing.focus();
            return;
        }
        const captureWindow = this.createWindow(true);
        captureWindow.setSize(620, 460);
        if (process.platform !== 'linux' || process.env['DISPLAY'] || process.env['WAYLAND_DISPLAY']) {
            captureWindow.center();
        }
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
                devTools: !app.isPackaged,
            },
        });
        this.attachDevToolsInspection(window);
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
        window.once('ready-to-show', () => {
            if (capture) {
                const [width = 0, height = 0] = window.getSize();
                if (width < 480 || height < 360) window.setSize(620, 460);
            }
            window.show();
        });
        window.on('closed', () => {
            if (this.primaryWindow === window) this.primaryWindow = null;
        });
        return window;
    }

    private attachDevToolsInspection(window: BrowserWindow): void {
        if (app.isPackaged) return;
        window.webContents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return;
            const key = input.key.toLowerCase();
            const isInspectorToggle =
                input.key === 'F12' ||
                ((key === 'i' || key === 'j') &&
                    ((input.control && input.shift) || (input.meta && input.alt)));
            if (!isInspectorToggle) return;
            event.preventDefault();
            window.webContents.toggleDevTools();
        });
        if (process.env['DEVLEDGER_E2E'] === '1') return;
        window.webContents.on('context-menu', (_event, params) => {
            const template: Electron.MenuItemConstructorOptions[] = [];
            if (params.isEditable) {
                template.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' });
            } else if (params.selectionText.trim()) {
                template.push({ role: 'copy' }, { type: 'separator' });
            }
            template.push({
                label: 'Inspect Element',
                click: () => {
                    window.webContents.inspectElement(params.x, params.y);
                    window.webContents.devToolsWebContents?.focus();
                },
            });
            Menu.buildFromTemplate(template).popup({ window });
        });
    }
}
