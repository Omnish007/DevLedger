import { test, expect } from '../fixtures/app.fixture';
import { WorkspacePage, workspaceRoutes } from '../pages/workspace.page';

test('opens every primary workspace route with its actual page heading @smoke', async ({ desktop }) => {
  const workspace = new WorkspacePage(desktop.page);
  for (const route of workspaceRoutes.slice(1)) {
    await workspace.navigate(route.label);
  }
  await workspace.navigate('Overview');
});

test('opens all Operations sections and renders their real content', async ({ desktop }) => {
  const page = desktop.page;
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Operations', exact: true })).toBeVisible();

  const expectedTabs = ['Tags', 'Links', 'Dependencies', 'Blockers', 'Reminders', 'Time', 'Activity', 'Background jobs', 'Inbox'];
  for (const tabName of expectedTabs) {
    await page.getByRole('tab', { name: tabName }).click();
    await expect(page.getByRole('tab', { name: tabName })).toHaveAttribute('data-state', 'active');
  }
  await expect(page.getByRole('heading', { name: 'Notification inbox' })).toBeVisible();
  await expect(page.getByText(/No notifications in this filter/)).toBeVisible();
});

test('command palette navigates with keyboard and closes with Escape', async ({ desktop }) => {
  const page = desktop.page;
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByPlaceholder(/search pages and actions/i).fill('Settings');
  await page.getByRole('option', { name: /Settings/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('primary navigation and visible buttons have accessible names', async ({ desktop }) => {
  const page = desktop.page;
  await expect(page.getByRole('main')).toBeVisible();
  for (const route of workspaceRoutes) {
    await expect(page.getByRole('button', { name: route.label, exact: true })).toHaveAccessibleName();
  }
  const visibleButtons = await page.locator('main button:visible').all();
  for (const button of visibleButtons) await expect(button).toHaveAccessibleName();
});
