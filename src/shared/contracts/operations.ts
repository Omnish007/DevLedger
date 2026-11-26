import type { EntityType } from './common.ts';

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

export interface NotificationRecord {
    id: string;
    reminderId: string | null;
    entityType: 'task' | 'project' | 'contact' | 'note' | 'system';
    entityId: string | null;
    kind: 'reminder' | 'backup' | 'system';
    title: string;
    body: string;
    status: 'unread' | 'read' | 'dismissed';
    createdAt: string;
    deliveredAt: string;
    readAt: string | null;
    dismissedAt: string | null;
}

export interface NotificationDeliveryPayload {
    notifications: NotificationRecord[];
    nativeShown: boolean;
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
