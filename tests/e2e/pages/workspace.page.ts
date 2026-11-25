import { expect, type Page } from '@playwright/test';

const ROUTES = [
    { label: 'Overview', heading: 'Overview' },
    { label: 'Projects', heading: 'Projects' },
    { label: 'Notes', heading: 'Notes' },
    { label: 'Tasks', heading: 'Tasks' },
    { label: 'Documents', heading: 'Documents' },
    { label: 'Contacts', heading: 'Contacts' },
    { label: 'Search', heading: 'Search' },
    { label: 'Settings', heading: 'Settings' },
] as const;

export class WorkspacePage {
    constructor(readonly page: Page) {}

    async navigate(label: (typeof ROUTES)[number]['label']): Promise<void> {
        const route = ROUTES.find((item) => item.label === label);
        if (!route) throw new Error(`Unknown workspace route: ${label}`);
        await this.page.getByRole('button', { name: label, exact: true }).click();
        await expect(this.page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible();
    }

    async openCommandPalette(): Promise<void> {
        await this.page.keyboard.press('Control+k');
        await expect(this.page.getByRole('dialog')).toBeVisible();
    }
}

export const workspaceRoutes = ROUTES;
