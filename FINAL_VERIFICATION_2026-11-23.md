# DevLedger — final source verification

**Date:** 23 November 2026
**Reviewed source:** DevLedger hardening branch after timer, notification, backup, vault, export, and service/migration modularization
**Release decision:** **NOT PRODUCTION-READY.** Code-level gaps were substantially closed in source and the dependency-free test suite passes. Dependency installation, semantic compilation, native Electron runtime, full E2E, visual/accessibility review and platform packaging remain unverified.

> **Historical snapshot:** This report predates the later Operations feed pagination and AI summary hardening documented in `RELEASE_VERIFICATION_2026-11-23.md`. Its test counts and performance figures describe the earlier source snapshot and are not the latest results. Use `IMPLEMENTATION_STATUS.md` and the continuation release report for the current state.

## Executive result

| Category | Result |
|---|---|
| Core Electron/React/TypeScript architecture | Present in source; not built/launched here |
| Projects, contacts, notes, tasks, documents and operations | Implemented in source with the limitations below |
| Timer restart recovery | Implemented and integration-tested with a heartbeat checkpoint |
| Durable notification inbox | Implemented and integration-tested |
| Protected attachments and vault key handling | Source implementation and lower-level tests; native app lifecycle remains unverified |
| Independent backup key wrapping | Source implementation and envelope tests; actual archive round-trip unverified |
| Restore staging/promotion/rollback | Source implementation and state/validation tests; packaged recovery drill unverified |
| Three-copy backup destinations | Optional local + two distinct-volume destinations; physical offline procedure requires user action |
| Persistent background work | Shared runner covers extraction, indexing, AI summary, project archive, maintenance, notification delivery and backup snapshots |
| Semantic candidate indexing | SQLite candidate prefilter and 12,000-row microbenchmark pass |
| E2E | Eight Playwright scenarios defined; execution blocked by missing dependencies/build |
| Premium visual acceptance | Component inventory/stories exist, but no Storybook or Electron visual inspection |
| Reproducible install/package | Missing lockfile, semantic build and installer verification |

## Requirement and implementation evidence

| Requirement / prior gap | Implementation approach | Evidence | Remaining limitation |
|---|---|---|---|
| Local-first single-user app | Electron main/preload/sandbox renderer, SQLite/WAL/FTS5 and local object storage | Source/import inventory and integration tests | No Electron runtime/build test in this environment |
| Electron security | Context isolation, Node integration disabled, sandbox, restrictive navigation/CSP, allowlisted and validated IPC | Source audit | No packaged IPC abuse/penetration test |
| Project and contact workflows | Project lifecycle, contacts, associations/roles, custom attributes, activity and import/export | Integration tests, source review | Large archive interoperability/runtime still unverified |
| Notes and knowledge | TipTap, autosave/version history, Markdown import/export, checklists, tables, mentions, tags and links/backlinks | Source, unit/integration | Rendered editor round-trips/abrupt shutdown E2E unverified |
| Task hierarchy and effort | Nested task CRUD, parent-cycle prevention, date-only/timestamp deadlines, estimate minutes, one active timer and manual entries | Integration tests | Full timesheet presentation, complex hierarchy E2E and overlap UX need further review |
| Timer recovery | Session UUID and 15-second heartbeat; previous session requires explicit continue/stop/discard; resume excludes closed-app gap | Integration tests for checkpoint/resume/stop/discard | Electron crash/restart E2E not run |
| Dependencies/blockers | DAG cycle prevention, blocker contact/follow-up and resolution history | Integration tests | No interactive graph or automatic dependent scheduling |
| Smart dates/reminders | Deterministic date parser, task deadlines, reminders and scheduled notifications | Unit/integration tests | DST/locale matrix and packaged notification behavior remain |
| Notification inbox | Idempotent SQLite inbox; filters; unread count; read/dismiss; snooze; keyset pagination | `notification-inbox.test.ts` | OS notifications and visual inbox rendering require actual Electron runtime |
| Documents | Atomic content-addressed store, signature/extension checks, TXT/CSV/MD, DOCX/XLSX/PDF extraction and optional OCR | Storage/integration tests | Poppler/Tesseract availability, malformed corpus fuzzing and packaged worker not tested |
| Persistent job orchestration | Leases, heartbeats, retries, bounded concurrency, progress/cancel and startup stale-job recovery; reminder and snapshot work are now jobs too | Unit/integration tests | Actual worker/Electron process restart tests not run |
| FTS5 search | Projects/contacts/notes/tasks/documents, structured filters, selected result routing | Integration tests | Large workspace pagination/contention benchmarks remain |
| Semantic search | LSH bucket prefilter, bounded candidates, cosine/RRF scoring and Ollama adapter | Integration/performance tests | Live model and relevance quality not tested |
| AI summaries | Explicit opt-in and local source-backed summaries | Source | Live Ollama, injection resistance, grounding/timeout behavior unverified |
| Protected notes and documents | AES-256-GCM note/file encryption, per-file DEK wrapped by vault master key, Argon2id passphrase/recovery envelopes | Unit/storage tests | Independent crypto review and actual packaged lifecycle test remain |
| Vault device unlock | Optional OS `safeStorage` wrapper for only the random vault key; Linux insecure backend rejected | Unit tests with safeStorage port fake | Real OS keychain and packaged Electron test not run |
| Manual backup | Random DEK with separate passphrase/recovery wrapping, versioned format, manifest hashes and v1 compatibility path | Key envelope tests | Actual `.nsbackup` creation/decrypt/restore not run |
| Automatic backup | OS-protected credential, 30-minute verified local snapshots, retention and persistent `backup.snapshot` jobs | Retention/key safety tests and source | Production safeStorage and archive format not run |
| External backup | Atomic mirror, SHA-256 validation, local and two external destinations, volume identity checks | External directory integration tests | User must mount offline drive and later disconnect it; cloud upload cannot be proven |
| Staged restore | Isolated staging, DB/object hash validation, durable promotion marker, startup integrity check, keep/rollback state | Restore tests from earlier hardening pass and current source | Packaged restart/crash drill not run |
| Project export | Manifest/zip/hash validation, ID remapping on import; protected files excluded and documented as exclusions | Import DB tests and source | Actual unzipper/archiver runtime not tested |
| UI / shadcn | Tailwind v4, semantic tokens, New York/Radix source, 49 component files, shared controls, 19 Storybook stories | 49/49 source inventory | Official CLI registry sync and visual runtime not run |
| Forms | Task creation uses React Hook Form and Zod; IPC boundaries use Zod | Source and syntax checks | Other forms remain mixed controlled-form implementations; not all forms use RHF |
| Settings | Theme, density/sidebar, shortcuts, vault/device unlock, Ollama/embedding, backup destinations and restore controls | Source | Full settings acceptance and OS-specific controls need E2E |

