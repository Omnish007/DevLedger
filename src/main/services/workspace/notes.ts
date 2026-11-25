import { randomUUID } from 'node:crypto';
import type { NoteInput, NoteRecord, PageRequest, PageResult } from '../../../shared/contracts.js';
import { normalizePage } from '../../../domain/pagination.ts';
import { safeFtsQuery } from '../../../domain/validation.ts';
import { WorkspaceProjectsService } from './projects.ts';

import { nowIso, mapNote } from './base.ts';

export class WorkspaceNotesService extends WorkspaceProjectsService {
  listNotesPage(input: PageRequest = {}): PageResult<NoteRecord> {
    const { limit, offset, query } = normalizePage(input);
    const projectId = input.projectId ?? null;
    const match = safeFtsQuery(query);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const titleLike = `%${normalizedQuery.replace(/[\\%_]/g, '\\$&')}%`;
    const includeLocked = input.includeLocked === true ? 1 : 0;
    const unlockedFilter = normalizedQuery === ''
      ? 'locked = 0'
      : match
        ? `(locked = 0 AND (id IN (SELECT note_id FROM note_search WHERE note_search MATCH ?) OR lower(title) LIKE ? ESCAPE '\\'))`
        : `(locked = 0 AND lower(title) LIKE ? ESCAPE '\\')`;
    const queryWhere = `deleted_at IS NULL AND (? IS NULL OR project_id = ?) AND (
      (locked = 1 AND ? = 1 AND (? = '' OR lower('locked protected note') LIKE ? ESCAPE '\\')) OR
      ${unlockedFilter}
    )`;
    const baseParams = [projectId, projectId, includeLocked, normalizedQuery, titleLike];
    const params = normalizedQuery === '' ? baseParams : match ? [...baseParams, match, titleLike] : [...baseParams, titleLike];
    const totalRow = this.db.prepare(`SELECT count(*) AS total FROM notes WHERE ${queryWhere}`).get(...params) as { total: number };
    const rows = this.db.prepare(`SELECT id, project_id,
      CASE WHEN locked = 1 THEN 'Locked note' ELSE title END AS title,
      CASE WHEN locked = 1 THEN '' ELSE substr(content, 1, 600) END AS content,
      created_at, updated_at, locked
      FROM notes WHERE ${queryWhere} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    const items = rows.map(mapNote);
    return { items, total: Number(totalRow.total), limit, offset, hasMore: offset + items.length < Number(totalRow.total) };
  }

  getNoteById(id: string): NoteRecord {
    const note = this.getNote(id);
    if (!note) throw new Error('Note not found.');
    return note;
  }


  createNote(input: NoteInput): NoteRecord {
    const id = randomUUID();
    const now = nowIso();
    if (input.projectId) this.assertProjectExists(input.projectId);
    const insert = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO notes (id, project_id, title, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, input.projectId ?? null, input.title.trim() || 'Untitled note', input.content, now, now);
      this.addActivity('note', id, 'created', `Created note ${input.title.trim() || 'Untitled note'}`);
    });
    insert.immediate();
    const note = this.getNote(id);
    if (!note) throw new Error('Note creation could not be verified.');
    return note;
  }

  updateNote(id: string, input: Partial<NoteInput>): NoteRecord {
    const existing = this.db.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL AND locked = 0').get(id) as Record<string, unknown> | undefined;
    if (!existing) throw new Error('Note not found or note is locked.');
    if (input.projectId) this.assertProjectExists(input.projectId);
    const title = input.title?.trim() ?? String(existing.title);
    const content = input.content ?? String(existing.content);
    const projectId = input.projectId === undefined ? existing.project_id : input.projectId;
    const version = Number(existing.content_version);
    const now = nowIso();
    const update = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO note_versions (id, note_id, content_version, title, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), id, version, existing.title, existing.content, now);
      const result = this.db.prepare(`UPDATE notes SET title = ?, content = ?, project_id = ?,
        content_version = content_version + 1, updated_at = ? WHERE id = ? AND content_version = ?`)
        .run(title, content, projectId ?? null, now, id, version);
      if (result.changes !== 1) throw new Error('This note changed during the save. Refresh it before editing again.');
      this.addActivity('note', id, 'updated', `Updated note ${title}`);
    });
    update.immediate();
    const note = this.getNote(id);
    if (!note) throw new Error('Note update could not be verified.');
    return note;
  }

  removeNote(id: string): void {
    const result = this.db.prepare('UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND locked = 0')
      .run(nowIso(), nowIso(), id);
    if (result.changes === 0) throw new Error('Note not found or note is locked.');
    this.addActivity('note', id, 'deleted', 'Moved note to trash');
  }

}
