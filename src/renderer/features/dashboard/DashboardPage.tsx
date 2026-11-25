import {
    AlertTriangle,
    ArrowUpRight,
    CheckCircle2,
    Clock3,
    FileClock,
    FolderKanban,
    LockKeyhole,
    NotebookPen,
    Timer,
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
}

export function DashboardPage({ summary, projects, loading, onNavigate, onNavigateTarget }: Props) {
    const todayLabel = new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    }).format(new Date());
    const active = projects.filter((project) => project.status === 'active');

    const metrics: Array<{
        label: string;
        hint: string;
        value: number | string;
        onClick: () => void;
        tone: 'neutral' | 'warning' | 'danger';
        icon: typeof FolderKanban;
    }> = [
        {
            label: 'Active projects',
            hint: active.length === 1 ? '1 active workspace' : `${active.length} active workspaces`,
            value: loading ? '—' : (summary?.activeProjects ?? 0),
            onClick: () => onNavigate('projects'),
            tone: 'neutral',
            icon: FolderKanban,
        },
        {
            label: 'Open tasks',
            hint: 'Across active projects',
            value: loading ? '—' : (summary?.openTasks ?? 0),
            onClick: () => onNavigate('tasks'),
            tone: 'neutral',
            icon: CheckCircle2,
        },
        {
            label: 'Overdue',
            hint: summary?.overdueTasks ? 'Needs immediate review' : 'All deadlines on track',
            value: loading ? '—' : (summary?.overdueTasks ?? 0),
            onClick: () => onNavigateTarget({ view: 'tasks' }),
            tone: summary?.overdueTasks ? 'danger' : 'neutral',
            icon: Clock3,
        },
        {
            label: 'Blocked',
            hint: summary?.blockedTasks ? 'Waiting on dependencies' : 'No active blockers',
            value: loading ? '—' : (summary?.blockedTasks ?? 0),
            onClick: () => onNavigateTarget({ view: 'tasks' }),
            tone: summary?.blockedTasks ? 'warning' : 'neutral',
            icon: AlertTriangle,
        },
    ];

    return (
        <div className="workspace-page page-overview mx-auto space-y-6">
            <PageHeader
                eyebrow={todayLabel}
                title="Overview"
                actions={
                    <div className="flex items-center gap-2">
                        {(summary?.activeTimers ?? 0) > 0 && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 border-primary/40 bg-primary/5 text-xs text-primary"
                                onClick={() => onNavigate('tasks')}
                            >
                                <Timer className="size-3.5" />
                                {summary!.activeTimers} timer running
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
                            className="group rounded-xl border border-border/80 bg-card px-4 py-3.5 text-left transition-colors hover:border-border hover:bg-surface-subtle/55"
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
                                className={`mt-2 text-[26px] font-semibold leading-none tabular-nums tracking-tight ${valueColor}`}
                            >
                                {item.value}
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
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

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(290px,0.9fr)]">
                <section className="flex min-w-0 flex-col rounded-xl border border-border/80 bg-card">
                    <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold">Upcoming focus</h2>
                            {summary?.upcomingTasks.length ? (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
                                    {summary.upcomingTasks.length}
                                </Badge>
                            ) : null}
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
                        <p className="py-10 text-center text-xs text-muted-foreground">Loading workspace…</p>
                    ) : summary?.upcomingTasks.length ? (
                        <div className="divide-y divide-border/60">
                            {summary.upcomingTasks.map((task) => {
                                const projectName =
                                    projects.find((p) => p.id === task.projectId)?.name ?? 'Project';
                                return (
                                    <button
                                        key={task.id}
                                        type="button"
                                        onClick={() =>
                                            onNavigateTarget({
                                                view: 'tasks',
                                                recordId: task.id,
                                                projectId: task.projectId,
                                            })
                                        }
                                        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-subtle/60"
                                    >
                                        <span
                                            className={`size-2 shrink-0 rounded-full ${task.priority === 'urgent' ? 'bg-danger' : task.priority === 'high' ? 'bg-warning' : 'bg-primary/70'}`}
                                            aria-hidden="true"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[13px] font-medium text-foreground group-hover:text-primary">
                                                {task.title}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                                <span className="truncate">{projectName}</span>
                                                <span>·</span>
                                                <span className="capitalize">
                                                    {task.status.replaceAll('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                        {(task.priority === 'urgent' || task.priority === 'high') && (
                                            <Badge variant="warning" className="shrink-0 capitalize">
                                                {task.priority}
                                            </Badge>
                                        )}
                                        <span className="shrink-0 rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                                            {formatRelative(task.dueDate ?? task.dueAt!)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center text-xs text-muted-foreground">
                            <Clock3 className="mb-2 size-4 opacity-70" />
                            <p className="font-medium text-foreground">No upcoming deadlines</p>
                            <p className="mt-0.5">Tasks with due dates appear here automatically.</p>
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

                <section className="flex min-w-0 flex-col rounded-xl border border-border/80 bg-card">
                    <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold">Active projects</h2>
                            {active.length ? (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
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
                        <p className="py-10 text-center text-xs text-muted-foreground">Loading projects…</p>
                    ) : active.length ? (
                        <div className="divide-y divide-border/60">
                            {active.slice(0, 6).map((project) => {
                                const done = Math.max(0, project.taskCount - project.openTaskCount);
                                const pct =
                                    project.taskCount > 0 ? Math.round((done / project.taskCount) * 100) : 0;
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
                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center text-xs text-muted-foreground">
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
            </div>

            {summary && summary.recentNotes.length > 0 && (
                <section className="space-y-3">
                    <div className="flex items-center justify-between">
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
                    <div className="grid gap-3 md:grid-cols-3">
                        {summary.recentNotes.slice(0, 3).map((note) => (
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
                                className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 text-left transition-colors hover:border-border hover:bg-surface-subtle/55"
                            >
                                <div>
                                    <div className="flex items-center gap-2 text-[13px] font-medium text-foreground group-hover:text-primary">
                                        {note.locked ? (
                                            <LockKeyhole className="size-3.5 shrink-0 text-warning" />
                                        ) : (
                                            <NotebookPen className="size-3.5 shrink-0 text-muted-foreground" />
                                        )}
                                        <span className="truncate">
                                            {note.locked ? 'Locked note' : note.title || 'Untitled note'}
                                        </span>
                                    </div>
                                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                        {note.locked
                                            ? 'Protected content'
                                            : cleanHtml(note.content) || 'Empty note'}
                                    </p>
                                </div>
                                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                                    <span>{formatRelative(note.updatedAt)}</span>
                                    <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-80" />
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {((summary?.pendingDocuments ?? 0) > 0 || Boolean(summary?.recentNotes[0])) && (
                <div className="flex flex-wrap items-center gap-6 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    {(summary?.pendingDocuments ?? 0) > 0 && (
                        <span>{summary!.pendingDocuments} docs pending extraction</span>
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
