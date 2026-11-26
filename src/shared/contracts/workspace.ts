import type { DocumentStatus, ProjectStatus, ProjectType, TaskPriority, TaskStatus } from './common.ts';
import type { ActivityRecord, ReminderRecord } from './operations.ts';

export interface ContactRecord {
    id: string;
    name: string;
    role: string;
    company: string;
    email: string;
    phone: string;
    notes: string;
    customAttributes: Record<string, string>;
    projectIds: string[];
    createdAt: string;
    updatedAt: string;
}

export interface ContactInput {
    name: string;
    role?: string | undefined;
    company?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    notes?: string | undefined;
    customAttributes?: Record<string, string> | undefined;
    projectId?: string | null | undefined;
}

export interface ProjectImportResult {
    projectId: string;
    projectName: string;
    lockedNotesSkipped: number;
    imported: {
        contacts: number;
        notes: number;
        tasks: number;
        documents: number;
        tags: number;
        links: number;
        timeEntries: number;
        reminders: number;
    };
}

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

export interface ProtectedNoteRecord {
    id: string;
    projectId: string | null;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    locked: true;
}

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

export interface ActiveTimerRecord {
    taskId: string;
    startedAt: string;
    lastHeartbeatAt: string | null;
    recoveryRequired: boolean;
}

export interface TaskRelationSummary {
    dependsOnOpen: number;
    dependsOnTotal: number;
    blocksCount: number;
    linkCount: number;
    activeBlockerId: string | null;
    activeBlockerReason: string | null;
    waitingContactId: string | null;
    waitingContactName: string | null;
    blockerFollowUpAt: string | null;
    firstPrereqId: string | null;
    firstPrereqTitle: string | null;
}

export interface DashboardBlockedItem {
    task: TaskRecord;
    blockerId: string;
    reason: string;
    waitingContactId: string | null;
    waitingContactName: string | null;
    followUpAt: string | null;
}

export interface DashboardReminderItem {
    id: string;
    entityType: 'task' | 'project' | 'contact' | 'note';
    entityId: string;
    entityTitle: string;
    projectId: string | null;
    dueAt: string;
    status: ReminderRecord['status'];
    message: string;
}

export interface DashboardChecklistItem {
    noteId: string;
    noteTitle: string;
    projectId: string | null;
    text: string;
    updatedAt: string;
}

export interface DashboardActiveTimerDetail {
    taskId: string;
    taskTitle: string;
    projectId: string;
    startedAt: string;
    recoveryRequired: boolean;
}

export interface DashboardSummary {
    activeProjects: number;
    openTasks: number;
    overdueTasks: number;
    blockedTasks: number;
    recentNotes: NoteRecord[];
    upcomingTasks: TaskRecord[];
    activeTimers: number;
    pendingDocuments: number;
    overdueTaskItems: TaskRecord[];
    blockedItems: DashboardBlockedItem[];
    waitingTasks: TaskRecord[];
    readyTasks: TaskRecord[];
    dueReminders: DashboardReminderItem[];
    noteActionItems: DashboardChecklistItem[];
    activeTimerDetail: DashboardActiveTimerDetail | null;
    attentionDocumentCount: number;
    recentActivity: ActivityRecord[];
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

export interface AppMetadata {
    appName: string;
    version: string;
    dataDirectory: string;
    platform: string;
}
