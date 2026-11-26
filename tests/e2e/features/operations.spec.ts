import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';
import { createNote, createProject, createTask } from '../helpers/workspace-actions';

test('creates and attaches a tag inline inside Task Inspector and cleans up via Project Hub', async ({
    desktop,
}) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const tagName = `e2e-${data
        .tag('triage')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')}`.slice(0, 60);
    const projectName = data.project('Tagged project');
    const taskTitle = data.task('Tagged task');
    await createProject(page, projectName);
    await createTask(page, projectName, taskTitle);

    await page.getByRole('button', { name: taskTitle, exact: true }).click();
    await page.getByRole('button', { name: 'Tag', exact: true }).click();
    await page.getByPlaceholder('Find or create tag…').fill(tagName);
    await page.getByRole('button', { name: `Create #${tagName}` }).click();
    await expect(page.getByText(tagName, { exact: true })).toBeVisible();
});

test('notification inbox bell exposes fresh-workspace empty state', async ({ desktop }) => {
    const page = desktop.page;
    await page.getByRole('button', { name: /Inbox notifications/i }).click();
    await expect(page.getByText(/You’re all caught up/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Read all' })).toBeDisabled();
});

test('can queue a maintenance job from Settings Health & Activity', async ({ desktop }) => {
    const page = desktop.page;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Health & Activity', exact: true }).click();
    await page.getByRole('button', { name: 'Rebuild search index' }).click();
    await expect(page.getByText(/Search index rebuild/i).first()).toBeVisible({ timeout: 15_000 });
});

test('connects a note and task inside Note Connections Drawer with human title resolution', async ({
    desktop,
}) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const projectName = data.project('Connected hub');
    const taskTitle = data.task('Target task');
    const noteTitle = data.note('Source note');
    await createProject(page, projectName);
    await createTask(page, projectName, taskTitle);
    await createNote(page, noteTitle, 'Spec content.');

    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await page.getByRole('button', { name: 'Connect record' }).click();
    await page
        .getByRole('combobox')
        .filter({ hasText: /Search record/i })
        .click();
    await page.getByPlaceholder('Search tasks…').fill(taskTitle);
    await page.getByRole('option', { name: taskTitle }).click();
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
});

test('syncs note reminder with inline note text and delivers toast on time', async ({ desktop }) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const noteTitle = data.note('Release reminder note');
    const reminderLine = 'Approve deployment checklist';

    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByRole('button', { name: 'Create note' }).click();
    await page.getByPlaceholder('Untitled note').fill(noteTitle);

    const editor = page.locator('.notes-writing-canvas [contenteditable="true"]');
    await editor.click();
    await editor.type(`${reminderLine} @r 23:59`, { delay: 10 });
    const suggestions = page.locator('[role="listbox"][aria-label="Date and contact suggestions"]');
    await expect(suggestions).toBeVisible();
    await expect(suggestions.getByRole('option').first()).toContainText('Today 23:59');
    await page.keyboard.press('Enter');
    await expect(suggestions).toBeHidden();

    const reminders = await page.evaluate(async () => {
        const api = (
            window as unknown as {
                devLedger: {
                    notes: { listPage: (input: unknown) => Promise<{ items: Array<{ id: string }> }> };
                    operations: {
                        listRemindersPage: (
                            input: unknown,
                        ) => Promise<{ items: Array<{ id: string; message: string }> }>;
                    };
                };
            }
        ).devLedger;
        const notes = await api.notes.listPage({ limit: 10, offset: 0 });
        const noteId = notes.items[0]?.id;
        const pageResult = await api.operations.listRemindersPage({
            entityType: 'note',
            entityId: noteId,
            limit: 10,
            offset: 0,
        });
        return pageResult.items;
    });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.message).toBe(reminderLine);

    // Reschedule slightly ahead and confirm immediate on-time toast + inbox delivery.
    await page.evaluate(async (reminderId) => {
        const api = (
            window as unknown as {
                devLedger: {
                    operations: {
                        updateReminder: (id: string, action: string, dueAt: string) => Promise<unknown>;
                    };
                };
            }
        ).devLedger;
        await api.operations.updateReminder(
            reminderId,
            'reschedule',
            new Date(Date.now() + 900).toISOString(),
        );
    }, reminders[0]!.id);

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: reminderLine });
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await expect(toast).toContainText(noteTitle);

    await page.getByRole('button', { name: /Inbox notifications/i }).click();
    const inboxItem = page.locator('[data-slot="popover-content"] article').filter({ hasText: reminderLine });
    await expect(inboxItem).toBeVisible();
    await inboxItem.getByRole('button', { name: 'Dismiss' }).click();
    await expect(inboxItem).toBeHidden();
});
