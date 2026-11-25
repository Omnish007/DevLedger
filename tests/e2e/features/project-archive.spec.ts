import { test, expect } from '../fixtures/app.fixture';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { TestDataFactory } from '../helpers/test-data.factory';
import { createProject, createTask } from '../helpers/workspace-actions';

async function selectArchivePath(
  desktop: { application: import('@playwright/test').ElectronApplication },
  archivePath: string,
): Promise<void> {
  // Control only the native OS file picker. Project export/import jobs, archive
  // validation, record remapping, SQLite writes and object storage stay real.
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
  }, archivePath);
}

test('exports a project archive and imports a remapped project copy with its task records', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const projectName = data.project('Archive round trip');
  const taskTitle = data.task('Imported task remains linked to its project');
  const archiveDirectory = join(desktop.profileDirectory, 'project-archives');
  const archivePath = join(archiveDirectory, 'project-round-trip.zip');
  await mkdir(archiveDirectory, { recursive: true });

  await createProject(page, projectName, 'A project used to test export and remapped import.');
  await createTask(page, projectName, taskTitle);
  await selectArchivePath(desktop, archivePath);

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: `Actions for ${projectName}` }).click();
  await page.getByRole('menuitem', { name: 'Export project' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Project exported to' })).toBeVisible({ timeout: 60_000 });
  expect((await stat(archivePath)).size).toBeGreaterThan(128);

  await page.getByRole('button', { name: 'Import archive' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Imported ${projectName} (Imported)` })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(`${projectName} (Imported)`, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText(taskTitle, { exact: true })).toHaveCount(2);

  // Verify the imported task is linked to the remapped imported project, not
  // merely duplicated as an orphan or left attached to the source project.
  const projectFilter = page.getByRole('combobox').filter({ hasText: 'All projects' });
  await projectFilter.click();
  await page.getByPlaceholder('Search workspace records…').fill(`${projectName} (Imported)`);
  await page.getByRole('option', { name: `${projectName} (Imported)` }).click();
  await expect(page.getByText(taskTitle, { exact: true })).toHaveCount(1);
});
