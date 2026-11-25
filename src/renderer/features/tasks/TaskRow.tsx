import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDot, Pencil, Play, Square, Trash2 } from 'lucide-react';
import type { ActiveTimerRecord, TaskRecord, TaskStatus, WorkspaceNavigationTarget } from '@shared/contracts';
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
  medium: 'bg-primary/70',
  low: 'bg-muted-foreground/50',
};

export function TaskRow({
  task, depth, hasChildren, contextOnly, collapsed, projectName, activeTimer, busy,
  onToggleCollapse, onInspect, onStatusChange, onEdit, onStartTimer, onStopTimer, onDelete, onNavigateTarget,
}: TaskRowProps) {
  const isCompleted = task.status === 'completed';
  const isRunning = activeTimer?.taskId === task.id;
  const rawDue = task.dueDate ?? task.dueAt;
  const dueMs = rawDue ? Date.parse(rawDue.length === 10 ? `${rawDue}T23:59:59` : rawDue) : NaN;
  const overdue = !isCompleted && task.status !== 'cancelled' && Number.isFinite(dueMs) && dueMs < Date.now();

  return (
    <div className={`task-row group grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 md:grid-cols-[minmax(240px,1fr)_136px_96px_124px_128px] md:gap-3 md:px-4 ${contextOnly ? 'bg-surface-subtle/40 opacity-80' : ''} ${isRunning ? 'bg-primary/[0.04]' : ''}`}>
      <div className="flex min-w-0 items-center gap-2">
        {depth > 0 && <span className="h-4 shrink-0 border-l border-border/70" style={{ width: `${Math.min(depth, 5) * 14}px` }} aria-hidden="true" />}
        {hasChildren
          ? <button type="button" className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${task.title}`} onClick={() => onToggleCollapse(task.id)}>{collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}</button>
          : <span className="size-5 shrink-0" aria-hidden="true" />}
        <button
          type="button"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={isCompleted ? 'Reopen task' : 'Complete task'}
          onClick={() => onStatusChange(task.id, isCompleted ? 'not_started' : 'completed')}
        >
          {isCompleted ? <CheckCircle2 className="size-4 text-success" />
            : task.status === 'blocked' ? <AlertCircle className="size-4 text-warning" />
              : task.status === 'in_progress' ? <CircleDot className="size-4 text-primary" />
                : <Circle className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onInspect(task.id)} className={`max-w-full truncate text-left text-sm font-medium hover:text-primary ${isCompleted ? 'text-muted-foreground line-through' : ''}`}>
              {task.title}
            </button>
            {isRunning && <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Running</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <button type="button" onClick={() => onNavigateTarget({ view: 'projects', recordId: task.projectId })} className="truncate hover:text-foreground hover:underline">{projectName}</button>
            {task.parentId && <span>· Subtask</span>}
            {task.estimateMinutes !== null && <span className="tabular-nums">· {task.estimateMinutes}m</span>}
            <span className="task-inline-context">· {task.status.replaceAll('_', ' ')}</span>
          </div>
        </div>
      </div>

      <div className="task-status-cell hidden md:block">
        <Select value={task.status} onValueChange={(v) => onStatusChange(task.id, v as TaskStatus)}>
          <SelectTrigger aria-label={`Status for ${task.title}`} size="sm" className="h-7 w-full border-transparent bg-transparent px-2 text-xs shadow-none hover:border-border hover:bg-surface-subtle">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="task-priority-cell hidden items-center gap-1.5 text-xs capitalize md:flex">
        <span className={`size-2 rounded-full ${PRIORITY_TONE[task.priority]}`} aria-hidden="true" />
        <span className={task.priority === 'urgent' ? 'font-medium text-danger' : 'text-muted-foreground'}>{task.priority}</span>
      </div>

      <div className={`task-due-cell hidden items-center gap-1 text-xs md:flex ${overdue ? 'font-medium text-danger' : 'text-muted-foreground'}`}>
        {rawDue ? <><CalendarClock className="size-3.5 shrink-0" /><span>{formatDate(rawDue)}</span></> : <span>—</span>}
      </div>

      <div className="flex items-center justify-end gap-0.5">
        <Button size="icon" variant="ghost" className="size-7 text-muted-foreground opacity-75 transition-opacity hover:text-foreground group-hover:opacity-100" aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)}><Pencil className="size-3.5" /></Button>
        {isRunning ? (
          <Button size="icon" variant="secondary" className="size-7" aria-label={`Stop timer for ${task.title}`} disabled={busy} onClick={() => onStopTimer(task.id)}><Square className="size-3" /></Button>
        ) : (
          <Button size="icon" variant="ghost" className="size-7 text-muted-foreground opacity-75 transition-opacity hover:text-foreground group-hover:opacity-100" aria-label={`Start timer for ${task.title}`} disabled={busy || Boolean(activeTimer) || ['completed', 'cancelled'].includes(task.status)} onClick={() => onStartTimer(task.id)}><Play className="size-3.5" /></Button>
        )}
        <Button size="icon" variant="ghost" className="size-7 text-muted-foreground opacity-75 transition-opacity hover:text-danger group-hover:opacity-100" aria-label={`Move ${task.title} to trash`} disabled={busy} onClick={() => onDelete(task)}><Trash2 className="size-3.5" /></Button>
      </div>
    </div>
  );
}
