import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ListTodo, Plus, Square } from 'lucide-react';
import type { ActiveTimerRecord, TaskInput, TaskRecord, TaskStatus, WorkspaceNavigationTarget } from '@shared/contracts';
import { parseSmartDate } from '@domain/smart-date';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { useConfirm } from '@/components/shared/ConfirmProvider';
import { VirtualList } from '@/components/shared/VirtualList';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/lib/utils';
import { TaskCreateDialog } from './TaskCreateDialog';
import { TaskEditDialog } from './TaskEditDialog';
import { TaskInspectorSheet } from './TaskInspectorSheet';
import { TaskRow } from './TaskRow';
import { createTaskSchema, editTaskSchema, type CreateTaskForm, type EditTaskForm } from './task-form-schema';
import { orderVisibleTasks, type OrderedTaskRow } from './task-tree';

const taskItemKey = (entry: OrderedTaskRow): string => entry.task.id;
const toDateTimeLocal = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
type TaskViewTab = 'active' | 'in_progress' | 'blocked' | 'completed';

interface Props {
  focusTaskId?: string | undefined;
  initialProjectId?: string | null | undefined;
  onConsumeFocus?: () => void;
  onCreate: (input: TaskInput) => Promise<TaskRecord>;
  onUpdate: (id: string, input: Partial<TaskInput> & { status?: TaskStatus }) => Promise<TaskRecord>;
  onRemove: (id: string) => Promise<void>;
  onStartTimer: (id: string) => Promise<void>;
  onStopTimer: (id: string) => Promise<number>;
  onResolveTimerRecovery: (id: string, action: 'resume' | 'stop' | 'discard', endedAt?: string) => Promise<void>;
  refresh: () => Promise<void>;
  activeTimer: ActiveTimerRecord | null;
  onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}

