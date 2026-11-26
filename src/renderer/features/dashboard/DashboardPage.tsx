import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    FileClock,
    type FolderKanban,
    SquareCheckBig,
} from 'lucide-react';
import type { DashboardSummary, ProjectRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { formatDate } from '@/lib/utils';
import { DashboardActiveTimerBanner } from './DashboardActiveTimerBanner';
import { DashboardAttentionQueue } from './DashboardAttentionQueue';
import { DashboardMetricsGrid, type DashboardMetricCardItem } from './DashboardMetricsGrid';
import { DashboardReadyTasksSection } from './DashboardReadyTasksSection';
import {
    DashboardActiveProjectsSection,
    DashboardNoteChecklistsSection,
    DashboardRecentNotesSection,
} from './DashboardSecondarySections';

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
    const timerDetail = summary?.activeTimerDetail ?? null;

    const storySubtitle = loading
        ? undefined
        : summary
          ? `${readyTasks.length} ready to start · ${attentionCount} ${attentionCount === 1 ? 'needs' : 'need'} attention · ${noteActionItems.length} open ${noteActionItems.length === 1 ? 'checklist' : 'checklists'} in notes`
          : undefined;

    const blockedCount = summary?.blockedTasks ?? blockedItems.length;
    const blockedHint =
        blockedCount > 0 && waitingItems.length > 0
            ? `${blockedCount} blocked · ${waitingItems.length} waiting`
            : blockedCount > 0
              ? `${blockedCount} blocked`
              : waitingItems.length > 0
                ? `${waitingItems.length} waiting externally`
                : 'No active blockers';

    const metrics: Array<DashboardMetricCardItem & { icon: typeof FolderKanban }> = [
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
            hint: blockedHint,
            value: loading ? '—' : blockedCount + waitingItems.length,
            onClick: () => onNavigateTarget({ view: 'tasks' }),
            tone: blockedCount > 0 ? 'warning' : 'neutral',
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
                    <Button size="sm" variant="outline" onClick={() => onNavigate('tasks')}>
                        Open Tasks
                    </Button>
                }
            />

            {timerDetail && (
                <DashboardActiveTimerBanner
                    timerDetail={timerDetail}
                    projectName={projectName(timerDetail.projectId)}
                    onNavigateTarget={onNavigateTarget}
                    onStopTimer={onStopTimer}
                />
            )}

            <DashboardMetricsGrid metrics={metrics} />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.9fr)]">
                <div className="min-w-0 space-y-5">
                    <DashboardAttentionQueue
                        loading={loading}
                        overdueItems={overdueItems}
                        blockedItems={blockedItems}
                        waitingItems={waitingItems}
                        dueReminders={dueReminders}
                        projectName={projectName}
                        onOpenTasks={() => onNavigate('tasks')}
                        onNavigateTarget={onNavigateTarget}
                        onCompleteTask={onCompleteTask}
                        onResolveBlocker={onResolveBlocker}
                        onReminderAction={onReminderAction}
                    />

                    <DashboardReadyTasksSection
                        loading={loading}
                        readyTasks={readyTasks}
                        hasActiveTimer={Boolean(timerDetail)}
                        projectName={projectName}
                        onOpenTasks={() => onNavigate('tasks')}
                        onNavigateTarget={onNavigateTarget}
                        onCompleteTask={onCompleteTask}
                        onStartTimer={onStartTimer}
                    />

                    <DashboardNoteChecklistsSection
                        noteActionItems={noteActionItems}
                        onOpenNotes={() => onNavigate('notes')}
                        onNavigateTarget={onNavigateTarget}
                    />
                </div>

                <div className="min-w-0 space-y-5">
                    <DashboardActiveProjectsSection
                        loading={loading}
                        activeProjects={active}
                        onOpenProjects={() => onNavigate('projects')}
                        onNavigateTarget={onNavigateTarget}
                    />

                    <DashboardRecentNotesSection
                        recentNotes={summary?.recentNotes ?? []}
                        onOpenNotes={() => onNavigate('notes')}
                        onNavigateTarget={onNavigateTarget}
                    />
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
