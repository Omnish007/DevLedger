import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceOperationsService } from '../../src/main/services/operations.ts';
import { MIGRATIONS } from '../../src/main/database/schema.ts';

function createDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(migration.sql); db.exec(`PRAGMA user_version = ${migration.version}`); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const now = new Date().toISOString();
  db.prepare('INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('p-1', 'DevLedger Demo', 'greenfield', now, now);
  db.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('c-1', 'Client Contact', now, now);
  db.prepare('INSERT INTO notes (id, project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('n-1', 'p-1', 'Scope note', 'Scope text', now, now);
  db.prepare('INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('t-1', 'p-1', 'Implement schema', now, now);
  db.prepare('INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('t-2', 'p-1', 'Build interface', now, now);
  return db;
}

test('tags attach to local records and can be removed cleanly', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    const tag = operations.createTag('scope-doc', 'blue');
    operations.assignTag('note', 'n-1', tag.id);
    assert.equal(operations.listEntityTags('note', 'n-1')[0]?.name, 'scope-doc');
    operations.unassignTag('note', 'n-1', tag.id);
    assert.equal(operations.listEntityTags('note', 'n-1').length, 0);
    operations.deleteTag(tag.id);
    assert.equal(operations.listTagsPage().items.length, 0);
  } finally { db.close(); }
});

test('record links are queryable from either side as backlinks', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    const link = operations.createLink('note', 'n-1', 'task', 't-1', 'implements');
    assert.equal(link.relationship, 'implements');
    assert.equal(operations.listLinksPage('task', 't-1').items[0]?.direction, 'incoming');
    assert.equal(operations.listLinksPage('note', 'n-1').items[0]?.direction, 'outgoing');
    operations.removeLink(link.id);
    assert.equal(operations.listLinksPage('note', 'n-1').total, 0);
  } finally { db.close(); }
});


test('record links return deterministic bounded pages with exact totals and a hard page-size ceiling', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    const now = new Date().toISOString();
    const insert = db.prepare(`INSERT INTO entity_links (id, source_type, source_id, target_type, target_id, relationship, created_at)
      VALUES (?, 'note', 'n-1', 'task', 't-1', ?, ?)`);
    for (let index = 0; index < 235; index += 1) insert.run(`link-page-${String(index).padStart(4, '0')}`, `related-${index}`, now);
    const first = operations.listLinksPage('note', 'n-1', { limit: 50, offset: 0 });
    const second = operations.listLinksPage('note', 'n-1', { limit: 50, offset: 50 });
    const capped = operations.listLinksPage('note', 'n-1', { limit: 10_000, offset: 0 });
    assert.equal(first.items.length, 50);
    assert.equal(first.total, 235);
    assert.equal(first.hasMore, true);
    assert.equal(second.items.length, 50);
    assert.notEqual(first.items[0]?.id, second.items[0]?.id);
    assert.equal(capped.items.length, 200);
    assert.equal(capped.limit, 200);
    const sourcePlan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM entity_links
      WHERE source_type = ? AND source_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all('note', 'n-1', 50, 0) as Array<{ detail: string }>;
    const targetPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM entity_links
      WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all('note', 'n-1', 50, 0) as Array<{ detail: string }>;
    assert.ok(sourcePlan.some((row) => row.detail.includes('entity_links_source_page_idx')));
    assert.ok(targetPlan.some((row) => row.detail.includes('entity_links_target_page_idx')));
  } finally { db.close(); }
});

test('dependencies reject self-links, cross-project links and cycles', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    operations.addDependency('t-2', 't-1');
    assert.deepEqual(operations.listDependencies('t-2').dependsOn.items, ['t-1']);
    assert.throws(() => operations.addDependency('t-1', 't-2'), /cycle/i);
    assert.throws(() => operations.addDependency('t-1', 't-1'), /itself/i);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('t-3', 'p-1', 'Third task', now, now);
    operations.addDependency('t-3', 't-2');
    assert.throws(() => operations.addDependency('t-1', 't-3'), /cycle/i, 'recursive SQL detects a cycle across multiple dependency edges');
    assert.equal(operations.listDependencies('t-1').dependsOn.total, 0, 'a rejected dependency does not mutate the graph');
    const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    for (let index = 0; index < 125; index += 1) {
      const id = `fanout-${String(index).padStart(4, '0')}`;
      insertTask.run(id, 'p-1', `Fanout task ${index}`, now, now);
      operations.addDependency(id, 't-1');
    }
    const firstPage = operations.listDependencies('t-1', { blocks: { limit: 50, offset: 0 } });
    const nextPage = operations.listDependencies('t-1', { blocks: { limit: 50, offset: 50 } });
    assert.equal(firstPage.blocks.items.length, 50);
    assert.equal(firstPage.blocks.total, 126, 'includes the earlier dependency already pointing at this task');
    assert.equal(firstPage.blocks.hasMore, true);
    assert.equal(nextPage.blocks.items.length, 50);
    assert.notEqual(firstPage.blocks.items[0], nextPage.blocks.items[0]);
    const reversePlan = db.prepare(`EXPLAIN QUERY PLAN SELECT task_id FROM task_dependencies
      WHERE depends_on_task_id = ? ORDER BY task_id LIMIT ? OFFSET ?`).all('t-1', 50, 0) as Array<{ detail: string }>;
    assert.ok(reversePlan.some((row) => row.detail.includes('task_dependencies_reverse_page_idx')));
  } finally { db.close(); }
});

