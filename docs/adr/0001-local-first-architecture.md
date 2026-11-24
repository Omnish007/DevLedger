# ADR 0001: Local-first desktop architecture

- **Status:** Accepted for the initial implementation.
- **Decision:** Use Electron with a React/Vite renderer, a narrow preload/IPC boundary, SQLite as the local source of truth and content-addressed file storage for originals.
- **Rationale:** This supports offline single-user workflows, native shortcuts/dialogs/notifications, local persistence and a renderer that does not need filesystem or database privileges.
- **Consequences:** Native module compatibility and packaging must be tested per platform. Backups must snapshot SQLite consistently with WAL. Long-running extraction/indexing must move to background workers before large datasets are supported.
