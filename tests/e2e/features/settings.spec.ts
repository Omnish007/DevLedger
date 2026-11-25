import { test, expect } from '../fixtures/app.fixture';

test('saves appearance preferences and restores them after a full application restart', async ({
    desktop,
}) => {
    const page = desktop.page;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await desktop.restart();
    await desktop.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(desktop.page.locator('html')).toHaveClass(/dark/);
    await expect(desktop.page.getByRole('button', { name: 'Dark', exact: true })).toBeVisible();

    // Restore the normal default inside the isolated profile before teardown.
    await desktop.page.getByRole('button', { name: 'System', exact: true }).click();
});

test('shows the actual isolated local data directory and supported global shortcut', async ({ desktop }) => {
    const page = desktop.page;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText(desktop.profileDirectory, { exact: true })).toBeVisible();
    const shortcut = page.getByLabel('Quick capture keyboard shortcut');
    await expect(shortcut).toBeVisible();
    await expect(shortcut).toHaveValue('CommandOrControl+Shift+Space');
});
