import type { z } from 'zod';

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type ProjectType = 'greenfield' | 'ongoing';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'waiting' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type DocumentStatus = 'queued' | 'extracting' | 'ocr_required' | 'indexed' | 'failed' | 'needs_attention';

export interface PageRequest { limit?: number | undefined; offset?: number | undefined; query?: string | undefined; projectId?: string | null | undefined; status?: TaskStatus | undefined; includeArchived?: boolean | undefined; includeCompleted?: boolean | undefined; includeLocked?: boolean | undefined; }
export interface PageResult<T> { items: T[]; total: number; limit: number; offset: number; hasMore: boolean; }

export interface ContactRecord {
  id: string; name: string; role: string; company: string; email: string; phone: string; notes: string; customAttributes: Record<string, string>; projectIds: string[]; createdAt: string; updatedAt: string;
}

export interface ContactInput { name: string; role?: string | undefined; company?: string | undefined; email?: string | undefined; phone?: string | undefined; notes?: string | undefined; customAttributes?: Record<string, string> | undefined; projectId?: string | null | undefined; }

export interface ProjectImportResult { projectId: string; projectName: string; lockedNotesSkipped: number; imported: { contacts: number; notes: number; tasks: number; documents: number; tags: number; links: number; timeEntries: number; reminders: number }; }

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  openTaskCount: number;
  noteCount: number;
}

export interface VaultStatus { configured: boolean; unlocked: boolean; }
export interface ProtectedNoteRecord { id: string; projectId: string | null; title: string; content: string; createdAt: string; updatedAt: string; locked: true; }

export interface NoteRecord {
  id: string;
  projectId: string | null;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  locked: boolean;
}

export interface TaskRecord {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  projectId: string | null;
  title: string;
  originalName: string;
  mediaType: string;
  extension: string;
  sizeBytes: number;
  status: DocumentStatus;
  createdAt: string;
  extractedText: string;
  extractionError: string | null;
  encrypted: boolean;
}

export interface SearchResult {
  id: string;
  type: 'project' | 'note' | 'task' | 'document' | 'contact';
  title: string;
  excerpt: string;
  projectId: string | null;
  updatedAt: string;
}

export interface ActiveTimerRecord { taskId: string; startedAt: string; lastHeartbeatAt: string | null; recoveryRequired: boolean; }

export interface DashboardSummary {
  activeProjects: number;
  openTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  recentNotes: NoteRecord[];
  upcomingTasks: TaskRecord[];
  activeTimers: number;
  pendingDocuments: number;
}

export interface ProjectInput {
  name: string;
  description?: string | undefined;
  type: ProjectType;
}

export interface NoteInput {
  projectId?: string | null | undefined;
  title: string;
  content: string;
}

export interface TaskInput {
  projectId: string;
  parentId?: string | null | undefined;
  title: string;
  description?: string | undefined;
  priority?: TaskPriority | undefined;
  dueAt?: string | null | undefined;
  dueDate?: string | null | undefined;
  estimateMinutes?: number | null | undefined;
}

export interface SearchInput {
  query: string;
  projectId?: string | null | undefined;
  types?: Array<SearchResult['type']> | undefined;
  limit?: number | undefined;
}

export interface ImportResult {
  document: DocumentRecord;
  warning?: string;
}

export interface BackupCreationResult { path: string; recoveryKey: string; }

export interface OllamaStatus { available: boolean; baseUrl: string; models: string[]; error: string | null; }
export interface AiSummary { summary: string; model: string; citations: SearchResult[]; cached: boolean; }
export interface SemanticIndexReport { model: string; sources: number; chunks: number; completedAt: string; }

export interface AppMetadata {
  appName: string;
  version: string;
  dataDirectory: string;
  platform: string;
}


