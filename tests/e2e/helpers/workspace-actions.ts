import { expect, type Page } from '@playwright/test';

export async function createProject(page: Page, name: string, description = 'Created by isolated Electron E2E test'): Promise<void> {
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Create a project' })).toBeVisible();
  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByLabel('Description (optional)').fill(description);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

export async function chooseProject(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Choose project' }).click();
  const search = page.getByPlaceholder('Search workspace records…');
  await search.fill(name);
  await page.getByRole('option', { name }).click();
}

export async function createTask(page: Page, projectName: string, taskTitle: string): Promise<void> {
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New task' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'New task' })).toBeVisible();
  await dialog.getByPlaceholder('What needs to be done?').fill(taskTitle);
  await chooseProject(page, projectName);
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
}

export async function createNote(page: Page, title: string, content: string): Promise<void> {
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create note' }).click();
  const titleInput = page.getByPlaceholder('Untitled note');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(title);
  const editor = page.locator('.notes-editor-content [contenteditable="true"]');
  await editor.fill(content);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
}
