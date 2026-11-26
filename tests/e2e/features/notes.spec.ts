import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';

test('creates and autosaves Unicode and script-like note content, then reloads it', async ({ desktop }) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const title = data.note('Decision 東京');
    const content =
        'Decision: preserve local-first behavior. Unicode: 東京 🧭. Literal input: <script>window.__e2eInjected = true</script>';

    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByRole('button', { name: 'Create note' }).click();
    const titleInput = page.getByPlaceholder('Untitled note');
    await expect(titleInput).toBeVisible();
    await titleInput.fill(title);
    const editor = page.locator('.notes-writing-canvas [contenteditable="true"]');
    await editor.fill(content);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.notes-writing-canvas script')).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByRole('textbox', { name: 'Filter notes by title or contents' }).fill(title);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByText(title, { exact: true }).click();
    await expect(page.getByPlaceholder('Untitled note')).toHaveValue(title);
    await expect(page.locator('.notes-writing-canvas [contenteditable="true"]')).toContainText('東京 🧭');
    expect(
        await page.evaluate(() => (window as unknown as { __e2eInjected?: boolean }).__e2eInjected),
    ).toBeUndefined();
});
