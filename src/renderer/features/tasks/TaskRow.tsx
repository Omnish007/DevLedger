import {
    AlertCircle,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Circle,
    CircleDot,
    GitBranch,
    Link2,
    PauseCircle,
    Pencil,
    Play,
    Square,
    Trash2,
    UserRound,
    XCircle,
} from 'lucide-react';
import type {
    ActiveTimerRecord,
    TaskRecord,
    TaskRelationSummary,
    TaskStatus,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from '@/lib/utils';
import { statuses } from './task-form-schema';

interface TaskRowProps {
    task: TaskRecord;
    depth: number;
    hasChildren: boolean;
    contextOnly: boolean;
    collapsed: boolean;
    projectName: string;
    activeTimer: ActiveTimerRecord | null;
    relations?: TaskRelationSummary | undefined;
    busy: boolean;
    onToggleCollapse: (id: string) => void;
    onInspect: (id: string) => void;
    onStatusChange: (id: string, status: TaskStatus) => void;
    onEdit: (task: TaskRecord) => void;
    onStartTimer: (id: string) => void;
    onStopTimer: (id: string) => void;
    onDelete: (task: TaskRecord) => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}

const PRIORITY_TONE: Record<TaskRecord['priority'], string> = {
    urgent: 'bg-danger',
    high: 'bg-warning',
    medium: 'bg-primary',
    low: 'bg-muted-foreground/50',
};

const STATUS_DOT: Record<TaskStatus, string> = {
    not_started: 'bg-muted-foreground/50',
    in_progress: 'bg-primary',
    waiting: 'bg-info',
    blocked: 'bg-warning',
    completed: 'bg-success',
    cancelled: 'bg-muted-foreground/40',
};

export function TaskRow({
    task,
    depth,
    hasChildren,
    contextOnly,
    collapsed,
    projectName,
    activeTimer,
    relations,
    busy,
    onToggleCollapse,
    onInspect,
    onStatusChange,
    onEdit,
    onStartTimer,
    onStopTimer,
    onDelete,
    onNavigateTarget,
}: TaskRowProps) {
    const isCompleted = task.status === 'completed';
    const isRunning = activeTimer?.taskId === task.id;
    const rawDue = task.dueDate ?? task.dueAt;
    const dueMs = rawDue ? Date.parse(rawDue.length === 10 ? `${rawDue}T23:59:59` : rawDue) : NaN;
    const overdue =
        !isCompleted && task.status !== 'cancelled' && Number.isFinite(dueMs) && dueMs < Date.now();
    const hasMetaLine = Boolean(
        task.description ||
        task.estimateMinutes !== null ||
        task.parentId ||
        relations?.activeBlockerReason ||
        relations?.waitingContactName ||
        (relations?.dependsOnOpen ?? 0) > 0 ||
        (relations?.blocksCount ?? 0) > 0 ||
        (relations?.linkCount ?? 0) > 0,
    );

    return (
        <div
            className={`task-row group grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/65 px-3 @[780px]:grid-cols-[minmax(200px,1.5fr)_128px_138px_86px_106px_104px] @[780px]:gap-3 @[780px]:px-4 ${contextOnly ? 'bg-surface-subtle/40 opacity-80' : ''} ${isRunning ? 'bg-primary/[0.04]' : ''}`}
        >
            <div className="flex min-w-0 items-center gap-2">
                {depth > 0 && (
                    <span
                        className="h-4 shrink-0 border-l border-border/70"
                        style={{ width: `${Math.min(depth, 5) * 14}px` }}
                        aria-hidden="true"
                    />
                )}
                {hasChildren ? (
                    <button
                        type="button"
                        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${task.title}`}
                        onClick={() => onToggleCollapse(task.id)}
                    >
                        {collapsed ? (
                            <ChevronRight className="size-3.5" />
                        ) : (
                            <ChevronDown className="size-3.5" />
                        )}
                    </button>
                ) : (
                    <span className="size-6 shrink-0" aria-hidden="true" />
                )}
                <button
                    type="button"
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                    aria-label={isCompleted ? 'Reopen task' : 'Complete task'}
                    onClick={() => onStatusChange(task.id, isCompleted ? 'not_started' : 'completed')}
                >
                    {isCompleted ? (
                        <CheckCircle2 className="size-4 text-success" />
                    ) : task.status === 'blocked' ? (
                        <AlertCircle className="size-4 text-warning" />
                    ) : task.status === 'in_progress' ? (
                        <CircleDot className="size-4 text-primary" />
                    ) : task.status === 'waiting' ? (
                        <PauseCircle className="size-4 text-info" />
                    ) : task.status === 'cancelled' ? (
                        <XCircle className="size-4 text-muted-foreground/60" />
                    ) : (
                        <Circle className="size-4" />
                    )}
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onInspect(task.id)}
                            className={`inline-flex min-h-6 max-w-full items-center truncate text-left text-sm font-medium transition-colors hover:text-primary ${isCompleted ? 'text-muted-foreground line-through' : ''}`}
                        >
                            {task.title}
                        </button>
                        {isRunning && (
                            <Badge variant="info" className="shrink-0">
                                Running
                            </Badge>
                        )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
                        {relations?.waitingContactName ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-info-subtle px-1.5 py-0.5 text-xs font-medium text-info-foreground">
                                <UserRound className="size-3" />
                                Waiting: {relations.waitingContactName}
                            </span>
                        ) : relations?.activeBlockerReason ? (
                            <span className="inline-flex max-w-[200px] shrink-0 items-center gap-1 truncate rounded bg-warning-subtle px-1.5 py-0.5 text-xs font-medium text-warning-foreground">
                                Blocked: {relations.activeBlockerReason}
                            </span>
                        ) : null}
                        {(relations?.dependsOnOpen ?? 0) > 0 && (
                            <span className="inline-flex max-w-[180px] shrink-0 items-center gap-1 rounded border border-border/80 bg-surface-subtle px-1.5 py-0.5 text-xs text-muted-foreground">
                                <GitBranch className="size-3 shrink-0" />
                                <span className="truncate">
                                    {relations!.dependsOnOpen === 1 && relations!.firstPrereqTitle
                                        ? `After ${relations!.firstPrereqTitle}`
                                        : `${relations!.dependsOnOpen} prerequisites`}
                                </span>
                            </span>
                        )}
                        {(relations?.blocksCount ?? 0) > 0 && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-muted-foreground">
                                Unlocks {relations!.blocksCount}
                            </span>
                        )}
                        {(relations?.linkCount ?? 0) > 0 && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-muted-foreground">
                                <Link2 className="size-3" />
                                {relations!.linkCount}
                            </span>
                        )}
                        {task.description && <span className="min-w-0 truncate">{task.description}</span>}
                        {task.parentId && <span className="shrink-0">· Subtask</span>}
                        {task.estimateMinutes !== null && (
                            <span className="shrink-0 tabular-nums">· {task.estimateMinutes}m</span>
                        )}
                        <span className="shrink-0 capitalize @[780px]:hidden">
                            {hasMetaLine ? '· ' : ''}
                            {projectName} · {task.status.replaceAll('_', ' ')}
                        </span>
                    </div>
                </div>
            </div>

            <div className="hidden min-w-0 @[780px]:block">
                <button
                    type="button"
                    onClick={() => onNavigateTarget({ view: 'projects', recordId: task.projectId })}
                    className="inline-flex min-h-6 max-w-full items-center rounded-md bg-surface-subtle/90 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                    <span className="truncate">{projectName}</span>
                </button>
            </div>

            <div className="task-status-cell hidden @[780px]:block">
                <Select value={task.status} onValueChange={(v) => onStatusChange(task.id, v as TaskStatus)}>
                    <SelectTrigger
                        aria-label={`Status for ${task.title}`}
                        size="sm"
                        className="h-8 w-full whitespace-nowrap border-border/75 bg-surface-subtle/50 px-2.5 text-xs font-medium shadow-none hover:border-border hover:bg-surface-subtle"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {statuses.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                    <span
                                        className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[s.value]}`}
                                    />
                                    {s.label}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="task-priority-cell hidden items-center gap-1.5 text-xs capitalize @[780px]:flex">
                <span className={`size-2 rounded-full ${PRIORITY_TONE[task.priority]}`} aria-hidden="true" />
                <span
                    className={
                        task.priority === 'urgent' ? 'font-medium text-danger' : 'text-muted-foreground'
                    }
                >
                    {task.priority}
                </span>
            </div>

            <div
                className={`task-due-cell hidden items-center gap-1.5 text-xs tabular-nums @[780px]:flex ${overdue ? 'font-medium text-danger' : 'text-muted-foreground'}`}
            >
                {rawDue ? (
                    <>
                        <CalendarClock className="size-3.5 shrink-0 opacity-80" />
                        <span>{formatDate(rawDue)}</span>
                    </>
                ) : (
                    <span className="opacity-50">—</span>
                )}
            </div>

            <div className="flex items-center justify-end gap-0.5">
                <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground opacity-75 transition-opacity hover:text-foreground group-hover:opacity-100"
                    aria-label={`Edit ${task.title}`}
                    onClick={() => onEdit(task)}
                >
                    <Pencil className="size-3.5" />
                </Button>
                {isRunning ? (
                    <Button
                        size="icon"
                        variant="secondary"
                        className="size-8"
                        aria-label={`Stop timer for ${task.title}`}
                        title="Stop timer"
                        disabled={busy}
                        onClick={() => onStopTimer(task.id)}
                    >
                        <Square className="size-3" />
                    </Button>
                ) : (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground opacity-75 transition-opacity hover:text-foreground group-hover:opacity-100"
                        aria-label={`Start timer for ${task.title}`}
                        title="Start timer"
                        disabled={
                            busy || Boolean(activeTimer) || ['completed', 'cancelled'].includes(task.status)
                        }
                        onClick={() => onStartTimer(task.id)}
                    >
                        <Play className="size-3.5" />
                    </Button>
                )}
                <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground opacity-75 transition-opacity hover:text-danger group-hover:opacity-100"
                    aria-label={`Move ${task.title} to trash`}
                    disabled={busy}
                    onClick={() => onDelete(task)}
                >
                    <Trash2 className="size-3.5" />
                </Button>
            </div>
        </div>
    );
}
