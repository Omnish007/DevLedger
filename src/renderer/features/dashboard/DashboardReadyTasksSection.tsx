import { ArrowUpRight, CheckCircle2, Circle, Play } from 'lucide-react';
import type { TaskRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/utils';

interface DashboardReadyTasksSectionProps {
    loading: boolean;
    readyTasks: TaskRecord[];
    hasActiveTimer: boolean;
    projectName: (projectId: string | null) => string;
    onOpenTasks: () => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
    onCompleteTask?: ((taskId: string) => Promise<void>) | undefined;
    onStartTimer?: ((taskId: string) => Promise<void>) | undefined;
}

export function DashboardReadyTasksSection({
    loading,
    readyTasks,
    hasActiveTimer,
    projectName,
    onOpenTasks,
    onNavigateTarget,
    onCompleteTask,
    onStartTimer,
}: DashboardReadyTasksSectionProps) {
    return (
        <section className="flex min-w-0 flex-col rounded-[var(--workspace-radius)] border border-border bg-card shadow-[var(--shadow-xs)]">
            <div className="flex items-center justify-between border-b border-border/75 px-4 py-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold">Up next (ready to start)</h2>
                        {readyTasks.length > 0 && (
                            <Badge variant="secondary" className="tabular-nums">
                                {readyTasks.length}
                            </Badge>
                        )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Tasks with all dependencies met and no active blocker
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={onOpenTasks}
                >
                    All tasks <ArrowUpRight className="size-3.5" />
                </Button>
            </div>
            {loading ? (
                <p className="py-10 text-center text-xs text-muted-foreground">Loading workspace…</p>
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
                                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-success-subtle hover:text-success-foreground"
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
                                    <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                                        {task.title}
                                    </span>
                                    {task.status === 'in_progress' && (
                                        <Badge variant="info" className="shrink-0">
                                            In progress
                                        </Badge>
                                    )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="truncate">{projectName(task.projectId)}</span>
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
                                            <span className="tabular-nums">{task.estimateMinutes}m</span>
                                        </>
                                    )}
                                </div>
                            </button>
                            {(task.priority === 'urgent' || task.priority === 'high') && (
                                <Badge variant="warning" className="shrink-0 capitalize">
                                    {task.priority}
                                </Badge>
                            )}
                            {onStartTimer && !hasActiveTimer && (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-8 shrink-0 text-muted-foreground opacity-70 hover:text-foreground group-hover:opacity-100"
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
                    <Button className="mt-3" size="sm" variant="outline" onClick={onOpenTasks}>
                        View tasks
                    </Button>
                </div>
            )}
        </section>
    );
}
