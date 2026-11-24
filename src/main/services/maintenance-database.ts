import type Database from 'better-sqlite3';
import type { MaintenanceJobContext } from './maintenance-shared.ts';

export function optimizeLocalDatabase(db: Database.Database, context: MaintenanceJobContext): { optimized: true } {
  context.signal.throwIfAborted();
  db.exec('PRAGMA optimize;');
  context.signal.throwIfAborted();
  // PRAGMA optimize uses SQLite's bounded planner-statistics maintenance; a
  // blanket ANALYZE would scan every table synchronously on the Electron thread.
  context.progress({ phase: 'sqlite-optimized' });
  return { optimized: true };
}
