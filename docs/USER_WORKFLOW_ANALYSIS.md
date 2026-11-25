# DevLedger User Journey and Workflow Analysis

## Core user journeys

### 1. Establish project context

1. Open Projects.
2. Create a named project and optional description.
3. Find it using the project filter.
4. Edit its metadata.
5. Archive and restore it when no longer active.
6. Return after a renderer reload or full application restart and confirm the record is still present.

Dependencies: Project UI → preload `projects` methods → project IPC/service → SQLite. Project context is then selected by tasks, contacts, record pickers, exports and related workspace tools.

### 2. Plan and execute work

1. Create a project.
2. Create one or more tasks and associate them with that project.
3. Set title, description, priority and date/estimate fields where required.
4. Change task status as work progresses.
5. Add prerequisites in Operations and verify cross-project and cycle rejection.
6. Record blockers and resolve them when the dependency clears.
7. Start/stop a timer or enter historical manual time.
8. Restart the app while a timer is active and explicitly confirm or discard recovered work.

Dependencies: Tasks ↔ Projects ↔ Operations dependency/blocker/time services. The timer has main-process persistence/heartbeat behavior, so a renderer reload alone is not sufficient lifecycle coverage.

### 3. Capture and maintain knowledge

1. Create a note in Notes or use the separate Quick Capture window.
2. Enter a title and rich-text content, including Unicode text.
3. Wait for the app's save state, navigate away, reopen the note and verify persistence.
4. Link a note to a project/task/contact/document using related-record or Operations linking.
5. Search the content through local FTS.
6. Exercise protected-note flows only after vault setup/unlock, and ensure locked content is not returned by search.

Dependencies: Notes UI/editor → notes preload API → note service/version history → SQLite and FTS. Protected notes additionally depend on vault state and encrypted storage.

### 4. Manage contacts and relationships

1. Create a contact with a name and optional role/project/company/email/phone/notes/custom attributes.
2. Verify input constraints and search.
3. Edit the record and verify updated details.
4. Move the contact to trash and confirm the destructive action.
5. Verify the contact can be selected where supported and that historical references/activity are handled according to actual service semantics.

Dependencies: Contacts, Projects and entity picker; contact names may be used from notes and task/blocker/reminder workflows.

### 5. Import and find documents

1. Create a controlled local fixture document inside the test profile.
2. Use the actual Documents import UI and native file chooser integration.
3. Verify the IPC/service import response, document row, object-store file and queued extraction job.
4. Search for extracted text after indexing where extraction is available.
5. Open the document through the document service.
6. Exercise unsupported extension and filesystem permission failures in isolated conditions.

The UI E2E test replaces only the native dialog's selected path; the app import pipeline remains real. Poppler/Tesseract availability is environment-dependent and should not make core tests flaky.

### 6. Cross-feature knowledge workflow

Create a project → create a task for the project → create a note describing the task → link the note and task → search the note text → inspect the record in its destination page → restart Electron → verify project, task, note and relationship remain consistent.

### 7. Operations workflow

Create a tag → apply it to a record → search/filter tags → remove the tag; create a record link and remove it; establish a dependency and reject cycle; record/resolve a blocker; add/correct/delete manual time; schedule reminder and verify inbox delivery state; enqueue/cancel/review a background job; review activity changes.

## Application lifecycle journeys

- Fresh, empty temporary user-data directory → first launch → DB migration and integrity check → Overview.
- Normal close/reopen → same isolated profile → persisted records available.
- Renderer reload → current local data is rehydrated, no duplicate operations.
- Active timer → full app restart → interrupted session confirmation → explicit recovery or discard.
- Queued/running background job → close/reopen → worker lease/status recovery according to the job implementation.
- Backup create → restore as copy → activate staged restore → validate → commit or rollback.
- Vault unlock → protected note/document access → lock/auto-lock → protected data no longer available to renderer.

## Failure and boundary scenarios

- Missing/blank required names, blank task title, blank note body, invalid email syntax, invalid tags and unsupported tag colors.
- Unicode, emoji, punctuation, HTML/script-like literal text and near-maximum field lengths.
- Duplicate tags/links and duplicate submissions.
- Stale IDs, deleted entities, unavailable files, unsupported extensions and invalid IPC payloads.
- Cross-project dependency and dependency cycle.
- Invalid date strings, reversed time intervals and intervals over seven days.
- Database busy/locked/read/write failures, startup integrity errors, migration failure, interrupted restore.
- Renderer page errors, failed IPC replies, untrusted sender, absent optional Ollama/Poppler/Tesseract integration.
- Process termination during a timer or persistent job.

## Risk priorities

| Risk | Why it matters | Test priority |
|---|---|---|
| Corrupt or inaccessible database / failed migration | App cannot start or may lose local records | Critical |
| Restore staging / interrupted activation | Data integrity and recovery | Critical |
| Timer restart/recovery | Work-time accuracy | High |
| Vault/backup encryption boundary | Confidential user data | Critical |
| IPC sender or payload validation regression | Privileged main-process boundary | Critical |
| Document object-store mismatch | Metadata can point to missing content | High |
| Cross-module relationship corruption | Broken project/task/note/contact graph | High |
| Background worker lease/retry failure | Jobs can become stuck or duplicated | High |
| Search index stale or inconsistent | Users cannot discover existing data | High |
| Pure page styling/navigation error | UX and discoverability | Medium to High |

## Known test gaps

The implemented E2E source covers primary project/contact/task/note/search/document/operations/settings/capture and lifecycle journeys, selected link/dependency/blocker/manual-time/reminder flows, vault setup/protected-note search exclusion/restart lock/wrong-passphrase/unlock, and encrypted backup/restore-as-copy. These scenarios have not been run in the current environment. Remaining E2E gaps include project archive round-trip, vault auto-lock/device unlock/protected-document UX, backup activation/rollback/commit, reminder delivery timing and OS notifications, worker crash recovery, and corrupted-database recovery. Existing unit/integration coverage does not substitute for E2E confirmation of these workflows.
