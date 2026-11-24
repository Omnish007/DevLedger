# DevLedger — audit defect fixes

**Date:** 24 November 2026  
**Source:** corrected continuation of `DevLedger-Workspace-Continuation-2026-11-23-v4.zip`  
**Decision:** critical source defects identified by the implementation audit were corrected and source-tested. The application is still **not production-ready** because semantic typechecking, Electron/native runtime and real archive round-trip testing remain blocked in this environment.

## Defects fixed

### 1. Fatal main-process startup path

`src/main/index.ts` previously passed an undeclared `databasePath` into `DocumentWorkerSupervisor.start()` and referenced an undeclared `openDatabase` in the database variable type. Startup now uses `Database.Database` as the variable type and calls `resolveWorkspaceDatabasePath(dataDirectory)`. The same helper is used by `initializeWorkspaceDatabase()`, so the worker and main process cannot silently diverge on the database location. A regression test verifies the canonical path.

### 2. Backup restore unresolved identifiers

`src/main/services/backup.ts` now imports `MAX_HEADER_BYTES`, `backupDataAad`, `createWriteStream` and `randomUUID` from their owning modules. This repairs the missing references that caused v2 header validation/decryption and extraction/restore-copy creation to fail before reaching their intended logic.

### 3. Unbounded and inefficient restore object validation

Restore previously loaded every active document reference in one `.all()` call and called `manifest.files.some(...)` for each record. It now keyset-pages references in batches of 200 and uses a `Set` for manifest membership, preserving path-containment checks while bounding the database result page and avoiding repeated linear manifest scans.

### 4. Backup writer/reader safety mismatch

Backup creation now:

- Iterates the object store lazily instead of first materializing every file path.
- Rejects an object-store root that is not a real directory or is a symlink.
- Checks document references against the database snapshot actually being archived, not a possibly newer live database state.
- Enforces the restore-side entry-count, expanded-size, compressed-size and manifest-size budgets before/during writing.

Backup restoration now:

- Enforces the compressed archive limit before decrypting/extracting.
- Rejects symlink entries.
- Counts actual decompressed bytes per entry and across the archive, rather than trusting only ZIP-declared lengths.
- Checks the extracted file size against the declared size.

### 5. Project export/import archive budget mismatch

A shared `project-archive-limits.ts` module now defines the same limits for export and import. Export validates the entry count, aggregate expanded size and manifest size before writing and enforces the compressed-size cap while streaming. This closes the known mismatch where export could generate an archive that import would reject solely because it exceeded one of the reader's configured size limits.

### 6. Cross-platform object-path portability

Document object references were persisted using the host OS path separator. A workspace created on Windows could therefore contain `objects\\...` values that were treated as literal backslash-containing filenames when restored on POSIX. New object references are now stored with canonical forward slashes. Backup creation and restore normalize legacy path values, reject absolute/drive/traversal paths, resolve them safely on the current platform, and rewrite legacy references in the private staged database before it is returned.

### 7. Remaining unbounded startup restore validation

The separate startup validator (`src/main/workspace-validation.ts`) still loaded every active document reference with a single `.all()` call. It now keyset-pages 200 references at a time and canonicalizes legacy object paths during validation. A 405-document test verifies 200/200/5 page traversal, canonical path updates and real-file existence checks.

## Verification

`npm run check:all` passed after these changes:

| Check | Result |
|---|---:|
| Syntax audit | 241 TypeScript/TSX files, 0 parse diagnostics |
| Local import audit | 241 source files, all local imports resolved |
| Node strip-only compatibility | 188 files passed |
| shadcn inventory | 49/49 present |
| Unit tests | 104 passed, 0 failed |
| Integration tests | 57 passed, 0 failed |
| Performance tests | 3 passed, 0 failed |
| Tailwind token generation | Passed |

New tests cover archive budget boundaries and rejection paths, shared database path resolution, portable object-path normalization, and 405-document startup restore validation. Existing project import/service tests and performance tests remain green.

## Still unverified

`npm run typecheck` was attempted but blocked by `TS2688` because the environment lacks the Electron and Node type definitions. The dependencies `electron`, `better-sqlite3`, `argon2`, `archiver` and `unzipper` are also not installed in this working tree, so an actual Electron startup, backup creation/decryption/restore round-trip, native database integrity validation, Playwright E2E and target-platform packaging could not be run. A source-level pass is not a substitute for those runtime checks. The project-export implementation still materializes project records and JSON/CSV buffers in memory; archive budgets prevent self-incompatible output but do not yet make export fully streaming or memory-bounded.


**Conclusion:** The concrete audit defects listed above are fixed in source and covered by available regression checks. The release remains a development build until strict compilation, installed dependency/runtime verification and real encrypted backup round-trips pass.
