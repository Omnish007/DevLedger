# DevLedger — code-level gap closure

**Date:** 23 November 2026
**Baseline:** `DevLedger-Workspace-Hardened-2026-11-23`
**Result:** The identified code-level gaps have received additional implementation work. Source-level checks pass, but runtime-dependent release checks remain open.

## 1. Timer restart recovery

**Previous gap:** A persisted active timer could span an application restart and silently count time during which the application was closed.

**Change:** Each active session stores an application-session UUID and a heartbeat timestamp. The main process updates the heartbeat every 15 seconds. At startup, the session UUID mismatch requires the user to choose how to recover:

- **Continue from now:** close the previous entry at the last saved heartbeat, then begin a new active entry at the current time. The closed-app gap is excluded.
- **Stop at a confirmed time:** ask the user for the actual end time and validate it against the session start and current time.
- **Discard:** remove the unconfirmed active entry.

The recovery UI displays elapsed time only through the last saved heartbeat while recovery is pending; it does not display the full wall-clock gap as known effort. The migration adds `active_session_id` and `heartbeat_at` without rewriting existing historical entries.

**Evidence:** schema migration 13, `WorkspaceService` timer methods, main-process heartbeat lifecycle, shared timer contract, task UI and integration coverage for previous-session recovery, resume, confirmed stop, discard and checkpoint handling.

## 2. Notification inbox and reminders

**Previous gap:** Reminder scheduling existed without a durable, user-facing notification history.

**Change:** Added a SQLite-backed notification inbox. Reminder delivery creates an idempotent inbox record independently of OS notification support. The inbox supports unread/read/dismissed/all filters, unread counts, mark-read, mark-all-read, dismiss, and reminder snooze presets of 15 minutes, 1 hour, 4 hours and 1 day. Snoozing updates the reminder due time and a later due delivery creates a new idempotent inbox event. The renderer uses keyset pagination on `(created_at, id)`, capped at 100 records per page.

Reminder delivery is now a persistent job (`notifications.deliver`). The minute timer only wakes the scheduler and enqueues due work; it no longer performs delivery directly.

**Evidence:** `notification-inbox.ts`, schema migration 12, IPC/preload contracts, Operations inbox UI and integration tests for idempotency, snooze/reschedule and pagination.

## 3. Three-copy backup configuration

**Previous gap:** The code had one optional external mirror and could not establish three distinct storage locations.

**Change:** Added a second external destination intended for removable/offline media. The local workspace is the first copy; the first external volume is the second; the separately mounted removable/offline volume can be the third. The directory validator compares device identity and rejects locations on the workspace or first external volume. Mirror-time revalidation catches a missing mount that resolves to an ordinary folder on the workspace volume. A same-volume artifact is removed rather than being recorded as an independent copy. Each successful copy is written atomically and SHA-256 checked.

The automatic snapshot operation now runs as a persistent `backup.snapshot` job, while the 30-minute interval only enqueues work. Backup failures for local/external/offline destinations create durable inbox warnings.

**Important physical limitation:** The removable/offline destination must be mounted when the backup job runs. It must be disconnected afterward by the user to provide an offline copy. The application cannot guarantee disconnection or verify a cloud-sync provider has uploaded the copied archive.

**Evidence:** Settings UI, `external-backup.ts`, `automatic-backup.ts`, the main-process scheduler and external-backup integration tests.

## 4. Project archive export correctness

**Previous gap:** Project export SQL excluded locked-note ciphertext and vault-encrypted documents, but the generated archive README implied protected ciphertext/key metadata was included.

**Change:** Kept the safer behavior and made it explicit everywhere. Project copy ZIP archives include ordinary notes and unencrypted attachments. They exclude locked notes, vault wrapping metadata and encrypted documents. Counts are included under `exportExclusions` in `project.json` and in the manifest; the archive README explains that full encrypted workspace backups are the mechanism for preserving protected records. The UI export confirmation says this as well.

**Evidence:** `project-export.ts`, export archive README/manifest generation and the renderer export result message.

## 5. Optional vault device unlock

**Previous gap:** The vault supported passphrase and offline recovery key but had no optional OS credential-store unlock.

**Change:** Added an opt-in adapter that stores only the random 256-bit vault master key encrypted by Electron `safeStorage`. It never stores the user's passphrase. The key file is written with restrictive permissions via an atomic temporary file. On Linux, insecure `basic_text` and `unknown` credential backends are rejected. Device unlock remains an optional convenience; passphrase and offline recovery routes remain available. Failure to decrypt the OS credential leaves the vault locked rather than weakening protection.

**Evidence:** `vault-device-key.ts`, `VaultService.unlockWithDeviceKey`, main startup opt-in, Settings control, IPC/preload and unit tests using a safeStorage test double.

**Limitation:** This is not a real keyring test. The target OS's safeStorage backend and packaging behavior must be tested on the owner's machine.

## 6. Background job coverage

The persistent runner now has registered executors for document extraction, semantic indexing, AI summaries, project import/export, search index rebuild, storage audit, database optimization, notification delivery and automatic backup snapshots. It retains queue persistence, idempotency, cancellation, progress, leases, retries/backoff and stale-running recovery.

