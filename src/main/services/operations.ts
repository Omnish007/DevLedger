import type Database from 'better-sqlite3';
import { cancelBackgroundJob, enqueueBackgroundJob } from './background-jobs.ts';
import { createTaskBlocker, listTaskBlockersPage, resolveTaskBlocker } from './operations-blockers.ts';
import { addTaskDependency, listTaskDependencies, removeTaskDependency } from './operations-dependencies.ts';
import { listActivityPage, listJobsPage } from './operations-history.ts';
import { createEntityLink, listEntityLinksPage, removeEntityLink } from './operations-links.ts';
import { resolveRecordSummaries } from './operations-mappers.ts';
import {
    createEntityReminder,
    listEntityRemindersPage,
    markEntityReminderDelivered,
    updateEntityReminder,
} from './operations-reminders.ts';
import {
    assignTag,
    createTag,
    deleteTag,
    listEntityTags,
    listTagsPage,
    unassignTag,
} from './operations-tags.ts';
import {
    addManualTaskTimeEntry,
    deleteTaskTimeEntry,
    listTaskTimeEntriesPage,
    updateTaskTimeEntry,
} from './operations-time.ts';
import type { PageRequest, PageResult, RecordSummary } from '../../shared/contracts.js';
import { mapJob } from './operations-shared.ts';
import type {
    ActivityRecord,
    BackgroundJobRecord,
    EntityLinkRecord,
    EntityType,
    ReminderRecord,
    TagRecord,
    TaskBlockerRecord,
    TimeEntryRecord,
} from './operations-shared.ts';

export type {
    ActivityRecord,
    BackgroundJobRecord,
    EntityLinkRecord,
    EntityType,
    ReminderRecord,
    TagRecord,
    TaskBlockerRecord,
    TimeEntryRecord,
} from './operations-shared.ts';

/** Operational records shared by tasks, knowledge records, reminders and persistent workers. */
export class WorkspaceOperationsService {
    private readonly db: Database.Database;
    constructor(db: Database.Database) {
        this.db = db;
    }

    listTagsPage(input: PageRequest = {}): PageResult<TagRecord> {
        return listTagsPage(this.db, input);
    }
    createTag(name: string, color = 'neutral'): TagRecord {
        return createTag(this.db, name, color);
    }
    deleteTag(tagId: string): void {
        deleteTag(this.db, tagId);
    }
    listEntityTags(entityType: EntityType, entityId: string): TagRecord[] {
        return listEntityTags(this.db, entityType, entityId);
    }
    assignTag(entityType: EntityType, entityId: string, tagId: string): void {
        assignTag(this.db, entityType, entityId, tagId);
    }
    unassignTag(entityType: EntityType, entityId: string, tagId: string): void {
        unassignTag(this.db, entityType, entityId, tagId);
    }

    createLink(
        sourceType: EntityType,
        sourceId: string,
        targetType: EntityType,
        targetId: string,
        relationship = 'related',
    ): EntityLinkRecord {
        return createEntityLink(this.db, sourceType, sourceId, targetType, targetId, relationship);
    }
    listLinksPage(
        entityType: EntityType,
        entityId: string,
        input: PageRequest = {},
    ): PageResult<EntityLinkRecord> {
        return listEntityLinksPage(this.db, entityType, entityId, input);
    }
    removeLink(linkId: string): void {
        removeEntityLink(this.db, linkId);
    }

    addDependency(taskId: string, dependsOnTaskId: string): void {
        addTaskDependency(this.db, taskId, dependsOnTaskId);
    }
    removeDependency(taskId: string, dependsOnTaskId: string): void {
        removeTaskDependency(this.db, taskId, dependsOnTaskId);
    }
    listDependencies(
        taskId: string,
        input: { dependsOn?: PageRequest | undefined; blocks?: PageRequest | undefined } = {},
    ): {
        dependsOn: PageResult<string>;
        blocks: PageResult<string>;
    } {
        return listTaskDependencies(this.db, taskId, input);
    }

