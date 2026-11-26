import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';

test('validates required project name and searches Unicode project names', async ({ desktop }) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const projectName = data.project('Release 東京 🧭');

    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('button', { name: 'New project' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(dialog.getByText('Enter a project name.')).toBeVisible();
    await dialog.getByLabel('Project name').fill(projectName);
    await dialog.getByLabel('Description').fill('Unicode, punctuation & safe plain text');
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();

    const filter = page.getByRole('textbox', { name: 'Filter projects by name or description' });
    await filter.fill('東京');
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();
    await filter.fill('this phrase does not exist');
    await expect(page.getByText('No matching projects')).toBeVisible();
});

test('edits, archives, filters, and restores a project without losing the record', async ({ desktop }) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const projectName = data.project('Lifecycle');
    const revisedDescription = 'Updated from an E2E workflow';

    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('button', { name: 'New project' }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByLabel('Project name').fill(projectName);
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: `Actions for ${projectName}` }).click();
    await page.getByRole('menuitem', { name: 'Edit project' }).click();
    const editDialog = page.getByRole('dialog');
    await editDialog.getByLabel('Description').fill(revisedDescription);
    await editDialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(revisedDescription)).toBeVisible();

    await page.getByRole('button', { name: `Actions for ${projectName}` }).click();
    await page.getByRole('menuitem', { name: 'Archive project' }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeHidden();

    await page.getByRole('button', { name: 'Show archived' }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Actions for ${projectName}` }).click();
    await page.getByRole('menuitem', { name: 'Restore project' }).click();
    await page.getByRole('button', { name: 'Active', exact: true }).click();
    await expect(page.getByText(projectName, { exact: true })).toBeVisible();
});
