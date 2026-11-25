import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';
import { chooseProject, createProject } from '../helpers/workspace-actions';

test('validates task title after a project is selected', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const projectName = data.project('Task validation');
  await createProject(page, projectName);
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await chooseProject(page, projectName);
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByText('Enter a task title.')).toBeVisible();
});

test('creates a task, updates status, searches it and starts/stops its timer', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const projectName = data.project('Task lifecycle');
  const taskTitle = data.task('Release checklist');
  await createProject(page, projectName);

  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByPlaceholder('What needs to be done?').fill(taskTitle);
  await page.getByLabel('Task description').fill('Verify create, update, timer and search in an isolated workspace.');
  await page.getByLabel('Priority').selectOption('high');
  await chooseProject(page, projectName);
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();

  const status = page.getByRole('combobox', { name: `Status for ${taskTitle}` });
  await status.click();
  await page.getByRole('option', { name: 'In progress' }).click();
  await expect(page.getByText(/in progress · high/i)).toBeVisible();

  await page.getByRole('textbox', { name: 'Filter tasks by title or description' }).fill(taskTitle);
  await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Filter tasks by title or description' }).clear();

  await page.locator('button[title="Start timer"]').first().click();
  await expect(page.getByText(/Timer running/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop timer' }).first().click();
  await expect(page.getByText(/Timer running/)).toBeHidden();
});

test('recovers an interrupted active timer after a full Electron restart', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const projectName = data.project('Timer recovery');
  const taskTitle = data.task('Recover after restart');
  await createProject(page, projectName);
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByPlaceholder('What needs to be done?').fill(taskTitle);
  await chooseProject(page, projectName);
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
  await page.locator('button[title="Start timer"]').first().click();
  await expect(page.getByText(/Timer running/)).toBeVisible();

  await desktop.restart();
  await desktop.page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(desktop.page.getByText('Confirm the interrupted work session')).toBeVisible();
  await desktop.page.getByRole('button', { name: 'Discard session' }).click();
  const confirmation = desktop.page.getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Discard session' }).click();
  await expect(desktop.page.getByText('Confirm the interrupted work session')).toBeHidden();
});
