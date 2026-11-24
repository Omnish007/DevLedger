import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeWorkspaceDatabaseCore, resolveWorkspaceDatabasePath } from '../../src/main/workspace-database-startup-core.ts';

type FakeDatabase = { id: string; closed: boolean };
function harness(options: {
  restoreState?: 'none' | 'rolled-back' | 'awaiting-validation';
  integrity?: Array<{ quickCheck: string; foreignKeyViolations: number }>;
  fullIntegrity?: string[];
  validationError?: Error;
  rollbackError?: Error;
} = {}) {
  const opened: FakeDatabase[] = [];
  const warnings: Array<[string, string | undefined]> = [];
  const infos: string[] = [];
  let rollbackCount = 0;
  const dependencies = {
    openDatabase: (path: string) => {
      const database = { id: `${path}#${opened.length + 1}`, closed: false };
      opened.push(database);
      return database;
    },
    closeDatabase: (database: FakeDatabase) => { database.closed = true; },
    checkDatabaseIntegrity: (_database: FakeDatabase) => options.integrity?.shift() ?? { quickCheck: 'ok', foreignKeyViolations: 0 },
    fullIntegrityCheck: (_database: FakeDatabase) => options.fullIntegrity?.shift() ?? 'ok',
    validateWorkspaceObjects: async (_database: FakeDatabase, _directory: string) => { if (options.validationError) throw options.validationError; },
    recoverInterruptedRestore: async (_directory: string) => options.restoreState ?? 'none',
    rollbackPromotedRestore: async (_directory: string) => { rollbackCount += 1; if (options.rollbackError) throw options.rollbackError; },
    logWarning: (message: string, detail?: string) => warnings.push([message, detail]),
    logInfo: (message: string) => infos.push(message),
  };
  return { dependencies, opened, warnings, infos, get rollbackCount() { return rollbackCount; } };
}

test('normal startup opens a healthy database and rejects/closes an unhealthy one', async () => {
  const healthy = harness();
  const database = await initializeWorkspaceDatabaseCore('/data', '/data/northstar.sqlite', healthy.dependencies);
  assert.equal(database.closed, false);
  assert.equal(healthy.opened.length, 1);

  const unhealthy = harness({ integrity: [{ quickCheck: 'corrupt', foreignKeyViolations: 2 }] });
  await assert.rejects(initializeWorkspaceDatabaseCore('/data', '/data/northstar.sqlite', unhealthy.dependencies), /Database integrity check failed/);
  assert.equal(unhealthy.opened[0]?.closed, true);
});

test('validated staged restore is retained only after object and full database checks pass', async () => {
  const state = harness({ restoreState: 'awaiting-validation' });
  const database = await initializeWorkspaceDatabaseCore('/data', '/data/northstar.sqlite', state.dependencies);
  assert.equal(database.closed, false);
  assert.equal(state.rollbackCount, 0);
  assert.ok(state.infos.some((message) => message.includes('passed startup validation')));
});

test('invalid promoted restore is closed and rolled back before opening the previous workspace', async () => {
  const state = harness({ restoreState: 'awaiting-validation', validationError: new Error('object hash mismatch') });
  const database = await initializeWorkspaceDatabaseCore('/data', '/data/northstar.sqlite', state.dependencies);
  assert.equal(state.opened.length, 2);
  assert.equal(state.opened[0]?.closed, true);
  assert.equal(database, state.opened[1]);
  assert.equal(database.closed, false);
  assert.equal(state.rollbackCount, 1);
  assert.ok(state.warnings.some(([message, detail]) => message.includes('failed startup validation') && detail === 'object hash mismatch'));
});

test('rollback database is also checked and closed when integrity fails', async () => {
  const state = harness({
    restoreState: 'awaiting-validation',
    validationError: new Error('bad staged object'),
    integrity: [{ quickCheck: 'corrupt', foreignKeyViolations: 1 }],
  });
  await assert.rejects(initializeWorkspaceDatabaseCore('/data', '/data/northstar.sqlite', state.dependencies), /rollback completed.*failed its integrity check/i);
  assert.equal(state.opened[0]?.closed, true);
  assert.equal(state.opened[1]?.closed, true);
  assert.equal(state.rollbackCount, 1);
});

test('rollback operation failure propagates rather than opening a potentially mixed workspace', async () => {
  const state = harness({ restoreState: 'awaiting-validation', validationError: new Error('restore invalid'), rollbackError: new Error('rollback failed') });
  await assert.rejects(initializeWorkspaceDatabaseCore('/data', '/data/northstar.sqlite', state.dependencies), /rollback failed/);
  assert.equal(state.opened[0]?.closed, true);
  assert.equal(state.opened.length, 1);
  assert.equal(state.rollbackCount, 1);
});

test('startup recovery reports a prior rollback and proceeds to integrity validation', async () => {
  const state = harness({ restoreState: 'rolled-back' });
  await initializeWorkspaceDatabaseCore('/data', '/data/northstar.sqlite', state.dependencies);
  assert.ok(state.warnings.some(([message]) => message.includes('interrupted restore promotion was rolled back')));
});

test('database initialization and background workers resolve the same workspace database path', () => {
  assert.equal(resolveWorkspaceDatabasePath('/user-data/northstar'), '/user-data/northstar/northstar.sqlite');
});
