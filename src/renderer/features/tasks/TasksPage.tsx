import { PageHeader } from '@/components/shared/PageHeader';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarClock, CheckCircle2, Circle, Clock3, ChevronDown, ChevronRight, ListTodo, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import type { ActiveTimerRecord, TaskInput, TaskRecord, TaskStatus } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, friendlyError } from '@/lib/utils';
import { parseSmartDate } from '@domain/smart-date';
import { createTaskSchema, editTaskSchema, type CreateTaskForm, type EditTaskForm, statuses } from './task-form-schema';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useConfirm } from '@/components/shared/ConfirmProvider';
import { VirtualList } from '@/components/shared/VirtualList';
import { PageControls } from '@/components/shared/PageControls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { TaskCreateDialog } from './TaskCreateDialog';
import { TaskEditDialog } from './TaskEditDialog';
import { orderVisibleTasks, type OrderedTaskRow } from './task-tree';

const taskItemKey = (entry: OrderedTaskRow): string => entry.task.id;

interface Props {
  onCreate: (input: TaskInput) => Promise<TaskRecord>;
  onUpdate: (id: string, input: Partial<TaskInput> & { status?: TaskStatus }) => Promise<TaskRecord>;
  onRemove: (id: string) => Promise<void>;
  onStartTimer: (id: string) => Promise<void>;
  onStopTimer: (id: string) => Promise<number>;
  onResolveTimerRecovery: (id: string, action: 'resume' | 'stop' | 'discard', endedAt?: string) => Promise<void>;
  refresh: () => Promise<void>;
  activeTimer: ActiveTimerRecord | null;
}

