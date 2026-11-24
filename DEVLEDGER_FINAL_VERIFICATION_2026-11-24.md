# DevLedger final rebrand verification

**Date:** 24 November 2026  
**Source:** DevLedger desktop source checkpoint, 24 November 2026  
**Verification environment:** Node.js v22.16.0, npm 10.9.2

## Result

The DevLedger rename is consistent across the app's active product identity, Electron metadata, renderer document title, preload API and user-facing logs. The source tree contains no `window.northstar` or `NorthstarApi` references, and no source filenames retaining the old product name.

The old `northstar` strings found in active source are intentional compatibility identifiers, not exposed product branding. They include:

- `northstar.sqlite`, retained so existing profiles, restore copies and backup layouts remain readable.
- Existing AES-GCM AAD labels and key-wrapping identifiers, whose values must remain byte-for-byte stable to decrypt existing data.
- The `NSBACKUP` magic value, `.nsbackup` extension and historical archive markers/link schemes, which remain accepted by import and restore code.
- The two legacy data-directory names used by the first-launch migration.
- Regression fixtures that prove old files and links remain readable.

## Checks run

`npm run check:all` completed successfully after the migration test hardening.

| Check | Result |
|---|---:|
| TypeScript/TSX syntax audit | 256 files, 0 diagnostics |
| Local and alias import audit | 256 files passed |
| Node strip-only compatibility audit | 198 files passed |
| Source-size audit | 198 files, all at most 250 lines |
| shadcn source inventory | 49/49 present |
| Unit tests | 125 passed, 0 failed |
| Integration tests | 60 passed, 0 failed |
| Performance tests | 3 passed, 0 failed |
| Tailwind token generation | Passed |

Two additional migration tests were added:

1. Startup refuses to choose between the two historical profile directories if both contain a database, preserving both files.
2. Startup refuses to follow a symlinked legacy database, preserving the external target.

## Runtime/build limitation

A strict TypeScript check and Electron build could not be completed because the source checkpoint does not contain `node_modules` or a package lockfile. `npm run typecheck` reports missing Electron and Node type definitions; `npm run build` stops at worker compilation for the same missing Node type definitions. `npm run lint` and `npm run format:check` cannot start because ESLint and Prettier are not installed. No claim is made that a packaged desktop build or installed-app migration was exercised.

Before release, install dependencies from the configured registry, create and commit the generated lockfile, then run typecheck, lint, formatting, build and an installed-app migration test against a copy of a real Northstar profile. Keep the original profile and backups untouched until that migration test is verified.
