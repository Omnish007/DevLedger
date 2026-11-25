# DevLedger Architecture and E2E Test Strategy

## Scope and repository verification

This review is based on the current repository source, not on the initial technology assumptions. The checked-out application is an Electron desktop application with a React/TypeScript renderer, Electron main process, a narrow preload bridge, SQLite persistence, local file/object storage, and a persistent background-job subsystem. The existing `package.json` already includes `@playwright/test`; this implementation reuses it and does not add or upgrade packages.

Primary source references:

- `docs/ARCHITECTURE.md`
- `src/main/index.ts`
- `src/main/desktop-window-manager.ts`
- `src/preload/index.ts`
- `src/main/ipc/handler.ts` and `src/main/ipc/register-*.ts`
- `src/main/database/connection.ts`, `src/main/database/schema.ts`, and `src/main/database/migrations/`
- `src/main/services/` and `src/main/services/workspace/`
- `src/renderer/main.tsx`, `src/renderer/components/shared/AppShell.tsx`, and `src/renderer/features/`
- `tests/unit/`, `tests/integration/`, and `tests/performance/`

## Runtime architecture and lifecycle

### Startup sequence

1. Electron evaluates `src/main/index.ts` and applies the test-only `userData` override only when the app is unpackaged, `DEVLEDGER_E2E=1`, and `DEVLEDGER_TEST_USER_DATA` is present.
2. The application requests the single-instance lock and proceeds through its initialization path.
3. The main process initializes local directories and the SQLite database, applies sequential migrations, performs startup integrity/recovery checks, and registers typed IPC handlers.
4. The main window is created and loads the renderer entry point. The renderer mounts React and the application shell; the primary workspace view is Overview.
5. Main-process services start their supported background work (persistent jobs, document worker, reminder delivery, timer heartbeat, automatic backups and vault auto-lock). Shutdown stops these services, heartbeats timer state, locks the vault, checkpoints/closes SQLite, and respects restore activation state.

### Process/data boundaries

`Renderer UI → window.devLedger preload API → validated IPC handler → domain/service layer → SQLite and/or managed filesystem storage`.

The renderer is not intended to access SQLite, Node APIs, arbitrary filesystem paths, or arbitrary IPC channels. The preload API exposes specific application capabilities via `contextBridge`. IPC handlers validate both the trusted sender origin/frame and channel payload schema (Zod schemas in the registration modules). Tests should use the public UI/preload bridge for normal behavior and only make direct preload calls for narrow IPC-contract/security tests.

### Persistence model

- SQLite database adapter: `better-sqlite3` in `src/main/database/connection.ts`.
- The connection enables foreign keys, uses a bounded busy timeout, WAL, full synchronous durability, secure deletion, and in-memory temporary storage.
- Migrations are applied transactionally and in sequence; the current schema version in `src/main/database/schema.ts` is 19.
- Document source objects are managed locally using content-addressed storage (hash-derived object paths); protected objects are stored separately under the protected storage area.
- Full backup/restore and project archive import/export are distinct workflows. Restore uses a staged/copy activation/rollback flow; project archives remap record identifiers and do not include vault-protected records.
- The E2E harness must never open the ordinary application profile. The main-process test override supplies a unique temporary `userData` directory per test.

### Important lifecycle behavior to exercise

- Single-instance behavior and startup/first-window creation.
- Database initialization, migration sequence, integrity checks and interrupted-restore recovery.
- Timer heartbeat plus explicit recovery confirmation after a process restart.
- Persistent background-job leasing/worker lifecycle and orderly shutdown.
- Vault lock/auto-lock behavior and protected item boundaries.
- Automatic backup behavior and restore staging/rollback.
- Legacy user-data migration is intentionally not invoked by the isolated E2E profile path.

## Security boundary audit

The current `BrowserWindow` configuration in `src/main/desktop-window-manager.ts` sets `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, and `allowRunningInsecureContent: false`. The preload uses a narrow `contextBridge.exposeInMainWorld('devLedger', api)` bridge. IPC handlers perform sender validation and schema validation. New-window creation is denied and navigation is constrained; permitted external HTTPS links are delegated to the system browser.

E2E security coverage checks the active BrowserWindow preferences, verifies that privileged Node/raw IPC objects are not available to the renderer, and submits an invalid preload API payload to ensure the IPC validation boundary rejects it. These tests do not change production security flags and the fixture does not pass `--no-sandbox`; the E2E process must exercise Electron using its normal sandbox behavior.

## Existing and selected test layers

| Layer | Purpose | Main location | Runtime dependency |
|---|---|---|---|
| Unit | Pure domain rules, validation, formatting, parsing, deterministic helpers | `tests/unit/` | Node test runner and TypeScript strip support |
| Integration | Services, SQLite transactions, migrations, file storage, job behavior, cross-module persistence | `tests/integration/` | Project dependencies and native SQLite module |
| Performance | Bounded query/algorithm/large-data behavior | `tests/performance/` | Node and relevant project dependencies |
| E2E | Real Electron window, React UI, preload, IPC, services, SQLite, local storage and lifecycle | `tests/e2e/` | Production Electron build + Playwright + native runtime deps |

## E2E design decisions

- Reuse the already declared Playwright version (`@playwright/test` in `package.json`); no test framework or package upgrade is introduced.
- Use `_electron.launch()` to control the actual Electron application, not a browser-only renderer substitute.
- Give each test a unique temporary profile. The fixture removes only the exact path created by `mkdtemp`, and only after the Electron process closes.
- Use the real preload, IPC, application services, database and object store. The document import test stubs only the operating-system file chooser return value; it still calls the real app import path.
- Prefer accessible roles, labels, placeholders, and user-facing text; avoid generated CSS class names except the stable TipTap editor contenteditable region where no public label exists.
- Wait on explicit app/UI states rather than fixed sleeps. Existing app-internal debounce/auto-save behavior is verified by waiting for visible saved/result states.
- Keep worker count at one for deterministic execution against a single local application profile per test; tests are independently seeded and can run in arbitrary order.
- Capture a failure screenshot and structured page/console diagnostics from the fixture. Playwright is configured to retain trace and video for failed tests and emit list, HTML and JSON reports.
- Do not use Ollama or live network services as prerequisites. Optional semantic/AI integrations are not necessary for baseline offline E2E workflows.

## Known environment constraints

The current working environment does not have the repository's npm dependencies installed. An `npm ci` attempt could not reach `registry.npmjs.org` (`EAI_AGAIN`). Consequently the Playwright/Electron test suite and TypeScript checker cannot be executed in this session until dependencies are available and `npm run build` has produced `out/main/index.cjs`. The source-level test suite is implemented, and the existing dependency-free `npm run check:all` pipeline is run separately; see `docs/E2E_IMPLEMENTATION_REPORT.md` for actual results. Do not interpret unexecuted E2E tests as passing.