export function TasksPage({ onCreate, onUpdate, onRemove, onStartTimer, onStopTimer, onResolveTimerRecovery, refresh, activeTimer }: Props) {
  const confirm = useConfirm();
  const [projectId, setProjectId] = useState('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const createTaskForm = useForm<CreateTaskForm>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { title: '', projectId: '', parentId: '', dueAt: '', estimate: '', priority: 'medium', description: '' },
  });
  const [selectedProject, parentId] = createTaskForm.watch(['projectId', 'parentId']);
  const editTaskForm = useForm<EditTaskForm>({
    resolver: zodResolver(editTaskSchema),
    defaultValues: { title: '', description: '', parentId: '', dueAt: '', estimate: '', priority: 'medium', status: 'not_started' },
    mode: 'onChange',
  });
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const editParentId = editTaskForm.watch('parentId');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [clockNow, setClockNow] = useState(Date.now());
  const [recoveryEndAt, setRecoveryEndAt] = useState(() => toDateTimeLocal(new Date()));
  const [pageTasks, setPageTasks] = useState<TaskRecord[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [pageOffset, setPageOffset] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const pageRequest = useRef(0);
  const pageSize = 50;
  const loadPage = useCallback(async (requestedOffset = pageOffset) => {
    const requestId = ++pageRequest.current;
    setPageLoading(true);
    try {
      const page = await window.devLedger.tasks.listPage({
        limit: pageSize, offset: requestedOffset, projectId: projectId === 'all' ? null : projectId,
        query: deferredQuery, includeCompleted: showCompleted,
      });
      if (requestId === pageRequest.current) {
        setPageTasks(page.items); setPageTotal(page.total);
        const ids = [...new Set(page.items.map((task) => task.projectId))];
        void window.devLedger.projects.getNames(ids).then((names) => { if (requestId === pageRequest.current) setProjectNames((current) => ({ ...current, ...names })); }).catch(() => undefined);
      }
    } finally { if (requestId === pageRequest.current) setPageLoading(false); }
  }, [deferredQuery, pageOffset, projectId, showCompleted]);
  useEffect(() => { void loadPage().catch((cause: unknown) => setError(friendlyError(cause, 'Tasks could not be loaded.'))); }, [loadPage]);
  useEffect(() => { if (activeTimer?.recoveryRequired) setRecoveryEndAt(toDateTimeLocal(new Date())); }, [activeTimer?.taskId, activeTimer?.recoveryRequired]);
  useEffect(() => {
    if (!activeTimer) return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeTimer?.taskId, activeTimer?.startedAt]);
  const elapsedEnd = activeTimer?.recoveryRequired ? Date.parse(activeTimer.lastHeartbeatAt ?? activeTimer.startedAt) : clockNow;
  const elapsedMs = activeTimer ? Math.max(0, elapsedEnd - Date.parse(activeTimer.startedAt)) : 0;
  const elapsedHours = elapsedMs / 3_600_000;
  const crossedLocalDay = Boolean(activeTimer && new Date(activeTimer.startedAt).toDateString() !== new Date(elapsedEnd).toDateString());
  const elapsedLabel = `${String(Math.floor(elapsedMs / 3_600_000)).padStart(2, '0')}:${String(Math.floor((elapsedMs % 3_600_000) / 60_000)).padStart(2, '0')}:${String(Math.floor((elapsedMs % 60_000) / 1_000)).padStart(2, '0')}`;
  const orderedVisible = useMemo(() => orderVisibleTasks(pageTasks, pageTasks, collapsedIds), [pageTasks, collapsedIds]);

  function toggleExpanded(taskId: string) {
    setCollapsedIds((current) => { const next = new Set(current); if (next.has(taskId)) next.delete(taskId); else next.add(taskId); return next; });
  }
  function resolveDueDate(value: string): { dueAt: string | null; dueDate: string | null } {
    if (!value.trim()) return { dueAt: null, dueDate: null };
    const parsed = parseSmartDate(value);
    return parsed.kind === 'datetime' ? { dueAt: parsed.isoUtc, dueDate: null } : { dueAt: null, dueDate: parsed.date };
  }
  function openCreateModal() {
    setError('');
    createTaskForm.clearErrors();
    createTaskForm.reset({ title: '', projectId: projectId === 'all' ? '' : projectId, parentId: '', dueAt: '', estimate: '', priority: 'medium', description: '' });
    setCreateOpen(true);
  }
  function beginEdit(task: TaskRecord) {
    setEditingTask(task);
    let dueAtValue = '';
    if (task.dueDate) { const [year, month, day] = task.dueDate.split('-'); dueAtValue = `${day}/${month}/${year}`; }
    else if (task.dueAt) {
      const date = new Date(task.dueAt);
      const parts = [date.getDate(), date.getMonth() + 1, date.getFullYear() % 100, date.getHours(), date.getMinutes()];
      dueAtValue = `@${String(parts[0]).padStart(2, '0')}${String(parts[1]).padStart(2, '0')}${String(parts[2]).padStart(2, '0')}${String(parts[3]).padStart(2, '0')}${String(parts[4]).padStart(2, '0')}`;
    }
    editTaskForm.reset({ title: task.title, description: task.description, parentId: task.parentId ?? '', dueAt: dueAtValue, estimate: task.estimateMinutes === null ? '' : String(task.estimateMinutes), priority: task.priority, status: task.status });
    setError('');
  }
  function closeEdit() { setEditingTask(null); editTaskForm.reset({ title: '', description: '', parentId: '', dueAt: '', estimate: '', priority: 'medium', status: 'not_started' }); }

  const saveEdit = editTaskForm.handleSubmit(async (values) => {
    if (!editingTask) return;
    setError(''); editTaskForm.clearErrors('root'); setBusyId(editingTask.id);
    try {
      await onUpdate(editingTask.id, { title: values.title.trim(), description: values.description, parentId: values.parentId || null, ...resolveDueDate(values.dueAt), estimateMinutes: values.estimate ? Number(values.estimate) : null, priority: values.priority, status: values.status });
      await loadPage(); closeEdit();
    } catch (caught) {
      const message = friendlyError(caught, 'Task could not be saved.');
      editTaskForm.setError('root', { type: 'server', message }); setError(message);
    } finally { setBusyId(null); }
  });
  const create = createTaskForm.handleSubmit(async (values) => {
    setError(''); createTaskForm.clearErrors('root'); setCreating(true);
    try {
      await onCreate({ projectId: values.projectId, parentId: values.parentId || null, title: values.title.trim(), description: values.description, ...resolveDueDate(values.dueAt), estimateMinutes: values.estimate ? Number(values.estimate) : null, priority: values.priority });
      setPageOffset(0); await loadPage(0); setCreateOpen(false);
      createTaskForm.reset({ title: '', projectId: values.projectId, parentId: '', dueAt: '', estimate: '', priority: 'medium', description: '' });
    } catch (caught) {
      const message = friendlyError(caught, 'Task could not be created.');
      createTaskForm.setError('root', { type: 'server', message });
    } finally { setCreating(false); }
  });
  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id); setError('');
    try { await action(); await refresh(); await loadPage(); }
    catch (caught) { setError(friendlyError(caught, 'Task action failed.')); }
    finally { setBusyId(null); }
  }
  async function recoverTimer(action: 'resume' | 'stop' | 'discard') {
    if (!activeTimer) return;
    if (action === 'discard') {
      const accepted = await confirm({ title: 'Discard interrupted timer?', description: 'The unconfirmed timer entry will be removed. This is intended for sessions that continued counting while you were away.', confirmLabel: 'Discard session', destructive: true });
      if (!accepted) return;
    }
    const endedAt = action === 'stop' ? new Date(recoveryEndAt).toISOString() : undefined;
    await run(activeTimer.taskId, () => onResolveTimerRecovery(activeTimer.taskId, action, endedAt));
  }
  async function stopActiveTimer(taskId: string) {
    if (elapsedHours >= 8 || crossedLocalDay) {
      const warning = crossedLocalDay ? 'This timer crossed a local calendar day.' : 'This timer has been running for at least eight hours.';
      const accepted = await confirm({ title: 'Review long timer session', description: `${warning} Stop and save the full elapsed duration (${elapsedLabel})? No time will be adjusted automatically. You can review the entry in Operations → Time afterwards.`, confirmLabel: 'Stop and save', destructive: false });
      if (!accepted) return;
    }
    await run(taskId, () => onStopTimer(taskId));
  }

  return <div className="workspace-page page-tasks mx-auto space-y-5">
    <PageHeader title="Tasks" description="Create, prioritize and track work across your projects." actions={<><Button variant={showCompleted ? 'secondary' : 'outline'} size="sm" onClick={() => { setPageOffset(0); setShowCompleted((v) => !v); }}>{showCompleted ? 'Hide completed' : 'Show completed'}</Button><Button onClick={openCreateModal}><Plus className="size-4"/>New task</Button></>} />
    {error && <Alert variant="destructive" className="py-2"><AlertDescription>{error}</AlertDescription></Alert>}
    {activeTimer && <div className={`task-timer flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${activeTimer.recoveryRequired || elapsedHours >= 8 || crossedLocalDay ? 'border-warning/50 bg-warning/5' : 'border-border bg-card'}`}><Clock3 className="size-4 text-muted-foreground"/><div className="min-w-0 flex-1"><p className="text-xs font-medium">{activeTimer.recoveryRequired ? 'Interrupted timer needs review' : 'Timer running'} · {pageTasks.find((task) => task.id === activeTimer.taskId)?.title ?? 'Task'}</p><p className="font-mono text-sm tabular-nums">{activeTimer.recoveryRequired ? 'Known time: ' : ''}{elapsedLabel}</p></div>{(activeTimer.recoveryRequired || elapsedHours >= 8 || crossedLocalDay) && <Badge variant="warning">Review session</Badge>}<Button size="sm" variant="outline" disabled={activeTimer.recoveryRequired} onClick={() => void stopActiveTimer(activeTimer.taskId)}><Square className="size-3.5"/>Stop timer</Button></div>}
    {activeTimer?.recoveryRequired && <Alert className="border-warning/50 bg-warning/5"><AlertDescription className="space-y-3"><div><p className="text-sm font-semibold text-foreground">Confirm the interrupted work session</p><p className="mt-1 text-xs leading-relaxed">DevLedger found a timer that was active before this app session began. Confirm an end time, or continue from now.</p></div><label className="block max-w-sm space-y-1 text-xs font-medium">I stopped working at<Input type="datetime-local" value={recoveryEndAt} onChange={(event) => setRecoveryEndAt(event.target.value)} max={toDateTimeLocal(new Date())} min={toDateTimeLocal(new Date(activeTimer.startedAt))}/></label><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void recoverTimer('stop')} disabled={!recoveryEndAt}>Save confirmed time</Button><Button size="sm" variant="outline" onClick={() => void recoverTimer('resume')}>Continue from now</Button><Button size="sm" variant="ghost" className="text-danger" onClick={() => void recoverTimer('discard')}>Discard session</Button></div></AlertDescription></Alert>}
    <div className="workspace-toolbar"><div className="relative min-w-[220px] max-w-sm flex-1"><ListTodo className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" aria-label="Filter tasks by title or description" value={query} onChange={(e) => { setPageOffset(0); setQuery(e.target.value); }} placeholder="Filter tasks…"/></div><RemoteRecordPicker entityType="project" value={projectId === 'all' ? '' : projectId} onValueChange={(value) => { setPageOffset(0); setProjectId(value || 'all'); }} placeholder="All projects" selectedLabel={projectId === 'all' ? undefined : projectNames[projectId]} className="w-48" /><Badge variant="secondary" className="ml-auto">{pageTotal} task{pageTotal === 1 ? '' : 's'}</Badge></div>
    <div className="workspace-surface task-queue">
      {pageLoading ? <p className="py-12 text-center text-xs text-muted-foreground">Loading tasks…</p> : <VirtualList items={orderedVisible} itemKey={taskItemKey} itemHeight={104} label="Workspace tasks" className="max-h-[min(70vh,760px)]" empty={<div className="py-16 text-center"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-surface-subtle text-muted-foreground"><ListTodo className="size-5"/></div><p className="text-sm font-medium">{query || projectId !== 'all' ? 'No tasks match this view' : 'No tasks yet'}</p><p className="mt-1 text-xs text-muted-foreground">Create a task to organize work, priorities and time tracking.</p><Button size="sm" className="mt-4" onClick={openCreateModal}><Plus className="size-3.5"/>New task</Button></div>} renderItem={({ task, depth, hasChildren, contextOnly }) => <div className={`task-row grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-2 md:grid-cols-[minmax(220px,1fr)_145px_110px_135px_190px] md:gap-3 md:px-4 md:py-3 ${contextOnly ? 'bg-muted/30' : ''}`}><div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 shrink-0" style={{ width: `${Math.min(depth, 5) * 14}px` }} aria-hidden="true" />
        {hasChildren ? <button type="button" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`${collapsedIds.has(task.id) ? 'Expand' : 'Collapse'} ${task.title}`} aria-expanded={!collapsedIds.has(task.id)} onClick={() => toggleExpanded(task.id)}>{collapsedIds.has(task.id) ? <ChevronRight className="size-3.5"/> : <ChevronDown className="size-3.5"/>}</button> : <span className="size-5 shrink-0" aria-hidden="true"/>}
        <button type="button" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label={task.status === 'completed' ? 'Reopen task' : 'Complete task'} onClick={() => void run(task.id, () => onUpdate(task.id, { status: task.status === 'completed' ? 'not_started' : 'completed' }))}>{task.status === 'completed' ? <CheckCircle2 className="size-4 text-success"/> : <Circle className="size-4"/>}</button><div className="min-w-0"><p className={`truncate text-[13px] font-medium ${task.status === 'completed' ? 'text-muted-foreground line-through' : ''}`}>{task.title}{contextOnly && <span className="ml-2 text-[10px] font-normal text-muted-foreground">Parent context</span>}</p>{task.description && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{task.description}</p>}<p className="mt-1 text-[10px] text-muted-foreground">{projectNames[task.projectId] ?? 'Project'}{task.parentId ? ' · Subtask' : ''}</p><p className="task-inline-context mt-1 text-[11px] text-muted-foreground">{task.status.replaceAll('_', ' ')} · {task.priority} · {task.dueDate || task.dueAt ? formatDate(task.dueDate ?? task.dueAt) : 'No due date'}</p></div></div>
        <div className="task-status-cell hidden md:block"><Select value={task.status} onValueChange={(value) => void run(task.id, () => onUpdate(task.id, { status: value as TaskStatus }))}><SelectTrigger aria-label={`Status for ${task.title}`} size="sm" className="w-full text-[11px]"><SelectValue/></SelectTrigger><SelectContent>{statuses.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="task-priority-cell hidden items-center gap-1.5 md:flex"><Badge variant={task.priority === 'urgent' ? 'destructive' : task.priority === 'high' ? 'warning' : 'secondary'}>{task.priority}</Badge></div>
        <div className="task-due-cell hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex">{task.dueDate || task.dueAt ? <><CalendarClock className="size-3.5"/>{formatDate(task.dueDate ?? task.dueAt)}</> : <span>No due date</span>}</div>
        <div className="col-start-2 row-start-1 flex items-center justify-end gap-0.5 md:col-auto md:row-auto md:gap-1">{task.estimateMinutes !== null && <span className="mr-auto rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{task.estimateMinutes}m</span>}<Button size="icon" variant="ghost" className="size-8" title="Edit task" aria-label={`Edit ${task.title}`} onClick={() => beginEdit(task)}><Pencil className="size-3.5"/></Button>{activeTimer?.taskId === task.id ? <Button size="icon" variant="secondary" className="size-8" title="Stop timer" aria-label={`Stop timer for ${task.title}`} disabled={busyId === task.id} onClick={() => void stopActiveTimer(task.id)}><Square className="size-3.5"/></Button> : <Button size="icon" variant="ghost" className="size-8" title="Start timer" aria-label={`Start timer for ${task.title}`} disabled={busyId === task.id || Boolean(activeTimer) || ['completed', 'cancelled'].includes(task.status)} onClick={() => void run(task.id, () => onStartTimer(task.id))}><Play className="size-3.5"/></Button>}<Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-danger" title="Move to trash" aria-label={`Move ${task.title} to trash`} disabled={busyId === task.id} onClick={() => { void (async () => { const accepted = await confirm({ title: 'Move task to trash?', description: `“${task.title}” will be moved to trash. You can recover it if trash recovery is enabled.`, confirmLabel: 'Move to trash', destructive: true }); if (accepted) await run(task.id, () => onRemove(task.id)); })(); }}><Trash2 className="size-3.5"/></Button></div>
      </div>} />}
    </div>
    <PageControls offset={pageOffset} limit={pageSize} total={pageTotal} disabled={pageLoading} onPageChange={setPageOffset}/>
    <TaskCreateDialog open={createOpen} form={createTaskForm} busy={creating} error={error} selectedProject={selectedProject} selectedProjectLabel={projectNames[selectedProject]} selectedParentLabel={pageTasks.find((item) => item.id === parentId)?.title} onProjectChange={(value, label) => { createTaskForm.setValue('projectId', value, { shouldValidate: true }); createTaskForm.setValue('parentId', ''); if (value && label) setProjectNames((current) => ({ ...current, [value]: label })); }} onClose={() => setCreateOpen(false)} onSubmit={create}/>
    <TaskEditDialog task={editingTask} form={editTaskForm} busy={busyId === editingTask?.id} error={error} selectedParentLabel={pageTasks.find((item) => item.id === editParentId)?.title} onClose={closeEdit} onSave={saveEdit}/>
  </div>;
}

function toDateTimeLocal(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