test('blockers set task status, keep resolution history and restore task progress', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    const blocker = operations.createBlocker('t-1', 'Waiting for client credentials', 'c-1', new Date(Date.now() + 60_000).toISOString());
    assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get('t-1')?.status, 'blocked');
    assert.equal(operations.listBlockersPage().items.length, 1);
    operations.resolveBlocker(blocker.id, 'Credentials received');
    assert.equal(operations.listBlockersPage().items.length, 0);
    assert.equal(operations.listBlockersPage({ includeResolved: true }).items[0]?.resolutionNote, 'Credentials received');
    assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get('t-1')?.status, 'in_progress');
  } finally { db.close(); }
});

test('reminders support snooze, dismissal and validated rescheduling', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    const reminder = operations.createReminder('task', 't-1', new Date(Date.now() + 60_000).toISOString(), 'Follow up');
    assert.equal(reminder.status, 'scheduled');
    operations.updateReminder(reminder.id, 'snooze');
    assert.equal(operations.listRemindersPage({ status: 'snoozed' }).items.length, 1);
    operations.updateReminder(reminder.id, 'reschedule', new Date(Date.now() + 120_000).toISOString());
    assert.equal(operations.listRemindersPage({ status: 'scheduled' }).items.length, 1);
    operations.updateReminder(reminder.id, 'dismiss');
    assert.equal(operations.listRemindersPage({ status: 'dismissed' }).items.length, 1);
  } finally { db.close(); }
});

test('manual time entries validate chronology and preserve duration metadata', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    const start = new Date(Date.now() - 90 * 60_000).toISOString();
    const end = new Date(Date.now() - 30 * 60_000).toISOString();
    const entry = operations.addManualTimeEntry('t-1', start, end, 'Manual correction');
    assert.equal(entry.durationSeconds, 3600);
    assert.equal(operations.listTimeEntriesPage('t-1').items.length, 1);
    assert.throws(() => operations.addManualTimeEntry('t-1', end, start), /end after it starts/i);
    operations.deleteTimeEntry(entry.id);
    assert.equal(operations.listTimeEntriesPage('t-1').items.length, 0);
  } finally { db.close(); }
});

test('manual time entry correction updates the record and writes an audit event', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    const start = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const end = new Date(Date.now() - 60 * 60_000).toISOString();
    const entry = operations.addManualTimeEntry('t-1', start, end, 'Initial estimate');
    const correctedStart = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    const correctedEnd = new Date(Date.now() - 90 * 60_000).toISOString();
    const updated = operations.updateTimeEntry(entry.id, correctedStart, correctedEnd, 'Corrected after review');
    assert.equal(updated.durationSeconds, 90 * 60);
    assert.equal(updated.note, 'Corrected after review');
    assert.equal(operations.listTimeEntriesPage('t-1').items.length, 1);
    assert.ok((db.prepare("SELECT count(*) AS n FROM activity_events WHERE event_type = 'time_entry_corrected'").get() as { n: number }).n === 1);
    assert.throws(() => operations.updateTimeEntry(entry.id, correctedEnd, correctedStart), /end after it starts/i);
  } finally { db.close(); }
});

test('background jobs are idempotently enqueued and visible in job monitor', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    const first = operations.enqueueJob('document.extract', 'document', 'd-1', 7, 'doc:d-1:v1');
    const second = operations.enqueueJob('document.extract', 'document', 'd-1', 7, 'doc:d-1:v1');
    assert.equal(first.id, second.id);
    const jobs = operations.listJobsPage({ limit: 10, offset: 0 });
    assert.equal(jobs.items[0]?.status, 'queued');
    assert.equal(jobs.total, 1);
  } finally { db.close(); }
});


