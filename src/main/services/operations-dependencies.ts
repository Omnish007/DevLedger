import type Database from 'better-sqlite3';
import { normalizePage } from '../../domain/pagination.ts';
import type { PageRequest, PageResult } from '../../shared/contracts.js';
import { addOperationActivity, now } from './operations-shared.ts';

export function addTaskDependency(db: Database.Database, taskId: string, dependsOnTaskId: string): void {
    if (taskId === dependsOnTaskId) throw new Error('A task cannot depend on itself.');
    const task = db
        .prepare('SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL')
        .get(taskId) as { project_id: string } | undefined;
    const dependency = db
        .prepare('SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL')
        .get(dependsOnTaskId) as { project_id: string } | undefined;
    if (!task || !dependency) throw new Error('Both tasks must exist and be active.');
    if (task.project_id !== dependency.project_id)
        throw new Error('Task dependencies must belong to the same project.');
    // Follow only the dependency chain reachable from the proposed prerequisite.
    // A cycle exists exactly when that chain already reaches the task being updated.
    // This keeps validation proportional to the reachable subgraph instead of copying
    // the entire workspace dependency graph into the main-process JavaScript heap.
    const cycle = db
        .prepare(
            `WITH RECURSIVE dependency_path(task_id) AS (
      SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?
      UNION
      SELECT edge.depends_on_task_id FROM task_dependencies edge
      INNER JOIN dependency_path path ON edge.task_id = path.task_id
    ) SELECT 1 AS creates_cycle FROM dependency_path WHERE task_id = ? LIMIT 1`,
        )
        .get(dependsOnTaskId, taskId) as { creates_cycle: number } | undefined;
    if (cycle) throw new Error('This dependency would create a cycle.');
    db.prepare(
        'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, created_at) VALUES (?, ?, ?)',
    ).run(taskId, dependsOnTaskId, now());
    addOperationActivity(
        db,
        'task',
        taskId,
        'dependency_added',
        `Added dependency on task ${dependsOnTaskId}`,
    );
}

export function removeTaskDependency(db: Database.Database, taskId: string, dependsOnTaskId: string): void {
    db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?').run(
        taskId,
        dependsOnTaskId,
    );
}

export function listTaskDependencies(
    db: Database.Database,
    taskId: string,
    input: { dependsOn?: PageRequest | undefined; blocks?: PageRequest | undefined } = {},
): {
    dependsOn: PageResult<string>;
    blocks: PageResult<string>;
} {
    const dependsPage = normalizePage(input.dependsOn);
    const blocksPage = normalizePage(input.blocks);
    const dependsTotal = Number(
        (
            db.prepare('SELECT count(*) AS total FROM task_dependencies WHERE task_id = ?').get(taskId) as {
                total: number;
            }
        ).total,
    );
    const blocksTotal = Number(
        (
            db
                .prepare('SELECT count(*) AS total FROM task_dependencies WHERE depends_on_task_id = ?')
                .get(taskId) as { total: number }
        ).total,
    );
    const dependsOn = (
        db
            .prepare(
                `SELECT depends_on_task_id FROM task_dependencies
      WHERE task_id = ? ORDER BY depends_on_task_id LIMIT ? OFFSET ?`,
            )
            .all(taskId, dependsPage.limit, dependsPage.offset) as Array<{ depends_on_task_id: string }>
    ).map((row) => row.depends_on_task_id);
    const blocks = (
        db
            .prepare(
                `SELECT task_id FROM task_dependencies
      WHERE depends_on_task_id = ? ORDER BY task_id LIMIT ? OFFSET ?`,
            )
            .all(taskId, blocksPage.limit, blocksPage.offset) as Array<{ task_id: string }>
    ).map((row) => row.task_id);
    return {
        dependsOn: {
            items: dependsOn,
            total: dependsTotal,
            limit: dependsPage.limit,
            offset: dependsPage.offset,
            hasMore: dependsPage.offset + dependsOn.length < dependsTotal,
        },
        blocks: {
            items: blocks,
            total: blocksTotal,
            limit: blocksPage.limit,
            offset: blocksPage.offset,
            hasMore: blocksPage.offset + blocks.length < blocksTotal,
        },
    };
}