Scheduler timers remain as wake-up triggers. They enqueue work rather than owning the operation. Real Electron shutdown/restart and native-worker crash tests have not been run in this environment.

## 7. Forms, docs and maintainability

- Task creation now uses React Hook Form + Zod validation for required project/title, bounded text, smart-date and estimate constraints. Other screens still contain controlled forms; the project does not yet use React Hook Form universally.
- Fixed the shadcn design-system documentation to say the local inventory is 49/49 files, while explicitly distinguishing file-presence from official CLI registry parity.
- Split the 600-line `WorkspaceService` into cohesive contacts, projects, notes, task/timer, dashboard and search services behind the same public facade.
- Split database migrations into core, relation, search and security modules. The schema history is append-only and now includes the notification/backup additions and schema-v15 pagination indexes; existing migration versions are preserved.
- The timer result type now explicitly exposes `lastHeartbeatAt`, matching the actual recovery contract.

### Follow-on scale and AI hardening (23 Nov)

- Added paginated IPC/service feeds for tags, blockers, reminders and per-task time entries. UI pages use a 50-row size (maximum 200), stable ordering, page clamping after mutations and debounced tag-prefix search. Tag prefix matching uses an indexed NOCASE range rather than an escaped `LIKE` scan. Schema v15 adds supporting blocker queue, reminder due-date and task-time-history indexes.
- Reminder delivery transactions now process at most 100 due reminders per job. Remaining due work is scheduled as another short continuation; inbox idempotency is retained. A 245-reminder integration case verifies 100/100/45 delivery.
- Local AI summary prompts now separate explicit security, grounding, citation and output instructions from JSON-encoded untrusted search/evidence data. Model output is bounded (2,048 generated tokens, 16,000-character response field and 32,000-character envelope), and citations must match returned local-search IDs. Mocked tests cover an injected workspace excerpt, invalid citation IDs and oversized output. This is defense-in-depth, not a guarantee that any language model is immune to prompt injection.


The earlier DevMemory engineering context specified a maximum of 250 lines per first-party source file. The workspace service, migration modules, task page, storage service, Operations service and job runner/store were split into smaller modules. **Seven TypeScript files remain above 250 lines**: `src/main/services/project-import.ts` (476), `src/main/index.ts` (412), `src/main/services/ollama.ts` (390), `src/main/ipc/register.ts` (385), `src/main/services/backup.ts` (326), `src/main/workers/document-worker.ts` (303), and `src/main/services/restore-activation.ts` (288). This limit came from the earlier DevMemory context, not the later DevLedger technology prompt; it is still treated as a maintainability target, but it is not fully satisfied.

## 8. Verification

The latest `npm run check:all` run completed successfully:

| Check | Result |
|---|---:|
| TS/TSX syntax parser | **195 files; zero parse diagnostics** |
| Local/alias import audit | **195 files passed** |
| shadcn UI source inventory | **49/49** |
| Unit tests | **80 passed, 0 failed** |
| Integration tests | **46 passed, 0 failed** |
| Indexed semantic prefilter benchmark | **Passed** — 12,000 synthetic vectors, 92 candidates, 0.35 ms p50 / 1.48 ms p95 in the final run |
| Tailwind token build | Passed |

`git diff --check` was clean before final documentation was written; it is rerun before packaging.

## 9. Remaining work that cannot be truthfully marked complete

- `package-lock.json` is still absent. `npm ping` fails with `EAI_AGAIN registry.npmjs.org`; no fabricated lockfile was added.
- `npm run typecheck` and the worker build are blocked because `@types/electron` and `@types/node` are not installed.
- ESLint, Prettier and Storybook executables are not installed.
- Eight Playwright Electron E2E scenarios exist, but the suite is not executed.
- Electron, `better-sqlite3`, `argon2`, `archiver` and `unzipper` are not installed; real native-driver execution and `.nsbackup` archive round-trip (passphrase and recovery key) remain untested.
- Restore promotion/rollback is source-tested but not exercised through a packaged app restart/crash drill.
- Real Ollama model behavior, AI summary quality, prompt-injection resilience and source-grounding effectiveness are not validated against installed models; only the prompt boundary and output/citation handling are covered by mocked integration tests.
- No rendered Storybook/Electron visual review, visual regression, formal WCAG 2.2 AA, screen-reader, contrast or reduced-motion audit is complete.
- The semantic prefilter benchmark is not a full application performance profile.
- Linux/Windows/macOS installers have not been built or smoke-tested on their target operating systems.
- Seven oversized TypeScript files remain above the earlier 250-line maintainability target; their exact paths and line counts are listed in Section 7.

- Tags, blockers, reminders and per-task time-entry feeds now use paginated service/IPC/UI paths; 10,000-row page benchmarks and query-plan assertions cover the paths.
- Reminder delivery processes a maximum of 100 due rows per transaction, with idempotent scheduled continuations.
- Current verification: 80 unit, 46 integration and 3 performance tests pass; syntax/import checks cover 195 source files; shadcn inventory is 49/49.

**Decision:** The newly identified code-level scalability and AI boundary gaps are addressed in source and source-tested. This does not equal a verified production release; the dependency/runtime/release gates above remain open.
