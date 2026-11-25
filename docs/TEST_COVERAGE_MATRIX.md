# DevLedger Test Coverage Matrix

**Important:** the E2E tests listed here are implemented in source but were not executed in the current environment because dependencies could not be installed and the Electron build is not present. “Existing unit/integration” means lower-layer tests already in the repository. A feature is not described as fully E2E-verified unless a successful Electron test run exists.

| Feature | Unit / integration evidence in repo | E2E source coverage | Important uncovered scenarios | Current status |
|---|---|---|---|---|
| Startup / renderer shell | Existing source and integration pipeline | `app/startup.spec.ts` | Fresh-install migration matrix, actual Electron run, main-process crash injection | Implemented / unexecuted |
| Navigation / command palette | Renderer source checks | `navigation/navigation.spec.ts` | Keyboard shortcuts on all platform conventions, back/forward history (not an implemented route model) | Implemented / unexecuted |
| Projects | Project/archive service unit/integration suites | `features/projects.spec.ts`, `features/project-archive.spec.ts`, `workflows/complete-user-journeys.spec.ts`, `app/lifecycle.spec.ts` | Malformed archive, permission failures, richer imported relationship permutations | Partial E2E / unexecuted |
| Tasks | Task domain and service integration suites | `features/tasks.spec.ts`, `workflows/complete-user-journeys.spec.ts`, `features/operations-workflows.spec.ts` | UI editing every field, delete confirmation, hierarchy, due date boundary, overlapping timer | Partial E2E / unexecuted |
| Notes | Note persistence, editor/domain and related service tests | `features/notes.spec.ts`, `workflows/complete-user-journeys.spec.ts`, `features/operations-workflows.spec.ts`, `security/protected-data-recovery.spec.ts` | Version history UI, Markdown import/export, detailed autosave failure injection | Partial E2E / unexecuted |
| Contacts | Contact validation and repository/service integration tests | `features/contacts.spec.ts` | Contact restart, stale project relationship, maximum custom attributes, all role values | Partial E2E / unexecuted |
| Documents | Object-store, extraction and import service integration tests | `features/documents.spec.ts` | Open/read, multiple formats, PDF/OCR workers, vault encryption, restart integrity | Partial E2E / unexecuted |
| Local search | FTS/indexing integration tests | `features/search.spec.ts`, workflow test, operations job test | Unicode/punctuation, rebuild completion/content parity, deletion consistency | Partial E2E / unexecuted |
| Tags | Tag validation and association services | `features/operations.spec.ts` | Invalid tag UI feedback, assignment persistence after restart, max 200 associations | Partial E2E / unexecuted |
| Links / backlinks | Entity link service integration tests | `features/operations-workflows.spec.ts` | UI removal, document/contact/project permutations, stale relation cleanup, restart | Partial E2E / unexecuted |
| Dependencies | Dependency DAG and service tests | `features/operations-workflows.spec.ts` | Cross-project/self edge UI, remove edge, chain longer than two, restart | Partial E2E / unexecuted |
| Blockers | Operations service tests | `features/operations-workflows.spec.ts` | Optional contact/follow-up, malformed reason, deleted task, restart | Partial E2E / unexecuted |
| Reminders / notifications | Reminder scheduling and notification service tests | `features/operations-workflows.spec.ts`, `features/operations.spec.ts` | Delivery timing, snooze, read/dismiss transitions, OS notifications, restart | Partial E2E / unexecuted |
| Manual time / timer | Time-entry and timer service tests | `features/operations-workflows.spec.ts`, `features/tasks.spec.ts` | Edit/delete UI, invalid interval, multi-active contention, timer heartbeat | Partial E2E / unexecuted |
| Activity / background jobs | Worker/job/lease integration tests | `features/operations.spec.ts`, `navigation/navigation.spec.ts` | Job cancellation, failure/retry, stale lease after process crash, activity details | Partial E2E / unexecuted |
| Settings | Settings/theme/shortcut unit/integration tests | `features/settings.spec.ts` | Every setting, native shortcut behavior, corrupt settings fallback, OS-specific behavior | Partial E2E / unexecuted |
| Quick Capture | Capture IPC/service tests | `workflows/complete-user-journeys.spec.ts` | Empty validation, save failure, shortcut invocation, window close during write | Partial E2E / unexecuted |
| Vault / protected content | Vault crypto/service tests | `security/protected-data-recovery.spec.ts` | Create vault, protect note, exclude protected body from global search, restart into locked state, reject wrong passphrase, unlock and open protected note, relock | Auto-lock timer/device unlock/safeStorage fallback, protected documents UI and corrupted protected object recovery | Partial E2E / unexecuted |
| Backups / restore | Backup and restore service/integration tests | `security/protected-data-recovery.spec.ts` | Create encrypted backup through UI, verify file creation, reject wrong passphrase, restore validated copy, assert live workspace remains unchanged | Activate/restart, rollback/commit, interrupted restore, corrupt archive, disk/permission failure and scheduled backup UI | Partial E2E / unexecuted |
| Project archive import/export | Project archive service integration tests | `features/project-archive.spec.ts` | UI export/import round-trip, imported project receives a remapped copy, imported task is filtered under that copy | Corrupted archive, malformed manifest, attachment checksum failure, permission errors and broad relationship permutations | Partial E2E / unexecuted |
| IPC / Electron security | Sender/schema security unit/integration checks | `security/ipc-security.spec.ts`, `app/startup.spec.ts` | Sender-frame spoof, navigation/external URL, traversal payloads and production packaged mode | Partial E2E / unexecuted |

