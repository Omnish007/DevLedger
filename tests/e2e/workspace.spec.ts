import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let application: ElectronApplication | undefined;
let page: Page | undefined;
let userDataDirectory = '';

async function launchWorkspace(reuseUserData = false): Promise<void> {
    if (!existsSync(resolve('out/main/index.cjs')))
        throw new Error('Electron E2E tests require a production build first. Run npm run build.');
    if (!reuseUserData || !userDataDirectory)
        userDataDirectory = await mkdtemp(join(tmpdir(), 'devledger-e2e-'));
    const launchEnv: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string' && entry[0] !== 'ELECTRON_RUN_AS_NODE',
            ),
        ),
        DEVLEDGER_E2E: '1',
        DEVLEDGER_TEST_USER_DATA: userDataDirectory,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    };
    const headlessArgs =
        !process.env['DISPLAY'] && !process.env['WAYLAND_DISPLAY']
            ? ['--ozone-platform=headless', '--disable-gpu']
            : [];
    application = await electron.launch({
        args: [resolve('.'), ...headlessArgs],
        env: launchEnv,
        timeout: 30_000,
    });
    page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

test.beforeEach(async () => {
    await launchWorkspace();
});
test.afterEach(async () => {
    await application?.close().catch(() => undefined);
    application = undefined;
    page = undefined;
    if (userDataDirectory) await rm(userDataDirectory, { recursive: true, force: true });
    userDataDirectory = '';
});

test('creates a project and persists it across a window reload', async () => {
    const currentPage = page!;
    await currentPage.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(currentPage.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await currentPage.getByRole('button', { name: 'New project' }).click();
    await currentPage.getByLabel('Project name').fill('E2E Workspace Project');
    await currentPage.getByRole('button', { name: 'Create project' }).click();
    await expect(currentPage.getByText('E2E Workspace Project', { exact: true })).toBeVisible();
    await currentPage.reload();
    await expect(currentPage.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await currentPage.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(currentPage.getByText('E2E Workspace Project', { exact: true })).toBeVisible();
    await currentPage.getByRole('button', { name: 'Tasks', exact: true }).click();
    await currentPage.getByRole('button', { name: 'New task', exact: true }).click();
    await currentPage.getByPlaceholder('What needs to be done?').fill('E2E verify task persistence');
    await currentPage.getByRole('combobox', { name: 'Choose project' }).click();
    await currentPage.getByPlaceholder('Search projects…').fill('E2E Workspace Project');
    await currentPage.getByRole('option', { name: 'E2E Workspace Project' }).click();
    await currentPage.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(currentPage.getByText('E2E verify task persistence', { exact: true })).toBeVisible();
    await currentPage.reload();
    await expect(currentPage.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await currentPage.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(currentPage.getByText('E2E verify task persistence', { exact: true })).toBeVisible();
});

test('navigates core workspace views and exposes accessible page headings', async () => {
    const currentPage = page!;
    const views = [
        { label: 'Documents', heading: 'Documents' },
        { label: 'Contacts', heading: 'Contacts' },
        { label: 'Settings', heading: 'Settings' },
    ];
    for (const view of views) {
        await currentPage.getByRole('button', { name: view.label, exact: true }).click();
        await expect(currentPage.getByRole('heading', { name: view.heading })).toBeVisible();
    }
    await currentPage.getByRole('button', { name: 'Documents', exact: true }).click();
    await expect(
        currentPage.getByRole('textbox', { name: 'Filter documents by title or filename' }),
    ).toBeVisible();
    await expect(currentPage.getByRole('combobox', { name: 'Filter project' })).toBeVisible();
    await expect(currentPage.getByRole('button', { name: 'Refresh documents' })).toBeVisible();
    await expect(currentPage.getByRole('checkbox', { name: 'Encrypt with vault' })).toBeDisabled();
});

test('opens command navigation with the keyboard', async () => {
    const currentPage = page!;
    await currentPage.keyboard.press('Control+k');
    await expect(currentPage.getByRole('dialog')).toBeVisible();
    await expect(currentPage.getByPlaceholder(/Jump to a note, task/i)).toBeVisible();
    await currentPage.keyboard.press('Escape');
    await expect(currentPage.getByRole('dialog')).toBeHidden();
});

test('visible controls have computed accessible names and the window has a main landmark', async () => {
    const currentPage = page!;
    await expect(currentPage.getByRole('main')).toBeVisible();
    const visibleButtons = await currentPage.locator('button:visible').all();
    for (const button of visibleButtons) {
        await expect(button).toHaveAccessibleName(/\S/);
    }
});

test('keyboard focus can reach the workspace navigation', async () => {
    const currentPage = page!;
    await currentPage.keyboard.press('Tab');
    const focus = await currentPage.evaluate(() => ({
        tag: document.activeElement?.tagName ?? '',
        visible:
            document.activeElement instanceof HTMLElement &&
            document.activeElement.getClientRects().length > 0,
        focusVisible:
            document.activeElement instanceof HTMLElement && document.activeElement.matches(':focus-visible'),
    }));
    expect(focus.tag).not.toBe('BODY');
    expect(focus.visible).toBe(true);
    expect(focus.focusVisible).toBe(true);
});

test('notification inbox is available and exposes its empty state', async () => {
    const currentPage = page!;
    await currentPage.getByRole('button', { name: /Inbox notifications/i }).click();
    await expect(currentPage.getByText('Inbox', { exact: true })).toBeVisible();
    await expect(currentPage.getByText(/You’re all caught up/)).toBeVisible();
});

test('task creation validates required fields with an accessible message', async () => {
    const currentPage = page!;
    await currentPage.getByRole('button', { name: 'Tasks', exact: true }).click();
    await currentPage.getByRole('button', { name: 'New task', exact: true }).click();
    await currentPage.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(currentPage.getByRole('alert').filter({ hasText: 'Enter a task title.' })).toBeVisible();
});

test('a timer surviving an application restart requires explicit recovery', async () => {
    const currentPage = page!;
    await currentPage.getByRole('button', { name: 'Projects', exact: true }).click();
    await currentPage.getByRole('button', { name: 'New project' }).click();
    await currentPage.getByLabel('Project name').fill('Timer recovery E2E project');
    await currentPage.getByRole('button', { name: 'Create project' }).click();
    await currentPage.getByRole('button', { name: 'Tasks', exact: true }).click();
    await currentPage.getByRole('button', { name: 'New task', exact: true }).click();
    await currentPage.getByPlaceholder('What needs to be done?').fill('Recover timer after restart');
    await currentPage.getByRole('combobox', { name: 'Choose project' }).click();
    await currentPage.getByPlaceholder('Search projects…').fill('Timer recovery E2E project');
    await currentPage.getByRole('option', { name: 'Timer recovery E2E project' }).click();
    await currentPage.getByRole('button', { name: 'Create task', exact: true }).click();
    await currentPage.locator('button[title="Start timer"]').first().click();
    await expect(currentPage.getByText(/Timer running/)).toBeVisible();
    await application!.close();
    application = undefined;
    page = undefined;
    await launchWorkspace(true);
    await page!.getByRole('button', { name: 'Tasks', exact: true }).click();
    const recoveryPrompt = page!.getByText('Confirm interrupted work session');
    await expect(recoveryPrompt).toBeVisible();
    await page!.getByRole('button', { name: 'Discard', exact: true }).click();
    const confirmation = page!.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(recoveryPrompt).toBeHidden();
});
