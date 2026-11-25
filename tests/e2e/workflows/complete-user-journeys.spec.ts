import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';
import { createProject, createTask, createNote } from '../helpers/workspace-actions';

test('creates project context, linked work records, and finds the note from another feature', async ({
    desktop,
}) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const projectName = data.project('Cross feature journey');
    const taskTitle = data.task('Implement workflow validation');
    const noteTitle = data.note('Architecture decision');
    const searchToken = data.label('content-index', 'persistedjourneytoken');

    await createProject(page, projectName, 'A project created for the complete multi-feature journey.');
    await createTask(page, projectName, taskTitle);
    await createNote(
        page,
        noteTitle,
        `Decision record ${searchToken}. Keep task and project context consistent.`,
    );

    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search workspace' }).fill(searchToken);
    await page.getByRole('button', { name: 'Search', exact: true }).last().click();
    await expect(page.locator('article.search-result').filter({ hasText: noteTitle })).toBeVisible({
        timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();

    // A complete app restart, not just a renderer refresh, validates durable records.
    await desktop.restart();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByRole('textbox', { name: 'Filter notes by title or contents' }).fill(noteTitle);
    await expect(page.getByText(noteTitle, { exact: true })).toBeVisible();
});

test('quick capture creates a note through its own Electron window and persists it in Notes', async ({
    desktop,
}) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const title = data.note('Quick capture record');
    const content = 'Captured from the dedicated Quick Capture window.';

    const captureWindowPromise = desktop.application.waitForEvent('window');
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    const captureWindow = await captureWindowPromise;
    await expect(captureWindow.getByRole('main')).toBeVisible();
    await captureWindow.getByLabel('Note title').fill(title);
    await captureWindow
        .getByPlaceholder('Capture a thought, decision, meeting note or follow-up…')
        .fill(content);
    const closed = captureWindow.waitForEvent('close');
    await captureWindow.getByRole('button', { name: 'Save note' }).click();
    await closed;

    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByRole('textbox', { name: 'Filter notes by title or contents' }).fill(title);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
});
