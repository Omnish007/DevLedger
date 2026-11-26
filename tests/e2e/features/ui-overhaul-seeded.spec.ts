import { expect, test } from '../fixtures/app.fixture';
import { TestDataFactory } from '../helpers/test-data.factory';

test('seeded overhaul suite exercises dropdowns, calendar, alert modals, task inspector, all 5 settings tabs, and table drag resize preview', async ({
    desktop,
}) => {
    const page = desktop.page;
    const data = new TestDataFactory(desktop.profileDirectory);
    const projectA = data.project('Core Shell');
    const projectB = data.project('Retail POS');
    const contactName = data.contact('Maya Lin');
    const seededTaskTitle = data.task('Audit WCAG 2.2 AA contrast');
    const modalTaskTitle = data.task('Verify calendar and dropdown UX');
    const tableNoteTitle = data.note('Architecture Table & SmartDate Spec');
    const customTag = `e2e-ui-${Date.now()}`.slice(0, 36);

    // Seed rich relational data directly through the preload IPC API, then refresh workspace state.
    await page.evaluate(
        async ({ pA, pB, cName, tTitle, nTitle }) => {
            const api = (
                window as unknown as {
                    devLedger: {
                        projects: { create: (i: unknown) => Promise<{ id: string }> };
                        contacts: { create: (i: unknown) => Promise<{ id: string }> };
                        tasks: {
                            create: (i: unknown) => Promise<{ id: string }>;
                            update: (id: string, i: unknown) => Promise<unknown>;
                        };
                        notes: { create: (i: unknown) => Promise<{ id: string }> };
                        operations: {
                            createBlocker: (
                                t: string,
                                r: string,
                                c: string | null,
                                f: string | null,
                            ) => Promise<unknown>;
                        };
                    };
                }
            ).devLedger;

            const pa = await api.projects.create({
                name: pA,
                description: 'Design system tokens and responsive shells.',
                type: 'greenfield',
            });
            await api.projects.create({
                name: pB,
                description: 'Storefront telemetry and sync workers.',
                type: 'ongoing',
            });
            const contact = await api.contacts.create({
                name: cName,
                role: 'technical_manager',
                company: 'Northwind Labs',
                email: 'maya@northwind.example',
                projectId: pa.id,
                customAttributes: { Team: 'Architecture' },
            });
            const task = await api.tasks.create({
                projectId: pa.id,
                title: tTitle,
                description: 'Verify dropdowns, drawers, and contrast.',
                priority: 'high',
                dueDate: '2026-11-30',
                estimateMinutes: 60,
            });
            await api.tasks.update(task.id, { status: 'in_progress' });
            await api.operations.createBlocker(
                task.id,
                'Waiting for QA sign-off',
                contact.id,
                '2026-11-28T10:00:00Z',
            );

            await api.notes.create({
                projectId: pa.id,
                title: nTitle,
                content:
                    '<h2>Table Resize & Smart Date Spec</h2>' +
                    '<p>Resize columns and rows with live pre-release bounds.</p>' +
                    '<table><tbody>' +
                    '<tr><th><p>Module</p></th><th><p>Status</p></th><th><p>Owner</p></th></tr>' +
                    '<tr><td><p>Dropdowns</p></td><td><p>Verified</p></td><td><p>Design</p></td></tr>' +
                    '<tr><td><p>Calendar</p></td><td><p>Verified</p></td><td><p>Core</p></td></tr>' +
                    '</tbody></table>',
            });
        },
        {
            pA: projectA,
            pB: projectB,
            cName: contactName,
            tTitle: seededTaskTitle,
            nTitle: tableNoteTitle,
        },
    );

    await page.getByRole('button', { name: 'Refresh workspace' }).click();
    await expect(page.getByText(projectA, { exact: true }).first()).toBeVisible();

    // 1. TaskCreateDialog + Calendar + RemoteRecordPicker + NativeSelect + Select dropdowns
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();

    // Test RemoteRecordPicker project filter -> select projectB (0 tasks) -> Clear
    const projectFilter = page.getByRole('combobox', { name: /All projects/i });
    await projectFilter.click();
    await page.getByPlaceholder('Search projects…').fill(projectB);
    await page.getByRole('option', { name: projectB }).click();
    await expect(page.getByRole('button', { name: seededTaskTitle, exact: true })).toHaveCount(0);
    await page.getByRole('combobox', { name: projectB }).click();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByRole('button', { name: seededTaskTitle, exact: true })).toBeVisible();

    // Open New Task modal and exercise structured fields + SmartDate Calendar popover
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    const createDialog = page.getByRole('dialog');
    await expect(createDialog.getByRole('heading', { name: 'New task' })).toBeVisible();
    await createDialog.getByPlaceholder('What needs to be done?').fill(modalTaskTitle);
    await createDialog
        .getByLabel('Task description')
        .fill('Exercises TaskCreateDialog, SmartDate calendar, and priority native select.');
    await createDialog.getByRole('combobox', { name: 'Choose project' }).click();
    await page.getByPlaceholder('Search projects…').fill(projectA);
    await page.getByRole('option', { name: projectA }).click();
    await createDialog.getByLabel('Priority').selectOption('urgent');
    await createDialog.getByPlaceholder('e.g. 45').fill('75');

    // Open DayPicker v10 Calendar via SmartDateField calendar trigger button
    await createDialog.getByRole('button', { name: /Open calendar and time selector/i }).click();
    const calendarGrid = page.locator('[data-slot="calendar"] [role="grid"]');
    await expect(calendarGrid).toBeVisible();
    const monthDropdown = page.locator('[data-slot="calendar"] select.rdp-months_dropdown');
    const yearDropdown = page.locator('[data-slot="calendar"] select.rdp-years_dropdown');
    await expect(monthDropdown).toBeVisible();
    await expect(yearDropdown).toBeVisible();
    await page.locator('[data-slot="calendar"] .rdp-button_next').click();
    await page.locator('[data-slot="calendar"] [role="gridcell"] button:not([disabled])').nth(10).click();
    await page.keyboard.press('Escape');
    await expect(calendarGrid).toBeHidden();
    await createDialog.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(page.getByRole('button', { name: modalTaskTitle, exact: true })).toBeVisible();

    // Radix Select status menu inside TaskRow
    const rowStatus = page.getByRole('combobox', { name: `Status for ${modalTaskTitle}` });
    await rowStatus.click();
    await expect(page.getByRole('option', { name: 'In progress' })).toBeVisible();
    await page.getByRole('option', { name: 'In progress' }).click();
    await expect(rowStatus).toContainText('In progress');

    // 2. TaskInspectorSheet: NativeSelect Status/Priority + TagSelector color swatches + Edit modal + AlertDialog Cancel & Confirm
    await page.getByRole('button', { name: modalTaskTitle, exact: true }).click();
    const inspector = page.getByRole('dialog');
    await expect(inspector.getByRole('heading', { name: modalTaskTitle })).toBeVisible();
    await inspector.locator('#task-inspector-priority').selectOption('high');
    await expect(inspector.locator('#task-inspector-priority')).toHaveValue('high');

    // TagSelector color swatch & creation
    await inspector.getByRole('button', { name: 'Tag', exact: true }).click();
    await page.getByPlaceholder('Find or create tag…').fill(customTag);
    await page.getByRole('button', { name: 'Select violet tag color' }).click();
    await page.getByRole('button', { name: `Create #${customTag}` }).click();
    await expect(inspector.getByText(customTag, { exact: true })).toBeVisible();

    // Edit details modal
    await inspector.getByRole('button', { name: 'Edit details' }).click();
    const editDialog = page.getByRole('dialog').filter({ hasText: 'Edit task' });
    await expect(editDialog).toBeVisible();
    await editDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(editDialog).toBeHidden();

    // AlertDialog cancel preserves record, then confirm removes record
    await inspector.getByRole('button', { name: 'Trash' }).click();
    const trashAlert = page.getByRole('alertdialog');
    await expect(trashAlert).toBeVisible();
    await trashAlert.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: modalTaskTitle, exact: true })).toBeVisible();

    await page.getByRole('button', { name: `Move ${modalTaskTitle} to trash` }).click();
    const trashConfirm = page.getByRole('alertdialog');
    await expect(trashConfirm).toBeVisible();
    await trashConfirm.getByRole('button', { name: 'Move to trash' }).click();
    await expect(page.getByRole('button', { name: modalTaskTitle, exact: true })).toHaveCount(0);

    // 3. Contacts DropdownMenu (Edit + Destructive Move to trash -> Cancel)
    await page.getByRole('button', { name: 'Contacts', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Contacts', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: `Actions for ${contactName}` }).click();
    await expect(page.getByRole('menuitem', { name: 'Edit contact' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Move to trash' })).toBeVisible();
    await page.keyboard.press('Escape');

    // 4. Notes: SmartDateInsert Calendar + Table Column & Row Live Drag Resize Preview
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: tableNoteTitle }).first().click();

    // Verify SmartDateInsert calendar popover inside Notes toolbar
    await page.getByRole('button', { name: 'Insert smart date' }).click();
    await expect(page.locator('[data-slot="calendar"] [role="grid"]')).toBeVisible();
    await page.locator('[data-slot="calendar"] [role="gridcell"] button:not([disabled])').nth(14).click();
    await expect(page.getByRole('button', { name: 'Insert', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await expect(page.locator('.notes-editor-content .smart-date-pill')).toBeVisible();

    // Activate table overlay by clicking inside the first table cell
    const firstCell = page.locator('.notes-editor-content table th, .notes-editor-content table td').first();
    await expect(firstCell).toBeVisible();
    const initialCellBox = await firstCell.boundingBox();
    expect(initialCellBox).not.toBeNull();
    await firstCell.click();

    // Column divider drag preview (before releasing mouse!)
    const colDivider = page.getByRole('separator', { name: 'Resize column 1' });
    await expect(colDivider).toBeVisible();
    const colBox = await colDivider.boundingBox();
    expect(colBox).not.toBeNull();
    const cx = colBox!.x + colBox!.width / 2;
    const cy = colBox!.y + colBox!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 64, cy, { steps: 6 });

    const colBoundsPreview = page.getByTestId('table-col-preview-bounds');
    const dragPill = page.getByTestId('table-resize-preview');
    await expect(colBoundsPreview).toBeVisible();
    await expect(dragPill).toBeVisible();
    await expect(dragPill).toContainText(/px/);
    await page.mouse.up();
    await expect(dragPill).toBeHidden();

    const resizedCellBox = await firstCell.boundingBox();
    expect(resizedCellBox!.width).toBeGreaterThan(initialCellBox!.width + 20);

    // Row bottom edge drag preview (before releasing mouse!)
    await firstCell.click();
    const rowDivider = page.getByRole('separator', { name: 'Resize row 1' });
    await expect(rowDivider).toBeVisible();
    const rowBox = await rowDivider.boundingBox();
    expect(rowBox).not.toBeNull();
    const rx = rowBox!.x + rowBox!.width / 2;
    const ry = rowBox!.y + rowBox!.height / 2;
    const initialRowBox = await firstCell.boundingBox();
    await page.mouse.move(rx, ry);
    await page.mouse.down();
    await page.mouse.move(rx, ry + 48, { steps: 6 });

    const rowBoundsPreview = page.getByTestId('table-row-preview-bounds');
    await expect(rowBoundsPreview).toBeVisible();
    await expect(dragPill).toBeVisible();
    await expect(dragPill).toContainText(/px/);
    await page.mouse.up();
    await expect(dragPill).toBeHidden();

    const resizedRowBox = await firstCell.boundingBox();
    expect(resizedRowBox!.height).toBeGreaterThan(initialRowBox!.height + 15);

    // 5. All 5 Settings Tabs (General, Vault & Privacy, Backups & Restore, Local AI, Health & Activity)
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.getByRole('button', { name: 'Vault & Privacy', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Protected notes vault' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create vault' })).toBeVisible();

    await page.getByRole('button', { name: 'Backups & Restore', exact: true }).click();
    await expect(page.getByLabel('Backup passphrase')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create backup' })).toBeVisible();

    await page.getByRole('button', { name: 'Local AI', exact: true }).click();
    await expect(page.getByLabel('Text generation model')).toBeVisible();
    await expect(page.getByLabel('Embedding model')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Build index' })).toBeVisible();

    await page.getByRole('button', { name: 'Health & Activity', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Rebuild search index' })).toBeVisible();

    expect(desktop.diagnostics.pageErrors).toEqual([]);
    expect(desktop.diagnostics.consoleErrors).toEqual([]);
});