    createBlocker(
        taskId: string,
        reason: string,
        waitingContactId: string | null,
        followUpAt: string | null,
    ): TaskBlockerRecord {
        return createTaskBlocker(this.db, taskId, reason, waitingContactId, followUpAt);
    }
    listBlockersPage(
        input: {
            taskId?: string | undefined;
            includeResolved?: boolean | undefined;
            limit?: number | undefined;
            offset?: number | undefined;
        } = {},
    ): PageResult<TaskBlockerRecord> {
        return listTaskBlockersPage(this.db, input);
    }
    resolveBlocker(id: string, resolutionNote = ''): TaskBlockerRecord {
        return resolveTaskBlocker(this.db, id, resolutionNote);
    }

    createReminder(
        entityType: ReminderRecord['entityType'],
        entityId: string,
        dueAt: string,
        message = '',
    ): ReminderRecord {
        return createEntityReminder(this.db, entityType, entityId, dueAt, message);
    }
    listRemindersPage(
        input: {
            entityType?: ReminderRecord['entityType'] | undefined;
            entityId?: string | undefined;
            status?: ReminderRecord['status'] | undefined;
            limit?: number | undefined;
            offset?: number | undefined;
        } = {},
    ): PageResult<ReminderRecord> {
        return listEntityRemindersPage(this.db, input);
    }
    resolveRecordSummaries(refs: Array<{ type: EntityType; id: string }>): Record<string, RecordSummary> {
        return resolveRecordSummaries(this.db, refs);
    }
    updateReminder(
        id: string,
        action: 'snooze' | 'dismiss' | 'reschedule' | 'cancel',
        dueAt?: string,
        snoozeMinutes: 15 | 60 | 240 | 1440 = 60,
    ): ReminderRecord {
        return updateEntityReminder(this.db, id, action, dueAt, snoozeMinutes);
    }
    markReminderDelivered(id: string): void {
        markEntityReminderDelivered(this.db, id);
    }

    listTimeEntriesPage(taskId: string, input: PageRequest = {}): PageResult<TimeEntryRecord> {
        return listTaskTimeEntriesPage(this.db, taskId, input);
    }
    addManualTimeEntry(taskId: string, startedAt: string, endedAt: string, note = ''): TimeEntryRecord {
        return addManualTaskTimeEntry(this.db, taskId, startedAt, endedAt, note);
    }
    updateTimeEntry(entryId: string, startedAt: string, endedAt: string, note = ''): TimeEntryRecord {
        return updateTaskTimeEntry(this.db, entryId, startedAt, endedAt, note);
    }
    deleteTimeEntry(entryId: string): void {
        deleteTaskTimeEntry(this.db, entryId);
    }

    enqueueJob(
        kind: string,
        targetType: string,
        targetId: string,
        priority = 5,
        idempotencyKey?: string,
        payload: Record<string, unknown> = {},
    ): BackgroundJobRecord {
        const row = enqueueBackgroundJob(this.db as never, kind, targetType, targetId, {
            priority,
            idempotencyKey,
            payload,
        });
        return mapJob(row as unknown as Record<string, unknown>);
    }
    enqueueMaintenanceJob(
        kind: 'search.rebuild' | 'storage.audit' | 'maintenance.optimize',
    ): BackgroundJobRecord {
        const idempotencyKey = `${kind}:${new Date().toISOString().slice(0, 16)}`;
        return this.enqueueJob(kind, 'workspace', 'local-workspace', 3, idempotencyKey);
    }
    cancelJob(id: string): 'cancelled' | 'requested' | 'not-cancellable' {
        return cancelBackgroundJob(this.db as never, id);
    }
    listJobsPage(input: PageRequest = {}): PageResult<BackgroundJobRecord> {
        return listJobsPage(this.db, input);
    }
    listActivityPage(input: PageRequest = {}): PageResult<ActivityRecord> {
        return listActivityPage(this.db, input);
    }
}