test('operations feeds return bounded deterministic pages and exact totals', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    for (let index = 0; index < 65; index += 1) {
      operations.createTag(`bulk-${String(index).padStart(3, '0')}`);
    }
    const firstTags = operations.listTagsPage({ limit: 20, offset: 0 });
    const secondTags = operations.listTagsPage({ limit: 20, offset: 20 });
    assert.equal(firstTags.items.length, 20);
    assert.equal(firstTags.total, 65);
    assert.equal(firstTags.hasMore, true);
    assert.equal(secondTags.offset, 20);
    assert.equal(secondTags.items.length, 20);
    assert.equal(new Set([...firstTags.items, ...secondTags.items].map((tag) => tag.id)).size, 40);
    assert.equal(operations.listTagsPage({ query: 'bulk-064', limit: 10 }).items[0]?.name, 'bulk-064');
    operations.createTag('prefix_under_score');
    operations.createTag('prefixXunderXscore');
    assert.deepEqual(operations.listTagsPage({ query: 'PREFIX_UNDER_', limit: 10 }).items.map((tag) => tag.name), ['prefix_under_score'], 'prefix filtering must be case-insensitive and treat underscores literally');

    const now = new Date().toISOString();
    for (let index = 0; index < 65; index += 1) {
      const taskId = `task-${String(index).padStart(3, '0')}`;
      db.prepare('INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(taskId, 'p-1', `Blockable ${index}`, now, now);
      operations.createBlocker(taskId, `Reason ${index}`, null, null);
      operations.createReminder('task', taskId, new Date(Date.now() + index * 1000).toISOString(), `Reminder ${index}`);
      db.prepare(`INSERT INTO time_entries (id, task_id, started_at, ended_at, duration_seconds, note, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
        .run(`entry-${index}`, 't-1', new Date(Date.now() - index * 1000).toISOString(), new Date(Date.now() - index * 1000 + 60_000).toISOString(), 60, `Entry ${index}`, now);
    }
    const blockers = operations.listBlockersPage({ limit: 25 });
    assert.equal(blockers.items.length, 25);
    assert.equal(blockers.total, 65);
    assert.equal(blockers.hasMore, true);
    assert.equal(operations.listBlockersPage({ includeResolved: true, limit: 100 }).total, 65);

    const reminders = operations.listRemindersPage({ limit: 25 });
    assert.equal(reminders.items.length, 25);
    assert.equal(reminders.total, 65);
    assert.equal(reminders.items[0]!.dueAt <= reminders.items.at(-1)!.dueAt, true);
    const reminderPage2 = operations.listRemindersPage({ limit: 25, offset: 25 });
    assert.equal(new Set([...reminders.items, ...reminderPage2.items].map((item) => item.id)).size, 50);

    const entries = operations.listTimeEntriesPage('t-1', { limit: 30 });
    assert.equal(entries.items.length, 30);
    assert.equal(entries.total, 65);
    assert.equal(entries.hasMore, true);
    assert.equal(operations.listTimeEntriesPage('t-1', { limit: 30, offset: 60 }).items.length, 5);
    assert.equal(operations.listTimeEntriesPage('missing-task', { limit: 30 }).total, 0);
  } finally { db.close(); }
});


test('activity and background-job histories page across the full timeline with deterministic tie-breaking', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    const insertActivity = db.prepare(`INSERT INTO activity_events (id, entity_type, entity_id, event_type, summary, created_at)
      VALUES (?, 'task', 't-1', 'updated', ?, ?)`);
    const insertJob = db.prepare(`INSERT INTO background_jobs (id, kind, target_type, target_id, created_at, updated_at)
      VALUES (?, 'maintenance.optimize', 'workspace', 'local-workspace', ?, ?)`);
    for (let index = 0; index < 65; index += 1) {
      const id = String(index).padStart(3, '0');
      const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      insertActivity.run(`activity-${id}`, `Activity ${id}`, createdAt);
      insertJob.run(`job-${id}`, createdAt, createdAt);
    }

    const activityFirst = operations.listActivityPage({ limit: 20, offset: 0 });
    const activityLast = operations.listActivityPage({ limit: 20, offset: 60 });
    assert.equal(activityFirst.total, 65);
    assert.equal(activityFirst.items.length, 20);
    assert.equal(activityFirst.items[0]?.id, 'activity-064');
    assert.equal(activityLast.items.length, 5);
    assert.equal(activityLast.hasMore, false);
    assert.equal(new Set([...activityFirst.items, ...operations.listActivityPage({ limit: 20, offset: 20 }).items, ...operations.listActivityPage({ limit: 20, offset: 40 }).items, ...activityLast.items].map((item) => item.id)).size, 65);

    const jobsFirst = operations.listJobsPage({ limit: 20, offset: 0 });
    const jobsLast = operations.listJobsPage({ limit: 20, offset: 60 });
    assert.equal(jobsFirst.total, 65);
    assert.equal(jobsFirst.items.length, 20);
    assert.equal(jobsFirst.items[0]?.id, 'job-064');
    assert.equal(jobsLast.items.length, 5);
    assert.equal(jobsLast.hasMore, false);
    assert.equal(new Set([...jobsFirst.items, ...operations.listJobsPage({ limit: 20, offset: 20 }).items, ...operations.listJobsPage({ limit: 20, offset: 40 }).items, ...jobsLast.items].map((item) => item.id)).size, 65);
  } finally { db.close(); }
});

test('entity tag lists and assignments have an explicit 200-tag safety bound', () => {
  const db = createDatabase();
  try {
    const operations = new WorkspaceOperationsService(db as never);
    for (let index = 0; index < 201; index += 1) {
      const tag = operations.createTag(`tag-${String(index).padStart(3, '0')}`);
      if (index < 200) operations.assignTag('note', 'n-1', tag.id);
      else assert.throws(() => operations.assignTag('note', 'n-1', tag.id), /at most 200 tags/i);
    }
    assert.equal(operations.listEntityTags('note', 'n-1').length, 200);
  } finally { db.close(); }
});
