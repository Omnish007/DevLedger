# DevLedger

**Your projects, work and knowledge — all in one place.**

DevLedger is a local-first desktop workspace for software developers who want one organized place for project context, tasks, technical notes, documents, contacts, time, reminders and work history. It is designed as a personal operating environment around the work of building and maintaining software—not as an IDE, hosted project-management service or team collaboration platform.

DevLedger keeps its primary workspace data on the user's computer. Its core project, notes, task and document workflows do not require a cloud account or an AI service. Optional local AI capabilities are provided through Ollama and remain separate from ordinary search.

> [!WARNING]
> **Development checkpoint — not production-ready.** The source-level verification suite passes, but a clean dependency installation, strict TypeScript compilation, Electron runtime/build, native-module integration, end-to-end UI tests, real encrypted-backup round trips, accessibility review and platform installers have not been verified in this environment. Do not use this checkpoint as the only copy of important data. See [Implementation status](IMPLEMENTATION_STATUS.md) and [Final verification](DEVLEDGER_FINAL_VERIFICATION_2026-11-24.md) before relying on it.

---

## Contents

- [Product scope](#product-scope)
- [Feature overview](#feature-overview)
- [Search and optional local AI](#search-and-optional-local-ai)
- [Privacy, security and data protection](#privacy-security-and-data-protection)
- [Backup, restore and portability](#backup-restore-and-portability)
- [User interface and productivity](#user-interface-and-productivity)
- [Technology stack](#technology-stack)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Development commands](#development-commands)
- [Project structure](#project-structure)
- [Local data and Northstar migration](#local-data-and-northstar-migration)
- [Verification and release readiness](#verification-and-release-readiness)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)
- [License](#license)

## Product scope

DevLedger is a **single-user, local-first desktop application**. It connects the information that normally becomes scattered across project folders, task lists, notes, documents, contact records and personal work logs.

Its working model is built around connected records:

- A **project** provides the context for related tasks, notes, documents and contacts.
- **Tasks** can be nested, assigned priorities and statuses, scheduled, estimated, timed and connected through prerequisite dependencies.
- **Notes** preserve technical decisions, meeting details, implementation knowledge and other project context. Notes can link to other records and can be protected in the vault.
- **Documents** are stored in a managed local object store and, for supported formats, indexed for search.
- **Contacts** keep stakeholder and collaborator information connected to the projects and records where it matters.
- **Operations** brings shared tags, record links, blockers, reminders, notifications, time entries, activity and background-job history together.

### What DevLedger is—and is not

| DevLedger is | DevLedger is not currently |
|---|---|
| A personal project and developer-work management desktop workspace | An IDE or code editor |
| A local knowledge base connected to projects and work records | A hosted SaaS workspace |
| A local SQLite-backed application with optional local AI | A cloud AI product or mandatory AI assistant |
| A single-user desktop application | A real-time multi-user collaboration platform |
| A workspace with local backup and recovery workflows | A substitute for an independently tested disaster-recovery plan |

There is no server-side account, hosted synchronization service or team-collaboration backend in this source checkpoint.

## Feature overview

The following describes capabilities implemented in the source tree. A capability being present in source does not mean its packaged Electron runtime has been verified; release validation status is documented separately below.

### 1. Overview dashboard

The Overview screen provides a workspace-level snapshot, including project and task context, recent notes and other current-work information. Dashboard queries are designed to return bounded summaries rather than loading every record into the renderer.

### 2. Project management

- Create and edit projects with a name, description and project type.
- Classify new work as **Greenfield** (starting from scratch) or **Ongoing** (existing work being continued).
- View open-task and note counts alongside project details.
- Search/filter projects and browse archived projects separately.
- Archive projects and restore archived projects.
- Keep project context connected to notes, tasks, documents and contacts.
- Export a project to a portable ZIP archive and import an archive as a separate project copy.

Project archive import remaps record identifiers so the imported work is independent of the source records. Records and relationships outside the selected archive are not brought in as live external references. Protected notes and vault-encrypted documents are deliberately excluded from project-only exports; use a full encrypted workspace backup to preserve those items.

### 3. Notes and technical knowledge

- Write and organize project notes in a rich-text editor powered by TipTap.
- Save edits automatically and maintain note version history for ordinary notes.
- Format content with headings, bold, italic, bulleted and numbered lists, checklists, block quotes and tables.
- Insert smart date references and mention existing contacts inline.
- Import and export Markdown files.
- Associate notes with projects, tags and linked workspace records.
- Browse related records and backlinks to keep decisions connected to the work they describe.
- Protect sensitive notes in the encrypted vault; protected notes are excluded from ordinary full-text and semantic search while locked.

The Markdown editor integration uses the TipTap Markdown extension, which is identified upstream as beta. Validate imports/exports with representative documents before using them as the only copy of critical knowledge.

### 4. Tasks, planning and time tracking

- Create, edit and organize tasks, including parent/child task relationships.
- Track task status and priority, and optionally add a due date and time estimate.
- Store date-only deadlines separately from timed deadlines. Timed deadlines are stored as UTC instants; date-only deadlines remain calendar dates.
- Add prerequisite dependencies between tasks. The dependency model is a directed acyclic graph (DAG), and cycle-forming dependencies are rejected.
- Identify blockers and inspect dependency relationships.
- Start and stop the workspace's active task timer.
- Add manual time entries and retain correction/history records.
- Recover a timer after an application restart through an explicit recovery action.

Only one timer can be active at a time. Timer heartbeats are persisted. When a timer is recovered after the application was closed, DevLedger closes the previous segment at its last saved checkpoint and starts a new segment at recovery time. It does **not** guess or charge the unknown time while the application was closed.

### 5. Contacts and project relationships

- Maintain contact records for people involved in development work.
- Associate contacts with projects and their roles.
- Store configured/custom contact attributes in addition to the core record fields.
- Search and select contacts through bounded remote-search-backed pickers.
- Mention contacts in notes and connect contacts to other workspace records.

### 6. Documents and attachments

- Import supported files into the local managed document store.
- Associate documents with projects and include document metadata in workspace search.
- Store ordinary document objects by content hash, with integrity information used during import, export and restore.
- Extract text from **PDF, DOCX, XLSX, CSV, TXT and Markdown** files for indexing.
- Process extraction through a dedicated worker path and persistent background jobs.
- Optionally run OCR for scanned PDFs using local Poppler and Tesseract installations (see [Optional document tools](#optional-document-tools)).
- Protect selected attachments using per-document encryption in the vault.

The current extraction adapters do not claim support for arbitrary file formats, image OCR as a general document-import feature, or cloud document processing. Unsupported extensions are rejected rather than silently accepted.

### 7. Workspace operations

The Operations area groups cross-cutting workflows into the following sections:

| Area | Purpose |
|---|---|
| **Inbox** | Review reminder and other delivered notifications; filter all, unread, read and dismissed items; mark read, dismiss or snooze reminders |
| **Tags** | Create a reusable tag library and assign tags to projects, notes, tasks, documents and contacts |
| **Links** | Create named relationships between workspace records and inspect related records |
| **Dependencies** | Inspect and manage task prerequisite relationships |
| **Blockers** | Review tasks blocked by unfinished prerequisites |
| **Reminders** | Manage scheduled reminders and their delivery state |
| **Time** | Review recorded time entries and related task work |
| **Activity** | Review recent workspace activity history |
| **Background jobs** | Inspect persistent background work, status and progress history |

Reminder delivery history remains in the notification inbox even when desktop notifications cannot be displayed by the operating system. Notification and operational feeds use bounded pages rather than unbounded list requests.

### 8. Import, export and workspace portability

- Export an individual project into a ZIP archive containing the project's portable data and eligible attachments.
- Import a project archive as a separate copy, with identifiers remapped to avoid overwriting the source project.
- Export ordinary task and time-entry data in the project archive's structured formats.
- Create a full encrypted workspace backup containing a consistent SQLite snapshot, the managed object store and a verification manifest.
- Restore a full backup to a separate recovery copy before activating it.

**Important distinction:** project export is for sharing or copying ordinary project data; it is not a full-fidelity encrypted workspace backup. Protected notes and vault-encrypted documents are excluded from project-only archives by design.

### 9. Persistent background processing

The source includes a persistent local job queue for supported long-running tasks, including document extraction, semantic indexing, AI summaries, project import/export, search rebuilds, storage audits, SQLite maintenance, notification delivery and automatic backup work.

Job records support progress/status tracking, cancellation and lease/recovery behavior at the service layer. Document extraction runs through a dedicated worker. Full Electron process crash/restart orchestration still requires runtime verification.

## Search and optional local AI

### Search works without AI

DevLedger uses SQLite FTS5 for ordinary workspace search. Search covers projects, notes, tasks, contacts and successfully indexed documents. Results can be scoped to a project and refined with the supported query operators below.

| Operator | Example | Meaning |
|---|---|---|
| Project | `p:"Payments API"` | Limit to a matching project name |
| Tag | `#architecture` | Filter by tag |
| Record type | `type:task` | Restrict to a project, note, task, document or contact |
| Document type | `type:pdf` | Restrict document results by extension; supported values include `pdf`, `docx`, `xlsx`, `csv`, `txt` and `md` |
| Status | `is:blocked` | Filter supported task states: `blocked`, `overdue`, `completed` or `in-progress` |
| Date lower bound | `after:2026-01-01` | Include records on/after a valid ISO calendar date |
| Date upper bound | `before:2026-12-31` | Include records updated before the start of a valid ISO calendar date (exclusive) |
| Plain text | `database migration` | Search for the remaining text terms |

Unknown operators remain part of the text query. Dates must use the valid `YYYY-MM-DD` form. Locked protected notes are not included in ordinary search.

### Optional semantic search

- Uses embeddings generated by a local Ollama service.
- Embedding indexing can include unlocked notes, projects, contacts, tasks and successfully extracted documents.
- Semantic matching can retrieve related concepts that do not use the same exact words.
- SQLite FTS5 remains available if semantic indexing or Ollama is unavailable.
- A semantic-index rebuild creates a new generation and switches to it only after the indexing batches complete successfully.

### Optional AI evidence summaries

- AI summaries are **off by default** and explicitly opt-in from the Search screen.
- The configured local Ollama service is used; the current Search flow targets the local service at `127.0.0.1`.
- The summary is based on matching, unlocked search excerpts and presents source-record citations that can be opened from the result.
- The model is not given a workspace-write action through this flow.
- AI is not required for ordinary search, project management, note-taking or task management.

Live Ollama model quality, prompt-injection resilience, relevance and latency have not been verified with real models in this checkpoint.

## Privacy, security and data protection

DevLedger is designed to keep core workspace data on the local device. Its main process owns database and filesystem access; the renderer uses a narrow typed preload API rather than direct Node.js, SQLite or arbitrary filesystem access.

### Electron security boundaries

The configured Electron window uses context isolation and sandboxing, disables Node integration, and exposes a limited `window.devLedger` API from preload. IPC handlers validate the sending frame and validate request payloads before calling application services. External window creation is denied, and HTTPS navigation is handed to the system browser.

### Protected notes vault

- A randomly generated 256-bit vault key protects notes with **AES-256-GCM** authenticated encryption.
- **Argon2id** derives independent wrapping keys for the master passphrase and the one-time offline recovery key.
- A protected note's ordinary title/content fields are replaced with non-sensitive placeholders while the encrypted payload is stored separately.
- The normal note full-text index does not retain locked note content.
- The vault supports explicit lock/unlock, passphrase changes and an inactivity auto-lock setting (15 minutes by default in this source configuration).
- The vault also locks when the operating-system session locks.
- Optional Electron `safeStorage` device unlock protects the random vault key; it does not store the master passphrase.

The offline vault recovery key is shown only during setup. Store it separately and securely. Losing both the passphrase and recovery key can permanently prevent access to protected notes and attachments.

### Protected attachments

Vault-protected documents use per-document random data-encryption keys wrapped by the vault key. Opening a protected file decrypts it to a short-lived private temporary file; integrity, length and hash checks are applied, and temporary decrypted material is removed on lock, shutdown or timeout where the process can perform cleanup.

### Security limitations

This is not an independently security-audited product. JavaScript/Node buffers cannot guarantee secure memory erasure. Real packaged OS credential-store behavior, adversarial testing, independent cryptographic review and release-runtime security checks remain outstanding. See [Security model](docs/SECURITY.md).

## Backup, restore and portability

DevLedger contains two full-workspace backup paths in source.

### Manual encrypted backup

- Creates a consistent SQLite snapshot and includes the managed `objects/` data plus a JSON integrity manifest.
- Generates a random 256-bit archive data-encryption key.
- Wraps that key independently for a user passphrase and a portable one-time recovery key.
- Uses AES-GCM authenticated encryption and checksum validation.
- Requires a manual-backup passphrase of at least 12 characters.
- Allows restore with either the passphrase or the separately stored recovery key.
- Retains reader compatibility with the historical v1 passphrase-only format.

Keep the recovery key separate from the encrypted backup file. Anyone with both the backup and its recovery key can restore the workspace.

### Automatic encrypted snapshots

- When enabled and when Electron reports an adequately secure OS credential backend, local encrypted snapshots are scheduled at startup when due and approximately every 30 minutes.
- The local backup credential is protected using Electron `safeStorage`.
- On Linux, automatic snapshots fail closed when the selected credential backend is `basic_text` or unknown.
- A new local snapshot is restored to a temporary copy for verification before retention cleanup.
- Retention policy keeps up to 48 recent half-hour snapshots, 7 daily snapshots, 4 weekly snapshots and 6 monthly snapshots.
- When configured, verified encrypted snapshots can be mirrored to separately selected external and offline destinations. The destination is revalidated, the copied archive is hashed, and the final copy is promoted atomically.
- A removable offline destination must be connected when the copy is written and disconnected by the user afterward.

Automatic local snapshots are not a substitute for independent backups. A second directory on the same physical volume is not a separate disaster-recovery copy. Follow a 3-2-1 strategy with independently stored copies and periodically test recovery.

### Restore as copy and activation

1. DevLedger decrypts and validates the archive, checks archive limits and manifest hashes, validates the SQLite database and verifies referenced stored objects.
2. It extracts the backup to a separate `restore-copies/` directory. This operation does not overwrite the active workspace.
3. The user can explicitly activate the verified restore copy from Settings.
4. The previous database and object store are retained as a rollback point while the restored workspace is validated on restart.
5. The user can keep the restored workspace or roll back to the previous one.

Restore staging, activation and rollback logic have source-level tests, but real archive round trips, packaged-app restarts, power-loss/crash drills and cross-machine recovery have not been completed in this environment. See [Backup and recovery](docs/BACKUP_AND_RECOVERY.md).

## User interface and productivity

- **Lazy-loaded feature screens:** the renderer loads major sections on demand rather than eagerly importing every page at startup.
- **Command palette:** press `Ctrl/Cmd + K` to navigate between sections and launch quick capture.
- **Global quick capture:** the default shortcut is `Ctrl/Cmd + Shift + Space`; Settings offers other supported shortcut choices. Global shortcut registration can fail if the operating system or another application reserves the combination.
- **Light and dark appearance:** semantic design tokens support theme-aware surfaces and controls.
- **Reusable UI components:** the source includes 49 requested shadcn/Radix-style component files and Storybook configuration with 19 stories.
- **Bounded lists and pagination:** projects, contacts, notes, tasks and operational records use paged or remote-search-backed loading patterns.
- **Virtualized lists:** Notes and Tasks use a fixed-row virtual list with overscan to limit mounted rows.
- **Error recovery:** a renderer error boundary exposes retry/reload actions instead of leaving a failed lazy screen blank.

These are source-level implementation details. A complete visual, screen-reader, keyboard-only, contrast, reduced-motion and WCAG 2.2 AA review has not yet been completed.

## Technology stack

| Layer | Technologies |
|---|---|
| Desktop runtime | Electron 45, Electron Vite |
| UI | React 19, TypeScript 5.9, Vite 8 |
| Styling | Tailwind CSS v4, CSS-first semantic design tokens |
| Component system | shadcn CLI, Radix UI, Lucide icons, Storybook 10 |
| Rich-text editor | TipTap 3 with StarterKit, mentions, lists, tables and Markdown integration |
| Forms and validation | React Hook Form, Zod and resolver integration |
| Data | SQLite via `better-sqlite3`, schema migrations, WAL and FTS5 |
| Cryptography | Node crypto AES-256-GCM and Argon2id key derivation/wrapping |
| Background work | Persistent SQLite-backed job store/runner and a dedicated document worker |
| Optional local AI | Ollama embeddings and opt-in local summaries |
| Tests | Node test runner, SQLite/service integration tests, synthetic performance tests and Playwright E2E configuration |
| Packaging | electron-builder targets configured for Linux, Windows and macOS |

## Requirements

### Development environment

- **Node.js:** `22.16.0` or newer (compatible LTS release recommended; enforced by `package.json`).
- **npm:** version `10.0.0` or newer; this checkpoint declares `npm@10.9.2` as its package manager.
- **Network access:** npm registry access is needed to install declared dependencies.
- **Native build tools:** required on systems where compatible prebuilt native binaries are unavailable for `better-sqlite3` or `argon2`.
- **Platform-specific Electron prerequisites:** install the supported build/runtime prerequisites for the operating system on which you develop and package.

### Optional document tools

For scanned-PDF OCR, install these tools separately and make them available on `PATH`:

- Poppler utilities: `pdfinfo`, `pdftoppm` and `pdftotext`.
- Tesseract OCR.

Without the OCR tools, text-based PDF extraction can still use Poppler where available; scanned documents that require OCR remain marked as requiring OCR. These tools are not bundled by this source archive.

### Optional local AI

- Install Ollama separately and start its local service.
- Download compatible embedding and text-generation models in Ollama.
- Configure the model names and check the local service from DevLedger Settings.

Ollama is optional. No Ollama installation is required for the core application or FTS5 search.

## Getting started

> This source checkpoint has no `package-lock.json` and no installed `node_modules` directory. The steps below describe the intended developer workflow, not an installation already verified in this environment. Generate and commit a lockfile after a successful clean dependency resolution before relying on reproducible installs.

### 1. Obtain the source

Extract the DevLedger source archive and open a terminal in the project root (the directory containing `package.json`).

### 2. Install dependencies

```bash
npm install
```

### 3. Rebuild native dependencies for Electron

```bash
npm run rebuild:native
```

This rebuilds the native `better-sqlite3` and `argon2` modules for the Electron runtime. Re-run it after changing Node/Electron versions or moving the project to an environment where the native module ABI differs.

### 4. Start the development application

```bash
npm run dev
```

The `predev` lifecycle builds generated design tokens and the document worker before launching Electron Vite.

### 5. Create your first workspace

On first launch, use the Overview and Projects screens to create a project, then connect tasks, notes, documents and contacts to that project. Use Operations for tags, relationships, reminders, time tracking and activity. Before adding important material, review **Settings → Local data** and configure a separate backup destination.

## Development commands

Run commands from the project root.

| Command | Description |
|---|---|
| `npm run dev` | Build generated tokens and worker, then launch Electron Vite development mode |
| `npm run preview` | Preview the Electron Vite build |
| `npm run build` | Build the Electron main, preload, renderer and worker outputs |
| `npm run typecheck` | Run strict TypeScript checks for main, renderer and worker projects |
| `npm run lint` | Run ESLint across the project |
| `npm run format` | Format project files with Prettier |
| `npm run format:check` | Check formatting without writing changes |
| `npm run test:unit` | Run unit tests with Node's test runner and TypeScript type stripping |
| `npm run test:integration` | Run SQLite and service integration tests |
| `npm test` | Run unit and integration suites |
| `npm run test:performance` | Run synthetic database and algorithm performance tests |
| `npm run test:e2e` | Build the app and run Playwright Electron end-to-end scenarios |
| `npm run check:syntax` | Parse TypeScript/TSX source and report syntax diagnostics |
| `npm run check:source` | Validate local and alias source imports and declared external packages |
| `npm run check:strip` | Check Node 22 strip-only compatibility for the audited source set |
| `npm run check:size` | Enforce the configured source-file size audit |
| `npm run shadcn:check` | Check the required shadcn component inventory |
| `npm run tokens:build` | Generate semantic design-token CSS |
| `npm run build:worker` | Compile the document worker TypeScript project |
| `npm run storybook` | Start Storybook on port 6006 |
| `npm run build-storybook` | Build the Storybook static site |
| `npm run check:all` | Run source audits, component inventory, unit/integration/performance tests and token generation |
| `npm run check` | Run typecheck, lint and unit tests |

### Build and package

```bash
npm run build

# Platform package targets configured in package.json
npm run package:linux
npm run package:win
npm run package:mac
```

Configured targets are Linux AppImage and DEB, Windows NSIS and macOS DMG. Cross-platform packaging should be performed and smoke-tested on the appropriate target operating system. These installers have not been built or validated in this checkpoint.

## Project structure

```text
DevLedger/
├── src/
│   ├── domain/                 # Framework-independent rules and validation
│   ├── main/                   # Electron main process and application services
│   │   ├── database/           # SQLite connection and schema migrations
│   │   ├── ipc/                 # Validated IPC handlers and trust boundaries
│   │   ├── services/            # Workspace, search, vault, backup and operations
│   │   └── workers/             # Document extraction worker and adapters
│   ├── preload/                # Narrow, typed window.devLedger bridge
│   ├── renderer/
│   │   ├── components/          # Shared shell and UI components
│   │   ├── features/            # Dashboard, projects, notes, tasks, etc.
│   │   └── styles/              # Global styles and generated tokens
│   └── shared/                  # Shared main/preload/renderer contracts
├── docs/                        # Architecture, security, backup and performance
├── scripts/                     # Token generation and source audits
├── tests/
│   ├── unit/                    # Domain, crypto, migration and UI behavior tests
│   ├── integration/             # SQLite and service integration tests
│   ├── performance/             # Synthetic scale/performance tests
│   └── e2e/                     # Playwright desktop scenarios
├── .storybook/                  # Storybook configuration
├── package.json
├── electron.vite.config.ts
├── playwright.config.ts
└── README.md
```

### Process architecture

```text
React renderer
     │
     ▼
Typed preload API (window.devLedger)
     │  validated IPC
     ▼
Electron main process
     ├── SQLite / FTS5
     ├── workspace and domain services
     ├── local filesystem and object storage
     ├── vault and backup services
     ├── persistent background-job runner
     └── document extraction worker
```

The renderer does not open SQLite or access arbitrary filesystem paths. The main process owns persistence, native integrations and privileged operations. Framework-independent domain modules hold deterministic parsing, validation, date, task-graph and export-safety rules.

See [Architecture overview](docs/ARCHITECTURE.md) for the detailed process boundaries and persistence model.

## Local data and Northstar migration

The Electron main process uses Electron's `app.getPath('userData')` as the application data root. The local workspace stores:

- `northstar.sqlite` — the SQLite workspace database (historical filename intentionally retained for compatibility).
- `objects/` — content-addressed ordinary files and protected attachment ciphertext.
- `automatic-backups/` — local automatic encrypted snapshots.
- `restore-copies/` — separately restored workspace copies awaiting optional activation.

Check **Settings → Local data** in the running application for the resolved path on the current operating system. Do not assume a fixed Windows, macOS or Linux location.

### First-launch migration from Northstar Workspace

The rename preserves compatibility with earlier Northstar Workspace profiles. On first launch, startup can move the recognized legacy data directory to the current DevLedger data location when the migration is unambiguous. The source includes handling for the prior `Northstar Workspace` profile and the historical `northstar-developer-workspace` development profile.

Migration is designed to avoid overwriting or silently merging workspaces:

- If both legacy locations contain workspace databases, startup refuses to choose one automatically.
- If a DevLedger data directory already contains files but has no workspace database, startup stops rather than overwriting or merging the contents.
- The migration does not rename the historical SQLite file or cryptographic format identifiers. Those values are retained so existing databases, protected content and older encrypted backups remain readable.

Before launching a renamed build against an existing workspace, make an independent copy of the complete old data folder. If startup reports a conflict, do not delete either folder; reconcile and back them up before trying again. Migration logic has source-level tests, but migration of a real installed user profile has not been exercised in a packaged Electron application in this environment.

## Verification and release readiness

### Latest source-level verification

The final source verification recorded for **24 November 2026** reports:

| Check | Result |
|---|---:|
| Unit tests | **125 passed, 0 failed** |
| SQLite/service integration tests | **60 passed, 0 failed** |
| Synthetic performance tests | **3 passed, 0 failed** |
| TypeScript/TSX syntax audit | **256 files, 0 diagnostics** |
| Local and alias import audit | **256 files passed** |
| Node 22 strip-only compatibility audit | **198 files passed** |
| Source-size audit | **198 files; all at or below 250 lines** |
| Required shadcn component inventory | **49/49 present** |
| Tailwind semantic token generation | **Passed** |

These results are source-level checks. They are not proof that a packaged Electron application, native dependencies, installer or full backup/recovery workflow works on a user's machine. Synthetic performance tests use local in-memory SQLite fixtures and are not desktop responsiveness guarantees.

### Release gates still outstanding

| Area | Status in this checkpoint |
|---|---|
| Dependency installation | Not completed in the available environment; npm registry access failed with `EAI_AGAIN` |
| Dependency lockfile | `package-lock.json` is absent; none was fabricated |
| Strict TypeScript compilation | Not verified; missing installed Electron and Node type definitions prevent the current check from completing |
| ESLint and Prettier | Not run successfully; dependencies are not installed |
| Worker compilation and Electron build | Not verified; required dependencies/type definitions are absent |
| Electron runtime and native modules | Not launched/rebuilt and runtime-tested here |
| Playwright E2E | Scenarios are authored, but have not been run against a built Electron application |
| Encrypted backup/archive round trips | Real end-to-end creation and restore using passphrase and portable recovery key remain unverified |
| Restore crash/restart recovery | Source state-machine tests exist; packaged-app crash/power-loss drills remain outstanding |
| OS credential store | Device-key adapter has source tests; real packaged `safeStorage` behavior remains unverified |
| Ollama integration | Mocked/source tests exist; real model quality and latency are unverified |
| Storybook and visual quality | Stories/configuration exist; full Storybook rendering and visual regression are unverified |
| Accessibility | Initial labels and keyboard behavior exist; comprehensive WCAG 2.2 AA and assistive-technology review remains outstanding |
| Platform installers | Linux, Windows and macOS package targets are configured but installers have not been built/smoke-tested |

The npm registry failure was environmental; it does not mean dependency installation is impossible in every environment. Run the release gates in a network-enabled clean environment, generate and commit a real lockfile, then test the packaged app on each target platform.

## Known limitations

- DevLedger is single-user and local-first; there is no hosted sync, shared workspace or simultaneous multi-user editing service.
- SQLite access is synchronous in parts of the Electron main process. A single background-job executor and a dedicated document worker reduce competing work, but real disk-backed and renderer profiling is still required.
- Some paginated screens use limit/offset navigation; extremely deep pages in very large workspaces may benefit from cursor pagination in a future revision.
- Project archive import applies a 128 MiB `project.json` limit and parses that bounded JSON payload in memory. It is not a fully streaming import format.
- OCR depends on optional external Poppler and Tesseract executables.
- Semantic search and AI summaries depend on a separately installed, configured local Ollama service and compatible models.
- The TipTap Markdown integration is beta upstream; validate interchange with critical Markdown sources.
- Automatic backup depends on a sufficiently secure Electron OS credential backend and will disable itself on Linux `basic_text` or unknown backends.
- An external backup folder on the same physical volume is not an independent backup. An offline medium must be connected for copying and disconnected by the user afterward.
- JavaScript/Node memory handling cannot guarantee secure erasure of secrets from process memory.
- Full WCAG/accessibility, adversarial security, packaged backup/recovery, runtime reliability and production performance reviews remain open.

## Documentation

| Document | Contents |
|---|---|
| [Implementation status](IMPLEMENTATION_STATUS.md) | Current implementation, verification evidence and remaining release gaps |
| [Final completion checkpoint](FINAL_COMPLETION_CHECKPOINT_2026-11-24.md) | Consolidated work completed and current release decision |
| [Final DevLedger verification](DEVLEDGER_FINAL_VERIFICATION_2026-11-24.md) | Latest rebrand/migration verification and test counts |
| [Rebrand report](DEVLEDGER_REBRAND_REPORT_2026-11-24.md) | Product identity updates and compatibility decisions |
| [Bug-fix report](BUGFIX_REPORT_2026-11-24.md) | Latest bug fixes and regression notes |
| [Architecture](docs/ARCHITECTURE.md) | Process boundaries, main modules, persistence and IPC model |
| [Security](docs/SECURITY.md) | Electron security, file handling, vault and privacy model |
| [Backup and recovery](docs/BACKUP_AND_RECOVERY.md) | Encrypted backup format, restore staging and recovery limitations |
| [Performance](docs/PERFORMANCE.md) | Pagination, virtualization, indexing and synthetic performance evidence |
| [shadcn component inventory](docs/SHADCN_COMPONENTS.md) | UI component source inventory and usage reference |

Historical reports from earlier checkpoints are retained for traceability. Prefer the latest dated verification report and `IMPLEMENTATION_STATUS.md` when assessing current release readiness.

## License

The package metadata currently declares this project as `UNLICENSED` and private. No open-source license or redistribution rights are granted by this repository. Obtain authorization from the project owner before redistributing or incorporating the source into another product.


## End-to-end testing

DevLedger uses the repository's existing Playwright dependency to automate the real Electron app. E2E tests run with isolated temporary user-data profiles; never point them at your everyday workspace. See [`tests/e2e/README.md`](tests/e2e/README.md) for setup, commands, isolation guarantees and troubleshooting. The architecture review, feature inventory, workflow analysis, scenario matrix, coverage matrix and execution report are under [`docs/`](docs/).
