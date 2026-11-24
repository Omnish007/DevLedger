# Backup format and recovery workflow

## Current implementation

DevLedger has two backup paths in source: manual encrypted backups and automatic local encrypted snapshots. Both use `better-sqlite3`'s SQLite Online Backup API to create a consistent database snapshot, and include the content-addressed `objects/` directory plus a JSON manifest containing each path, byte length and SHA-256 digest.

New `.nsbackup` files use a versioned `NSBKP002` envelope containing a bounded JSON header, a random backup identifier, an AES-GCM data nonce, and two independently salted/wrapped copies of a random 256-bit archive data key (passphrase and portable recovery key), followed by the authenticated encrypted ZIP stream and GCM tag. Manual backups use a user-supplied passphrase of at least 12 characters; either that passphrase or the separately generated recovery key can unwrap the data key. The reader also retains compatibility with the older `NSBACKUP` v1 passphrase format. The encrypted output is written to a `.partial` file, flushed, then renamed.

Automatic local snapshots are attempted at application startup when due and then every 30 minutes. The manager creates a random local backup credential and protects it with Electron `safeStorage`; the credential file is stored with restrictive permissions. On Linux, automatic snapshots are disabled when the selected backend is `basic_text` or unknown. After creating a snapshot, the manager performs a real restore-as-copy verification and removes the temporary verification copy. Retention keeps up to 48 recent half-hour snapshots, 7 daily, 4 weekly and 6 monthly restore points. Older snapshots are not deleted when a new backup or verification fails.

## Restore as copy

Restore decrypts/authenticates the archive, checks archive path and size bounds, validates manifest hashes, opens the recovered SQLite database read-only, runs `quick_check`, `integrity_check` and `foreign_key_check`, and verifies referenced document objects. It extracts into a new `restore-copies/restore-*` folder. The result contains `northstar.sqlite`, `objects/` and `manifest.json` at the copy root, matching the live data-directory layout. Restore-as-copy never overwrites the active workspace; activation is a separate explicit operation with a retained rollback snapshot.

The Settings flow can stage a restore copy for activation. Before activation, DevLedger validates the database and re-hashes every referenced document object. The application then closes the active database/worker, preserves the previous database and object store, and atomically promotes the restored copy. On next launch it validates the promoted workspace; the prior workspace remains available until the user explicitly keeps the restore or requests rollback. Interrupted promotion is recovered by rollback on startup.

## Remaining backup work

- Pre-migration snapshots and explicit migration rollback workflow.
- Removable-drive destination management and automatic external backup scheduling.
- Offline historical backup management and clear health/status UI for independent copies.
- Cross-device recovery drill on a clean computer/profile (source format supports the portable recovery key; packaged cross-machine testing remains outstanding).
- Release-grade injected-failure tests for archive stream interruption, disk-full, key backend failure and interrupted restore.

The local automatic snapshots are not a replacement for independent backups. Follow the 3-2-1 principle manually: keep three copies on two media types, with one copy offline or off-site. Do not treat a snapshot on the same physical disk as disaster recovery.

## External destination mirror

The Settings page can select an existing external destination folder. The main process canonicalizes and validates the directory, rejects a symlink at the selected path, rejects a destination inside the app-data root, and performs a write probe. It compares filesystem device IDs and records whether the selected destination is on the same volume as app data; a second directory on the same volume is not independent disaster recovery.

After a new automatic snapshot has passed its local restore-as-copy verification, the app can mirror that already-encrypted archive to the configured destination. The copy is written as a `.partial` file, flushed, hashed with SHA-256, compared with the source and renamed atomically. External retention enumerates only DevLedger's timestamped automatic-snapshot filename pattern. It must not prune manually named `.nsbackup` files or archives created by another application.

This functionality has temporary-directory integration tests for directory validation, atomic mirroring, digest verification and retention-scope protection. It has not been tested against an actual removable drive, network mount, disconnect or operating-system permission change. It does not replace periodic offline historical backup management.

## DevLedger rebrand compatibility

New encrypted backup manifests use the `devledger-workspace-backup` format marker; the restore path continues to accept the historical `northstar-workspace-backup` marker. The versioned encryption AAD strings, database filename (`northstar.sqlite`) and existing object layout remain stable intentionally: changing any of those identifiers without a format-aware cryptographic/data migration would make existing workspaces or protected content unreadable.
