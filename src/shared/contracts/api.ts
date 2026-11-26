import type {
    AiSummary,
    BackupCreationResult,
    OllamaStatus,
    SemanticIndexReport,
    VaultStatus,
} from './ai-vault.ts';
import type {
    EntityType,
    PageRequest,
    PageResult,
    ProjectStatus,
    RecordSummary,
    TaskStatus,
    WorkspaceNavigationTarget,
} from './common.ts';
import type {
    ActivityRecord,
    BackgroundJobRecord,
    EntityLinkRecord,
    NotificationDeliveryPayload,
    NotificationRecord,
    ReminderRecord,
    TagRecord,
    TaskBlockerRecord,
    TimeEntryRecord,
} from './operations.ts';
import type {
    ActiveTimerRecord,
    AppMetadata,
    ContactInput,
    ContactRecord,
    DashboardSummary,
    DocumentRecord,
    ImportResult,
    NoteInput,
    NoteRecord,
    ProjectImportResult,
    ProjectInput,
    ProjectRecord,
    ProtectedNoteRecord,
    SearchInput,
    SearchResult,
    TaskInput,
    TaskRecord,
    TaskRelationSummary,
} from './workspace.ts';

export interface DevLedgerApi {
    app: { getMetadata(): Promise<AppMetadata> };
    dashboard: { getSummary(): Promise<DashboardSummary> };
    contacts: {
        listPage(input?: PageRequest): Promise<PageResult<ContactRecord>>;
        get(id: string): Promise<ContactRecord | null>;
        create(input: ContactInput): Promise<ContactRecord>;
        update(id: string, input: Partial<ContactInput>): Promise<ContactRecord>;
        remove(id: string): Promise<void>;
    };
    projects: {
        listPage(input?: PageRequest): Promise<PageResult<ProjectRecord>>;
        getNames(ids: string[]): Promise<Record<string, string>>;
        create(input: ProjectInput): Promise<ProjectRecord>;
        update(
            id: string,
            input: Partial<ProjectInput> & { status?: ProjectStatus | undefined },
        ): Promise<ProjectRecord>;
        archive(id: string): Promise<void>;
        restore(id: string): Promise<ProjectRecord>;
        export(id: string): Promise<string | null>;
        import(): Promise<ProjectImportResult | null>;
    };
    notes: {
        listPage(input?: PageRequest): Promise<PageResult<NoteRecord>>;
        get(id: string): Promise<NoteRecord>;
        lock(id: string): Promise<void>;
        unlock(id: string): Promise<ProtectedNoteRecord>;
        unprotect(id: string): Promise<NoteRecord>;
        saveLocked(
            id: string,
            input: { title: string; content: string; projectId: string | null },
        ): Promise<ProtectedNoteRecord>;
        create(input: NoteInput): Promise<NoteRecord>;
        update(id: string, input: Partial<NoteInput>): Promise<NoteRecord>;
        remove(id: string): Promise<void>;
    };
    tasks: {
        listPage(input?: PageRequest): Promise<PageResult<TaskRecord>>;
        getTitles(ids: string[]): Promise<Record<string, string>>;
        relationSummaries(ids: string[]): Promise<Record<string, TaskRelationSummary>>;
        create(input: TaskInput): Promise<TaskRecord>;
        update(
            id: string,
            input: Partial<TaskInput> & { status?: TaskStatus | undefined },
        ): Promise<TaskRecord>;
        remove(id: string): Promise<void>;
        startTimer(taskId: string): Promise<string>;
        stopTimer(taskId: string): Promise<number>;
        getActiveTimer(): Promise<ActiveTimerRecord | null>;
        resolveTimerRecovery(
            taskId: string,
            action: 'resume' | 'stop' | 'discard',
            endedAt?: string,
        ): Promise<void>;
    };
    documents: {
        listPage(input?: PageRequest): Promise<PageResult<DocumentRecord>>;
        import(projectId?: string | null, protectWithVault?: boolean): Promise<ImportResult | null>;
        open(id: string): Promise<void>;
    };
    search: { query(input: SearchInput): Promise<SearchResult[]> };
    ai: {
        status(): Promise<OllamaStatus>;
        summarize(query: string, projectId?: string | null): Promise<AiSummary>;
        indexSemanticKnowledge(): Promise<SemanticIndexReport>;
        hybridSearch(query: string, projectId?: string | null): Promise<SearchResult[]>;
    };
    capture: { save(input: NoteInput): Promise<NoteRecord>; open(): Promise<void> };
    settings: { getAll(): Promise<Record<string, unknown>>; set(key: string, value: unknown): Promise<void> };
    vault: {
        status(): Promise<VaultStatus>;
        setup(passphrase: string): Promise<{ recoveryKey: string }>;
        unlock(passphrase: string, recovery?: boolean): Promise<void>;
        lock(): Promise<void>;
        changePassphrase(passphrase: string): Promise<void>;
        configureDeviceUnlock(enabled: boolean): Promise<void>;
        onAutoLock(handler: () => void): () => void;
    };
    backups: {
        create(passphrase: string): Promise<BackupCreationResult | null>;
        restoreAsCopy(secret: string, recovery?: boolean): Promise<string | null>;
        activateRestoreCopy(path: string): Promise<{ staged: boolean; restartRequired: boolean }>;
        getRestoreActivationStatus(): Promise<boolean>;
        rollbackRestoreActivation(): Promise<void>;
        commitRestoreActivation(): Promise<void>;
        chooseExternalDestination(): Promise<{ directory: string; sameVolume: boolean } | null>;
        clearExternalDestination(): Promise<void>;
        chooseOfflineDestination(): Promise<{ directory: string; sameVolume: boolean } | null>;
        clearOfflineDestination(): Promise<void>;
    };
    notifications: {
        list(
            filter?: 'all' | 'unread' | 'read' | 'dismissed',
            limit?: number,
            before?: { createdAt: string; id: string },
        ): Promise<NotificationRecord[]>;
        unreadCount(): Promise<number>;
        markRead(id: string): Promise<void>;
        snooze(id: string, minutes: 15 | 60 | 240 | 1440): Promise<void>;
        dismiss(id: string): Promise<void>;
        markAllRead(): Promise<number>;
        deliverDue(): Promise<NotificationDeliveryPayload>;
        sendTest(): Promise<NotificationRecord>;
        onDelivered(handler: (payload: NotificationDeliveryPayload) => void): () => void;
        onOpenTarget(handler: (target: WorkspaceNavigationTarget) => void): () => void;
    };
    operations: {
        listTagsPage(input?: PageRequest): Promise<PageResult<TagRecord>>;
        createTag(name: string, color?: string): Promise<TagRecord>;
        deleteTag(tagId: string): Promise<void>;
        listEntityTags(type: EntityType, id: string): Promise<TagRecord[]>;
        assignTag(type: EntityType, id: string, tagId: string): Promise<void>;
        unassignTag(type: EntityType, id: string, tagId: string): Promise<void>;
        createLink(
            sourceType: EntityType,
            sourceId: string,
            targetType: EntityType,
            targetId: string,
            relationship?: string,
        ): Promise<EntityLinkRecord>;
        listLinksPage(
            type: EntityType,
            id: string,
            input?: PageRequest,
        ): Promise<PageResult<EntityLinkRecord>>;
        removeLink(linkId: string): Promise<void>;
        addDependency(taskId: string, dependsOnTaskId: string): Promise<void>;
        removeDependency(taskId: string, dependsOnTaskId: string): Promise<void>;
        listDependencies(
            taskId: string,
            input?: { dependsOn?: PageRequest | undefined; blocks?: PageRequest | undefined },
        ): Promise<{ dependsOn: PageResult<string>; blocks: PageResult<string> }>;
        createBlocker(
            taskId: string,
            reason: string,
            waitingContactId: string | null,
            followUpAt: string | null,
        ): Promise<TaskBlockerRecord>;
        listBlockersPage(input?: {
            taskId?: string | undefined;
            includeResolved?: boolean | undefined;
            limit?: number | undefined;
            offset?: number | undefined;
        }): Promise<PageResult<TaskBlockerRecord>>;
        resolveBlocker(id: string, resolutionNote?: string): Promise<TaskBlockerRecord>;
        createReminder(
            type: ReminderRecord['entityType'],
            id: string,
            dueAt: string,
            message?: string,
        ): Promise<ReminderRecord>;
        listRemindersPage(input?: {
            entityType?: ReminderRecord['entityType'] | undefined;
            entityId?: string | undefined;
            status?: ReminderRecord['status'] | undefined;
            limit?: number | undefined;
            offset?: number | undefined;
        }): Promise<PageResult<ReminderRecord>>;
        updateReminder(
            id: string,
            action: 'snooze' | 'dismiss' | 'reschedule' | 'cancel',
            dueAt?: string,
            snoozeMinutes?: 15 | 60 | 240 | 1440,
        ): Promise<ReminderRecord>;
        resolveRecordSummaries(
            refs: Array<{ type: EntityType; id: string }>,
        ): Promise<Record<string, RecordSummary>>;
        listTimeEntriesPage(taskId: string, input?: PageRequest): Promise<PageResult<TimeEntryRecord>>;
        addManualTimeEntry(
            taskId: string,
            startedAt: string,
            endedAt: string,
            note?: string,
        ): Promise<TimeEntryRecord>;
        updateTimeEntry(
            entryId: string,
            startedAt: string,
            endedAt: string,
            note?: string,
        ): Promise<TimeEntryRecord>;
        deleteTimeEntry(entryId: string): Promise<void>;
        listActivityPage(input?: PageRequest): Promise<PageResult<ActivityRecord>>;
        listJobsPage(input?: PageRequest): Promise<PageResult<BackgroundJobRecord>>;
        enqueueJob(
            kind: 'search.rebuild' | 'storage.audit' | 'maintenance.optimize',
        ): Promise<BackgroundJobRecord>;
        cancelJob(id: string): Promise<void>;
    };
}
