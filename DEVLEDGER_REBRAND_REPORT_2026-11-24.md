# DevLedger rebrand and source rename

**Date:** 24 November 2026  
**Source baseline:** Northstar final source checkpoint, 24 November 2026  
**New product identity:** DevLedger

## Summary

The application source has been rebranded from Northstar Workspace to DevLedger across its visible product identity, package/build metadata, Electron app identity, renderer/preload API, logs, notifications, dialogs, and documentation. The rename is designed to preserve existing user data and old exported content rather than blindly replacing identifiers that participate in storage or cryptographic formats.

## Product and application identity changes

- npm package name: `devledger-desktop`.
- Electron Builder app ID: `com.devledger.desktop`.
- Packaged product name and author: `DevLedger`.
- Renderer document title, sidebar identity, footer and command-palette title: `DevLedger`.
- Main-window and quick-capture titles, OS notifications, logs, dialogs and user-facing error messages: `DevLedger`.
- Preload API type renamed from `NorthstarApi` to `DevLedgerApi`.
- Context bridge global renamed from `window.northstar` to `window.devLedger` and renderer type declarations updated.
- E2E-only profile environment variables renamed to `DEVLEDGER_E2E` and `DEVLEDGER_TEST_USER_DATA`.
- New project exports, encrypted backup manifests, contact mention links and smart-date links emit DevLedger identifiers.

## Existing data and format compatibility

The source intentionally retains selected historical identifiers. They are not visible brand leftovers:

- The SQLite file remains `northstar.sqlite`; changing the filename would break existing profile layouts and restore/rollback paths.
- AES-GCM additional authenticated data (AAD) labels for backups, vault keys, protected notes/documents, attachments and backup-key wrapping remain unchanged. Altering an AAD value makes existing ciphertext fail authentication and can make user data unreadable.
- Existing backup/project archive markers and Markdown URI schemes remain accepted by import/restore parsers. New files use DevLedger markers/schemes.
- The old data-folder names are retained only as migration source paths.
- The `.nsbackup` extension and `NSBACKUP` magic identifiers remain stable because they identify an established backup file format, not the displayed product name.

## First-launch user-data migration

`src/main/legacy-user-data-migration.ts` implements a one-time, non-destructive migration from these old profile directories under Electron's `appData` path:

- `Northstar Workspace` (previous packaged profile)
- `northstar-developer-workspace` (previous development/package profile)

When exactly one legacy directory contains a regular `northstar.sqlite`, the app renames that directory into Electron's current DevLedger `userData` location before opening the database. The move is on the same parent/volume and keeps the database, object store, backup snapshots and restore copies together.

The migration refuses to select between multiple legacy profiles, overwrite an existing new profile database, follow an unsafe symlink, or merge a non-empty target folder without a database. In these conflict cases startup stops and leaves both locations untouched so the user can back them up and reconcile them explicitly. The Playwright-only custom data directory is excluded from migration.

## Validation

`npm run check:all` passed after the rename:

| Check | Result |
|---|---:|
| TypeScript/TSX syntax audit | 256 files, 0 parse diagnostics |
| Local/alias import audit | 256 files passed |
| Node strip-only compatibility audit | 198 files passed |
| Source-size audit | 198 first-party TypeScript/TSX files, all <= 250 lines |
| shadcn source inventory | 49/49 present |
| Unit tests | 125 passed |
| Integration tests | 60 passed |
| Performance tests | 3 passed |
| Tailwind token generation | Passed |

The full source-level suite was rerun on 24 November 2026. Two additional migration regression tests now cover ambiguous dual legacy profiles and symlinked database rejection. Renderer/preload references were searched: no `window.northstar` or `NorthstarApi` references remain. Remaining `northstar` strings are limited to documented legacy data/crypto/archive compatibility, the SQLite filename, migration paths and tests that verify legacy readability.

## Remaining verification limitation

Strict TypeScript compilation and an actual Electron package/runtime launch were not completed in this environment. The source archive has no `node_modules` folder or package lockfile, so `npm run typecheck` and `npm run build` stop because Electron/Node type definitions are unavailable; lint and Prettier checks are also unavailable because their CLI packages are not installed. This report does not claim a production build or installed-app migration has been exercised. After dependency access is restored, perform a clean `npm install`, create/commit the real lockfile, run `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and test an installed DevLedger build against a copied Northstar profile before using it with irreplaceable data.