## E2E source inventory

| Spec | Scenarios |
|---|---|
| `app/startup.spec.ts` | isolated profile, startup main landmark, Electron window preferences, renderer API exposure, renderer exception check |
| `app/lifecycle.spec.ts` | renderer reload and process restart persistence, minimum supported Notes viewport |
| `navigation/navigation.spec.ts` | all primary routes, all Operations tabs, command palette, accessible primary controls |
| `features/projects.spec.ts` | required project name, Unicode search, edit/archive/restore |
| `features/project-archive.spec.ts` | project archive export/import round-trip, imported project copy, task association verified under remapped project |
| `features/contacts.spec.ts` | required name, native invalid-email constraint, custom attribute, search, edit, trash confirmation |
| `features/tasks.spec.ts` | task title validation, create/status/filter/timer, interrupted timer restart/discard |
| `features/notes.spec.ts` | Unicode and inert script-like content, autosave and reopening after reload |
| `features/documents.spec.ts` | Markdown import through actual IPC/service/store with a controlled dialog selection, unsupported extension rejection |
| `features/search.spec.ts` | FTS result for created note, empty/no-match query |
| `features/operations.spec.ts` | tag create/search/apply/delete, inbox empty state, search rebuild job enqueue |
| `features/operations-workflows.spec.ts` | note-task record linking, dependency cycle rejection, blocker create/resolve, manual time entry, reminder scheduling |
| `features/settings.spec.ts` | theme persistence across app restart, isolated data path and shortcut preference |
| `workflows/complete-user-journeys.spec.ts` | project-task-note-search-restart journey; dedicated Quick Capture window and note persistence |
| `security/ipc-security.spec.ts` | invalid IPC payload rejection and renderer privilege surface |
| `security/protected-data-recovery.spec.ts` | vault setup/protected-note lock, search exclusion, wrong-passphrase handling, restart unlock; encrypted backup creation, wrong-passphrase rejection and restore-as-copy non-destructive check |

## Counts

The current source tree contains **16 Playwright spec files and 37 E2E test scenarios**. The test runner did not execute in this environment, so the E2E passed/failed/skipped count is **not available**; no E2E pass count is claimed. The repository's separately executed lower-layer suite passed 129 unit tests, 60 integration tests and 3 performance tests.
