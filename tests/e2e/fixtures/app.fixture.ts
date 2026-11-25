import {
    _electron as electron,
    expect,
    test as base,
    type ElectronApplication,
    type Page,
    type TestInfo,
} from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve, sep } from 'node:path';

export interface DesktopDiagnostics {
    pageErrors: string[];
    consoleErrors: string[];
    mainProcessStderr: string[];
    rendererCrashes: string[];
}

export interface DesktopHarness {
    readonly application: ElectronApplication;
    readonly page: Page;
    readonly profileDirectory: string;
    readonly diagnostics: DesktopDiagnostics;
    restart(): Promise<void>;
}

const APP_ENTRY = resolve(process.cwd(), 'out/main/index.cjs');
const PROJECT_ROOT = resolve(process.cwd());
const PROFILE_PREFIX = 'devledger-e2e-';

async function attachFailureEvidence(
    testInfo: TestInfo,
    page: Page | null,
    diagnostics: DesktopDiagnostics,
): Promise<void> {
    if (testInfo.status === testInfo.expectedStatus) return;

    if (page && !page.isClosed()) {
        try {
            const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' });
            await testInfo.attach('desktop-failure.png', { body: screenshot, contentType: 'image/png' });
        } catch {
            /* The renderer may already have crashed; preserve other diagnostics. */
        }
    }

    await testInfo.attach('desktop-diagnostics.json', {
        body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
        contentType: 'application/json',
    });
}

export const test = base.extend<{ desktop: DesktopHarness }>({
    desktop: async ({}, use, testInfo) => {
        if (!existsSync(APP_ENTRY)) {
            throw new Error(
                `Built Electron entry was not found at ${APP_ENTRY}. Run npm run build before E2E tests.`,
            );
        }

        const profileDirectory = await mkdtemp(resolve(tmpdir(), `${PROFILE_PREFIX}${process.pid}-`));
        const diagnostics: DesktopDiagnostics = {
            pageErrors: [],
            consoleErrors: [],
            mainProcessStderr: [],
            rendererCrashes: [],
        };
        let state: { application: ElectronApplication | null; page: Page | null } = {
            application: null,
            page: null,
        };

        const launch = async (): Promise<void> => {
            const application = await electron.launch({
                // Keep Electron's production security model intact during tests; never pass --no-sandbox.
                args: [PROJECT_ROOT],
                env: {
                    ...process.env,
                    DEVLEDGER_E2E: '1',
                    DEVLEDGER_TEST_USER_DATA: profileDirectory,
                },
                timeout: 45_000,
            });
            application
                .process()
                .stderr?.on('data', (chunk: Buffer) => diagnostics.mainProcessStderr.push(chunk.toString()));
            const page = await application.firstWindow();
            state = { application, page };
            page.on('crash', () =>
                diagnostics.rendererCrashes.push('The Electron renderer process crashed.'),
            );
            page.on('pageerror', (error) => diagnostics.pageErrors.push(error.stack ?? error.message));
            page.on('console', (message) => {
                if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
            });
            await page.waitForLoadState('domcontentloaded');
            await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
            await expect(page.getByRole('main')).toBeVisible();
        };

        const harness: DesktopHarness = {
            get application() {
                if (!state.application) throw new Error('Electron application is not running.');
                return state.application;
            },
            get page() {
                if (!state.page) throw new Error('Electron renderer page is not available.');
                return state.page;
            },
            profileDirectory,
            diagnostics,
            async restart() {
                if (state.application) await state.application.close();
                state = { application: null, page: null };
                await launch();
            },
        };

        try {
            await launch();
            await use(harness);
            expect(
                diagnostics.pageErrors,
                'No unhandled renderer exceptions should occur during this scenario.',
            ).toEqual([]);
            expect(
                diagnostics.rendererCrashes,
                'The renderer must remain alive for the complete scenario.',
            ).toEqual([]);
        } finally {
            await attachFailureEvidence(testInfo, state.page, diagnostics);
            if (state.application) await state.application.close().catch(() => undefined);
            state = { application: null, page: null };

            // Cleanup is limited to the unique directory created by mkdtemp for this test.
            const resolvedProfile = resolve(profileDirectory);
            const allowedRoot = resolve(tmpdir());
            if (
                basename(resolvedProfile).startsWith(PROFILE_PREFIX) &&
                resolvedProfile.startsWith(`${allowedRoot}${sep}`)
            ) {
                await rm(resolvedProfile, { recursive: true, force: true });
            }
        }
    },
});

export { expect };
