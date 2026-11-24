# Security model and limitations

## Electron

The main window enables context isolation, disables Node integration, enables the sandbox and uses a narrow preload bridge. External window creation is denied; HTTPS navigation is handed to the system browser. IPC checks that calls originate from the top-level trusted renderer and validates inputs with Zod.

The application must continue to treat renderer data as untrusted. Do not add generic filesystem, shell or IPC methods to preload. Keep CSP restrictive and review Electron security guidance when upgrading Electron.

## File handling

User-selected files are opened through native file dialogs. Original names are sanitized for display, import size and extension are constrained, and stored-object paths are derived from hashes. Path containment uses resolved relative paths. Backup and project-archive import reject unsafe paths, duplicate entries, symbolic links, excessive entry counts, excessive compressed/expanded sizes and manifest sizes. Streamed extraction is checked against both declared per-entry lengths and aggregate expanded-size limits. Checksums are validated before database insertion.

## Vault-protected data

A random 32-byte vault key encrypts each protected note using AES-256-GCM with a unique nonce and note-specific additional authenticated data. Argon2id derives independent wrapping keys for the master passphrase and offline recovery key. The database stores wrapped key metadata plus ciphertext; the normal note title/content fields are replaced with non-sensitive placeholders and the note FTS entry is removed.

The vault master key is held in the main process for the current app session. It is cleared on explicit lock and process exit, but JavaScript/Node buffers do not offer a guarantee of secure memory erasure. The recovery key is shown only once in the setup flow. Protect it offline. The application has an inactivity auto-lock setting (15 minutes by default) and also locks the vault when the OS locks the session.

Protected attachments are stored as per-document AES-256-GCM ciphertext. Each file uses an independent random 256-bit data-encryption key wrapped with the vault master key; wrap/data AAD binds the key to the document identity and plaintext SHA-256. Imports are streamed to an atomic object file. Opening decrypts to a short-lived private temporary file, checks plaintext length and digest, and removes temporary material on vault lock/shutdown or timeout. Protected documents are excluded from extraction and search indexing.

**Known omissions:** Optional Electron `safeStorage` device unlock is implemented in source and protects only the random vault key; its behavior has not been verified against real OS credential stores in packaged desktop builds. JavaScript/Node buffers cannot guarantee secure erasure. Independent cryptographic review, adversarial testing and packaged runtime testing remain required before production use.

## Backups

Manual backup archives generate a random 256-bit data-encryption key and independently wrap it under Argon2id-derived keys for the user passphrase and a portable recovery key. Either credential unwraps the same archive key. The versioned reader retains v1 passphrase-restore compatibility; v1 backups have no independent recovery key. Automatic local backup credentials are stored encrypted with Electron `safeStorage` where an appropriate OS backend is available. Automatic backup is disabled on Linux when Electron selects `basic_text` or an unknown backend. Automatic snapshots are verified by restoring them to a separate copy before local retention removes older files.

When configured, automatic encrypted snapshots are mirrored to a validated external folder using an atomic copy and SHA-256 verification. The app checks whether the destination is on the same filesystem volume and only applies external retention to its own timestamped auto-snapshot naming pattern. External destination and temporary-directory behavior have integration tests, but actual removable-drive disconnect, remount and permission failure tests remain outstanding. A full offline historical backup manager, cross-device recovery validation, and failure-injected packaged-app tests are still required. Protected attachment encryption and independent backup-DEK wrapping are now implemented in source but have not yet completed packaged runtime testing. Backup implementation has not been executed end-to-end in Electron in this environment. Backup creation and restoration now share entry, compressed-size, expanded-size and manifest budgets; restore rejects symlinks and enforces actual streamed expansion limits. A real encrypted archive round-trip remains an outstanding release gate.

## Privacy

Core project data is stored locally. The optional Ollama adapter targets a user-configured local service; it is not a cloud AI dependency. The app does not intentionally upload project content to remote services. Do not add telemetry or external transmission without explicit user-facing disclosure and consent.
