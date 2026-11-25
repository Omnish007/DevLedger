import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';

test('finds a note created through the Notes workflow using local full-text search', async ({ desktop }) => {
  const page = desktop.page;
  const data = new TestDataFactory(desktop.profileDirectory);
  const title = data.note('Search integration record');
  const token = data.label('search-token', 'crossfeaturepersist');

  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.getByPlaceholder('Untitled note').fill(title);
  await page.locator('.notes-editor-content [contenteditable="true"]').fill(`Architecture decision: ${token}. Keep storage local and indexed.`);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const searchInput = page.getByRole('textbox', { name: 'Search workspace' });
  await searchInput.fill(token);
  await page.getByRole('button', { name: 'Search', exact: true }).last().click();
  const result = page.locator('article.search-result').filter({ hasText: title });
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result).toContainText(token);
});

test('returns an explicit empty state for a query with no matching records', async ({ desktop }) => {
  const page = desktop.page;
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search workspace' }).fill('zz-no-record-should-match-88419');
  await page.getByRole('button', { name: 'Search', exact: true }).last().click();
  await expect(page.getByText('No matching results')).toBeVisible();
  await expect(page.getByText(/0 results/)).toBeVisible();
});
