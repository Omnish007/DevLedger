import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { normalizePage } from '../../domain/pagination.ts';
import type { PageRequest, PageResult } from '../../shared/contracts.ts';
import { assertEntityExists } from './operations-mappers.ts';
import { mapTag, now } from './operations-shared.ts';
import type { EntityType, TagRecord } from './operations-shared.ts';

export const MAX_TAGS_PER_ENTITY = 200;

export function listTagsPage(db: Database.Database, input: PageRequest = {}): PageResult<TagRecord> {
    const page = normalizePage(input);
    const normalizedQuery = page.query.toLowerCase();
    const where = normalizedQuery ? 'WHERE name >= ? COLLATE NOCASE AND name < ? COLLATE NOCASE' : '';
    const parameters = normalizedQuery ? [normalizedQuery, `${normalizedQuery}\u{10ffff}`] : [];
    const total = Number(
        (db.prepare(`SELECT count(*) AS total FROM tags ${where}`).get(...parameters) as { total: number })
            .total,
    );
    const items = (
        db
            .prepare(`SELECT * FROM tags ${where} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`)
            .all(...parameters, page.limit, page.offset) as Array<Record<string, unknown>>
    ).map(mapTag);
    return {
        items,
        total,
        limit: page.limit,
        offset: page.offset,
        hasMore: page.offset + items.length < total,
    };
}

export function createTag(db: Database.Database, name: string, color = 'neutral'): TagRecord {
    const normalized = name.trim().replace(/^#/, '').toLowerCase();
    if (!normalized || normalized.length > 64 || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(normalized))
        throw new Error('Tag names may contain letters, numbers, spaces, underscores and hyphens.');
    if (!/^(neutral|blue|green|amber|red|violet)$/.test(color)) throw new Error('Invalid tag color.');
    db.prepare(
        'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET color = excluded.color',
    ).run(randomUUID(), normalized, color, now());
    return mapTag(db.prepare('SELECT * FROM tags WHERE name = ?').get(normalized) as Record<string, unknown>);
}

export function deleteTag(db: Database.Database, tagId: string): void {
    if (!db.prepare('DELETE FROM tags WHERE id = ?').run(tagId).changes) throw new Error('Tag not found.');
}

export function listEntityTags(db: Database.Database, entityType: EntityType, entityId: string): TagRecord[] {
    assertEntityExists(db, entityType, entityId);
    return (
        db
            .prepare(
                'SELECT t.* FROM tags t JOIN entity_tags et ON et.tag_id = t.id WHERE et.entity_type = ? AND et.entity_id = ? ORDER BY t.name COLLATE NOCASE LIMIT ?',
            )
            .all(entityType, entityId, MAX_TAGS_PER_ENTITY) as Array<Record<string, unknown>>
    ).map(mapTag);
}

export function assignTag(
    db: Database.Database,
    entityType: EntityType,
    entityId: string,
    tagId: string,
): void {
    assertEntityExists(db, entityType, entityId);
    if (!db.prepare('SELECT id FROM tags WHERE id = ?').get(tagId)) throw new Error('Tag not found.');
    const existing = db
        .prepare(
            'SELECT 1 AS assigned FROM entity_tags WHERE tag_id = ? AND entity_type = ? AND entity_id = ?',
        )
        .get(tagId, entityType, entityId);
    if (existing) return;
    const result = db
        .prepare(
            `INSERT OR IGNORE INTO entity_tags (tag_id, entity_type, entity_id, created_at)
    SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM entity_tags WHERE entity_type = ? AND entity_id = ?) < ?`,
        )
        .run(tagId, entityType, entityId, now(), entityType, entityId, MAX_TAGS_PER_ENTITY);
    if (result.changes !== 1) throw new Error(`An entity can have at most ${MAX_TAGS_PER_ENTITY} tags.`);
}

export function unassignTag(
    db: Database.Database,
    entityType: EntityType,
    entityId: string,
    tagId: string,
): void {
    db.prepare('DELETE FROM entity_tags WHERE tag_id = ? AND entity_type = ? AND entity_id = ?').run(
        tagId,
        entityType,
        entityId,
    );
}
