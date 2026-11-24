# Architecture overview

## Process boundaries

- **Electron main:** owns the SQLite connection, app-data paths, filesystem operations, native dialogs, OS shortcut and backend services.
- **Preload:** exposes the `window.devLedger` typed API. It does not expose raw `ipcRenderer`, Node APIs or arbitrary channels.
- **Renderer:** React pages and shared components call only the preload API. It never opens SQLite or arbitrary filesystem paths.
- **Domain:** deterministic parsing, validation, export safety and task graph rules have no Electron or React dependencies.

The dependency direction is renderer → preload contract → IPC handler → application service → SQLite/filesystem adapter. This is a lightweight implementation boundary rather than a complete ports-and-adapters framework yet.

## Main modules

- `src/main/database/`: SQLite connection, integrity checks and versioned migrations.
- `src/main/ipc/`: sender validation, Zod schemas and channel registrations.
- `src/main/services/workspace.ts`: project/contact/note/task queries, writes, timer, dashboard and FTS5 search.
- `src/main/services/operations.ts` and `background-jobs.ts`: tags, links, blockers, dependencies, reminders, time entries, activity, and the durable lease/progress/cancellation job queue.
- `src/main/services/storage.ts`: document import, content-addressed object storage, per-document envelope encryption and protected open/decrypt handling.
- `src/main/services/document-extractor.ts` and `src/main/workers/`: local document extraction and OCR worker path.
- `src/main/services/vault.ts`: protected-note key wrapping and encryption.
- `src/main/services/backup.ts`: versioned encrypted database/object backup with a random DEK, independent passphrase/recovery-key wrapping, and non-destructive restore-as-copy.
- `src/main/services/automatic-backup.ts`: OS-protected automatic local backup credential, snapshots, restore verification, retention and optional external mirroring.
- `src/main/services/external-backup.ts`: validates independent destination directories, atomically mirrors encrypted snapshots and verifies their SHA-256 digest.
- `src/main/services/project-export.ts` and `project-import.ts`: portable project ZIP export/import with validation and ID remapping.
- `src/main/services/ollama.ts`: optional local embeddings, hybrid search and AI summaries.
- `src/renderer/features/`: dashboard and feature screens.
- `src/domain/`: smart date parser, task graph rules, backup retention and export validation helpers.

## Persistence model

SQLite is the source of truth. Schema version is stored in `PRAGMA user_version`. Migrations are applied sequentially in immediate transactions. Foreign keys are enabled, WAL mode is used, and synchronous durability is configured in the connection adapter. FTS5 tables are derived indexes maintained by triggers; a locked note is removed from normal note FTS when its plaintext fields are cleared.

Unprotected imported originals are stored under `objects/<hash-prefix>/<sha256>`. Protected attachments use per-document ciphertext paths under `objects/protected/` and wrapped per-file keys; the database stores only object paths and authenticated encryption metadata. Original content is not embedded as a blob in the document table. Project archive import remaps record IDs to create an independent project copy; locked notes and relationships to records outside the archive are skipped. Task date-only deadlines are stored separately in `due_date`; deadlines with a clock time are stored as UTC `due_at` instants.

## IPC rules

Every invoke handler validates the sender frame and parses its payload using Zod before invoking a service. Channels are individually registered; the renderer cannot select arbitrary method names or SQL statements. Native file dialogs return paths to main-process code; paths are not supplied by the renderer.

## Known architectural gaps

The current implementation remains a single-user desktop application with a document worker and a durable local job queue, not a distributed multi-machine job service. The queue now orchestrates document extraction, semantic indexing, AI summaries, project import/export, search rebuilds, storage audits and SQLite maintenance. Heavy PDF/OCR and archive tasks still need profiling under real project sizes. Semantic retrieval uses a SQLite LSH candidate prefilter and exact cosine scoring on a bounded candidate set; large-corpus recall and end-to-end latency still need tuning on real workspaces. No live Ollama or packaged Electron performance measurements have been completed. The Settings flow stages backup restores, validates the database and object hashes, promotes the database and object store together, and retains an explicit rollback point. A full offline historical backup manager is still outstanding.