export type EntityType = 'project' | 'note' | 'task' | 'document' | 'contact';
export interface TagRecord { id: string; name: string; color: string; createdAt: string; }
export interface EntityLinkRecord { id: string; sourceType: EntityType; sourceId: string; targetType: EntityType; targetId: string; relationship: string; createdAt: string; direction: 'outgoing' | 'incoming'; }
export interface ReminderRecord { id: string; entityType: 'task' | 'project' | 'contact' | 'note'; entityId: string; dueAt: string; status: 'scheduled' | 'delivered' | 'snoozed' | 'dismissed' | 'cancelled'; message: string; lastDeliveredAt: string | null; createdAt: string; updatedAt: string; }
export interface NotificationRecord { id: string; reminderId: string | null; entityType: 'task' | 'project' | 'contact' | 'note' | 'system'; entityId: string | null; kind: 'reminder' | 'backup' | 'system'; title: string; body: string; status: 'unread' | 'read' | 'dismissed'; createdAt: string; deliveredAt: string; readAt: string | null; dismissedAt: string | null; }
export interface TimeEntryRecord { id: string; taskId: string; startedAt: string; endedAt: string | null; durationSeconds: number | null; note: string; active: boolean; createdAt: string; }
export interface TaskBlockerRecord { id: string; taskId: string; reason: string; waitingContactId: string | null; followUpAt: string | null; createdAt: string; resolvedAt: string | null; resolutionNote: string; }
export interface ActivityRecord { id: string; entityType: string; entityId: string; eventType: string; summary: string; createdAt: string; }
export interface BackgroundJobRecord { id: string; kind: string; targetType: string; targetId: string; priority: number; status: string; attempts: number; maxAttempts: number; progress: Record<string, unknown>; result: Record<string, unknown> | null; errorMessage: string | null; cancelRequestedAt: string | null; createdAt: string; startedAt: string | null; completedAt: string | null; updatedAt: string; }

export type WorkspaceViewId = 'dashboard' | 'projects' | 'notes' | 'tasks' | 'documents' | 'contacts' | 'search' | 'settings';
export interface WorkspaceNavigationTarget {
  view: WorkspaceViewId;
  recordId?: string;
  projectId?: string | null;
  tag?: string;
}

export interface RecordSummary {
  id: string;
  type: EntityType;
  title: string;
  subtitle: string;
  projectId: string | null;
}

