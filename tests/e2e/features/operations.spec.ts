import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';
import { createProject } from '../helpers/workspace-actions';

test('creates, filters and deletes a tag using the Operations workflow', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const tagName = `e2e-${data.tag('triage').toLowerCase().replace(/[^a-z0-9-]/g, '-')}`.slice(0, 60);
  const projectName = data.project('Tagged project');
  await createProject(page, projectName);
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await page.getByPlaceholder('e.g. technical-spec').fill(tagName);
  await page.getByLabel('Tag color').selectOption('violet');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(`#${tagName}`, { exact: true })).toBeVisible();

  await page.getByRole('textbox', { name: 'Search tags' }).fill('no-tag-with-this-name');
  await expect(page.getByText(`#${tagName}`, { exact: true })).toBeHidden();
  await page.getByRole('textbox', { name: 'Search tags' }).clear();
  await expect(page.getByText(`#${tagName}`, { exact: true })).toBeVisible();

  await page.getByRole('combobox', { name: /Choose a record/ }).click();
  await page.getByPlaceholder('Search workspace records…').fill(projectName);
  await page.getByRole('option', { name: projectName }).click();
  await page.getByRole('button', { name: 'Apply tag' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Tag assigned.' })).toBeVisible();

  await page.getByRole('button', { name: `Delete ${tagName}` }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation.getByRole('heading', { name: 'Delete tag?' })).toBeVisible();
  await confirmation.getByRole('button', { name: 'Delete tag' }).click();
  await expect(page.getByText(`#${tagName}`, { exact: true })).toBeHidden();
});

test('notification inbox supports its fresh-workspace empty state', async ({ desktop }) => {
  const page = desktop.page;
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await page.getByRole('tab', { name: 'Inbox' }).click();
  await expect(page.getByRole('heading', { name: 'Notification inbox' })).toBeVisible();
  await expect(page.getByText(/No notifications in this filter/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
});

test('can queue a real local maintenance job and observe it in Background jobs', async ({ desktop }) => {
  const page = desktop.page;
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await page.getByRole('tab', { name: 'Background jobs' }).click();
  await page.getByRole('button', { name: 'Rebuild search index' }).click();
  await expect(page.getByText(/search\.rebuild/)).toBeVisible({ timeout: 15_000 });
});
