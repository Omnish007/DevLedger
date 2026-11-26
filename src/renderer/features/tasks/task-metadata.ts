import type { TaskPriority, TaskStatus } from '@shared/contracts';

export const TASK_PRIORITY_TONE: Record<TaskPriority, string> = {
    urgent: 'bg-danger',
    high: 'bg-warning',
    medium: 'bg-primary',
    low: 'bg-muted-foreground/50',
};

export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
    not_started: 'bg-muted-foreground/50',
    in_progress: 'bg-primary',
    waiting: 'bg-info',
    blocked: 'bg-warning',
    completed: 'bg-success',
    cancelled: 'bg-muted-foreground/40',
};

export const TASK_STATUS_VARIANT: Record<
    TaskStatus,
    'outline' | 'info' | 'secondary' | 'warning' | 'success'
> = {
    not_started: 'outline',
    in_progress: 'info',
    waiting: 'secondary',
    blocked: 'warning',
    completed: 'success',
    cancelled: 'secondary',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
    not_started: 'Not started',
    in_progress: 'In progress',
    waiting: 'Waiting',
    blocked: 'Blocked',
    completed: 'Completed',
    cancelled: 'Cancelled',
};
