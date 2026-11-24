# DevLedger — implementation and release status

**Updated:** 24 November 2026
**Status:** Follow-up defects fixed and a final source-level quality pass completed; project export is streamed, renderer recovery is improved, and all available checks pass; **not production-ready because dependency-backed build/runtime and release verification remain blocked**.

## What the latest hardening pass added

- Persisted timer-session identifiers and 15-second heartbeats. A timer from a prior application session requires an explicit user decision. “Continue from now” closes the previous session at its last known checkpoint and starts a fresh segment; time while the app was closed is not silently counted. Users can instead confirm a stop time or discard the interrupted session.
- Durable in-app notification inbox with idempotent reminder delivery, unread/read/dismissed state, snooze/reschedule, reminder-to-inbox history, unread count and stable keyset pagination capped at 100 records per page.
- Reminder delivery and automatic backup snapshots are dispatched through the persistent background-job runner. Timers now act as scheduling triggers rather than executing those operations directly.
- Optional OS-keychain vault unlock. The OS credential store protects only the random vault master key, never the user's passphrase. Linux backends identified as `basic_text` or `unknown` fail closed.
- A second external/offline backup destination can be configured. The two external destinations must be on distinct physical volumes and outside the workspace data volume. Destinations are revalidated at mirror time; an apparent mount-point folder on the workspace volume is not counted as an independent copy.
- Project ZIP export behavior is explicit: ordinary notes and unencrypted attachments are included; locked-note ciphertext/key-wrapping metadata and vault-encrypted documents are excluded, with exclusion counts in the manifest and archive README. The full encrypted workspace backup remains the preservation mechanism for protected data.
- Task creation uses React Hook Form and Zod for required fields and bounded input validation.
- Corrected stale design-system component inventory documentation.
- **Continuation performance fix (23 Nov):** dashboard recent notes no longer call the full `listNotes()` method. A direct limited query retrieves only six cards and a 600-character excerpt each.
- **Operations scalability fix (23 Nov):** removed the five legacy full-collection calls from Operations navigation. Record selectors now search projects, notes, tasks, documents and contacts through paginated IPC APIs with 30-result pages, query debouncing, stale-response protection and preserved access to archived projects/completed tasks. Added adapter unit tests for all entity kinds and request bounds.
- **Background-job recovery correction (23 Nov):** stale-worker recovery now uses its supplied recovery instant as the new availability time rather than wall-clock time. Added a regression assertion that a recovered job can be claimed immediately at that instant; cancellation completion also uses the supplied timestamp for deterministic behavior.
- **Operations data-path hardening (23 Nov):** added a bounded batch task-title API for dependency/blocker labels, with deduplication and a 200-ID IPC cap. Dependency-cycle validation now uses a recursive SQLite CTE and existing task/dependency indexes instead of reading the entire dependency graph into JavaScript. Added integration coverage for duplicate/missing task IDs and multi-hop cycle rejection.
- **Operations feed pagination (23 Nov):** replaced unbounded tag, blocker, reminder and per-task time-entry feed reads with bounded IPC page methods (50 rows in the UI, hard cap 200). Added stable ordering, exact totals, clamped page recovery after deletions/filtering, debounced literal-prefix tag search and schema-v15 page indexes. SQLite query-plan tests verify the tag, blocker, reminder and time-history indexes.
- **Reminder backlog protection (23 Nov):** each durable reminder-delivery job processes at most 100 due reminders in one transaction and reports whether more work remains. Main-process continuation schedules subsequent batches, while inbox insertion remains idempotent. Integration coverage delivers a 245-reminder backlog in three batches.
- **Local AI summary hardening (23 Nov):** the Ollama prompt now defines explicit trust boundaries for the search question and workspace evidence, instructs the model not to follow embedded instructions or claim side effects, caps generation and rejects oversized model responses. Returned citations are still restricted to exact IDs in the local search results. Mocked integration tests cover hostile source content, fabricated citations and oversized output. This does not guarantee prompt-injection immunity or replace testing against real installed models.
- Split the workspace service into focused contacts, projects, notes, tasks/timer, dashboard and search service areas while preserving the `WorkspaceService` facade. Split database migrations into core, relationship, search and security modules. The timer return contract now explicitly includes its last heartbeat checkpoint.
- **Node 22 strip-only test compatibility:** removed unsupported TypeScript constructor parameter properties from imported service classes (including semantic indexing/search, backups, project export and reminder/job schedulers). Added a source audit so future parameter-property regressions fail `check:all` before tests run.
- **Startup restore state-machine coverage:** extracted the workspace database startup/restore validation flow into a dependency-injected core and added six tests for healthy startup, corrupt DB closure, valid staged restore, object-validation failure rollback, rollback integrity failure, rollback operation failure and prior interrupted rollback handling.
- **Storage audit scalability:** object integrity audit now keyset-pages document metadata in 200-row batches, checks cancellation between rows, and caps persisted issue details at 500 while reporting the total issue count and truncation flag. Added a 505-document regression test verifying all pages and bounded result payload.
- **Typecheck coverage:** the `typecheck` script now includes worker TypeScript in addition to main and renderer projects.
- **Main-process maintainability:** moved workspace startup/restore validation into a dedicated module; main entry point is now 226 lines.
- **Search-index maintenance scalability (23 Nov):** FTS repair now constructs replacement note/task/contact/document/semantic indexes in 200-record keyset batches, yields to the Electron event loop between batches, mirrors concurrent source changes into the staging indexes and swaps the completed set atomically. Cancellation/failure leaves the previous live indexes intact. Source triggers are recreated transactionally after the swap, and FTS secure-delete behavior is preserved. SQLite maintenance now uses `PRAGMA optimize` instead of a forced full `ANALYZE` scan.
- **Relationship pagination (23 Nov):** entity links/backlinks and both sides of task dependencies now use bounded 50-row UI pages (200-row service cap) with exact totals, deterministic ordering and page recovery after deletions. Notes and Operations screens consume the new paginated APIs; active selections reset stale offsets and creating a link refreshes the displayed page.
- **Relationship query indexes (schema v19):** added source and target link indexes ordered by `(created_at DESC, id DESC)` and a reverse dependency covering index. Removed redundant target/dependency indexes where newer indexes or the composite primary key already provide the access path. Query-plan assertions verify link and reverse-dependency pages use the intended indexes.
- **Restore validation scalability (23 Nov):** staged-restore validation now keyset-pages active document references 200 at a time and verifies each object path, symlink state and content hash before moving to the next batch. It no longer loads the full document-reference table into memory. A 405-object regression verifies the 200/200/5 batch traversal and completion read.
- **Critical startup defect fixed (24 Nov):** the background document worker previously received an undeclared `databasePath`, and the main entry point used `openDatabase` only in a `ReturnType` expression without importing it. The app now uses the `Database.Database` type and a shared `resolveWorkspaceDatabasePath()` helper used by both database initialization and the document worker. A path-equivalence regression test protects the shared location.
- **Backup restore defects fixed (24 Nov):** added the missing `MAX_HEADER_BYTES`, `backupDataAad`, `createWriteStream` and `randomUUID` dependencies. Restored document references are now validated using 200-row keyset pages and a manifest-path `Set`, avoiding the prior unbounded `.all()` plus repeated linear `.some()` scans.
- **Backup archive safety fixed (24 Nov):** backup creation now enumerates object files lazily, validates the object-store root is a real directory, reads document references and schema version from the actual SQLite snapshot, and enforces the same archive-entry, 100 GiB expanded, 5 GiB compressed and 10 MiB manifest budgets as restore. Restore validates actual streamed output bytes, rejects symlink entries and enforces the same compressed/expanded/manifest limits.
- **Project archive contract fixed (24 Nov):** project export and import now share one set of archive budget constants. Export checks entry count, aggregate expanded size and manifest size before writing, and enforces the 5 GiB compressed cap while streaming. This prevents the exporter from intentionally creating archives that DevLedger's importer rejects on size grounds.
- **Archive budget regressions (24 Nov):** added boundary and over-limit tests for backup and project archive contracts. The shared startup/database path test and archive budget tests are part of the unit suite.
- **Portable object paths (24 Nov):** document object paths are persisted with canonical forward slashes. Backup creation normalizes legacy separator styles; backup restore normalizes paths in the staged database, so backups move between Windows and POSIX platforms without path-separator mismatches. Absolute, drive-prefixed and traversal paths are rejected.
- **Startup restore validation pagination (24 Nov):** `workspace-validation.ts` now keyset-pages active document references in 200-row batches instead of `.all()`-loading the entire table. It also canonicalizes legacy Windows paths as part of staged restore validation. A 405-document regression verifies 200/200/5 batches and portable path updates.
- **Source-size maintainability:** the source-size checker is part of `check:all`; all first-party TypeScript/TSX files under `src` remain at or below 250 lines.
- **Project export memory reduction (24 Nov):** export now uses a stable SQLite snapshot and a temporary scoped-entity table, reads each record category in 200-row keyset batches and writes JSON/CSV to staging files through streams. Attachment objects are copied and hashed in the same pass, path traversal and symlink parents are rejected, and exports that reference outside-project link endpoints omit those links. The top-level `project.json` payload is capped at the same 128 MiB boundary used by import. Import still parses the bounded JSON payload in memory; this is a remaining large-project limit.
- **Renderer fault recovery (24 Nov):** added a top-level React error boundary for failed lazy-loaded views and render exceptions. It presents an accessible error state, technical details, retry and full reload actions instead of leaving the window blank.
- **Virtualized-list render efficiency (24 Nov):** the Notes and Tasks pages now pass stable module-level item-key callbacks. The virtual list can retain its memoized identity signature during unrelated editor/form renders instead of rebuilding a full key string every render.

