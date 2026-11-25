import { test, expect } from '../fixtures/app.fixture';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function selectNativeFile(
    desktop: { application: import('@playwright/test').ElectronApplication },
    filePath: string,
): Promise<void> {
    // Stub only the operating-system file chooser boundary. The real renderer,
    // preload, IPC validation, document service, SQLite and object store remain active.
    await desktop.application.evaluate(({ dialog }, selectedPath) => {
        Object.defineProperty(dialog, 'showOpenDialog', {
            configurable: true,
            writable: true,
            value: async () => ({ canceled: false, filePaths: [selectedPath] }),
        });
    }, filePath);
}

test('imports a Markdown document through the real UI, IPC handler and local object store', async ({
    desktop,
}) => {
    const page = desktop.page;
    const fixtureDirectory = join(desktop.profileDirectory, 'e2e-source-files');
    await mkdir(fixtureDirectory, { recursive: true });
    const filePath = join(fixtureDirectory, 'architecture-reference.md');
    await writeFile(filePath, '# Architecture reference\n\nA local-only test document.\n', 'utf8');
    await selectNativeFile(desktop, filePath);

    await page.getByRole('button', { name: 'Documents', exact: true }).click();
    await page.getByRole('button', { name: 'Import document' }).click();
    await expect(page.getByRole('button', { name: 'architecture-reference', exact: true })).toBeVisible({
        timeout: 15_000,
    });
    await expect(
        page.getByText(/original was stored safely|Background text extraction has been queued/i),
    ).toBeVisible();

    const storedObjects = await desktop.application.evaluate(({ app }) => app.getPath('userData'));
    expect(storedObjects).toBe(desktop.profileDirectory);
});

test('rejects an unsupported document extension without persisting a document', async ({ desktop }) => {
    const page = desktop.page;
    const fixtureDirectory = join(desktop.profileDirectory, 'e2e-source-files');
    await mkdir(fixtureDirectory, { recursive: true });
    const filePath = join(fixtureDirectory, 'unsupported.bin');
    await writeFile(filePath, Buffer.from([0x01, 0x02, 0x03, 0x04]));
    await selectNativeFile(desktop, filePath);

    await page.getByRole('button', { name: 'Documents', exact: true }).click();
    await page.getByRole('button', { name: 'Import document' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Supported formats' })).toBeVisible();
    await expect(page.getByText('No documents yet')).toBeVisible();
});
