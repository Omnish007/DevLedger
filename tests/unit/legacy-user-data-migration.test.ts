import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LEGACY_USER_DATA_DIRECTORY_NAMES, WORKSPACE_DATABASE_FILENAME, migrateLegacyUserDataDirectory } from '../../src/main/legacy-user-data-migration.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'devledger-rename-'));
  return { root, appData: join(root, 'app-data'), current: join(root, 'app-data', 'DevLedger'), legacy: join(root, 'app-data', LEGACY_USER_DATA_DIRECTORY_NAMES[0]!) };
}

test('legacy user data directory is atomically moved into DevLedger on first launch', async () => {
  const paths = await fixture();
  try {
    await mkdir(paths.legacy, { recursive: true });
    await mkdir(join(paths.legacy, 'objects'));
    await writeFile(join(paths.legacy, WORKSPACE_DATABASE_FILENAME), 'existing-database');
    await writeFile(join(paths.legacy, 'objects', 'document.bin'), 'document-bytes');
    assert.equal(await migrateLegacyUserDataDirectory(paths.appData, paths.current), 'migrated');
    assert.equal(await readFile(join(paths.current, WORKSPACE_DATABASE_FILENAME), 'utf8'), 'existing-database');
    assert.equal(await readFile(join(paths.current, 'objects', 'document.bin'), 'utf8'), 'document-bytes');
    await assert.rejects(readdir(paths.legacy), { code: 'ENOENT' });
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test('missing legacy workspace is a no-op', async () => {
  const paths = await fixture();
  try {
    await mkdir(paths.appData, { recursive: true });
    assert.equal(await migrateLegacyUserDataDirectory(paths.appData, paths.current), 'no-legacy-workspace');
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test('migration does not overwrite a DevLedger database when both workspaces exist', async () => {
  const paths = await fixture();
  try {
    await mkdir(paths.legacy, { recursive: true });
    await mkdir(paths.current, { recursive: true });
    await writeFile(join(paths.legacy, WORKSPACE_DATABASE_FILENAME), 'legacy-database');
    await writeFile(join(paths.current, WORKSPACE_DATABASE_FILENAME), 'new-database');
    await assert.rejects(migrateLegacyUserDataDirectory(paths.appData, paths.current), /Both legacy and DevLedger workspace databases exist/);
    assert.equal(await readFile(join(paths.legacy, WORKSPACE_DATABASE_FILENAME), 'utf8'), 'legacy-database');
    assert.equal(await readFile(join(paths.current, WORKSPACE_DATABASE_FILENAME), 'utf8'), 'new-database');
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test('migration refuses to merge a non-empty destination without a database', async () => {
  const paths = await fixture();
  try {
    await mkdir(paths.legacy, { recursive: true });
    await mkdir(paths.current, { recursive: true });
    await writeFile(join(paths.legacy, WORKSPACE_DATABASE_FILENAME), 'legacy-database');
    await writeFile(join(paths.current, 'settings.json'), '{}');
    await assert.rejects(migrateLegacyUserDataDirectory(paths.appData, paths.current), /already contains files/);
    assert.equal(await readFile(join(paths.legacy, WORKSPACE_DATABASE_FILENAME), 'utf8'), 'legacy-database');
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test('empty destination directory is replaced by the legacy workspace directory', async () => {
  const paths = await fixture();
  try {
    await mkdir(paths.legacy, { recursive: true });
    await mkdir(paths.current, { recursive: true });
    await writeFile(join(paths.legacy, WORKSPACE_DATABASE_FILENAME), 'legacy-database');
    assert.equal(await migrateLegacyUserDataDirectory(paths.appData, paths.current), 'migrated');
    assert.equal(await readFile(join(paths.current, WORKSPACE_DATABASE_FILENAME), 'utf8'), 'legacy-database');
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test('development profile from the previous package name is also migrated', async () => {
  const paths = await fixture();
  const legacyDevelopment = join(paths.appData, LEGACY_USER_DATA_DIRECTORY_NAMES[1]);
  try {
    await mkdir(legacyDevelopment, { recursive: true });
    await writeFile(join(legacyDevelopment, WORKSPACE_DATABASE_FILENAME), 'dev-database');
    assert.equal(await migrateLegacyUserDataDirectory(paths.appData, paths.current), 'migrated');
    assert.equal(await readFile(join(paths.current, WORKSPACE_DATABASE_FILENAME), 'utf8'), 'dev-database');
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test('migration refuses to choose when both historical profile directories contain databases', async () => {
  const paths = await fixture();
  const secondLegacy = join(paths.appData, LEGACY_USER_DATA_DIRECTORY_NAMES[1]);
  try {
    await mkdir(paths.legacy, { recursive: true });
    await mkdir(secondLegacy, { recursive: true });
    await writeFile(join(paths.legacy, WORKSPACE_DATABASE_FILENAME), 'packaged-database');
    await writeFile(join(secondLegacy, WORKSPACE_DATABASE_FILENAME), 'development-database');
    await assert.rejects(migrateLegacyUserDataDirectory(paths.appData, paths.current), /More than one legacy workspace database/);
    assert.equal(await readFile(join(paths.legacy, WORKSPACE_DATABASE_FILENAME), 'utf8'), 'packaged-database');
    assert.equal(await readFile(join(secondLegacy, WORKSPACE_DATABASE_FILENAME), 'utf8'), 'development-database');
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});

test('migration refuses a legacy database symlink without following it', { skip: process.platform === 'win32' }, async () => {
  const paths = await fixture();
  const externalDatabase = join(paths.root, 'external.sqlite');
  try {
    await mkdir(paths.legacy, { recursive: true });
    await writeFile(externalDatabase, 'do-not-move');
    await symlink(externalDatabase, join(paths.legacy, WORKSPACE_DATABASE_FILENAME));
    await assert.rejects(migrateLegacyUserDataDirectory(paths.appData, paths.current), /not a regular file/);
    assert.equal(await readFile(externalDatabase, 'utf8'), 'do-not-move');
    await assert.rejects(readdir(paths.current), { code: 'ENOENT' });
  } finally { await rm(paths.root, { recursive: true, force: true }); }
});
