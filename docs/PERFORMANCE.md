# Performance architecture and operating limits

## Goals

DevLedger is a local-first Electron application. Performance work must preserve data integrity, keep the renderer responsive, and avoid moving large workspace payloads across the Electron IPC boundary unnecessarily. The current changes are additive: the original full-list APIs remain available for compatibility while the renderer's primary list screens use bounded page APIs.

## Implemented in this pass

### Startup and frontend delivery

- Feature pages are loaded with React `lazy()` and `Suspense`, so editor-heavy and rarely used screens are split from the initial renderer bundle.
- Initial bootstrap fetches application metadata, dashboard summary, active timer, settings, and vault status. It does not eagerly fetch every project, task, contact, note, and document.
- View data is loaded when that view is selected. Stale view requests are ignored when navigation changes before a request completes.
- CRUD refreshes update dashboard-level information and let each list screen refresh its own page rather than reloading every collection.

### Bounded data access

- Projects and contacts use pages of 30.
- Tasks and notes use pages of 50.
- Documents use pages of 40.
- The IPC boundary normalizes page sizes and caps them at 200; negative offsets and oversized search strings are rejected or normalized before queries run.
- Task list pages include only matching tasks plus their ancestor context, so nested tasks remain understandable without loading the entire task table.
- Note list responses include a 600-character preview. The full note body is fetched by ID only when a note is opened.
- Document list responses contain metadata only; extracted text is excluded from list IPC payloads.
- Quick Capture loads a bounded set of project choices.
- Workspace collections expose bounded page APIs only; legacy unbounded list IPC routes were removed. Dashboard recent-note cards use a direct SQL query with `LIMIT 6` and a 600-character excerpt, avoiding materialization of the full Notes collection in main-process memory.

### Renderer memory and rendering

- Task and note result lists use a fixed-row virtual list with overscan, reducing mounted row count to the visible window plus a small buffer.
- List requests use request IDs to ignore stale responses after fast filtering, pagination, or navigation.
- Task and note filters use deferred React values to avoid forcing the input interaction to wait for every list render.
- The virtual list observes its viewport size and resets scroll only when the row identity/order changes, not when a visible row's contents are updated. Notes and Tasks pass stable module-level item-key callbacks so unrelated editor/form state changes do not force the complete page identity string to be rebuilt.

### Database access

- Contacts, notes, and task text filters use their existing FTS5 search indexes rather than leading-wildcard scans.
- Contact page queries select the page of contact IDs before loading project associations.
- Contact create/update responses fetch the changed contact by ID instead of materializing every contact in the workspace.
- Task hierarchy-cycle validation walks the proposed parent's ancestor chain using a recursive CTE instead of loading every task in the project into JavaScript. Task-dependency cycle validation now uses a recursive SQLite CTE and the existing `(task_id, depends_on_task_id)` index to inspect only the prerequisite's reachable dependency chain; it no longer copies the complete dependency graph into the main-process heap.
- Schema migration 14 adds indexes for workspace-wide contact-name, note-updated, document-updated and task due-date ordering, plus reverse contact membership lookup. Schema migration 15 adds stable-order page indexes for blocker queues, reminder due dates and per-task time-entry histories.
- Existing WAL, foreign-key, FTS and maintenance behavior is retained.

### Export and archive memory policy

- Project export opens a stable SQLite backup snapshot and uses a temporary scoped-entity table to avoid constructing giant `IN (...)` parameter lists.
- Each exported record category is read in 200-row keyset batches. JSON/CSV data is serialized into staging files through streams rather than accumulated as one workspace-sized string/buffer.
- Attachment copies are streamed to staging and hashed from the exact bytes being copied. Object path containment and symlink-parent checks run before copy.
- `project.json` is capped at 128 MiB on both export and import, and project archives share the same entry-count, expanded-size, compressed-size and manifest budgets.
- The import path still parses the bounded `project.json` payload in memory. Very large projects are therefore safely limited rather than fully streaming end-to-end; a future versioned JSONL/record-stream archive format would be needed to remove that ceiling.

### Main-process observability and workload policy

- IPC handlers log channel and elapsed duration when a handler exceeds 100 ms. No IPC payloads or user data are logged.
- The persistent background-job queue is configured for one active executor to avoid concurrent database-heavy jobs competing on the Electron main thread.
- Document extraction remains in its dedicated worker.

## Current limits and follow-up work

These changes improve the common workflows, but they do not make all work non-blocking or guarantee a particular frame rate on every machine.

