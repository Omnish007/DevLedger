import {
    AlarmClock,
    AlertTriangle,
    ArrowUpRight,
    Check,
    CheckCircle2,
    Circle,
    PauseCircle,
    UserRound,
} from 'lucide-react';
import type {
    DashboardBlockedItem,
    DashboardReminderItem,
    TaskRecord,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatRelative } from '@/lib/utils';

interface DashboardAttentionQueueProps {
    loading: boolean;
    overdueItems: TaskRecord[];
    blockedItems: DashboardBlockedItem[];
    waitingItems: TaskRecord[];
    dueReminders: DashboardReminderItem[];
    projectName: (projectId: string | null) => string;
    onOpenTasks: () => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
    onCompleteTask?: ((taskId: string) => Promise<void>) | undefined;
    onResolveBlocker?: ((blockerId: string) => Promise<void>) | undefined;
    onReminderAction?: ((id: string, action: 'snooze' | 'dismiss') => Promise<void>) | undefined;
}

export function DashboardAttentionQueue({
    loading,
    overdueItems,
    blockedItems,
    waitingItems,
    dueReminders,
    projectName,
    onOpenTasks,
    onNavigateTarget,
    onCompleteTask,
    onResolveBlocker,
    onReminderAction,
}: DashboardAttentionQueueProps) {
    const totalCount = overdueItems.length + blockedItems.length + waitingItems.length + dueReminders.length;

    if (totalCount === 0) {
        if (loading) return null;
        return (
            <div className="flex items-center gap-2.5 rounded-[var(--workspace-radius)] border border-border bg-surface-subtle/50 px-4 py-3 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 shrink-0 text-success" />
                <span>Clear runway — no overdue deadlines, active blockers, or due reminders.</span>
            </div>
        );
    }

    return (
        <section className="rounded-[var(--workspace-radius)] border border-border bg-card shadow-[var(--shadow-xs)]">
            <div className="flex items-center justify-between border-b border-border/75 px-4 py-3">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                    <h2 className="text-sm font-semibold">Needs attention</h2>
                    <Badge variant="warning" className="tabular-nums">
                        {totalCount}
                    </Badge>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={onOpenTasks}
                >
                    Review in Tasks <ArrowUpRight className="size-3.5" />
                </Button>
            </div>
            <div className="divide-y divide-border/60">
                {overdueItems.map((task) => (
                    <div key={`overdue-${task.id}`} className="flex items-center gap-3 px-4 py-2.5">
                        {onCompleteTask && (
                            <button
                                type="button"
                                aria-label={`Complete ${task.title}`}
                                onClick={() => void onCompleteTask(task.id)}
                                className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-success-subtle hover:text-success-foreground"
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
                            <div className="truncate text-sm font-medium hover:text-primary">
                                {task.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
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
                        <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
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
                                className="inline-flex min-h-6 max-w-full items-center truncate text-left text-sm font-medium hover:text-primary"
                            >
                                {item.task.title}
                            </button>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span className="font-medium text-warning">{item.reason}</span>
                                {item.waitingContactName && item.waitingContactId && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onNavigateTarget({
                                                view: 'contacts',
                                                recordId: item.waitingContactId!,
                                            })
                                        }
                                        className="inline-flex min-h-6 items-center gap-1 rounded px-1.5 font-medium text-info hover:bg-info-subtle hover:text-info-foreground"
                                    >
                                        <UserRound className="size-3.5" />
                                        Waiting on {item.waitingContactName}
                                    </button>
                                )}
                                {item.followUpAt && <span>· Follow up {formatDate(item.followUpAt)}</span>}
                            </div>
                        </div>
                        {item.blockerId && onResolveBlocker && (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 px-2.5 text-xs"
                                onClick={() => void onResolveBlocker(item.blockerId)}
                            >
                                <Check className="size-3.5" />
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
                        <PauseCircle className="size-4 shrink-0 text-info" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{task.title}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                                {projectName(task.projectId)} · Waiting on external follow-up
                            </div>
                        </div>
                    </button>
                ))}

                {dueReminders.map((reminder) => (
                    <div key={`rem-${reminder.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <AlarmClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
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
                            <div className="truncate text-sm font-medium hover:text-primary">
                                {reminder.message || reminder.entityTitle}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                                {reminder.entityTitle} · Due {formatDate(reminder.dueAt)}
                            </div>
                        </button>
                        {onReminderAction && (
                            <div className="flex items-center gap-1.5">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2.5 text-xs"
                                    onClick={() => void onReminderAction(reminder.id, 'snooze')}
                                >
                                    Snooze 1h
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => void onReminderAction(reminder.id, 'dismiss')}
                                >
                                    Dismiss
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