export function TasksPage({
  focusTaskId, initialProjectId, onConsumeFocus, onCreate, onUpdate, onRemove,
  onStartTimer, onStopTimer, onResolveTimerRecovery, refresh, activeTimer, onNavigateTarget,
}: Props) {
  const confirm = useConfirm();
  const [projectId, setProjectId] = useState(initialProjectId || 'all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [inspectedTaskId, setInspectedTaskId] = useState<string | null>(null);
  const [inspectedFallback, setInspectedFallback] = useState<TaskRecord | null>(null);
  const createTaskForm = useForm<CreateTaskForm>({ resolver: zodResolver(createTaskSchema), defaultValues: { title: '', projectId: '', parentId: '', dueAt: '', estimate: '', priority: 'medium', description: '' } });
  const [selectedProject, parentId] = createTaskForm.watch(['projectId', 'parentId']);
  const editTaskForm = useForm<EditTaskForm>({ resolver: zodResolver(editTaskSchema), defaultValues: { title: '', description: '', parentId: '', dueAt: '', estimate: '', priority: 'medium', status: 'not_started' }, mode: 'onChange' });
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const editParentId = editTaskForm.watch('parentId');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [viewTab, setViewTab] = useState<TaskViewTab>('active');
  const showCompleted = viewTab === 'completed';
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

  useEffect(() => {
    if (initialProjectId) { setProjectId(initialProjectId); setPageOffset(0); }
    if (focusTaskId) { setInspectedTaskId(focusTaskId); }
    if (initialProjectId || focusTaskId) onConsumeFocus?.();
  }, [initialProjectId, focusTaskId, onConsumeFocus]);

  const loadPage = useCallback(async (requestedOffset = pageOffset) => {
    const requestId = ++pageRequest.current;
    setPageLoading(true);
    try {
      const page = await window.devLedger.tasks.listPage({ limit: pageSize, offset: requestedOffset, projectId: projectId === 'all' ? null : projectId, query: deferredQuery, includeCompleted: showCompleted });
      if (requestId === pageRequest.current) {
        setPageTasks(page.items); setPageTotal(page.total);
        const ids = [...new Set(page.items.map((t) => t.projectId))];
        void window.devLedger.projects.getNames(ids).then((names) => { if (requestId === pageRequest.current) setProjectNames((c) => ({ ...c, ...names })); }).catch(() => undefined);
      }
    } finally { if (requestId === pageRequest.current) setPageLoading(false); }
  }, [deferredQuery, pageOffset, projectId, showCompleted]);

  useEffect(() => { void loadPage().catch((cause: unknown) => setError(friendlyError(cause, 'Tasks could not be loaded.'))); }, [loadPage]);
  useEffect(() => { if (activeTimer?.recoveryRequired) setRecoveryEndAt(toDateTimeLocal(new Date())); }, [activeTimer?.taskId, activeTimer?.recoveryRequired]);
  useEffect(() => { if (!activeTimer) return; const id = window.setInterval(() => setClockNow(Date.now()), 1000); return () => window.clearInterval(id); }, [activeTimer?.taskId, activeTimer?.startedAt]);

  const elapsedEnd = activeTimer?.recoveryRequired ? Date.parse(activeTimer.lastHeartbeatAt ?? activeTimer.startedAt) : clockNow;
  const elapsedMs = activeTimer ? Math.max(0, elapsedEnd - Date.parse(activeTimer.startedAt)) : 0;
  const elapsedHours = elapsedMs / 3_600_000;
  const crossedLocalDay = Boolean(activeTimer && new Date(activeTimer.startedAt).toDateString() !== new Date(elapsedEnd).toDateString());
  const elapsedLabel = `${String(Math.floor(elapsedMs / 3_600_000)).padStart(2, '0')}:${String(Math.floor((elapsedMs % 3_600_000) / 60_000)).padStart(2, '0')}:${String(Math.floor((elapsedMs % 60_000) / 1_000)).padStart(2, '0')}`;
  const orderedVisible = useMemo(() => {
    const matched = viewTab === 'active' ? pageTasks : pageTasks.filter((task) => task.status === viewTab);
    return orderVisibleTasks(pageTasks, matched, collapsedIds);
  }, [pageTasks, viewTab, collapsedIds]);
  const inspectedTask = pageTasks.find((t) => t.id === inspectedTaskId) ?? (inspectedFallback?.id === inspectedTaskId ? inspectedFallback : null);

  useEffect(() => {
    if (!inspectedTaskId || pageTasks.some((t) => t.id === inspectedTaskId)) { setInspectedFallback(null); return; }
    let active = true;
    void window.devLedger.tasks.listPage({ limit: 200, offset: 0, includeCompleted: true })
      .then((page) => { if (active) setInspectedFallback(page.items.find((t) => t.id === inspectedTaskId) ?? null); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [inspectedTaskId, pageTasks]);

  function resolveDueDate(value: string) {
    if (!value.trim()) return { dueAt: null, dueDate: null };
    const parsed = parseSmartDate(value);
    return parsed.kind === 'datetime' ? { dueAt: parsed.isoUtc, dueDate: null } : { dueAt: null, dueDate: parsed.date };
  }
  function openCreateModal() {
    setError(''); createTaskForm.clearErrors();
    createTaskForm.reset({ title: '', projectId: projectId === 'all' ? '' : projectId, parentId: '', dueAt: '', estimate: '', priority: 'medium', description: '' });
    setCreateOpen(true);
  }
  function beginEdit(task: TaskRecord) {
    setEditingTask(task);
    let dueAtValue = '';
    if (task.dueDate) { dueAtValue = task.dueDate; }
    else if (task.dueAt) {
      const dt = new Date(task.dueAt);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const mm = String(dt.getMinutes()).padStart(2, '0');
      dueAtValue = `${y}-${m}-${d} ${hh}:${mm}`;
    }
    editTaskForm.reset({ title: task.title, description: task.description, parentId: task.parentId ?? '', dueAt: dueAtValue, estimate: task.estimateMinutes === null ? '' : String(task.estimateMinutes), priority: task.priority, status: task.status });
    setError('');
  }
  const saveEdit = editTaskForm.handleSubmit(async (values) => {
    if (!editingTask) return;
    setError(''); editTaskForm.clearErrors('root'); setBusyId(editingTask.id);
    try { await onUpdate(editingTask.id, { title: values.title.trim(), description: values.description, parentId: values.parentId || null, ...resolveDueDate(values.dueAt), estimateMinutes: values.estimate ? Number(values.estimate) : null, priority: values.priority, status: values.status }); await loadPage(); setEditingTask(null); }
    catch (caught) { editTaskForm.setError('root', { type: 'server', message: friendlyError(caught, 'Task could not be saved.') }); }
    finally { setBusyId(null); }
  });
  const create = createTaskForm.handleSubmit(async (values) => {
    setError(''); createTaskForm.clearErrors('root'); setCreating(true);
    try { await onCreate({ projectId: values.projectId, parentId: values.parentId || null, title: values.title.trim(), description: values.description, ...resolveDueDate(values.dueAt), estimateMinutes: values.estimate ? Number(values.estimate) : null, priority: values.priority }); setPageOffset(0); await loadPage(0); setCreateOpen(false); }
    catch (caught) { createTaskForm.setError('root', { type: 'server', message: friendlyError(caught, 'Task could not be created.') }); }
    finally { setCreating(false); }
  });
  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id); setError('');
    try { await action(); await refresh(); await loadPage(); }
    catch (caught) { setError(friendlyError(caught, 'Task action failed.')); }
    finally { setBusyId(null); }
  }
  async function recoverTimer(action: 'resume' | 'stop' | 'discard') {
    if (!activeTimer) return;
    if (action === 'discard' && !(await confirm({ title: 'Discard interrupted timer?', description: 'The unconfirmed session will be deleted.', confirmLabel: 'Discard', destructive: true }))) return;
    await run(activeTimer.taskId, () => onResolveTimerRecovery(activeTimer.taskId, action, action === 'stop' ? new Date(recoveryEndAt).toISOString() : undefined));
  }
  async function stopActiveTimer(taskId: string) {
    if ((elapsedHours >= 8 || crossedLocalDay) && !(await confirm({ title: 'Save long timer session?', description: `Save full duration (${elapsedLabel})? You can edit entries later inside the task inspector.`, confirmLabel: 'Stop and save' }))) return;
    await run(taskId, () => onStopTimer(taskId));
  }

  return (
    <div className="workspace-page page-tasks mx-auto space-y-4">
      <PageHeader title="Tasks" description="Click any task to manage blockers, dependencies, time logs, tags and reminders." actions={<Button size="sm" onClick={openCreateModal}><Plus className="size-3.5" />New task</Button>} />
      {error && <Alert variant="destructive" className="py-2"><AlertDescription>{error}</AlertDescription></Alert>}
      {activeTimer && <div className={`task-timer flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 ${activeTimer.recoveryRequired || elapsedHours >= 8 || crossedLocalDay ? 'border-warning/50 bg-warning/5' : 'border-border'}`}><span className="size-2 shrink-0 rounded-full bg-primary" /><div className="min-w-0 flex-1 text-xs"><button type="button" onClick={() => setInspectedTaskId(activeTimer.taskId)} className="font-medium hover:underline">{activeTimer.recoveryRequired ? 'Interrupted timer needs review' : 'Timer running'} · {pageTasks.find((t) => t.id === activeTimer.taskId)?.title ?? 'Task'}</button><p className="font-mono text-sm font-semibold tabular-nums">{elapsedLabel}</p></div><Button size="sm" variant="outline" disabled={activeTimer.recoveryRequired} onClick={() => void stopActiveTimer(activeTimer.taskId)}><Square className="size-3.5" />Stop timer</Button></div>}
      {activeTimer?.recoveryRequired && <Alert className="border-warning/50 bg-warning/5"><AlertDescription className="space-y-3 text-xs"><p className="font-semibold">Confirm interrupted work session</p><Input type="datetime-local" value={recoveryEndAt} onChange={(e) => setRecoveryEndAt(e.target.value)} max={toDateTimeLocal(new Date())} min={toDateTimeLocal(new Date(activeTimer.startedAt))} className="max-w-xs" /><div className="flex gap-2"><Button size="sm" onClick={() => void recoverTimer('stop')} disabled={!recoveryEndAt}>Save confirmed time</Button><Button size="sm" variant="outline" onClick={() => void recoverTimer('resume')}>Continue from now</Button><Button size="sm" variant="ghost" className="text-danger" onClick={() => void recoverTimer('discard')}>Discard</Button></div></AlertDescription></Alert>}

      <div className="workspace-toolbar justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
            {([['active', 'Active'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['completed', 'Completed']] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => { setPageOffset(0); setViewTab(key); }} className={`rounded px-2.5 py-1 font-medium transition-colors ${viewTab === key ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
            ))}
          </div>
          <div className="relative min-w-[200px] max-w-xs flex-1"><ListTodo className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" aria-label="Filter tasks by title or description" value={query} onChange={(e) => { setPageOffset(0); setQuery(e.target.value); }} placeholder="Filter tasks…" /></div>
          <RemoteRecordPicker entityType="project" value={projectId === 'all' ? '' : projectId} onValueChange={(v) => { setPageOffset(0); setProjectId(v || 'all'); }} placeholder="All projects" selectedLabel={projectId === 'all' ? undefined : projectNames[projectId]} className="w-44" />
        </div>
        <Badge variant="secondary" className="tabular-nums">{orderedVisible.length}{viewTab === 'active' ? '' : ` of ${pageTotal}`} task{orderedVisible.length === 1 ? '' : 's'}</Badge>
      </div>

      <div className="workspace-surface task-queue">
        <div className="hidden grid-cols-[minmax(240px,1fr)_136px_96px_124px_128px] gap-3 border-b border-border bg-surface-subtle px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
          <span>Task</span><span>Status</span><span>Priority</span><span>Due</span><span className="text-right">Actions</span>
        </div>
        {pageLoading ? <p className="py-12 text-center text-xs text-muted-foreground">Loading tasks…</p> : <VirtualList items={orderedVisible} itemKey={taskItemKey} itemHeight={60} label="Workspace tasks" className="max-h-[min(72vh,760px)]" empty={<div className="py-14 text-center"><ListTodo className="mx-auto mb-2.5 size-5 text-muted-foreground" /><p className="text-sm font-medium">{query || projectId !== 'all' || viewTab !== 'active' ? 'No tasks match this view' : 'No tasks yet'}</p><Button size="sm" className="mt-4" onClick={openCreateModal}><Plus className="size-3.5" />New task</Button></div>} renderItem={({ task, depth, hasChildren, contextOnly }) => (
          <TaskRow
            task={task} depth={depth} hasChildren={hasChildren} contextOnly={contextOnly} collapsed={collapsedIds.has(task.id)}
            projectName={projectNames[task.projectId] ?? 'Project'} activeTimer={activeTimer} busy={busyId === task.id}
            onToggleCollapse={(id) => setCollapsedIds((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
            onInspect={setInspectedTaskId}
            onStatusChange={(id, status) => void run(id, () => onUpdate(id, { status }))}
            onEdit={beginEdit}
            onStartTimer={(id) => void run(id, () => onStartTimer(id))}
            onStopTimer={(id) => void stopActiveTimer(id)}
            onDelete={(item) => { void (async () => { if (await confirm({ title: 'Move task to trash?', description: `“${item.title}” will be moved to trash.`, confirmLabel: 'Move to trash', destructive: true })) await run(item.id, () => onRemove(item.id)); })(); }}
            onNavigateTarget={onNavigateTarget}
          />
        )} />}
      </div>

      <PageControls offset={pageOffset} limit={pageSize} total={pageTotal} disabled={pageLoading} onPageChange={setPageOffset} />
      <TaskInspectorSheet task={inspectedTask} projectName={inspectedTask ? projectNames[inspectedTask.projectId] : undefined} activeTimer={activeTimer} onClose={() => setInspectedTaskId(null)} onEdit={beginEdit} onUpdate={onUpdate} onRemove={async (id) => { await onRemove(id); await loadPage(); }} onStartTimer={onStartTimer} onStopTimer={onStopTimer} onNavigate={onNavigateTarget} onRefreshParent={async () => { await refresh(); await loadPage(); }} />
      <TaskCreateDialog open={createOpen} form={createTaskForm} busy={creating} error={error} selectedProject={selectedProject} selectedProjectLabel={projectNames[selectedProject]} selectedParentLabel={pageTasks.find((i) => i.id === parentId)?.title} onProjectChange={(v, l) => { createTaskForm.setValue('projectId', v, { shouldValidate: true }); createTaskForm.setValue('parentId', ''); if (v && l) setProjectNames((c) => ({ ...c, [v]: l })); }} onClose={() => setCreateOpen(false)} onSubmit={create} />
      <TaskEditDialog task={editingTask} form={editTaskForm} busy={busyId === editingTask?.id} error={error} selectedParentLabel={pageTasks.find((i) => i.id === editParentId)?.title} onClose={() => setEditingTask(null)} onSave={saveEdit} />
    </div>
  );
}
