import { test, expect } from '../fixtures/app.fixture';

test('rejects malformed project data at the validated IPC boundary', async ({ desktop }) => {
  const message = await desktop.page.evaluate(async () => {
    const api = (window as unknown as { devLedger: { projects: { create(input: unknown): Promise<unknown> } } }).devLedger;
    try {
      await api.projects.create({ name: '   ', description: 'invalid request', type: 'not-a-project-type' });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });

  expect(message).toContain('Invalid projects:create request');
  await desktop.page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(desktop.page.getByRole('heading', { name: 'Projects' })).toBeVisible();
});

test('renderer cannot access Node globals or raw IPC even after navigating to sensitive settings', async ({ desktop }) => {
  await desktop.page.getByRole('button', { name: 'Settings', exact: true }).click();
  const values = await desktop.page.evaluate(() => {
    const surface = window as unknown as Record<string, unknown>;
    return {
      require: typeof surface['require'],
      process: typeof surface['process'],
      ipcRenderer: typeof surface['ipcRenderer'],
      devLedger: typeof surface['devLedger'],
    };
  });
  expect(values).toEqual({ require: 'undefined', process: 'undefined', ipcRenderer: 'undefined', devLedger: 'object' });
});