1. **Operations record selection and operational feeds are bounded.** Projects, notes, tasks, documents and contacts use remote-search-backed selectors with at most 30 results per request. Tags, blockers, reminders and per-task time-entry histories use page APIs with a 50-row UI page size and a 200-row service ceiling. Tag search uses an indexed, literal prefix range. Activity and job feeds remain explicitly limited to their latest 150 rows; the notification inbox uses keyset pagination with a 100-row page size.
2. **Some cross-reference selectors load up to 200 records.** They are bounded, but a workspace with more than 200 projects/tasks/contacts/documents may need remote-search pickers to expose every record without transferring every record.
3. **SQLite calls remain synchronous in the Electron main process.** The single background queue prevents multiple jobs from competing, and document extraction is worker-isolated, but synchronous SQLite work can still block the main event loop. A future database worker/serialized command architecture must preserve transaction ordering and the single-writer rule before it is introduced.
4. **Entity page navigation currently uses limit/offset.** This is simple and compatible with the existing UI. Very deep pages in extremely large databases should move to stable keyset/cursor pagination with indexed sort keys.
5. **Search and semantic AI need full-workspace benchmarks.** The included vector-prefilter benchmark validates candidate narrowing only; it is not an end-to-end search, embedding, Ollama inference, or UI latency benchmark.
6. **Visual profiling remains outstanding.** Browser/Electron runtime profiling, accessibility inspection, memory-leak checks, and real-device performance tests still need to be run after dependencies can be installed.
7. **Dashboard note loading is bounded.** The dashboard reads only six recent notes directly from SQLite, each with a 600-character preview. Operations remote pickers and paginated feeds also avoid full-collection loads on those paths. Further scale work should evaluate realistic cross-view usage and deep offset pagination against disk-backed workspaces.

## Validation performed for this pass

Run from the project root:

```bash
npm run check:all
```

This runs the syntax audit, local-import audit, shadcn inventory check, unit and integration tests, semantic-prefilter benchmark, and design-token generation.

The Electron build, TypeScript project typecheck, ESLint, Playwright E2E, native-module rebuild, visual profiling, and platform packaging still require installed project dependencies and a real Electron runtime. They are not represented as passing checks in this report.

## Measured local checks (2026-11-23)

`npm run check:all` completed successfully in the available Node/SQLite environment:

- Syntax audit: 195 TypeScript/TSX files, zero parse diagnostics.
- Local import audit: 195 source files, all relative imports resolve and external packages are declared.
- shadcn source inventory: 49/49 expected components present.
- Unit tests: 80 passed.
- Integration tests: 46 passed, including paginated operations feeds, 245-reminder batch delivery, AI evidence/citation bounds, batched task-title lookup and transitive dependency-cycle rejection.
- Performance tests: 3 passed, including 10,000-row Operations feed pages, dashboard summary, indexed semantic prefilter and 10,000-edge dependency-cycle benchmarks.
- Operations remote-record search adapter tests: 2 passed (included in the unit-test total).
- Design-token CSS generation: passed.

The paginated-list benchmark inserts **10,000** contacts, notes, tasks, and documents, then measures 15 deep offset-page reads per entity (offset 9,950, page size 50). The latest scale run reported:

| Endpoint | p50 | p95 |
|---|---:|---:|
| Contacts | 2.32 ms | 2.77 ms |
| Notes | 0.79 ms | 0.95 ms |
| Tasks | 4.10 ms | 4.66 ms |
| Documents | 0.91 ms | 1.48 ms |

The continuation benchmark also measured `dashboardSummary()` against the same 10,000-note dataset (15 runs, 6 recent note cards): p50 5.11 ms, p95 6.07 ms in the latest run. This verifies bounded output and records a local query timing; it does not measure renderer or disk latency.

The semantic-prefilter benchmark measured 12,000 synthetic vector rows narrowed to 92 candidates, with p50 0.35 ms and p95 1.48 ms in the latest scale run. These are local in-memory SQLite query measurements, not end-to-end application timings or guarantees for slower disks/older CPUs.

The dependency-cycle benchmark seeds 10,000 tasks and 9,999 dependency edges, checks the recursive query plan uses `task_dependencies_pair_idx`, then attempts the cycle-closing edge 15 times. The latest run measured p50 9.93 ms and p95 10.33 ms for service-level validation, including task/project checks. It verifies that the rejected edge is never inserted.


### Operations feed scale checks (additional continuation)

The same run measured 10,000 rows per Operations feed and 50-row deep pages (15 reads per case). The tests also inspect `EXPLAIN QUERY PLAN` to confirm the tag prefix query, blocker queue, reminder due-date and per-task time-entry history use their supporting indexes.

| Operations feed | p50 | p95 |
|---|---:|---:|
| Tags | 0.30 ms | 0.51 ms |
| Blockers | 0.87 ms | 1.02 ms |
| Reminders | 4.41 ms | 4.88 ms |
| Per-task time entries | 0.73 ms | 1.30 ms |

Reminder delivery is bounded to 100 rows per job transaction. The integration test drains 245 due reminders in three runs (100, 100, 45) and verifies idempotent redelivery. Local AI summary boundary tests now cover untrusted evidence prompt framing, allow-listed citations and rejection of oversized responses.


## Final source checkpoint (2026-11-24)

The latest `npm run check:all` run passed with 113 unit tests, 60 service/SQLite integration tests, 3 synthetic performance tests, 252 syntax/import-audited source files, 196 Node-strip/source-size-audited files and the 49/49 shadcn inventory. The final run also includes export staging/attachment hash checks, bounded tag associations, capped ambiguous exact-name lookup, restore-path portability and the renderer error boundary. These remain source-level checks; the Electron build and runtime, full archive round-trips, actual Storybook rendering, Playwright E2E and target-OS packaging are not verified in this environment.
