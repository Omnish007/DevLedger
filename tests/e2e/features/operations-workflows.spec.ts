import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';
import { createProject, createTask } from '../helpers/workspace-actions';

test('adds a task dependency inside Task Inspector and rejects cycles', async ({ desktop }) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const projectName = data.project('Dependency project');
    const prerequisite = data.task('Prerequisite task');
    const dependent = data.task('Dependent task');
    await createProject(page, projectName);
    await createTask(page, projectName, prerequisite);
    await createTask(page, projectName, dependent);

    await page.getByRole('button', { name: dependent, exact: true }).click();
    await page.getByRole('combobox', { name: /Add prerequisite task/i }).click();
    await page.getByPlaceholder('Search workspace records…').fill(prerequisite);
    await page.getByRole('option', { name: prerequisite }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('dialog').getByText(prerequisite, { exact: true })).toBeVisible();
});

test('records and resolves a task blocker inline from Task Inspector', async ({ desktop }) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const projectName = data.project('Blocker project');
    const taskTitle = data.task('Waiting for credentials');
    const reason = 'Waiting for integration credentials.';
    await createProject(page, projectName);
    await createTask(page, projectName, taskTitle);

    await page.getByRole('button', { name: taskTitle, exact: true }).click();
    await page.getByRole('button', { name: 'Mark blocked' }).click();
    await page.getByPlaceholder('What is blocking this task?').fill(reason);
    await page.getByRole('button', { name: 'Save blocker' }).click();
    await expect(page.getByText(reason, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByText('No active blocker.')).toBeVisible();
});

test('logs a manual time entry and reminder inline inside Task Inspector', async ({ desktop }) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const projectName = data.project('Time project');
    const taskTitle = data.task('Document reviewed');
    const note = data.label('time entry', 'Manual E2E entry');
    await createProject(page, projectName);
    await createTask(page, projectName, taskTitle);

    await page.getByRole('button', { name: taskTitle, exact: true }).click();
    await page.getByRole('button', { name: 'Log time' }).click();
    const end = new Date(Date.now() - 60_000);
    const start = new Date(end.getTime() - 60 * 60_000);
    const localInputValue = (value: Date): string => {
        const pad = (part: number) => String(part).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
    };
    await page.getByLabel('Start').fill(localInputValue(start));
    await page.getByLabel('End').fill(localInputValue(end));
    await page.getByPlaceholder('Summary of work…').fill(note);
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();
    await expect(page.getByText(note, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Add reminder' }).click();
    await page.getByLabel('When').fill('@tomorrow 9am');
    await page.getByPlaceholder('Reminder note (optional)').fill('Follow up on handoff');
    await page.getByRole('button', { name: 'Schedule reminder' }).click();
    await expect(page.getByText('Follow up on handoff')).toBeVisible();
});
