import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { NoteRecord, ProjectRecord, TaskRecord, TaskStatus } from '../../../shared/contracts.js';
import { stripControlCharacters } from '../../../domain/validation.ts';

export function nowIso(): string {
    return new Date().toISOString();
}

export function parseContactAttributes(value: unknown): Record<string, string> {
    try {
        const parsed = JSON.parse(String(value ?? '{}')) as unknown;
        return normalizeContactAttributes(parsed);
    } catch {
        return {};
    }
}

export function normalizeContactAttributes(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
        const key = stripControlCharacters(rawKey.trim()).slice(0, 40);
        if (!key || typeof rawValue !== 'string') continue;
        result[key] = rawValue.trim().slice(0, 500);
    }
    return result;
}

export function mapProject(row: Record<string, unknown>): ProjectRecord {
    return {
        id: String(row['id']),
        name: String(row['name']),
        description: String(row['description'] ?? ''),
        type: row['type'] as ProjectRecord['type'],
        status: row['status'] as ProjectRecord['status'],
        createdAt: String(row['created_at']),
        updatedAt: String(row['updated_at']),
        taskCount: Number(row['task_count'] ?? 0),
        openTaskCount: Number(row['open_task_count'] ?? 0),
        noteCount: Number(row['note_count'] ?? 0),
    };
}

export function mapNote(row: Record<string, unknown>): NoteRecord {
    return {
        id: String(row['id']),
        projectId: row['project_id'] ? String(row['project_id']) : null,
        title: String(row['title']),
        content: String(row['content']),
        createdAt: String(row['created_at']),
        updatedAt: String(row['updated_at']),
        locked: Boolean(row['locked']),
    };
}

export function mapTask(row: Record<string, unknown>): TaskRecord {
    return {
        id: String(row['id']),
        projectId: String(row['project_id']),
        parentId: row['parent_id'] ? String(row['parent_id']) : null,
        title: String(row['title']),
        description: String(row['description'] ?? ''),
        status: row['status'] as TaskStatus,
        priority: row['priority'] as TaskRecord['priority'],
        dueAt: row['due_at'] ? String(row['due_at']) : null,
        dueDate: row['due_date'] ? String(row['due_date']) : null,
        estimateMinutes: row['estimate_minutes'] === null ? null : Number(row['estimate_minutes']),
        createdAt: String(row['created_at']),
        updatedAt: String(row['updated_at']),
    };
}
export class WorkspaceBase {
    protected readonly db: Database.Database;
    protected readonly sessionId = randomUUID();
    constructor(db: Database.Database) {
        this.db = db;
    }

    protected getProject(id: string): ProjectRecord | undefined {
        const row = this.db
            .prepare(
                `SELECT p.*,
      (SELECT count(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS task_count,
      (SELECT count(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status NOT IN ('completed', 'cancelled')) AS open_task_count,
      (SELECT count(*) FROM notes n WHERE n.project_id = p.id AND n.deleted_at IS NULL) AS note_count
      FROM projects p WHERE p.id = ? AND p.deleted_at IS NULL`,
            )
            .get(id) as Record<string, unknown> | undefined;
        return row ? mapProject(row) : undefined;
    }

    protected getNote(id: string): NoteRecord | undefined {
        const row = this.db.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL').get(id) as
            Record<string, unknown> | undefined;
        return row ? mapNote(row) : undefined;
    }

    protected getTask(id: string): TaskRecord | undefined {
        const row = this.db.prepare('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL').get(id) as
            Record<string, unknown> | undefined;
        return row ? mapTask(row) : undefined;
    }

    protected assertProjectExists(id: string): void {
        const row = this.db.prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL').get(id);
        if (!row) throw new Error('Project not found.');
    }

    protected assertTaskExists(id: string): void {
        const row = this.db.prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL').get(id);
        if (!row) throw new Error('Task not found.');
    }

    protected assertParent(parentId: string, projectId: string, currentTaskId?: string): void {
        const row = this.db
            .prepare('SELECT id, project_id FROM tasks WHERE id = ? AND deleted_at IS NULL')
            .get(parentId) as { id: string; project_id: string } | undefined;
        if (!row || row.project_id !== projectId)
            throw new Error('A parent task must exist in the same project.');
        if (currentTaskId && currentTaskId === parentId) throw new Error('A task cannot be its own parent.');
    }

    protected scalar(sql: string, params: unknown[] = []): number {
        const row = this.db.prepare(sql).get(...params) as Record<string, unknown>;
        return Number(Object.values(row)[0] ?? 0);
    }

    protected addActivity(entityType: string, entityId: string, eventType: string, summary: string): void {
        this.db
            .prepare(
                `INSERT INTO activity_events (id, entity_type, entity_id, event_type, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(randomUUID(), entityType, entityId, eventType, summary, nowIso());
    }
}
