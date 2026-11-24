import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { WorkspaceOperationsService } from '../../src/main/services/operations.ts';

const TASK_COUNT = 10_000;

function percentile(samples: number[], value: number): number {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * value))] ?? 0;
}

test('dependency-cycle validation follows the indexed SQLite chain in a 10k-edge graph', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('dependency-benchmark-project', 'Dependency benchmark', 'ongoing', now, now);
    const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    const insertEdge = db.prepare('INSERT INTO task_dependencies (task_id, depends_on_task_id, created_at) VALUES (?, ?, ?)');
    db.exec('BEGIN IMMEDIATE');
    try {
      for (let index = 0; index < TASK_COUNT; index += 1) {
        const id = `dependency-task-${String(index).padStart(5, '0')}`;
        insertTask.run(id, 'dependency-benchmark-project', id, now, now);
        if (index > 0) insertEdge.run(id, `dependency-task-${String(index - 1).padStart(5, '0')}`, now);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const queryPlan = db.prepare(`EXPLAIN QUERY PLAN WITH RECURSIVE dependency_path(task_id) AS (
      SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?
      UNION
      SELECT edge.depends_on_task_id FROM task_dependencies edge
      INNER JOIN dependency_path path ON edge.task_id = path.task_id
    ) SELECT 1 AS creates_cycle FROM dependency_path WHERE task_id = ? LIMIT 1`)
      .all('dependency-task-09999', 'dependency-task-00000') as Array<{ detail: string }>;
    assert.ok(queryPlan.some((row) => row.detail.includes('USING COVERING INDEX') && row.detail.includes('task_id=?')),
      'the recursive dependency traversal should use the task/dependency covering primary-key index');

    const operations = new WorkspaceOperationsService(db as never);
    const samples: number[] = [];
    for (let iteration = 0; iteration < 15; iteration += 1) {
      const startedAt = performance.now();
      assert.throws(
        () => operations.addDependency('dependency-task-00000', 'dependency-task-09999'),
        /cycle/i,
      );
      samples.push(performance.now() - startedAt);
    }
    console.log(`[dependency-cycle] edges=${TASK_COUNT - 1} p50=${percentile(samples, 0.5).toFixed(2)}ms p95=${percentile(samples, 0.95).toFixed(2)}ms`);
    assert.equal(db.prepare('SELECT count(*) AS total FROM task_dependencies').get()?.total, TASK_COUNT - 1,
      'rejected cycle checks must not write a dependency edge');
  } finally {
    db.close();
  }
});
