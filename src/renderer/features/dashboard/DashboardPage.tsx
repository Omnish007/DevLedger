import {
    AlarmClock,
    AlertTriangle,
    ArrowUpRight,
    Check,
    CheckCircle2,
    Circle,
    Clock3,
    FileClock,
    FolderKanban,
    LockKeyhole,
    NotebookPen,
    PauseCircle,
    Play,
    Square,
    SquareCheckBig,
    Timer,
    UserRound,
} from 'lucide-react';
import type { DashboardSummary, ProjectRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { formatDate, formatRelative } from '@/lib/utils';
import { stripHtmlToPlainText as cleanHtml } from '@domain/html-text';

interface Props {
    summary: DashboardSummary | null;
    projects: ProjectRecord[];
    loading: boolean;
    onNavigate: (view: 'projects' | 'notes' | 'tasks' | 'documents') => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
    onCompleteTask?: (taskId: string) => Promise<void>;
    onResolveBlocker?: (blockerId: string) => Promise<void>;
    onStartTimer?: (taskId: string) => Promise<void>;
    onStopTimer?: (taskId: string) => Promise<void>;
    onReminderAction?: (id: string, action: 'snooze' | 'dismiss') => Promise<void>;
}

export function DashboardPage({
    summary,
    projects,
    loading,
    onNavigate,
    onNavigateTarget,
    onCompleteTask,
    onResolveBlocker,
    onStartTimer,
    onStopTimer,
    onReminderAction,
}: Props) {
    const todayLabel = new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    }).format(new Date());
    const active = projects.filter((project) => project.status === 'active');
    const projectName = (projectId: string | null) =>
        (projectId ? projects.find((p) => p.id === projectId)?.name : undefined) ?? 'Project';

    const overdueItems = summary?.overdueTaskItems ?? [];
    const blockedItems = summary?.blockedItems ?? [];
    const waitingItems = summary?.waitingTasks ?? [];
    const dueReminders = summary?.dueReminders ?? [];
    const readyTasks = summary?.readyTasks ?? [];
    const noteActionItems = summary?.noteActionItems ?? [];
    const attentionCount = (summary?.overdueTasks ?? 0) + (summary?.blockedTasks ?? 0) + dueReminders.length;
    const hasAttentionQueue =
        overdueItems.length > 0 ||
        blockedItems.length > 0 ||
        waitingItems.length > 0 ||
        dueReminders.length > 0;
    const timerDetail = summary?.activeTimerDetail ?? null;

    const storySubtitle = loading
        ? undefined
        : summary
          ? `${readyTasks.length} ready to start · ${attentionCount} ${attentionCount === 1 ? 'needs' : 'need'} attention · ${noteActionItems.length} open ${noteActionItems.length === 1 ? 'checklist' : 'checklists'} in notes`
          : undefined;

    const metrics: Array<{
        label: string;
        hint: string;
        value: number | string;
        onClick: () => void;
        tone: 'neutral' | 'warning' | 'danger';
        icon: typeof FolderKanban;
    }> = [
        {
            label: 'Ready to build',
            hint: summary ? `${summary.openTasks} total open tasks` : 'Unblocked tasks',
            value: loading ? '—' : readyTasks.length,
            onClick: () => onNavigate('tasks'),
            tone: 'neutral',
            icon: CheckCircle2,
        },
        {
            label: 'Overdue',
            hint: summary?.overdueTasks ? 'Past deadline' : 'Deadlines clear',
            value: loading ? '—' : (summary?.overdueTasks ?? 0),
            onClick: () => onNavigateTarget({ view: 'tasks' }),
            tone: summary?.overdueTasks ? 'danger' : 'neutral',
            icon: Clock3,
        },
        {
            label: 'Blocked & waiting',
            hint:
                blockedItems.length || waitingItems.length
                    ? `${waitingItems.length} waiting externally`
                    : 'No active blockers',
            value: loading ? '—' : (summary?.blockedTasks ?? 0) + waitingItems.length,
            onClick: () => onNavigateTarget({ view: 'tasks' }),
            tone: (summary?.blockedTasks ?? 0) > 0 ? 'warning' : 'neutral',
            icon: AlertTriangle,
        },
        {
            label: 'Note checklists',
            hint:
                (summary?.attentionDocumentCount ?? 0) > 0
                    ? `${summary!.attentionDocumentCount} ${summary!.attentionDocumentCount === 1 ? 'doc needs' : 'docs need'} review`
                    : `${active.length} active ${active.length === 1 ? 'project' : 'projects'}`,
            value: loading ? '—' : noteActionItems.length,
            onClick: () => onNavigate('notes'),
            tone: 'neutral',
            icon: SquareCheckBig,
        },
    ];

    return (
        <div className="workspace-page page-overview mx-auto space-y-5">
            <PageHeader
                eyebrow={todayLabel}
                title="Overview"
                description={storySubtitle}
                actions={
                    <div className="flex items-center gap-2">
                        {timerDetail && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 border-primary/40 bg-primary/5 text-xs text-primary"
                                onClick={() =>
                                    onNavigateTarget({
                                        view: 'tasks',
                                        recordId: timerDetail.taskId,
                                        projectId: timerDetail.projectId,
                                    })
                                }
                            >
                                <Timer className="size-3.5" />
                                <span className="max-w-[180px] truncate">{timerDetail.taskTitle}</span>
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => onNavigate('tasks')}
                        >
                            Open Tasks
                        </Button>
                    </div>
                }
            />

            {timerDetail && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/35 bg-primary/[0.04] px-4 py-3 text-xs">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="size-2 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0">
                            <p className="font-medium text-foreground">
                                {timerDetail.recoveryRequired ? 'Timer needs review' : 'Active focus session'}{' '}
                                ·{' '}
                                <button
                                    type="button"
                                    className="font-semibold text-primary hover:underline"
                                    onClick={() =>
                                        onNavigateTarget({
                                            view: 'tasks',
                                            recordId: timerDetail.taskId,
                                            projectId: timerDetail.projectId,
                                        })
                                    }
                                >
                                    {timerDetail.taskTitle}
                                </button>
                            </p>
                            <p className="text-muted-foreground">
                                Started {formatRelative(timerDetail.startedAt)} ·{' '}
                                {projectName(timerDetail.projectId)}
                            </p>
                        </div>
                    </div>
                    {!timerDetail.recoveryRequired && onStopTimer && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => void onStopTimer(timerDetail.taskId)}
                        >
                            <Square className="size-3" />
                            Stop timer
                        </Button>
                    )}
                </div>
            )}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Workspace summary">
                {metrics.map((item) => {
                    const Icon = item.icon;
                    const valueColor =
                        item.tone === 'danger'
                            ? 'text-danger'
                            : item.tone === 'warning'
                              ? 'text-warning'
                              : 'text-foreground';
                    const iconBg =
                        item.tone === 'danger'
                            ? 'bg-danger/10 text-danger'
                            : item.tone === 'warning'
                              ? 'bg-warning/10 text-warning'
                              : 'bg-surface-subtle text-muted-foreground';
                    return (
                        <button
                            key={item.label}
                            type="button"
                            onClick={item.onClick}
                            className="group rounded-xl border border-border/80 bg-card px-4 py-3 text-left transition-colors hover:border-border hover:bg-surface-subtle/55"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                    {item.label}
                                </span>
                                <span className={`grid size-6 place-items-center rounded-md ${iconBg}`}>
                                    <Icon className="size-3.5" aria-hidden="true" />
                                </span>
                            </div>
                            <div
                                className={`mt-1.5 text-[24px] font-semibold leading-none tabular-nums tracking-tight ${valueColor}`}
                            >
                                {item.value}
                            </div>
                            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                                <span className="truncate">{item.hint}</span>
                                <ArrowUpRight
                                    className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-80"
                                    aria-hidden="true"
                                />
                            </div>
                        </button>
                    );
                })}
            </section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.9fr)]">
                <div className="min-w-0 space-y-5">
                    {hasAttentionQueue ? (
                        <section className="rounded-xl border border-border/80 bg-card">
                            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                                    <h2 className="text-sm font-semibold">Needs attention</h2>
                                    <Badge variant="warning" className="h-5 px-1.5 text-[11px] tabular-nums">
                                        {overdueItems.length +
                                            blockedItems.length +
                                            waitingItems.length +
                                            dueReminders.length}
                                    </Badge>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => onNavigate('tasks')}
                                >
                                    Review in Tasks <ArrowUpRight className="size-3.5" />
                                </Button>
                            </div>
                            <div className="divide-y divide-border/60">
                                {overdueItems.map((task) => (
                                    <div
                                        key={`overdue-${task.id}`}
                                        className="flex items-center gap-3 px-4 py-2.5"
                                    >
                                        {onCompleteTask && (
                                            <button
                                                type="button"
                                                aria-label={`Complete ${task.title}`}
                                                onClick={() => void onCompleteTask(task.id)}
                                                className="shrink-0 text-muted-foreground transition-colors hover:text-success"
                                            >
                                                <Circle className="size-4" />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onNavigateTarget({
                                                    view: 'tasks',
                                                    recordId: task.id,
                                                    projectId: task.projectId,
                                                })
                                            }
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <div className="truncate text-[13px] font-medium hover:text-primary">
                                                {task.title}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                                <span>{projectName(task.projectId)}</span>
                                                <span>·</span>
                                                <span className="font-medium text-danger">
                                                    Overdue {formatRelative(task.dueDate ?? task.dueAt!)}
                                                </span>
                                            </div>
                                        </button>
                                    </div>
                                ))}

                                {blockedItems.map((item) => (
                                    <div
                                        key={`blocked-${item.task.id}`}
                                        className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                                    >
                                        <AlertTriangle
                                            className="size-4 shrink-0 text-warning"
                                            aria-hidden="true"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onNavigateTarget({
                                                        view: 'tasks',
                                                        recordId: item.task.id,
                                                        projectId: item.task.projectId,
                                                    })
                                                }
                                                className="block max-w-full truncate text-left text-[13px] font-medium hover:text-primary"
                                            >
                                                {item.task.title}
                                            </button>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                                <span className="text-warning">{item.reason}</span>
                                                {item.waitingContactName && item.waitingContactId && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onNavigateTarget({
                                                                view: 'contacts',
                                                                recordId: item.waitingContactId!,
                                                            })
                                                        }
                                                        className="inline-flex items-center gap-1 font-medium text-info hover:underline"
                                                    >
                                                        <UserRound className="size-3" />
                                                        Waiting on {item.waitingContactName}
                                                    </button>
                                                )}
                                                {item.followUpAt && (
                                                    <span>· Follow up {formatDate(item.followUpAt)}</span>
                                                )}
                                            </div>
                                        </div>
                                        {item.blockerId && onResolveBlocker && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-7 gap-1 px-2.5 text-xs"
                                                onClick={() => void onResolveBlocker(item.blockerId)}
                                            >
                                                <Check className="size-3" />
                                                Resolve
                                            </Button>
                                        )}
                                    </div>
                                ))}

                                {waitingItems.map((task) => (
                                    <button
                                        key={`waiting-${task.id}`}
                                        type="button"
                                        onClick={() =>
                                            onNavigateTarget({
                                                view: 'tasks',
                                                recordId: task.id,
                                                projectId: task.projectId,
                                            })
                                        }
                                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-subtle/60"
                                    >
                                        <PauseCircle
                                            className="size-4 shrink-0 text-info"
                                            aria-hidden="true"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[13px] font-medium">
                                                {task.title}
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                                                {projectName(task.projectId)} · Waiting on external follow-up
                                            </div>
                                        </div>
                                    </button>
                                ))}

                                {dueReminders.map((reminder) => (
                                    <div
                                        key={`rem-${reminder.id}`}
                                        className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                                    >
                                        <AlarmClock
                                            className="size-4 shrink-0 text-primary"
                                            aria-hidden="true"
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onNavigateTarget({
                                                    view:
                                                        reminder.entityType === 'project'
                                                            ? 'projects'
                                                            : reminder.entityType === 'contact'
                                                              ? 'contacts'
                                                              : reminder.entityType === 'note'
                                                                ? 'notes'
                                                                : 'tasks',
                                                    recordId: reminder.entityId,
                                                    projectId: reminder.projectId,
                                                })
                                            }
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <div className="truncate text-[13px] font-medium hover:text-primary">
                                                {reminder.message || reminder.entityTitle}
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                                                {reminder.entityTitle} · Due {formatDate(reminder.dueAt)}
                                            </div>
                                        </button>
                                        {onReminderAction && (
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-xs"
                                                    onClick={() =>
                                                        void onReminderAction(reminder.id, 'snooze')
                                                    }
                                                >
                                                    Snooze 1h
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-xs text-muted-foreground"
                                                    onClick={() =>
                                                        void onReminderAction(reminder.id, 'dismiss')
                                                    }
                                                >
                                                    Dismiss
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : (
                        !loading && (
                            <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-surface-subtle/40 px-4 py-3 text-xs text-muted-foreground">
                                <CheckCircle2 className="size-4 shrink-0 text-success" />
                                <span>
                                    Clear runway — no overdue deadlines, active blockers, or due reminders.
                                </span>
                            </div>
                        )
                    )}

                    <section className="flex min-w-0 flex-col rounded-xl border border-border/80 bg-card">
                        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-semibold">Up next (ready to start)</h2>
                                    {readyTasks.length > 0 && (
                                        <Badge
                                            variant="secondary"
                                            className="h-5 px-1.5 text-[11px] tabular-nums"
                                        >
                                            {readyTasks.length}
                                        </Badge>
                                    )}
                                </div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    Tasks with all dependencies met and no active blocker
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => onNavigate('tasks')}
                            >
                                All tasks <ArrowUpRight className="size-3.5" />
                            </Button>
                        </div>
                        {loading ? (
                            <p className="py-10 text-center text-xs text-muted-foreground">
                                Loading workspace…
                            </p>
                        ) : readyTasks.length ? (
                            <div className="divide-y divide-border/60">
                                {readyTasks.map((task) => (
                                    <div
                                        key={task.id}
                                        className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-subtle/50"
                                    >
                                        {onCompleteTask ? (
                                            <button
                                                type="button"
                                                aria-label={`Complete ${task.title}`}
                                                onClick={() => void onCompleteTask(task.id)}
                                                className="shrink-0 text-muted-foreground transition-colors hover:text-success"
                                            >
                                                <Circle className="size-4" />
                                            </button>
                                        ) : (
                                            <span
                                                className={`size-2 shrink-0 rounded-full ${task.priority === 'urgent' ? 'bg-danger' : task.priority === 'high' ? 'bg-warning' : 'bg-primary/70'}`}
                                                aria-hidden="true"
                                            />
                                        )}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onNavigateTarget({
                                                    view: 'tasks',
                                                    recordId: task.id,
                                                    projectId: task.projectId,
                                                })
                                            }
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-[13px] font-medium text-foreground group-hover:text-primary">
                                                    {task.title}
                                                </span>
                                                {task.status === 'in_progress' && (
                                                    <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary">
                                                        In progress
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                                <span className="truncate">
                                                    {projectName(task.projectId)}
                                                </span>
                                                {(task.dueDate || task.dueAt) && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="tabular-nums">
                                                            {formatRelative(task.dueDate ?? task.dueAt!)}
                                                        </span>
                                                    </>
                                                )}
                                                {task.estimateMinutes !== null && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="tabular-nums">
                                                            {task.estimateMinutes}m
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </button>
                                        {(task.priority === 'urgent' || task.priority === 'high') && (
                                            <Badge variant="warning" className="shrink-0 capitalize">
                                                {task.priority}
                                            </Badge>
                                        )}
                                        {onStartTimer && !timerDetail && (
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="size-7 shrink-0 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100"
                                                aria-label={`Start timer for ${task.title}`}
                                                onClick={() => void onStartTimer(task.id)}
                                            >
                                                <Play className="size-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center text-xs text-muted-foreground">
                                <CheckCircle2 className="mb-2 size-4 opacity-70" />
                                <p className="font-medium text-foreground">No unblocked tasks queued</p>
                                <p className="mt-0.5">Create a task or resolve a blocker to keep moving.</p>
                                <Button
                                    className="mt-3"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onNavigate('tasks')}
                                >
                                    View tasks
                                </Button>
                            </div>
                        )}
                    </section>

                    {noteActionItems.length > 0 && (
                        <section className="rounded-xl border border-border/80 bg-card">
                            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-semibold">Pending in notes</h2>
                                    <Badge
                                        variant="secondary"
                                        className="h-5 px-1.5 text-[11px] tabular-nums"
                                    >
                                        {noteActionItems.length}
                                    </Badge>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => onNavigate('notes')}
                                >
                                    All notes <ArrowUpRight className="size-3.5" />
                                </Button>
                            </div>
                            <div className="divide-y divide-border/60">
                                {noteActionItems.map((item, idx) => (
                                    <button
                                        key={`${item.noteId}-${idx}`}
                                        type="button"
                                        onClick={() =>
                                            onNavigateTarget({
                                                view: 'notes',
                                                recordId: item.noteId,
                                                projectId: item.projectId,
                                            })
                                        }
                                        className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-subtle/50"
                                    >
                                        <SquareCheckBig
                                            className="size-3.5 shrink-0 text-muted-foreground"
                                            aria-hidden="true"
                                        />
                                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground group-hover:text-primary">
                                            {item.text}
                                        </span>
                                        <span className="max-w-[160px] shrink-0 truncate rounded bg-surface-subtle px-2 py-0.5 text-[11px] text-muted-foreground">
                                            {item.noteTitle}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                <div className="min-w-0 space-y-5">
                    <section className="flex min-w-0 flex-col rounded-xl border border-border/80 bg-card">
                        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-semibold">Active projects</h2>
                                {active.length ? (
                                    <Badge
                                        variant="secondary"
                                        className="h-5 px-1.5 text-[11px] tabular-nums"
                                    >
                                        {active.length}
                                    </Badge>
                                ) : null}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => onNavigate('projects')}
                            >
                                All projects <ArrowUpRight className="size-3.5" />
                            </Button>
                        </div>
                        {loading ? (
                            <p className="py-10 text-center text-xs text-muted-foreground">
                                Loading projects…
                            </p>
                        ) : active.length ? (
                            <div className="divide-y divide-border/60">
                                {active.slice(0, 6).map((project) => {
                                    const done = Math.max(0, project.taskCount - project.openTaskCount);
                                    const pct =
                                        project.taskCount > 0
                                            ? Math.round((done / project.taskCount) * 100)
                                            : 0;
                                    return (
                                        <button
                                            key={project.id}
                                            type="button"
                                            onClick={() =>
                                                onNavigateTarget({ view: 'projects', recordId: project.id })
                                            }
                                            className="group flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-subtle/60"
                                        >
                                            <div className="flex items-center justify-between gap-2.5">
                                                <div className="flex min-w-0 items-center gap-2.5">
                                                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground">
                                                        <FolderKanban className="size-3.5" />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="truncate text-[13px] font-medium text-foreground group-hover:text-primary">
                                                            {project.name}
                                                        </div>
                                                        <div className="text-[11px] tabular-nums text-muted-foreground">
                                                            {project.openTaskCount} open · {project.noteCount}{' '}
                                                            notes
                                                        </div>
                                                    </div>
                                                </div>
                                                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100" />
                                            </div>
                                            {project.taskCount > 0 && (
                                                <div className="flex items-center gap-2 pl-9">
                                                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-subtle">
                                                        <div
                                                            className="h-full rounded-full bg-primary/80 transition-all"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                                        {done}/{project.taskCount}
                                                    </span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center text-xs text-muted-foreground">
                                <FolderKanban className="mb-2 size-4 opacity-70" />
                                <p className="font-medium text-foreground">No active projects yet</p>
                                <Button
                                    className="mt-3"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onNavigate('projects')}
                                >
                                    Create project
                                </Button>
                            </div>
                        )}
                    </section>

                    {summary && summary.recentNotes.length > 0 && (
                        <section className="rounded-xl border border-border/80 bg-card">
                            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                                <h2 className="text-sm font-semibold">Recent notes</h2>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => onNavigate('notes')}
                                >
                                    Open notes <ArrowUpRight className="size-3.5" />
                                </Button>
                            </div>
                            <div className="divide-y divide-border/60">
                                {summary.recentNotes.slice(0, 4).map((note) => (
                                    <button
                                        key={note.id}
                                        type="button"
                                        onClick={() =>
                                            onNavigateTarget({
                                                view: 'notes',
                                                recordId: note.id,
                                                projectId: note.projectId,
                                            })
                                        }
                                        className="group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-subtle/55"
                                    >
                                        {note.locked ? (
                                            <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-warning" />
                                        ) : (
                                            <NotebookPen className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[13px] font-medium text-foreground group-hover:text-primary">
                                                {note.locked ? 'Locked note' : note.title || 'Untitled note'}
                                            </div>
                                            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                                                {note.locked
                                                    ? 'Protected content'
                                                    : cleanHtml(note.content) || 'Empty note'}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-[11px] text-muted-foreground">
                                            {formatRelative(note.updatedAt)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </div>

            {((summary?.attentionDocumentCount ?? 0) > 0 || Boolean(summary?.recentNotes[0])) && (
                <div className="flex flex-wrap items-center gap-6 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    {(summary?.attentionDocumentCount ?? 0) > 0 && (
                        <button
                            type="button"
                            onClick={() => onNavigate('documents')}
                            className="hover:text-foreground hover:underline"
                        >
                            {summary!.attentionDocumentCount} documents need indexing or attention
                        </button>
                    )}
                    {summary?.recentNotes[0] && (
                        <span>
                            <FileClock className="mr-1 inline size-3.5" />
                            Last note updated {formatDate(summary.recentNotes[0].updatedAt)}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
