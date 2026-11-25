import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import type Database from 'better-sqlite3';
import type { MaintenanceJobContext } from './maintenance-shared.ts';
import { SEARCH_INDEX_REBUILDS, SEARCH_REBUILD_BATCH_SIZE, type SearchIndexRebuildSpec, type SearchIndexRow } from './maintenance-search-specs.ts';

function withImmediateTransaction(db: Database.Database, work: () => void): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    work();
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* Preserve the original operation error. */ }
    throw error;
  }
}

function rebuildTriggerNames(spec: SearchIndexRebuildSpec): [string, string, string] {
  const prefix = `${spec.sourceTable}_search_rebuild`;
  return [`${prefix}_insert`, `${prefix}_update`, `${prefix}_delete`];
}

function installSearchRebuildTriggers(db: Database.Database, spec: SearchIndexRebuildSpec, installed: string[]): void {
  const [insertTrigger, updateTrigger, deleteTrigger] = rebuildTriggerNames(spec);
  const table = spec.sourceTable;
  const deleteOld = `DELETE FROM ${spec.name}_rebuild WHERE ${spec.idField} = old.id;`;
  const deleteNew = `DELETE FROM ${spec.name}_rebuild WHERE ${spec.idField} = new.id;`;
  db.exec(`CREATE TEMP TRIGGER ${insertTrigger} AFTER INSERT ON main.${table} BEGIN
    ${deleteNew}
    ${spec.insertNewSql}
  END;`);
  installed.push(insertTrigger);
  db.exec(`CREATE TEMP TRIGGER ${updateTrigger} AFTER UPDATE ON main.${table} BEGIN
    ${deleteOld}
    ${deleteNew}
    ${spec.insertNewSql}
  END;`);
  installed.push(updateTrigger);
  db.exec(`CREATE TEMP TRIGGER ${deleteTrigger} AFTER DELETE ON main.${table} BEGIN
    ${deleteOld}
  END;`);
  installed.push(deleteTrigger);
}

function dropSearchRebuildTriggers(db: Database.Database, triggerNames: string[]): void {
  for (const name of triggerNames) db.exec(`DROP TRIGGER IF EXISTS temp.${name};`);
}

async function rebuildSearchIndex(db: Database.Database, spec: SearchIndexRebuildSpec, context: MaintenanceJobContext, indexNumber: number, indexCount: number): Promise<void> {
  const stage = `${spec.name}_rebuild`;
  const previous = `${spec.name}_previous`;
  const triggerNames: string[] = [];
  let swapped = false;
  try {
    // An interrupted prior process may have left only its staging table behind.
    // The live index is never renamed until the replacement is complete.
    db.exec(`DROP TABLE IF EXISTS main.${stage};`);
    db.exec(spec.createSql);
    if (spec.initializeSql) db.exec(spec.initializeSql);
    installSearchRebuildTriggers(db, spec, triggerNames);

    const selectPage = db.prepare(spec.selectSql);
    const deleteById = db.prepare(`DELETE FROM ${stage} WHERE ${spec.idField} = ?`);
    const insert = db.prepare(`INSERT INTO ${stage}(${spec.columns.join(', ')}) VALUES (${spec.columns.map(() => '?').join(', ')})`);
    let lastId = '';
    let scanned = 0;

    while (true) {
      context.signal.throwIfAborted();
      const rows = selectPage.all(lastId, SEARCH_REBUILD_BATCH_SIZE) as SearchIndexRow[];
      if (rows.length === 0) break;

      // Replacing each page by primary key also reconciles rows that a live-write
      // trigger may already have mirrored into the staging FTS table.
      withImmediateTransaction(db, () => {
        for (const row of rows) {
          deleteById.run(row.id);
          insert.run(...spec.selectValues(row));
        }
      });

      lastId = rows[rows.length - 1]?.id ?? lastId;
      scanned += rows.length;
      // Stage-level progress avoids an up-front full-table COUNT scan; scanned is
      // an exact live count and the percentage advances when an index is swapped.
      const percent = Math.min(99, Math.round(((indexNumber - 1) / indexCount) * 100));
      context.progress({
        phase: 'rebuilding-search', current: spec.name, completed: indexNumber - 1,
        total: indexCount, scanned, percent,
      });
      // Let IPC, cancellation polling, timers and window rendering proceed between
      // bounded SQLite write batches instead of monopolizing the Electron main loop.
      await yieldToEventLoop();
    }

    context.signal.throwIfAborted();
    withImmediateTransaction(db, () => {
      dropSearchRebuildTriggers(db, triggerNames);
      // SQLite rewrites source-trigger SQL when an FTS table is renamed. Drop the
      // existing hooks inside this transaction, swap tables, then recreate them
      // against the stable public FTS table name. No app write can interleave.
      for (const triggerSql of spec.sourceTriggers) {
        const triggerName = triggerSql.match(/^CREATE TRIGGER ([^ ]+)/)?.[1];
        if (triggerName) db.exec(`DROP TRIGGER IF EXISTS main.${triggerName};`);
      }
      db.exec(`ALTER TABLE main.${spec.name} RENAME TO ${previous};`);
      db.exec(`ALTER TABLE main.${stage} RENAME TO ${spec.name};`);
      db.exec(`DROP TABLE main.${previous};`);
      for (const triggerSql of spec.sourceTriggers) db.exec(triggerSql);
    });
    swapped = true;
    context.progress({
      phase: 'rebuilding-search', current: spec.name, completed: indexNumber,
      total: indexCount, scanned,
      percent: Math.round((indexNumber / indexCount) * 100),
    });
  } finally {
    // On failure/cancellation the old live index remains untouched. A staging
    // table is disposable and is cleaned on this run or before the next rebuild.
    dropSearchRebuildTriggers(db, triggerNames);
    if (!swapped) db.exec(`DROP TABLE IF EXISTS main.${stage};`);
  }
}

export async function rebuildLocalSearchIndexes(db: Database.Database, context: MaintenanceJobContext): Promise<{ indexesRebuilt: number }> {
  let completed = 0;
  for (const spec of SEARCH_INDEX_REBUILDS) {
    context.signal.throwIfAborted();
    await rebuildSearchIndex(db, spec, context, completed + 1, SEARCH_INDEX_REBUILDS.length);
    completed += 1;
    await yieldToEventLoop();
  }
  return { indexesRebuilt: completed };
}
