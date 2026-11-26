import { test, expect } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';

test('creates, searches, edits and moves a contact to trash', async ({ desktop }) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const contactName = data.contact('Asha Unicode');
    const revisedCompany = 'Northwind Engineering';
    const email = 'asha.e2e@example.test';

    await page.getByRole('button', { name: 'Contacts', exact: true }).click();
    await page.getByRole('button', { name: 'Add contact' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByText('Enter a contact name.')).toBeVisible();

    await dialog.getByLabel('Name').fill(contactName);
    const emailInput = dialog.getByLabel('Email');
    await emailInput.fill('not-an-email');
    // This is an input[type=email]; native constraint validation blocks submission
    // before React Hook Form receives it. Assert the real browser boundary.
    expect(await emailInput.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);
    await emailInput.fill(email);
    expect(await emailInput.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
    await dialog.getByLabel('Company').fill('Initial Company');
    await dialog.getByLabel('Notes').fill('Contact record created with Unicode name: 東京');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await dialog.getByPlaceholder('Field').fill('Environment');
    await dialog.getByPlaceholder('Value').fill('Production');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(contactName, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Production', { exact: true })).toBeVisible();

    const search = page.getByPlaceholder('Filter contacts…');
    await search.fill('ASHA.E2E@EXAMPLE.TEST');
    await expect(page.getByText(contactName, { exact: true }).first()).toBeVisible();
    await search.fill('does-not-exist');
    await expect(page.getByText('No matching contacts')).toBeVisible();
    await search.clear();

    await page.getByRole('button', { name: `Actions for ${contactName}` }).click();
    await page.getByRole('menuitem', { name: 'Edit contact' }).click();
    const editDialog = page.getByRole('dialog');
    await editDialog.getByLabel('Company').fill(revisedCompany);
    await editDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(revisedCompany, { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: `Actions for ${contactName}` }).click();
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation.getByRole('heading', { name: 'Move contact to trash?' })).toBeVisible();
    await confirmation.getByRole('button', { name: 'Move to trash' }).click();
    await expect(page.getByText(contactName, { exact: true })).toBeHidden();
});
