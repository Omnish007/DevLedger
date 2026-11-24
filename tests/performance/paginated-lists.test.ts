import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { WorkspaceService } from '../../src/main/services/workspace.ts';
import { DocumentStorageService } from '../../src/main/services/storage.ts';
import { WorkspaceOperationsService } from '../../src/main/services/operations.ts';
import { NotificationInboxService } from '../../src/main/services/notification-inbox.ts';

const RECORDS_PER_TYPE = 10_000;
const PAGE_SIZE = 50;

function percentile(samples: number[], value: number): number {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * value))] ?? 0;
}

test('workspace list endpoints return bounded pages on a 10k-record dataset per entity', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('performance-project', 'Performance workspace', 'ongoing', now, now);

    const insertContact = db.prepare(`INSERT INTO contacts (id, name, role, company, email, phone, notes, created_at, updated_at)
      VALUES (?, ?, 'developer', 'Benchmark Co', '', '', '', ?, ?)`);
    const insertNote = db.prepare(`INSERT INTO notes (id, project_id, title, content, created_at, updated_at)
      VALUES (?, 'performance-project', ?, 'A small searchable note body for pagination benchmark.', ?, ?)`);
    const insertLockedNote = db.prepare(`INSERT INTO notes (id, project_id, title, content, locked, encrypted_payload, encryption_meta, created_at, updated_at)
      VALUES (?, 'performance-project', 'Locked note', '', 1, ?, '{}', ?, ?)`);
    const insertTask = db.prepare(`INSERT INTO tasks (id, project_id, title, description, created_at, updated_at)
      VALUES (?, 'performance-project', ?, 'Benchmark task description', ?, ?)`);
    const insertTag = db.prepare(`INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, 'neutral', ?)`);
    const insertBlocker = db.prepare(`INSERT INTO task_blockers (id, task_id, reason, created_at) VALUES (?, ?, 'Waiting for an external response', ?)`);
    const insertReminder = db.prepare(`INSERT INTO reminders (id, entity_type, entity_id, due_at, status, message, created_at, updated_at) VALUES (?, 'task', ?, ?, 'scheduled', 'Follow up', ?, ?)`);
    const insertTimeEntry = db.prepare(`INSERT INTO time_entries (id, task_id, started_at, ended_at, duration_seconds, note, is_active, created_at) VALUES (?, ?, ?, ?, 300, '', 0, ?)`);
    const insertActivity = db.prepare(`INSERT INTO activity_events (id, entity_type, entity_id, event_type, summary, created_at) VALUES (?, 'task', 'task-00000', 'updated', 'Pagination benchmark activity', ?)`);
    const insertJob = db.prepare(`INSERT INTO background_jobs (id, kind, target_type, target_id, created_at, updated_at) VALUES (?, 'maintenance.optimize', 'workspace', 'local-workspace', ?, ?)`);
    const insertNotification = db.prepare(`INSERT INTO notifications (id, idempotency_key, entity_type, kind, title, body, status, created_at, delivered_at) VALUES (?, ?, 'system', 'system', ?, 'History benchmark item', ?, ?, ?)`);
    const insertDocument = db.prepare(`INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes,
      sha256, object_relative_path, status, extracted_text, created_at, updated_at)
      VALUES (?, 'performance-project', ?, ?, 'text/plain', '.txt', 128, ?, ?, 'indexed', 'large extracted text omitted from list page', ?, ?)`);

    db.exec('BEGIN IMMEDIATE');
    try {
      for (let index = 0; index < RECORDS_PER_TYPE; index += 1) {
        const suffix = String(index).padStart(5, '0');
        insertContact.run(`contact-${suffix}`, `Developer ${suffix}`, now, now);
        insertNote.run(`note-${suffix}`, `Engineering note ${suffix}`, now, now);
        if (index < 1_000) insertLockedNote.run(`protected-${suffix}`, Buffer.from(`cipher-${suffix}`), now, now);
        insertTask.run(`task-${suffix}`, `Engineering task ${suffix}`, now, now);
        insertDocument.run(`document-${suffix}`, `Architecture document ${suffix}`, `architecture-${suffix}.txt`, 'a'.repeat(64), `objects/${suffix}.txt`, now, now);
        insertTag.run(`tag-${suffix}`, `benchmark-tag-${suffix}`, now);
        insertBlocker.run(`blocker-${suffix}`, `task-${suffix}`, now);
        const dueAt = new Date(Date.now() + index * 1000).toISOString();
        insertReminder.run(`reminder-${suffix}`, `task-${suffix}`, dueAt, now, now);
        const startedAt = new Date(Date.now() - index * 1000).toISOString();
        insertTimeEntry.run(`entry-${suffix}`, 'task-00000', startedAt, new Date(Date.parse(startedAt) + 300_000).toISOString(), now);
        insertActivity.run(`activity-${suffix}`, startedAt);
        insertJob.run(`job-${suffix}`, startedAt, startedAt);
        insertNotification.run(`notification-${suffix}`, `benchmark:${suffix}`, `History ${suffix}`, index % 3 === 0 ? 'unread' : 'read', startedAt, startedAt);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const workspace = new WorkspaceService(db as never);
    const documents = new DocumentStorageService(db as never, '/tmp/devledger-pagination-benchmark');
    const operations = new WorkspaceOperationsService(db as never);
    const notifications = new NotificationInboxService(db as never);
    const cases: Array<[string, () => { items: unknown[]; total: number }]> = [
      ['contacts', () => workspace.listContactsPage({ limit: PAGE_SIZE, offset: RECORDS_PER_TYPE - PAGE_SIZE })],
      ['notes', () => workspace.listNotesPage({ limit: PAGE_SIZE, offset: RECORDS_PER_TYPE - PAGE_SIZE })],
      ['tasks', () => workspace.listTasksPage({ limit: PAGE_SIZE, offset: RECORDS_PER_TYPE - PAGE_SIZE })],
      ['documents', () => documents.listPage({ limit: PAGE_SIZE, offset: RECORDS_PER_TYPE - PAGE_SIZE })],
    ];

    for (const [name, execute] of cases) {
      const samples: number[] = [];
      for (let iteration = 0; iteration < 15; iteration += 1) {
        const startedAt = performance.now();
        const page = execute();
        samples.push(performance.now() - startedAt);
        assert.equal(page.items.length, PAGE_SIZE, `${name} must return only one bounded page`);
        assert.equal(page.total, RECORDS_PER_TYPE, `${name} should retain an accurate total`);
      }
      console.log(`[paged-list:${name}] rows=${RECORDS_PER_TYPE} page=${PAGE_SIZE} p50=${percentile(samples, 0.5).toFixed(2)}ms p95=${percentile(samples, 0.95).toFixed(2)}ms`);
    }

    const protectedNoteSamples: number[] = [];
    for (let iteration = 0; iteration < 15; iteration += 1) {
      const startedAt = performance.now();
      const page = workspace.listNotesPage({ limit: PAGE_SIZE, offset: RECORDS_PER_TYPE + 1_000 - PAGE_SIZE, includeLocked: true });
      protectedNoteSamples.push(performance.now() - startedAt);
      assert.equal(page.items.length, PAGE_SIZE, 'protected and ordinary notes must share bounded pagination');
      assert.equal(page.total, RECORDS_PER_TYPE + 1_000, 'protected note metadata must contribute to the combined Notes total');
    }
    console.log(`[paged-list:notes-with-protected] rows=${RECORDS_PER_TYPE + 1_000} page=${PAGE_SIZE} p50=${percentile(protectedNoteSamples, 0.5).toFixed(2)}ms p95=${percentile(protectedNoteSamples, 0.95).toFixed(2)}ms`);
    const protectedOnly = workspace.listNotesPage({ limit: PAGE_SIZE, offset: 950, query: 'protected', includeLocked: true });
    assert.equal(protectedOnly.total, 1_000);
    assert.equal(protectedOnly.items.length, PAGE_SIZE);
    assert.ok(protectedOnly.items.every((note) => note.locked && note.title === 'Locked note' && note.content === ''), 'protected pages must expose no decrypted content');

    const operationCases: Array<[string, () => { items: unknown[]; total: number }]> = [
      ['tags', () => operations.listTagsPage({ limit: PAGE_SIZE, offset: RECORDS_PER_TYPE - PAGE_SIZE })],
      ['blockers', () => operations.listBlockersPage({ limit: PAGE_SIZE, offset: RECORDS_PER_TYPE - PAGE_SIZE })],
      ['reminders', () => operations.listRemindersPage({ limit: PAGE_SIZE, offset: RECORDS_PER_TYPE - PAGE_SIZE })],
      ['time-entries', () => operations.listTimeEntriesPage('task-00000', { limit: PAGE_SIZE, offset: RECORDS_PER_TYPE - PAGE_SIZE })],
      ['activity-history', () => operations.listActivityPage({ limit: PAGE_SIZE, offset: RECORDS_PER_TYPE - PAGE_SIZE })],
      ['background-job-history', () => operations.listJobsPage({ limit: PAGE_SIZE, offset: RECORDS_PER_TYPE - PAGE_SIZE })],
    ];
    for (const [name, execute] of operationCases) {
      const samples: number[] = [];
      for (let iteration = 0; iteration < 15; iteration += 1) {
        const startedAt = performance.now();
        const page = execute();
        samples.push(performance.now() - startedAt);
        assert.equal(page.items.length, PAGE_SIZE, `${name} must return only one bounded page`);
        assert.equal(page.total, RECORDS_PER_TYPE, `${name} should retain an accurate total`);
      }
      console.log(`[paged-operations:${name}] rows=${RECORDS_PER_TYPE} page=${PAGE_SIZE} p50=${percentile(samples, 0.5).toFixed(2)}ms p95=${percentile(samples, 0.95).toFixed(2)}ms`);
    }
    const allNotesPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 50`).all() as Array<{ detail: string }>;
    assert.ok(allNotesPlan.some((row) => row.detail.includes('notes_all_updated_idx')), 'unified Notes feed must use the chronological index including protected records');
    const tagPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM tags WHERE name >= 'benchmark-tag-099' COLLATE NOCASE AND name < 'benchmark-tag-099\u{10ffff}' COLLATE NOCASE ORDER BY name COLLATE NOCASE LIMIT 50`).all() as Array<{ detail: string }>;
    assert.ok(tagPlan.some((row) => row.detail.includes('SEARCH') && row.detail.includes('sqlite_autoindex_tags_2')), 'tag prefix search must use the unique name range index');
    const blockerPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM task_blockers ORDER BY coalesce(follow_up_at, created_at) ASC, id ASC LIMIT 50`).all() as Array<{ detail: string }>;
    assert.ok(blockerPlan.some((row) => row.detail.includes('blockers_queue_page_idx')), 'blocker feed must use the stable-order index');
    const reminderPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM reminders WHERE status = 'scheduled' ORDER BY due_at ASC, id ASC LIMIT 50`).all() as Array<{ detail: string }>;
    assert.ok(reminderPlan.some((row) => row.detail.includes('reminders_due_page_idx')), 'reminder feed must use the status/time index');
    const timePlan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM time_entries WHERE task_id = 'task-00000' ORDER BY started_at DESC, id DESC LIMIT 50`).all() as Array<{ detail: string }>;
    assert.ok(timePlan.some((row) => row.detail.includes('time_entries_task_page_idx')), 'time-entry history must use the task/time index');
    const activityPlan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM activity_events ORDER BY created_at DESC, id DESC LIMIT 50').all() as Array<{ detail: string }>;
    assert.ok(activityPlan.some((row) => row.detail.includes('activity_events_history_page_idx')), 'activity history must use the stable chronological index');
    const jobsPlan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM background_jobs ORDER BY created_at DESC, id DESC LIMIT 50').all() as Array<{ detail: string }>;
    assert.ok(jobsPlan.some((row) => row.detail.includes('background_jobs_history_page_idx')), 'background-job history must use the stable chronological index');

    const inboxCases: Array<[string, () => ReturnType<NotificationInboxService['list']>]> = [
      ['notification-inbox-all', () => notifications.list('all', PAGE_SIZE)],
      ['notification-inbox-unread', () => notifications.list('unread', PAGE_SIZE)],
    ];
    for (const [name, execute] of inboxCases) {
      const samples: number[] = [];
      for (let iteration = 0; iteration < 15; iteration += 1) {
        const startedAt = performance.now();
        const page = execute();
        samples.push(performance.now() - startedAt);
        assert.equal(page.length, PAGE_SIZE, `${name} must return a bounded history page`);
      }
      console.log(`[${name}] rows=${RECORDS_PER_TYPE} page=${PAGE_SIZE} p50=${percentile(samples, 0.5).toFixed(2)}ms p95=${percentile(samples, 0.95).toFixed(2)}ms`);
    }
    const inboxPlan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT 50').all() as Array<{ detail: string }>;
    assert.ok(inboxPlan.some((row) => row.detail.includes('notifications_history_page_idx')), 'All inbox history must use the chronological index');
    const unreadInboxPlan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM notifications WHERE status = 'unread' ORDER BY created_at DESC, id DESC LIMIT 50").all() as Array<{ detail: string }>;
    assert.ok(unreadInboxPlan.some((row) => row.detail.includes('notifications_status_history_page_idx')), 'Filtered inbox history must use the status/chronological index');

    const dashboardSamples: number[] = [];
    for (let iteration = 0; iteration < 15; iteration += 1) {
      const startedAt = performance.now();
      const summary = workspace.dashboardSummary();
      dashboardSamples.push(performance.now() - startedAt);
      assert.equal(summary.recentNotes.length, 6, 'dashboard should only load six recent note cards');
      assert.ok(summary.recentNotes.every((note) => note.content.length <= 600), 'dashboard note excerpts must be bounded');
    }
    console.log(`[dashboard-summary] notes=${RECORDS_PER_TYPE} recent=6 p50=${percentile(dashboardSamples, 0.5).toFixed(2)}ms p95=${percentile(dashboardSamples, 0.95).toFixed(2)}ms`);
  } finally {
    db.close();
  }
});
