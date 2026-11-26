import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { normalizePage } from '../../domain/pagination.ts';
import type { PageRequest, PageResult } from '../../shared/contracts.js';
import { assertEntityExists, mapLink } from './operations-mappers.ts';
import { type EntityLinkRecord, type EntityType, now } from './operations-shared.ts';

export function createEntityLink(
    db: Database.Database,
    sourceType: EntityType,
    sourceId: string,
    targetType: EntityType,
    targetId: string,
    relationship = 'related',
): EntityLinkRecord {
    assertEntityExists(db, sourceType, sourceId);
    assertEntityExists(db, targetType, targetId);
    if (sourceType === targetType && sourceId === targetId)
        throw new Error('A record cannot link to itself.');
    const label = relationship.trim().slice(0, 64) || 'related';
    const id = randomUUID();
    const createdAt = now();
    db.prepare(
        `INSERT OR IGNORE INTO entity_links (id, source_type, source_id, target_type, target_id, relationship, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, sourceType, sourceId, targetType, targetId, label, createdAt);
    const row = db
        .prepare(
            `SELECT * FROM entity_links WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND relationship = ?`,
        )
        .get(sourceType, sourceId, targetType, targetId, label) as Record<string, unknown>;
    return mapLink(row, 'outgoing');
}

export function listEntityLinksPage(
    db: Database.Database,
    entityType: EntityType,
    entityId: string,
    input: PageRequest = {},
): PageResult<EntityLinkRecord> {
    assertEntityExists(db, entityType, entityId);
    const page = normalizePage(input);
    const total = Number(
        (
            db
                .prepare(
                    `SELECT
      (SELECT count(*) FROM entity_links WHERE source_type = ? AND source_id = ?) +
      (SELECT count(*) FROM entity_links WHERE target_type = ? AND target_id = ?) AS total`,
                )
                .get(entityType, entityId, entityType, entityId) as { total: number }
        ).total,
    );
    const rows = db
        .prepare(
            `SELECT * FROM (
      SELECT *, 'outgoing' AS direction FROM entity_links WHERE source_type = ? AND source_id = ?
      UNION ALL
      SELECT *, 'incoming' AS direction FROM entity_links WHERE target_type = ? AND target_id = ?
    ) ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(entityType, entityId, entityType, entityId, page.limit, page.offset) as Array<
        Record<string, unknown>
    >;
    const items = rows.map((row) => mapLink(row, row['direction'] as 'outgoing' | 'incoming'));
    return {
        items,
        total,
        limit: page.limit,
        offset: page.offset,
        hasMore: page.offset + items.length < total,
    };
}

export function removeEntityLink(db: Database.Database, linkId: string): void {
    const result = db.prepare('DELETE FROM entity_links WHERE id = ?').run(linkId);
    if (!result.changes) throw new Error('Relationship not found.');
}
