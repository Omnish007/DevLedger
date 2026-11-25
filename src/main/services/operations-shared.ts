export type EntityType = 'project' | 'note' | 'task' | 'document' | 'contact';
export interface TagRecord {
    id: string;
    name: string;
    color: string;
    createdAt: string;
}
export interface EntityLinkRecord {
    id: string;
    sourceType: EntityType;
    sourceId: string;
    targetType: EntityType;
    targetId: string;
    relationship: string;
    createdAt: string;
    direction: 'outgoing' | 'incoming';
}
export interface ReminderRecord {
    id: string;
    entityType: 'task' | 'project' | 'contact' | 'note';
    entityId: string;
    dueAt: string;
    status: 'scheduled' | 'delivered' | 'snoozed' | 'dismissed' | 'cancelled';
    message: string;
    lastDeliveredAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface TimeEntryRecord {
    id: string;
    taskId: string;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
    note: string;
    active: boolean;
    createdAt: string;
}
export interface TaskBlockerRecord {
    id: string;
    taskId: string;
    reason: string;
    waitingContactId: string | null;
    followUpAt: string | null;
    createdAt: string;
    resolvedAt: string | null;
    resolutionNote: string;
}
export interface ActivityRecord {
    id: string;
    entityType: string;
    entityId: string;
    eventType: string;
    summary: string;
    createdAt: string;
}
export interface BackgroundJobRecord {
    id: string;
    kind: string;
    targetType: string;
    targetId: string;
    priority: number;
    status: string;
    attempts: number;
    maxAttempts: number;
    progress: Record<string, unknown>;
    result: Record<string, unknown> | null;
    errorMessage: string | null;
    cancelRequestedAt: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    updatedAt: string;
}

export const now = () => new Date().toISOString();
export const ENTITY_TYPES = new Set<EntityType>(['project', 'note', 'task', 'document', 'contact']);
export const REMINDER_TYPES = new Set(['task', 'project', 'contact', 'note']);

export function mapTag(row: Record<string, unknown>): TagRecord {
    return {
        id: String(row['id']),
        name: String(row['name']),
        color: String(row['color']),
        createdAt: String(row['created_at']),
    };
}
export function mapReminder(row: Record<string, unknown>): ReminderRecord {
    return {
        id: String(row['id']),
        entityType: row['entity_type'] as ReminderRecord['entityType'],
        entityId: String(row['entity_id']),
        dueAt: String(row['due_at']),
        status: row['status'] as ReminderRecord['status'],
        message: String(row['message']),
        lastDeliveredAt: row['last_delivered_at'] ? String(row['last_delivered_at']) : null,
        createdAt: String(row['created_at']),
        updatedAt: String(row['updated_at']),
    };
}
export function mapTimeEntry(row: Record<string, unknown>): TimeEntryRecord {
    return {
        id: String(row['id']),
        taskId: String(row['task_id']),
        startedAt: String(row['started_at']),
        endedAt: row['ended_at'] ? String(row['ended_at']) : null,
        durationSeconds: row['duration_seconds'] === null ? null : Number(row['duration_seconds']),
        note: String(row['note']),
        active: Boolean(row['is_active']),
        createdAt: String(row['created_at']),
    };
}
export function mapBlocker(row: Record<string, unknown>): TaskBlockerRecord {
    return {
        id: String(row['id']),
        taskId: String(row['task_id']),
        reason: String(row['reason']),
        waitingContactId: row['waiting_contact_id'] ? String(row['waiting_contact_id']) : null,
        followUpAt: row['follow_up_at'] ? String(row['follow_up_at']) : null,
        createdAt: String(row['created_at']),
        resolvedAt: row['resolved_at'] ? String(row['resolved_at']) : null,
        resolutionNote: String(row['resolution_note']),
    };
}
export function mapJob(row: Record<string, unknown>): BackgroundJobRecord {
    let progress: Record<string, unknown> = {};
    try {
        progress = JSON.parse(String(row['progress_json'] ?? '{}')) as Record<string, unknown>;
    } catch {
        progress = {};
    }
    let result: Record<string, unknown> | null = null;
    try {
        if (typeof row['result_json'] === 'string' && row['result_json'])
            result = JSON.parse(row['result_json']) as Record<string, unknown>;
    } catch {
        result = null;
    }
    return {
        id: String(row['id']),
        kind: String(row['kind']),
        targetType: String(row['target_type']),
        targetId: String(row['target_id']),
        priority: Number(row['priority']),
        status: String(row['status']),
        attempts: Number(row['attempts']),
        maxAttempts: Number(row['max_attempts']),
        progress,
        result,
        errorMessage: row['error_message'] ? String(row['error_message']) : null,
        cancelRequestedAt: row['cancel_requested_at'] ? String(row['cancel_requested_at']) : null,
        createdAt: String(row['created_at']),
        startedAt: row['started_at'] ? String(row['started_at']) : null,
        completedAt: row['completed_at'] ? String(row['completed_at']) : null,
        updatedAt: String(row['updated_at']),
    };
}
