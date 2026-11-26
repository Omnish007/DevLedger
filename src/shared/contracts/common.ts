import type { z } from 'zod';

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type ProjectType = 'greenfield' | 'ongoing';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'waiting' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type DocumentStatus =
    'queued' | 'extracting' | 'ocr_required' | 'indexed' | 'failed' | 'needs_attention';

export interface PageRequest {
    limit?: number | undefined;
    offset?: number | undefined;
    query?: string | undefined;
    projectId?: string | null | undefined;
    status?: TaskStatus | undefined;
    includeArchived?: boolean | undefined;
    includeCompleted?: boolean | undefined;
    includeLocked?: boolean | undefined;
}

export interface PageResult<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
}

export type EntityType = 'project' | 'note' | 'task' | 'document' | 'contact';

export type WorkspaceViewId =
    'dashboard' | 'projects' | 'notes' | 'tasks' | 'documents' | 'contacts' | 'search' | 'settings';

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
    status?: string;
}

export type InferSchema<T extends z.ZodType> = z.infer<T>;