## Latest source verification

- **DevLedger rebrand and legacy profile migration (24 Nov):** visible branding, Electron/package identity, preload API (`window.devLedger`), generated archive markers and Markdown link schemes now use DevLedger. Existing Northstar data folders are migrated non-destructively; historical database, encryption AAD, backup markers and Markdown schemes remain readable for backward compatibility.


`npm run check:all` passed on 24 November 2026 after the final UI and export changes:

| Check | Result |
|---|---:|
| TypeScript/TSX syntax parsing | **252 files, 0 diagnostics** |
| Local/alias import audit | **252 files passed** |
| Node 22 strip-only compatibility audit | **196 first-party TS/TSX files passed** |
| Source-size audit | **196 first-party TS/TSX files; all at most 250 lines** |
| shadcn source inventory | **49/49** files present |
| Unit tests | **113 passed, 0 failed** |
| SQLite/service integration tests | **60 passed, 0 failed** |
| Performance tests | **3 passed, 0 failed** |
| Tailwind token generation | Passed |

Latest synthetic in-memory SQLite performance run (24 Nov): dependency-cycle validation (10,000 tasks / 9,999 edges) **12.38/13.40 ms p50/p95**; contacts **2.57/3.82 ms**; notes **4.80/5.69 ms**; tasks **5.24/6.14 ms**; documents **1.02/1.68 ms**; protected + ordinary notes **4.59/5.25 ms**; tags **0.56/0.88 ms**; blockers **1.25/1.67 ms**; reminders **5.95/7.08 ms**; time entries **0.90/1.39 ms**; activity history **0.41/0.55 ms**; background-job history **0.61/2.17 ms**; inbox all **0.22/0.59 ms**; inbox unread **0.18/0.47 ms**; dashboard recent notes **6.15/7.12 ms**; semantic SQL prefilter (12,000 vectors narrowed to 92 candidates) **0.49/1.17 ms**. These are synthetic local measurements, not Electron end-to-end guarantees.