## Tests actually run

`npm run check:all` passed after the latest code refactor:

- **185** TypeScript/TSX files parsed with zero syntax diagnostics.
- **185** source files passed local/alias import audit.
- **49/49** required shadcn source file inventory.
- **76/76** unit tests passed.
- **40/40** SQLite/service integration tests passed.
- **1/1** indexed semantic candidate benchmark passed: 12,000 synthetic vector rows were reduced to 92 candidates; 0.35 ms p50 / 0.73 ms p95 for the candidate query in this run.
- Tailwind token generation passed.

The semantic benchmark is a narrow SQL candidate-query measurement. It does not represent full search latency, retrieval quality, embedding generation, renderer speed or production hardware.

## Commands attempted but blocked / not run

| Command or check | Result |
|---|---|
| `npm run typecheck` | Blocked: TS2688 missing `electron` and `node` type definitions |
| `npm run build` | Blocked: worker TS compilation missing Node types |
| `npm run lint` | `eslint: not found` |
| `npm run format:check` | `prettier: not found` |
| `npm run build-storybook` | `storybook: not found` |
| `npm ping --fetch-retries=0 --fetch-timeout=6000` | `EAI_AGAIN registry.npmjs.org` |
| `npm run test:e2e` | Not executed; it requires a successful build and installed Playwright/Electron dependencies |
| Real backup archive round-trip | Not run; `archiver`, `unzipper`, `argon2` and native SQLite app driver are not installed |
| Electron launch/native module rebuild | Not run |
| Storybook render/screenshots | Not run |
| Live Ollama/vector retrieval | Not run |
| Formal WCAG/screen-reader/contrast/reduced-motion audit | Not run |
| Linux/Windows/macOS installers | Not built or smoke-tested |

## Rules and maintainability

The workspace service, migration modules, task page, storage service, Operations service and background-job runner/store have been split into smaller units. Seven files remain over the earlier 250-line threshold: `project-import.ts` (476), `index.ts` (403), `ollama.ts` (384), `ipc/register.ts` (353), `backup.ts` (326), `document-worker.ts` (303), and `restore-activation.ts` (288). This constraint comes from the earlier DevMemory engineering context rather than the later DevLedger master prompt; it remains a maintainability target but is not fully satisfied.

No lockfile is included because npm dependency resolution is not available. A real lockfile must be generated with npm after registry access is restored; it must not be fabricated. The actual official shadcn CLI registry reconciliation is also not completed; file inventory is not proof of byte-for-byte upstream parity.

## Release decision

**Not production-ready.** Core code-level gaps received implementations and the dependency-free source test suite passes. That is not equivalent to a verified desktop release. Before using irreplaceable data, complete a clean install and lockfile, strict semantic compilation, Electron/native runtime tests, real encrypted backup/recovery drills, E2E, visual/accessibility review, realistic performance profiling and platform-specific installers. Keep independent backups until those checks have passed.
