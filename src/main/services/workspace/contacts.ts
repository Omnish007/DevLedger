import { randomUUID } from 'node:crypto';
import type { ContactInput, ContactRecord, PageRequest, PageResult } from '../../../shared/contracts.js';
import { normalizePage } from '../../../domain/pagination.ts';
import { safeFtsQuery } from '../../../domain/validation.ts';
import { WorkspaceBase } from './base.ts';

import { nowIso, parseContactAttributes, normalizeContactAttributes } from './base.ts';

export class WorkspaceContactsService extends WorkspaceBase {
  listContactsPage(input: PageRequest = {}): PageResult<ContactRecord> {
    const { limit, offset, query } = normalizePage(input);
    const projectId = input.projectId ?? null;
    const match = safeFtsQuery(query);
    const where = `c.deleted_at IS NULL AND (? IS NULL OR EXISTS (SELECT 1 FROM project_contacts selected WHERE selected.contact_id = c.id AND selected.project_id = ?))
      AND (? = '' OR c.id IN (SELECT contact_id FROM contact_search WHERE contact_search MATCH ?))`;
    const params = [projectId, projectId, match, match] as const;
    const totalRow = this.db.prepare(`SELECT count(*) AS total FROM contacts c WHERE ${where}`).get(...params) as { total: number };
    const rows = this.db.prepare(`WITH selected(id) AS (
        SELECT c.id FROM contacts c WHERE ${where} ORDER BY c.name COLLATE NOCASE LIMIT ? OFFSET ?
      )
      SELECT c.*, group_concat(pc.project_id) AS project_ids FROM selected
      JOIN contacts c ON c.id = selected.id
      LEFT JOIN project_contacts pc ON pc.contact_id = c.id
      GROUP BY c.id ORDER BY c.name COLLATE NOCASE`).all(...params, limit, offset) as Array<Record<string, unknown>>;
    const items = rows.map((row) => ({
      id: String(row['id']), name: String(row['name']), role: String(row['role']), company: String(row['company']),
      email: String(row['email']), phone: String(row['phone']), notes: String(row['notes']),
      customAttributes: parseContactAttributes(row['custom_attributes_json']),
      projectIds: row['project_ids'] ? String(row['project_ids']).split(',') : [],
      createdAt: String(row['created_at']), updatedAt: String(row['updated_at']),
    }));
    return { items, total: Number(totalRow.total), limit, offset, hasMore: offset + items.length < Number(totalRow.total) };
  }

  getContactById(id: string): ContactRecord | null {
    const row = this.db.prepare(`SELECT c.*, (SELECT group_concat(project_id) FROM project_contacts WHERE contact_id = c.id) AS project_ids
      FROM contacts c WHERE c.id = ? AND c.deleted_at IS NULL`).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row['id']), name: String(row['name']), role: String(row['role']), company: String(row['company']),
      email: String(row['email']), phone: String(row['phone']), notes: String(row['notes']),
      customAttributes: parseContactAttributes(row['custom_attributes_json']),
      projectIds: row['project_ids'] ? String(row['project_ids']).split(',') : [],
      createdAt: String(row['created_at']), updatedAt: String(row['updated_at']),
    };
  }


  createContact(input: ContactInput): ContactRecord {
    const id = randomUUID(); const now = nowIso();
    if (input.projectId) this.assertProjectExists(input.projectId);
    const create = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO contacts (id, name, role, company, email, phone, notes, custom_attributes_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.name.trim(), input.role ?? 'other', input.company ?? '', input.email ?? '', input.phone ?? '', input.notes ?? '', JSON.stringify(normalizeContactAttributes(input.customAttributes)), now, now);
      if (input.projectId) this.db.prepare('INSERT INTO project_contacts (project_id, contact_id, relationship_role) VALUES (?, ?, ?)')
        .run(input.projectId, id, input.role ?? 'other');
      this.addActivity('contact', id, 'created', `Created contact ${input.name.trim()}`);
    });
    create.immediate();
    const contact = this.getContactById(id);
    if (!contact) throw new Error('Contact creation could not be verified.');
    return contact;
  }

  updateContact(id: string, input: Partial<ContactInput>): ContactRecord {
    const current = this.db.prepare('SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined;
    if (!current) throw new Error('Contact not found.');
    if (input.projectId) this.assertProjectExists(input.projectId);
    const next = { name: input.name?.trim() ?? String(current['name']), role: input.role ?? String(current['role']), company: input.company ?? String(current['company']), email: input.email ?? String(current['email']), phone: input.phone ?? String(current['phone']), notes: input.notes ?? String(current['notes']), customAttributes: input.customAttributes === undefined ? parseContactAttributes(current['custom_attributes_json']) : normalizeContactAttributes(input.customAttributes) };
    const update = this.db.transaction(() => {
      this.db.prepare('UPDATE contacts SET name = ?, role = ?, company = ?, email = ?, phone = ?, notes = ?, custom_attributes_json = ?, updated_at = ? WHERE id = ?')
        .run(next.name, next.role, next.company, next.email, next.phone, next.notes, JSON.stringify(next.customAttributes), nowIso(), id);
      if (input.projectId !== undefined) {
        this.db.prepare('DELETE FROM project_contacts WHERE contact_id = ?').run(id);
        if (input.projectId) this.db.prepare('INSERT INTO project_contacts (project_id, contact_id, relationship_role) VALUES (?, ?, ?)').run(input.projectId, id, next.role);
      }
      this.addActivity('contact', id, 'updated', `Updated contact ${next.name}`);
    });
    update.immediate();
    const contact = this.getContactById(id);
    if (!contact) throw new Error('Contact update could not be verified.');
    return contact;
  }

  removeContact(id: string): void {
    const now = nowIso();
    const result = this.db.prepare('UPDATE contacts SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(now, now, id);
    if (result.changes !== 1) throw new Error('Contact not found.');
    this.addActivity('contact', id, 'deleted', 'Moved contact to trash');
  }
}
