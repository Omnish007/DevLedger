# DevLedger Electron E2E Tests

This suite drives the actual Electron application using the repository's existing `@playwright/test` dependency. The renderer, preload bridge, IPC handlers, services, SQLite database and local object storage remain active. The tests run against fresh isolated user-data profiles and never connect to a developer's normal DevLedger profile.

## Prerequisites

- Supported Node.js version from `package.json` (`>=22.16.0`).
- npm version matching the repository package manager declaration (npm 10.x).
- Dependencies installed from the committed lockfile: `npm ci`.
- Project production bundle built successfully: `npm run build`.
- Native project dependencies available for the current OS (notably the project's SQLite/native modules).
- A supported desktop session/display or a working headless Electron environment.

Do not use your everyday DevLedger profile as the E2E database.

## Commands

```bash
# Install exactly the committed dependency graph
npm ci

# Build main, preload, worker and renderer bundles
npm run build

# Type-check only the test suite and Playwright configuration
npm run typecheck:e2e

# Run the complete Electron E2E suite
npm run test:e2e

# Run startup/navigation smoke tests tagged @smoke
npm run test:e2e:smoke

# Run with a visible Electron window
npm run test:e2e:headed

# Open the last HTML report
npm run test:e2e:report
```

`test:e2e`, `test:e2e:smoke`, and `test:e2e:headed` build before running Playwright. The `playwright` CLI is provided by the already declared `@playwright/test` package. No package manager other than npm is assumed by the existing package metadata.

## Directory map

- `fixtures/app.fixture.ts`: launches the built app, creates one unique temporary `userData` directory per test, collects renderer/process diagnostics, attaches failure evidence, closes Electron and removes only its own temp directory.
- `pages/workspace.page.ts`: route names and user-facing heading checks.
- `helpers/test-data.factory.ts`: creates deterministic per-profile labels.
- `helpers/workspace-actions.ts`: common project, task, note and project-picker actions.
- `app/`: startup and application lifecycle behavior.
- `navigation/`: primary routes, Operations tabs and command palette.
- `features/`: feature-specific behavior and validation, including project archive export/import round-tripping and filtering the imported task under the remapped imported project.
- `workflows/`: multi-feature end-to-end journeys.
- `security/`: preload and IPC boundary assertions, vault/protected-content recovery, and encrypted backup/restore-as-copy journeys.

The architecture review, scenario matrix, feature coverage and delivery report are in `docs/TESTING_ARCHITECTURE.md`, `docs/TEST_SCENARIO_MATRIX.md`, `docs/TEST_COVERAGE_MATRIX.md`, `docs/FEATURE_INVENTORY.md`, `docs/USER_WORKFLOW_ANALYSIS.md` and `docs/E2E_IMPLEMENTATION_REPORT.md`.

## Isolation and test data safety

1. The fixture creates a new folder under the OS temp directory with the `devledger-e2e-` prefix using `mkdtemp`.
2. It passes the location through `DEVLEDGER_TEST_USER_DATA` with `DEVLEDGER_E2E=1`.
3. `src/main/index.ts` accepts this override only for an unpackaged app with the explicit E2E flag. The normal profile path is not selected by the fixture.
4. Each test gets its own profile. A lifecycle test can restart Electron while reusing only that test's folder.
5. Cleanup closes the Electron process first and removes only the exact directory created by that test after checking the expected prefix and temp-root boundary.
6. The document-import test creates source files below that isolated profile. It replaces only `dialog.showOpenDialog` to return that file path; document import, IPC, service validation, SQLite metadata and object storage are not mocked.

Never change the fixture to use `app.getPath('userData')` from a developer profile or recursively delete a configured path supplied by an untrusted environment variable.

## Locators and synchronization

Prefer `getByRole`, `getByLabel`, `getByPlaceholder`, and visible application text. Do not use generated Tailwind class names or arbitrary sleeps. Wait for explicit state such as the saved indicator, result row, dialog state, notification, or job record. The Notes editor contenteditable locator is scoped to the stable `notes-editor-content` host because the rich-text editor does not expose a conventional textbox label.

## External tools and integrations

The basic suite is designed to run offline. It does not require Ollama or external APIs. Optional semantic AI, Poppler and Tesseract behavior depends on the machine and needs dedicated controlled tests. A document test only stubs the OS file-picker response; the local application pipeline is exercised normally.

## Current suite inventory

The checked-in source contains 16 spec files and 37 Playwright test scenarios. They are implemented but were not executed in the current environment; see `docs/E2E_IMPLEMENTATION_REPORT.md` for the exact blockers and actual results from the runnable lower test layers.

## Reports and artifacts

Playwright is configured to write:

- list output to the terminal,
- `playwright-report/` for the HTML report,
- `test-results/e2e/results.json` for machine-readable JSON,
- `test-results/e2e/` for traces, failure screenshots and video retained on failure,
- `desktop-diagnostics.json` and `desktop-failure.png` attachments when a test fails.

Reports can contain local paths, test record names and screenshots. Treat them as development artifacts and do not commit personal data or a real workspace profile into the repository.

## Debugging

1. Re-run the failing spec alone, for example `npx playwright test tests/e2e/features/tasks.spec.ts --headed`.
2. Inspect the generated HTML report and attached screenshot.
3. Open the trace from the report to review actions, locator resolutions and snapshots.
4. Read attached renderer page-error, renderer console and Electron stderr diagnostics.
5. Determine whether the failure is an application defect, test defect or environment issue before changing assertions.
6. Do not add fixed waits to hide asynchronous defects, suppress errors, skip failures, or turn a real application interaction into a mock.

## Adding a test

- First identify the real UI action, preload function, IPC schema, service and persistence side effect.
- Add a test using the fixture and a unique `TestDataFactory` label.
- Assert user-visible feedback and, for persistence-critical flows, verify the state after reload/restart or through the application's actual UI.
- Add meaningful cases to `docs/TEST_SCENARIO_MATRIX.md` and `docs/TEST_COVERAGE_MATRIX.md`.
- Run the isolated spec, relevant smoke tests and the full suite. Update the report with actual counts only after execution.
