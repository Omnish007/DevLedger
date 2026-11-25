import { test, expect } from '../fixtures/app.fixture';

test('launches a fresh isolated workspace and initializes the main window @smoke', async ({ desktop }) => {
  const actualUserData = await desktop.application.evaluate(({ app }) => app.getPath('userData'));
  expect(actualUserData).toBe(desktop.profileDirectory);
  await expect(desktop.page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(desktop.page.getByRole('main')).toBeVisible();
  await expect(desktop.page.getByText('No active projects yet.')).toBeVisible();
  expect(desktop.diagnostics.pageErrors).toEqual([]);
});

test('keeps Electron privileges in the main process and exposes only the narrow preload API', async ({ desktop }) => {
  const preferences = await desktop.application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    const webContents = window?.webContents as unknown as {
      getLastWebPreferences?: () => {
        nodeIntegration?: boolean;
        contextIsolation?: boolean;
        sandbox?: boolean;
        webSecurity?: boolean;
        allowRunningInsecureContent?: boolean;
      };
    } | undefined;
    const value = webContents?.getLastWebPreferences?.();
    return value ? {
      nodeIntegration: value.nodeIntegration,
      contextIsolation: value.contextIsolation,
      sandbox: value.sandbox,
      webSecurity: value.webSecurity,
      allowRunningInsecureContent: value.allowRunningInsecureContent,
    } : null;
  });

  expect(preferences).not.toBeNull();
  expect(preferences).toMatchObject({
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  });

  const rendererSurface = await desktop.page.evaluate(() => {
    const surface = window as unknown as {
      devLedger?: Record<string, unknown>;
      require?: unknown;
      process?: unknown;
      ipcRenderer?: unknown;
    };
    return {
      apiAvailable: Boolean(surface.devLedger),
      apiKeys: Object.keys(surface.devLedger ?? {}).sort(),
      hasRequire: typeof surface.require !== 'undefined',
      hasProcess: typeof surface.process !== 'undefined',
      hasRawIpc: typeof surface.ipcRenderer !== 'undefined',
    };
  });

  expect(rendererSurface.apiAvailable).toBe(true);
  expect(rendererSurface.apiKeys).toEqual(expect.arrayContaining(['app', 'projects', 'notes', 'tasks', 'documents', 'settings', 'backups', 'operations']));
  expect(rendererSurface.hasRequire).toBe(false);
  expect(rendererSurface.hasProcess).toBe(false);
  expect(rendererSurface.hasRawIpc).toBe(false);
});

test('does not raise an unhandled renderer exception during bootstrap', async ({ desktop }) => {
  await expect(desktop.page.getByRole('button', { name: 'Projects', exact: true })).toBeVisible();
  await expect(desktop.page.getByRole('button', { name: 'Notes', exact: true })).toBeVisible();
  await expect(desktop.page.getByRole('button', { name: 'Tasks', exact: true })).toBeVisible();
  expect(desktop.diagnostics.pageErrors).toEqual([]);
});
