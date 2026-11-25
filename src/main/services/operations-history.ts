import type Database from 'better-sqlite3';
import { normalizePage } from '../../domain/pagination.ts';
import type { PageRequest, PageResult } from '../../shared/contracts.ts';
import { mapJob } from './operations-shared.ts';
import type { ActivityRecord, BackgroundJobRecord } from './operations-shared.ts';

export function listJobsPage(db: Database.Database, input: PageRequest = {}): PageResult<BackgroundJobRecord> {
  const page = normalizePage(input);
  const total = Number((db.prepare('SELECT count(*) AS total FROM background_jobs').get() as { total: number }).total);
  const items = (db.prepare('SELECT * FROM background_jobs ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?').all(page.limit, page.offset) as Array<Record<string, unknown>>).map(mapJob);
  return { items, total, limit: page.limit, offset: page.offset, hasMore: page.offset + items.length < total };
}

export function listActivityPage(db: Database.Database, input: PageRequest = {}): PageResult<ActivityRecord> {
  const page = normalizePage(input);
  const total = Number((db.prepare('SELECT count(*) AS total FROM activity_events').get() as { total: number }).total);
  const items = (db.prepare('SELECT * FROM activity_events ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?').all(page.limit, page.offset) as Array<Record<string, unknown>>).map(mapActivity);
  return { items, total, limit: page.limit, offset: page.offset, hasMore: page.offset + items.length < total };
}

function mapActivity(row: Record<string, unknown>): ActivityRecord {
  return { id: String(row['id']), entityType: String(row['entity_type']), entityId: String(row['entity_id']), eventType: String(row['event_type']), summary: String(row['summary']), createdAt: String(row['created_at']) };
}
