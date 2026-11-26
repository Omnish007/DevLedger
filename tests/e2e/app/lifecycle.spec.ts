import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';

test('persists a project across renderer reload and Electron process restart', async ({ desktop }) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const projectName = data.project('Cold start persistence');

    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill(projectName);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();

    await desktop.restart();
    await desktop.page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(desktop.page.getByText(projectName, { exact: true })).toBeVisible();
});

test('opens supported minimum desktop viewport without clipping the main workspace', async ({ desktop }) => {
    const page = desktop.page;
    await page.setViewportSize({ width: 1080, height: 700 });
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByRole('button', { name: 'Create note' }).click();
    await page.getByPlaceholder('Untitled note').fill('Minimum viewport layout check');
    await expect(page.locator('.notes-sidebar')).toBeVisible();
    await expect(page.locator('.notes-writing-canvas')).toBeVisible();
    const sizes = await page.evaluate(() => {
        const sidebar = document.querySelector('.notes-sidebar')?.getBoundingClientRect();
        const editor = document.querySelector('.notes-writing-canvas')?.getBoundingClientRect();
        return {
            sidebarWidth: sidebar?.width ?? 0,
            editorWidth: editor?.width ?? 0,
            viewportWidth: document.documentElement.clientWidth,
        };
    });
    expect(sizes.sidebarWidth).toBeGreaterThan(190);
    expect(sizes.editorWidth).toBeGreaterThan(350);
    expect(sizes.viewportWidth).toBeGreaterThanOrEqual(1080);
});
