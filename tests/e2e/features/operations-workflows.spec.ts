import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';
import { createNote, createProject, createTask } from '../helpers/workspace-actions';

async function chooseRecord(page: import('@playwright/test').Page, pickerIndex: number, recordName: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Choose a record' }).nth(pickerIndex).click();
  await page.getByPlaceholder('Search workspace records…').fill(recordName);
  await page.getByRole('option', { name: recordName }).click();
}

async function chooseTask(page: import('@playwright/test').Page, pickerIndex: number, taskName: string): Promise<void> {
  await page.getByRole('combobox').nth(pickerIndex).click();
  await page.getByPlaceholder('Search workspace records…').fill(taskName);
  await page.getByRole('option', { name: taskName }).click();
}

test('links a note to a task and verifies the relationship in the record graph', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const noteTitle = data.note('Link source');
  const taskTitle = data.task('Linked implementation');
  const relationship = 'documents';

  await createNote(page, noteTitle, 'This note is linked to a task through Operations.');
  const projectName = data.project('Link target project');
  await createProject(page, projectName);
  await createTask(page, projectName, taskTitle);

  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await page.getByRole('tab', { name: 'Links' }).click();
  await chooseRecord(page, 0, noteTitle);
  await chooseRecord(page, 1, taskTitle);
  await page.getByLabel('Relationship').fill(relationship);
  await page.getByRole('button', { name: 'Create link' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Records linked bidirectionally.' })).toBeVisible();
  await expect(page.getByText(relationship, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show links / backlinks' }).click();
  await expect(page.getByText(relationship, { exact: true })).toBeVisible();
});

test('adds a task dependency and rejects a cycle without changing the valid edge', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const projectName = data.project('Dependency project');
  const prerequisite = data.task('Prerequisite task');
  const dependent = data.task('Dependent task');
  await createProject(page, projectName);
  await createTask(page, projectName, prerequisite);
  await createTask(page, projectName, dependent);

  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await page.getByRole('tab', { name: 'Dependencies' }).click();
  await chooseTask(page, 0, dependent);
  await chooseTask(page, 1, prerequisite);
  await page.getByRole('button', { name: 'Add dependency' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Dependency added.' })).toBeVisible();
  await expect(page.getByText(prerequisite, { exact: true })).toBeVisible();

  // Reverse the proposed edge. The service must reject the cycle while keeping
  // the first valid edge intact.
  await chooseTask(page, 0, prerequisite);
  await chooseTask(page, 1, dependent);
  await page.getByRole('button', { name: 'Add dependency' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'This dependency would create a cycle.' })).toBeVisible();
  await chooseTask(page, 0, dependent);
  await expect(page.getByText(prerequisite, { exact: true })).toBeVisible();
});

test('records and resolves a task blocker through Operations', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const projectName = data.project('Blocker project');
  const taskTitle = data.task('Waiting for credentials');
  const reason = 'Waiting for the integration credentials from the project owner.';
  await createProject(page, projectName);
  await createTask(page, projectName, taskTitle);

  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await page.getByRole('tab', { name: 'Blockers' }).click();
  await page.getByRole('combobox').first().click();
  await page.getByPlaceholder('Search workspace records…').fill(taskTitle);
  await page.getByRole('option', { name: taskTitle }).click();
  await page.getByLabel('Reason').fill(reason);
  await page.getByRole('button', { name: 'Save blocker' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Blocker recorded; task marked blocked.' })).toBeVisible();
  const blockerRow = page.locator('article').filter({ hasText: reason });
  await expect(blockerRow).toContainText(taskTitle);
  await blockerRow.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Blocker resolved.' })).toBeVisible();
  await expect(page.getByText('No open blockers.')).toBeVisible();
});

test('adds a manual time entry and verifies its duration and note', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const projectName = data.project('Time entry project');
  const taskTitle = data.task('Document reviewed');
  const note = data.label('time entry', 'Manual E2E time entry');
  await createProject(page, projectName);
  await createTask(page, projectName, taskTitle);

  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await page.getByRole('tab', { name: 'Time' }).click();
  await page.getByRole('combobox').click();
  await page.getByPlaceholder('Search workspace records…').fill(taskTitle);
  await page.getByRole('option', { name: taskTitle }).click();

  const end = new Date(Date.now() - 60_000);
  const start = new Date(end.getTime() - 60 * 60_000);
  const localInputValue = (value: Date): string => {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  };
  await page.getByLabel('Start').fill(localInputValue(start));
  await page.getByLabel('End').fill(localInputValue(end));
  await page.getByLabel('Note').fill(note);
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Time entry saved.' })).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await expect(page.getByText(/60 min/)).toBeVisible();
});


test('schedules a reminder for a task and exposes it in the reminders list', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const projectName = data.project('Reminder project');
  const taskTitle = data.task('Review design handoff');
  const reminderMessage = data.label('reminder', 'Review handoff tomorrow');
  await createProject(page, projectName);
  await createTask(page, projectName, taskTitle);

  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await page.getByRole('tab', { name: 'Reminders' }).click();
  await page.locator('button[role="combobox"]').click();
  await page.getByPlaceholder('Search workspace records…').fill(taskTitle);
  await page.getByRole('option', { name: taskTitle }).click();
  await page.getByLabel('When').fill('tomorrow');
  await page.getByLabel('Message').fill(reminderMessage);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Reminder scheduled.' })).toBeVisible();
  await expect(page.getByText(reminderMessage, { exact: true })).toBeVisible();
});
