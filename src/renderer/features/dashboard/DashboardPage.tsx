import { ArrowUpRight, Clock3, FileClock, FolderKanban, NotebookPen } from 'lucide-react';
import type { DashboardSummary, ProjectRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  const active = projects.filter((project) => project.status === 'active');

  const metrics: Array<{ label: string; value: number | string; onClick: () => void; accent?: boolean }> = [
    { label: 'Active projects', value: loading ? '—' : summary?.activeProjects ?? 0, onClick: () => onNavigate('projects') },
    { label: 'Open tasks', value: loading ? '—' : summary?.openTasks ?? 0, onClick: () => onNavigate('tasks') },
    { label: 'Overdue', value: loading ? '—' : summary?.overdueTasks ?? 0, onClick: () => onNavigateTarget({ view: 'tasks' }), accent: Boolean(summary?.overdueTasks) },
    { label: 'Blocked', value: loading ? '—' : summary?.blockedTasks ?? 0, onClick: () => onNavigateTarget({ view: 'tasks' }), accent: Boolean(summary?.blockedTasks) },
  ];

  return (
    <div className="workspace-page page-overview mx-auto space-y-6">
      <PageHeader eyebrow={todayLabel} title="Overview" />

      <section className="overview-metrics" aria-label="Workspace summary">
        {metrics.map((item) => (
          <button key={item.label} type="button" onClick={item.onClick} className="overview-metric px-5 py-4 text-left transition-colors hover:bg-surface-subtle">
            <div className="flex items-baseline justify-between">
              <span className={`text-2xl font-semibold tabular-nums tracking-tight ${item.accent ? 'text-warning' : 'text-foreground'}`}>{item.value}</span>
              <ArrowUpRight className="size-3.5 text-muted-foreground opacity-55" />
            </div>
            <div className="mt-1 text-xs font-medium text-muted-foreground">{item.label}</div>
          </button>
        ))}
      </section>

      <div className="overview-work-grid">
        <section>
          <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
            <h3 className="text-sm font-semibold">Upcoming tasks</h3>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onNavigate('tasks')}>All tasks <ArrowUpRight className="size-3.5" /></Button>
          </div>
          {loading ? <p className="py-8 text-xs text-muted-foreground">Loading workspace…</p> : summary?.upcomingTasks.length ? (
            <div className="divide-y divide-border">
              {summary.upcomingTasks.map((task) => (
                <button key={task.id} type="button" onClick={() => onNavigateTarget({ view: 'tasks', recordId: task.id, projectId: task.projectId })} className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-subtle">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{task.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{projects.find((p) => p.id === task.projectId)?.name ?? 'Project'}</div>
                  </div>
                  {(task.priority === 'urgent' || task.priority === 'high') && <Badge variant="warning" className="capitalize">{task.priority}</Badge>}
                  <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{formatRelative(task.dueDate ?? task.dueAt!)}</span>
                </button>
              ))}
            </div>
          ) : <div className="py-10 text-center text-xs text-muted-foreground"><Clock3 className="mx-auto mb-2 size-4 opacity-70" /><p>No upcoming tasks due.</p></div>}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
            <h3 className="text-sm font-semibold">Active projects</h3>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onNavigate('projects')}>All projects <ArrowUpRight className="size-3.5" /></Button>
          </div>
          {loading ? <p className="py-8 text-xs text-muted-foreground">Loading projects…</p> : active.length ? (
            <div className="divide-y divide-border">
              {active.slice(0, 6).map((project) => (
                <button key={project.id} type="button" onClick={() => onNavigateTarget({ view: 'projects', recordId: project.id })} className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-subtle">
                  <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{project.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{project.openTaskCount} open · {project.noteCount} notes</div>
                  </div>
                  <ArrowUpRight className="size-3.5 text-muted-foreground opacity-55" />
                </button>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-muted-foreground">
              <FolderKanban className="mx-auto mb-2 size-4 opacity-70" />
              <p>No active projects yet.</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => onNavigate('projects')}>Create project</Button>
            </div>
          )}
        </section>
      </div>

      {summary && summary.recentNotes.length > 0 && (
        <section className="workspace-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Recent notes</h3>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onNavigate('notes')}>Open notes <ArrowUpRight className="size-3.5" /></Button>
          </div>
          <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {summary.recentNotes.slice(0, 3).map((note) => (
              <button key={note.id} type="button" onClick={() => onNavigateTarget({ view: 'notes', recordId: note.id, projectId: note.projectId })} className="p-4 text-left transition-colors hover:bg-surface-subtle">
                <div className="flex items-center gap-1.5 text-sm font-medium"><NotebookPen className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{note.locked ? 'Locked note' : (note.title || 'Untitled note')}</span></div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{note.locked ? 'Protected content' : cleanHtml(note.content) || 'Empty note'}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{formatRelative(note.updatedAt)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {((summary?.activeTimers ?? 0) > 0 || (summary?.pendingDocuments ?? 0) > 0 || Boolean(summary?.recentNotes[0])) && (
        <div className="flex flex-wrap items-center gap-6 border-t border-border pt-3 text-xs text-muted-foreground">
          {(summary?.activeTimers ?? 0) > 0 && <span className="font-medium text-primary">{summary!.activeTimers} active timer{summary!.activeTimers === 1 ? '' : 's'}</span>}
          {(summary?.pendingDocuments ?? 0) > 0 && <span>{summary!.pendingDocuments} docs pending extraction</span>}
          {summary?.recentNotes[0] && <span><FileClock className="mr-1 inline size-3.5" />Last note updated {formatDate(summary.recentNotes[0].updatedAt)}</span>}
        </div>
      )}
    </div>
  );
}
