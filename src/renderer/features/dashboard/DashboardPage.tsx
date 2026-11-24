import { ArrowUpRight, Clock3, FileClock, FolderKanban, ListTodo, NotebookPen, ShieldAlert, Timer } from 'lucide-react';
import type { DashboardSummary, ProjectRecord } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatDate, formatRelative } from '@/lib/utils';

interface Props {
  summary: DashboardSummary | null;
  projects: ProjectRecord[];
  loading: boolean;
  onNavigate: (view: 'projects' | 'notes' | 'tasks' | 'documents') => void;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: typeof Clock3 }) {
  return (
    <div className="flex min-w-0 items-start gap-3 py-2">
      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-surface-subtle text-muted-foreground"><Icon className="size-4" strokeWidth={1.7} /></div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        <div className="text-xs font-medium">{label}</div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

export function DashboardPage({ summary, projects, loading, onNavigate }: Props) {
  const greeting = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  const active = projects.filter((project) => project.status === 'active');
  return (
    <div className="mx-auto max-w-[1180px] space-y-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{greeting}</p>
          <h2 className="text-[25px] font-semibold tracking-tight">A clear view of your work.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your projects, notes and next actions in one place.</p>
        </div>
        <Badge variant="outline" className="mb-1 gap-1.5 px-2.5 py-1"><span className="size-1.5 rounded-full bg-success" /> Local data</Badge>
      </div>

      <section className="grid grid-cols-2 gap-x-8 gap-y-3 border-y border-border py-4 md:grid-cols-4">
        <Metric label="Active projects" value={summary?.activeProjects ?? 0} detail="Currently in progress" icon={FolderKanban} />
        <Metric label="Open tasks" value={summary?.openTasks ?? 0} detail="Across all projects" icon={ListTodo} />
        <Metric label="Overdue" value={summary?.overdueTasks ?? 0} detail="Need your attention" icon={Clock3} />
        <Metric label="Blocked" value={summary?.blockedTasks ?? 0} detail="Waiting on something" icon={ShieldAlert} />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.85fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div><h3 className="text-sm font-semibold">Upcoming work</h3><p className="mt-0.5 text-xs text-muted-foreground">Due dates across your workspace</p></div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('tasks')}>All tasks <ArrowUpRight className="size-3.5" /></Button>
          </div>
          <Separator />
          {loading ? <p className="py-8 text-sm text-muted-foreground">Loading workspace…</p> : summary?.upcomingTasks.length ? (
            <div className="divide-y divide-border">
              {summary.upcomingTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 py-3">
                  <div className="size-1.5 shrink-0 rounded-full bg-primary/50" />
                  <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{task.title}</div><div className="mt-0.5 truncate text-[11px] text-muted-foreground">{projects.find((project) => project.id === task.projectId)?.name ?? 'Project'}</div></div>
                  <Badge variant={task.priority === 'urgent' || task.priority === 'high' ? 'warning' : 'secondary'}>{task.priority}</Badge>
                  <span className="w-[78px] text-right text-[11px] tabular-nums text-muted-foreground">{formatRelative(task.dueDate ?? task.dueAt!)}</span>
                </div>
              ))}
            </div>
          ) : <div className="py-9 text-center"><FileClock className="mx-auto mb-2 size-5 text-muted-foreground" /><p className="text-sm font-medium">No upcoming tasks</p><p className="mt-1 text-xs text-muted-foreground">Add a due date to a task to see it here.</p></div>}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Active projects</h3><p className="mt-0.5 text-xs text-muted-foreground">A pulse on current work</p></div><Button variant="ghost" size="sm" onClick={() => onNavigate('projects')}>All projects <ArrowUpRight className="size-3.5" /></Button></div>
          <Separator />
          {active.length ? <div className="divide-y divide-border">
            {active.slice(0, 5).map((project) => <div key={project.id} className="flex items-center gap-3 py-3"><div className="grid size-8 place-items-center rounded-md bg-surface-subtle"><FolderKanban className="size-4 text-muted-foreground" /></div><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{project.name}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{project.openTaskCount} open tasks · {project.noteCount} notes</div></div><Badge variant="outline">{project.type === 'greenfield' ? 'New' : 'Ongoing'}</Badge></div>)}
          </div> : <div className="py-8 text-center"><FolderKanban className="mx-auto mb-2 size-5 text-muted-foreground"/><p className="text-sm font-medium">No active projects yet</p><p className="mt-1 text-xs text-muted-foreground">Create a project to start organizing your work.</p><Button className="mt-3" size="sm" onClick={() => onNavigate('projects')}>Create project</Button></div>}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface-subtle/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-surface text-muted-foreground"><NotebookPen className="size-4" /></div><div><div className="text-sm font-semibold">Make space for the next thought</div><div className="mt-0.5 text-xs text-muted-foreground">Capture meeting notes, ideas or technical decisions without breaking your flow.</div></div></div>
          <Button variant="outline" size="sm" onClick={() => onNavigate('notes')}>Open notes <ArrowUpRight className="size-3.5" /></Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs text-muted-foreground md:grid-cols-4">
        <div className="flex items-center gap-2"><Timer className="size-3.5" />{summary?.activeTimers ?? 0} active timers</div>
        <div className="flex items-center gap-2"><FileClock className="size-3.5" />{summary?.pendingDocuments ?? 0} docs pending index</div>
        <div>Updated {summary?.recentNotes[0] ? formatDate(summary.recentNotes[0].updatedAt) : '—'}</div>
        <div className="text-right">{projects.length} total projects</div>
      </div>
    </div>
  );
}
