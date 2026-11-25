import { test, expect } from '../fixtures/app.fixture';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { TestDataFactory } from '../helpers/test-data.factory';
import { createNote } from '../helpers/workspace-actions';

const vaultPassphrase = 'devledger-e2e-vault-passphrase-2026';
const backupPassphrase = 'devledger-e2e-backup-passphrase-2026';

async function chooseBackupFile(
    desktop: { application: import('@playwright/test').ElectronApplication },
    filePath: string,
): Promise<void> {
    // Only the operating-system dialog is controlled. Backup encryption,
    // decryption, validation, SQLite and object-store operations remain real.
    await desktop.application.evaluate(({ dialog }, selectedPath) => {
        Object.defineProperty(dialog, 'showSaveDialog', {
            configurable: true,
            writable: true,
            value: async () => ({ canceled: false, filePath: selectedPath }),
        });
        Object.defineProperty(dialog, 'showOpenDialog', {
            configurable: true,
            writable: true,
            value: async () => ({ canceled: false, filePaths: [selectedPath] }),
        });
    }, filePath);
}

test('creates a vault, protects a note, excludes it from search and unlocks it after restart', async ({
    desktop,
}) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const title = data.note('Protected decision record');
    const secretContent = `Private recovery test content ${data.label('vault-content', 'should-not-be-indexed')}`;

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const vault = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Protected notes vault' }) });
    await vault.getByLabel('Master passphrase').fill(vaultPassphrase);
    await vault.getByLabel('Confirm passphrase').fill(vaultPassphrase);
    await vault.getByRole('button', { name: 'Create vault' }).click();
    await expect(vault.getByText('Save this offline recovery key now')).toBeVisible({ timeout: 30_000 });
    await vault.getByRole('checkbox', { name: 'I have saved this recovery key offline.' }).click();
    await vault.getByRole('button', { name: 'Finish vault setup' }).click();
    await expect(vault.getByText('Unlocked', { exact: true })).toBeVisible();

    await createNote(page, title, secretContent);
    await page.getByRole('button', { name: 'Protect', exact: true }).click();
    await expect(page.getByRole('button', { name: /Locked note/ })).toBeVisible();

    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search workspace' }).fill(secretContent);
    await page.getByRole('button', { name: 'Search', exact: true }).last().click();
    await expect(page.getByText('No matching results')).toBeVisible();

    await desktop.restart();
    await desktop.page.getByRole('button', { name: 'Notes', exact: true }).click();
    await desktop.page.getByRole('button', { name: /Locked note/ }).click();
    await expect(desktop.page.getByRole('heading', { name: 'Protected note' })).toBeVisible();
    await expect(desktop.page.getByRole('button', { name: 'Unlock note' })).toBeDisabled();

    await desktop.page.getByRole('button', { name: 'Settings', exact: true }).click();
    const lockedVault = desktop.page
        .locator('section')
        .filter({ has: desktop.page.getByRole('heading', { name: 'Protected notes vault' }) });
    await expect(lockedVault.getByText('Locked', { exact: true })).toBeVisible();
    await lockedVault.getByLabel('Master passphrase').fill('incorrect-e2e-passphrase');
    await lockedVault.getByRole('button', { name: 'Unlock vault' }).click();
    await expect(desktop.page.getByRole('alert')).toBeVisible();
    await lockedVault.getByLabel('Master passphrase').fill(vaultPassphrase);
    await lockedVault.getByRole('button', { name: 'Unlock vault' }).click();
    await expect(lockedVault.getByText('Unlocked', { exact: true })).toBeVisible();

    await desktop.page.getByRole('button', { name: 'Notes', exact: true }).click();
    await desktop.page.getByRole('button', { name: /Locked note/ }).click();
    await expect(desktop.page.getByPlaceholder('Untitled note')).toHaveValue(title);
    await expect(desktop.page.locator('.notes-editor-content [contenteditable="true"]')).toContainText(
        secretContent,
    );
    await desktop.page.getByRole('button', { name: 'Lock now' }).click();
    await expect(desktop.page.getByRole('heading', { name: 'Choose a note to open' })).toBeVisible();
});

test('creates an encrypted backup, rejects a wrong passphrase and restores a validated copy without replacing live data', async ({
    desktop,
}) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const projectName = data.project('Backup source project');
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill(projectName);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();

    const backupDirectory = join(desktop.profileDirectory, 'e2e-backups');
    await mkdir(backupDirectory, { recursive: true });
    const backupPath = join(backupDirectory, 'isolated-workspace.nsbackup');
    await chooseBackupFile(desktop, backupPath);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByPlaceholder('Backup passphrase (12+ characters)').fill(backupPassphrase);
    await page.getByRole('button', { name: 'Create backup' }).click();
    await expect(page.getByRole('status')).toContainText('Encrypted backup created:', { timeout: 60_000 });
    expect((await stat(backupPath)).size).toBeGreaterThan(128);
    await page.getByRole('button', { name: 'I have stored this key' }).click();

    await page.getByPlaceholder('Backup passphrase').fill('wrong-backup-passphrase-2026');
    await page.getByRole('button', { name: 'Restore as copy' }).click();
    await expect(page.getByRole('alert')).toContainText(/backup passphrase is incorrect/i, {
        timeout: 60_000,
    });

    await page.getByPlaceholder('Backup passphrase').fill(backupPassphrase);
    await page.getByRole('button', { name: 'Restore as copy' }).click();
    await expect(page.getByRole('heading', { name: 'Verified restore copy is ready' })).toBeVisible({
        timeout: 60_000,
    });
    await expect(page.getByText(/Your current workspace is unchanged/)).toBeVisible();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate and restart' })).toBeEnabled();

    const restorePathText = await page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Encrypted backup and recovery copy' }) })
        .getByText(/restore-copies/)
        .textContent();
    expect(restorePathText).toContain(join(desktop.profileDirectory, 'restore-copies'));
});
