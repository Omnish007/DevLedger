import { DatabaseSync } from 'node:sqlite';

type TransactionRunner = (() => unknown) & {
    immediate: () => unknown;
    deferred: () => unknown;
    exclusive: () => unknown;
};

/** Adds the transaction wrapper shape used by better-sqlite3 services to Node's test SQLite driver. */
export function addTransactionAdapter<T extends DatabaseSync>(db: T): T {
    const transaction = (callback: () => unknown): TransactionRunner => {
        const run = (() => {
            db.exec('BEGIN IMMEDIATE');
            try {
                const result = callback();
                db.exec('COMMIT');
                return result;
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
        }) as TransactionRunner;
        run.immediate = run;
        run.deferred = run;
        run.exclusive = run;
        return run;
    };
    Object.defineProperty(db, 'transaction', { configurable: true, value: transaction });
    return db;
}