The source checks do not replace strict TypeScript compilation or Electron runtime testing. `npm run typecheck` still fails before semantic compilation because `@types/node` and Electron type definitions are absent. `npm ping --fetch-retries=0 --fetch-timeout=6000` still fails with `EAI_AGAIN registry.npmjs.org`. No lockfile was fabricated.

## Remaining code and release gaps

| Item | Current state |
|---|---|
| Dependency lockfile | No `package-lock.json`. Registry DNS fails with `EAI_AGAIN`; no lockfile was fabricated. |
| Strict TypeScript and worker compilation | Blocked by missing project dependencies/type definitions (`electron`, `node`). `npm run typecheck` and `npm run build` cannot proceed to semantic compilation. Syntax parsing is not semantic type checking. |
| ESLint and Prettier | Not run successfully; `eslint` and `prettier` executables are not installed. |
| Electron runtime/native modules | Electron, `better-sqlite3` and `argon2` have not been installed/rebuilt or launched in this environment. |
| Playwright E2E | Eight Electron scenarios are authored; they have not been executed because the build and dependencies are unavailable. |
| Backup archive round-trip | Archive creation/restore limits, streaming checks, cross-platform object paths and restore references are hardened in source. Real `.nsbackup` creation, passphrase restore, portable recovery-key restore and cross-machine restore remain unrun because `archiver`, `unzipper`, `argon2` and the native SQLite driver are not installed in this environment. |
| Restore promotion/rollback | State-machine and staged-object validation are source-tested; packaged Electron restart/crash-injection drill remains outstanding. |
| OS safeStorage | The device-key adapter is unit-tested with a fake safeStorage port; a real OS keyring test on the target desktop remains outstanding. |
| Offline 3-copy backup | Code supports local + two external volumes when configured. The user must connect the removable destination at snapshot time and disconnect it afterward. The app cannot guarantee that users disconnect it or prove cloud-provider upload. |
| Universal job framework | Extracted job persistence/store and lease runner into separate cohesive modules. Extraction, semantic indexing, AI summaries, project import/export, maintenance, notification delivery and automatic snapshots use the persistent runner. Scheduler timers remain as triggers, and real Electron crash/restart orchestration has not been exercised. |
| Full premium UI review | Storybook has 19 stories and the 49/49 source inventory passes, but Storybook has not been built/rendered and no Electron screenshots/visual regression review is complete. |
| Accessibility | Initial labels, focus and keyboard checks exist. No comprehensive WCAG 2.2 AA, screen-reader, contrast or reduced-motion audit has been performed. |
| Performance at scale | Synthetic SQLite paging and candidate-prefilter tests pass. Full large-workspace renderer, startup, extraction, backup and end-to-end Electron profiling remains outstanding. |
| Live AI model behavior | Prompt trust boundaries, citation allow-listing and response-size limits are source-tested with mocked Ollama responses. Real-model prompt-injection resilience, relevance, hallucination rates and latency remain unverified. |
| Platform installation | Linux, Windows and macOS installers have not been built or smoke-tested on their target OSes. |
| Source-size rule | The largest workspace service and migration modules were split. The earlier 250-line maintainability target is now satisfied across `src`: the largest first-party TypeScript/TSX file is 245 lines. This target originated in the older DevMemory context, but it is retained as a quality guard for this codebase. |