export interface DevLedgerApi {
  app: { getMetadata(): Promise<AppMetadata> };
  dashboard: { getSummary(): Promise<DashboardSummary> };
  contacts: { listPage(input?: PageRequest): Promise<PageResult<ContactRecord>>; get(id: string): Promise<ContactRecord | null>; create(input: ContactInput): Promise<ContactRecord>; update(id: string, input: Partial<ContactInput>): Promise<ContactRecord>; remove(id: string): Promise<void> };
  projects: {
    listPage(input?: PageRequest): Promise<PageResult<ProjectRecord>>;
    getNames(ids: string[]): Promise<Record<string, string>>;
    create(input: ProjectInput): Promise<ProjectRecord>;
    update(id: string, input: Partial<ProjectInput> & { status?: ProjectStatus | undefined }): Promise<ProjectRecord>;
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
    saveLocked(id: string, input: { title: string; content: string; projectId: string | null }): Promise<ProtectedNoteRecord>;
    create(input: NoteInput): Promise<NoteRecord>;
    update(id: string, input: Partial<NoteInput>): Promise<NoteRecord>;
    remove(id: string): Promise<void>;
  };
  tasks: {
    listPage(input?: PageRequest): Promise<PageResult<TaskRecord>>;
    getTitles(ids: string[]): Promise<Record<string, string>>;
    create(input: TaskInput): Promise<TaskRecord>;
    update(id: string, input: Partial<TaskInput> & { status?: TaskStatus | undefined }): Promise<TaskRecord>;
    remove(id: string): Promise<void>;
    startTimer(taskId: string): Promise<string>;
    stopTimer(taskId: string): Promise<number>;
    getActiveTimer(): Promise<ActiveTimerRecord | null>;
    resolveTimerRecovery(taskId: string, action: 'resume' | 'stop' | 'discard', endedAt?: string): Promise<void>;
  };
  documents: {
    listPage(input?: PageRequest): Promise<PageResult<DocumentRecord>>;
    import(projectId?: string | null, protectWithVault?: boolean): Promise<ImportResult | null>;
    open(id: string): Promise<void>;
  };
  search: { query(input: SearchInput): Promise<SearchResult[]> };
  ai: { status(): Promise<OllamaStatus>; summarize(query: string, projectId?: string | null): Promise<AiSummary>; indexSemanticKnowledge(): Promise<SemanticIndexReport>; hybridSearch(query: string, projectId?: string | null): Promise<SearchResult[]>; };
  capture: { save(input: NoteInput): Promise<NoteRecord>; open(): Promise<void> };
  settings: { getAll(): Promise<Record<string, unknown>>; set(key: string, value: unknown): Promise<void> };
  vault: { status(): Promise<VaultStatus>; setup(passphrase: string): Promise<{ recoveryKey: string }>; unlock(passphrase: string, recovery?: boolean): Promise<void>; lock(): Promise<void>; changePassphrase(passphrase: string): Promise<void>; configureDeviceUnlock(enabled: boolean): Promise<void>; onAutoLock(handler: () => void): () => void };
  backups: { create(passphrase: string): Promise<BackupCreationResult | null>; restoreAsCopy(secret: string, recovery?: boolean): Promise<string | null>; activateRestoreCopy(path: string): Promise<{ staged: boolean; restartRequired: boolean }>; getRestoreActivationStatus(): Promise<boolean>; rollbackRestoreActivation(): Promise<void>; commitRestoreActivation(): Promise<void>; chooseExternalDestination(): Promise<{ directory: string; sameVolume: boolean } | null>; clearExternalDestination(): Promise<void>; chooseOfflineDestination(): Promise<{ directory: string; sameVolume: boolean } | null>; clearOfflineDestination(): Promise<void> };
  notifications: { list(filter?: 'all' | 'unread' | 'read' | 'dismissed', limit?: number, before?: { createdAt: string; id: string }): Promise<NotificationRecord[]>; unreadCount(): Promise<number>; markRead(id: string): Promise<void>; snooze(id: string, minutes: 15 | 60 | 240 | 1440): Promise<void>; dismiss(id: string): Promise<void>; markAllRead(): Promise<number>; };
  operations: {
    listTagsPage(input?: PageRequest): Promise<PageResult<TagRecord>>; createTag(name: string, color?: string): Promise<TagRecord>; deleteTag(tagId: string): Promise<void>;
    listEntityTags(type: EntityType, id: string): Promise<TagRecord[]>; assignTag(type: EntityType, id: string, tagId: string): Promise<void>; unassignTag(type: EntityType, id: string, tagId: string): Promise<void>;
    createLink(sourceType: EntityType, sourceId: string, targetType: EntityType, targetId: string, relationship?: string): Promise<EntityLinkRecord>; listLinksPage(type: EntityType, id: string, input?: PageRequest): Promise<PageResult<EntityLinkRecord>>; removeLink(linkId: string): Promise<void>;
    addDependency(taskId: string, dependsOnTaskId: string): Promise<void>; removeDependency(taskId: string, dependsOnTaskId: string): Promise<void>; listDependencies(taskId: string, input?: { dependsOn?: PageRequest | undefined; blocks?: PageRequest | undefined }): Promise<{ dependsOn: PageResult<string>; blocks: PageResult<string> }>;
    createBlocker(taskId: string, reason: string, waitingContactId: string | null, followUpAt: string | null): Promise<TaskBlockerRecord>; listBlockersPage(input?: { taskId?: string | undefined; includeResolved?: boolean | undefined; limit?: number | undefined; offset?: number | undefined }): Promise<PageResult<TaskBlockerRecord>>; resolveBlocker(id: string, resolutionNote?: string): Promise<TaskBlockerRecord>;
    createReminder(type: ReminderRecord['entityType'], id: string, dueAt: string, message?: string): Promise<ReminderRecord>; listRemindersPage(input?: { entityType?: ReminderRecord['entityType'] | undefined; entityId?: string | undefined; status?: ReminderRecord['status'] | undefined; limit?: number | undefined; offset?: number | undefined }): Promise<PageResult<ReminderRecord>>; updateReminder(id: string, action: 'snooze' | 'dismiss' | 'reschedule' | 'cancel', dueAt?: string, snoozeMinutes?: 15 | 60 | 240 | 1440): Promise<ReminderRecord>;
    resolveRecordSummaries(refs: Array<{ type: EntityType; id: string }>): Promise<Record<string, RecordSummary>>;
    listTimeEntriesPage(taskId: string, input?: PageRequest): Promise<PageResult<TimeEntryRecord>>; addManualTimeEntry(taskId: string, startedAt: string, endedAt: string, note?: string): Promise<TimeEntryRecord>; updateTimeEntry(entryId: string, startedAt: string, endedAt: string, note?: string): Promise<TimeEntryRecord>; deleteTimeEntry(entryId: string): Promise<void>;
    listActivityPage(input?: PageRequest): Promise<PageResult<ActivityRecord>>; listJobsPage(input?: PageRequest): Promise<PageResult<BackgroundJobRecord>>; enqueueJob(kind: 'search.rebuild' | 'storage.audit' | 'maintenance.optimize'): Promise<BackgroundJobRecord>; cancelJob(id: string): Promise<void>;
  };
}

export type InferSchema<T extends z.ZodType> = z.infer<T>;