## Commands attempted and environmental blocker

- `npm run typecheck` (24 Nov): blocked by missing Electron and Node type definitions (`TS2688`).
- `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000`: registry requests failed with `EAI_AGAIN`; command did not produce a lockfile.
- `npm run build`: blocked during worker compilation by missing Node types.
- `npm run lint`: `eslint: not found`.
- `npm run format:check`: `prettier: not found`.
- `npm run build-storybook`: `storybook: not found`.
- `npm ping --fetch-retries=0 --fetch-timeout=6000`: failed with `EAI_AGAIN registry.npmjs.org`.

There is no `node_modules` directory. A real lockfile must be generated after dependency resolution succeeds; manually inventing one would make the install less trustworthy, not more.

## Release decision

This is a substantially hardened development source tree. It is **not a production release** and should not be the only copy of irreplaceable project knowledge. The next gate is a clean dependency install and lockfile, followed by strict type/build/lint/format checks, real Electron + native-module runtime, Playwright flows, backup/recovery drills, visual/accessibility testing and target-OS packaging.

See [RELEASE_VERIFICATION_2026-11-23.md](./RELEASE_VERIFICATION_2026-11-23.md) for the latest evidence, [GAP_CLOSURE_2026-11-23.md](./GAP_CLOSURE_2026-11-23.md) for the implementation history and [docs/PERFORMANCE.md](./docs/PERFORMANCE.md) for performance design. `FINAL_VERIFICATION_2026-11-23.md` is a historical snapshot superseded by the continuation report.
