import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ListTodo, Plus } from 'lucide-react';
import type {
    ActiveTimerRecord,
    TaskInput,
    TaskRecord,
    TaskRelationSummary,
    TaskStatus,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { parseSmartDate } from '@domain/smart-date';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SearchFilterInput } from '@/components/shared/SearchFilterInput';
import { useConfirm } from '@/components/shared/confirm-context';
import { VirtualList } from '@/components/shared/VirtualList';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { friendlyError } from '@/lib/utils';
import { TaskActiveTimerBanner } from './TaskActiveTimerBanner';
import { TaskCreateDialog } from './TaskCreateDialog';
import { TaskEditDialog } from './TaskEditDialog';
import { TaskInspectorSheet } from './TaskInspectorSheet';
import { TaskRow } from './TaskRow';
import { createTaskSchema, editTaskSchema, type CreateTaskForm, type EditTaskForm } from './task-form-schema';
import { orderVisibleTasks, type OrderedTaskRow } from './task-tree';
import { useTaskTimerClock } from './useTaskTimerClock';

const taskItemKey = (entry: OrderedTaskRow): string => entry.task.id;
type TaskViewTab = 'active' | 'in_progress' | 'waiting' | 'blocked' | 'completed';

function formatTaskDueEditValue(task: TaskRecord): string {
    if (task.dueDate) return task.dueDate;
    if (!task.dueAt) return '';
    const dt = new Date(task.dueAt);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
}

function resolveDueDate(value: string) {
    if (!value.trim()) return { dueAt: null, dueDate: null };
    const parsed = parseSmartDate(value);
    return parsed.kind === 'datetime'
        ? { dueAt: parsed.isoUtc, dueDate: null }
        : { dueAt: null, dueDate: parsed.date };
}

interface Props {
    focusTaskId?: string | undefined;
    initialProjectId?: string | null | undefined;
    onConsumeFocus?: () => void;
    onCreate: (input: TaskInput) => Promise<TaskRecord>;
    onUpdate: (id: string, input: Partial<TaskInput> & { status?: TaskStatus }) => Promise<TaskRecord>;
    onRemove: (id: string) => Promise<void>;
    onStartTimer: (id: string) => Promise<void>;
    onStopTimer: (id: string) => Promise<number>;
    onResolveTimerRecovery: (
        id: string,
        action: 'resume' | 'stop' | 'discard',
        endedAt?: string,
    ) => Promise<void>;
    refresh: () => Promise<void>;
    activeTimer: ActiveTimerRecord | null;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}

const PAGE_SIZE = 50;

export function TasksPage({
    focusTaskId,
    initialProjectId,
    onConsumeFocus,
    onCreate,
    onUpdate,
    onRemove,
    onStartTimer,
    onStopTimer,
    onResolveTimerRecovery,
    refresh,
    activeTimer,
    onNavigateTarget,
}: Props) {
    const confirm = useConfirm();
    const [projectId, setProjectId] = useState(initialProjectId || 'all');
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [inspectedTaskId, setInspectedTaskId] = useState<string | null>(null);
    const [inspectedFallback, setInspectedFallback] = useState<TaskRecord | null>(null);
    const createTaskForm = useForm<CreateTaskForm>({
        resolver: zodResolver(createTaskSchema),
        defaultValues: {
            title: '',
            projectId: '',
            parentId: '',
            dueAt: '',
            estimate: '',
            priority: 'medium',
            description: '',
        },
    });
    const [selectedProject, parentId] = createTaskForm.watch(['projectId', 'parentId']);
    const editTaskForm = useForm<EditTaskForm>({
        resolver: zodResolver(editTaskSchema),
        defaultValues: {
            title: '',
            description: '',
            parentId: '',
            dueAt: '',
            estimate: '',
            priority: 'medium',
            status: 'not_started',
        },
        mode: 'onChange',
    });
    const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
    const editParentId = editTaskForm.watch('parentId');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [viewTab, setViewTab] = useState<TaskViewTab>('active');
    const showCompleted = viewTab === 'completed';
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
    const [pageTasks, setPageTasks] = useState<TaskRecord[]>([]);
    const [pageTotal, setPageTotal] = useState(0);
    const [projectNames, setProjectNames] = useState<Record<string, string>>({});
    const [relationSummaries, setRelationSummaries] = useState<Record<string, TaskRelationSummary>>({});
    const [pageOffset, setPageOffset] = useState(0);
    const [pageLoading, setPageLoading] = useState(true);
    const pageRequest = useRef(0);

    const { recoveryEndAt, setRecoveryEndAt, elapsedHours, crossedLocalDay, elapsedLabel, timerTitle } =
        useTaskTimerClock(activeTimer, pageTasks);

    useEffect(() => {
        if (initialProjectId) {
            setProjectId(initialProjectId);
            setPageOffset(0);
        }
        if (focusTaskId) setInspectedTaskId(focusTaskId);
        if (initialProjectId || focusTaskId) onConsumeFocus?.();
    }, [initialProjectId, focusTaskId, onConsumeFocus]);

    const loadPage = useCallback(
        async (requestedOffset = pageOffset) => {
            const requestId = ++pageRequest.current;
            setPageLoading(true);
            try {
                const page = await window.devLedger.tasks.listPage({
                    limit: PAGE_SIZE,
                    offset: requestedOffset,
                    projectId: projectId === 'all' ? null : projectId,
                    query: deferredQuery,
                    status: viewTab === 'active' ? undefined : viewTab,
                    includeCompleted: showCompleted,
                });
                if (requestId === pageRequest.current) {
                    setPageTasks(page.items);
                    setPageTotal(page.total);
                    const ids = [...new Set(page.items.map((t) => t.projectId))];
                    void window.devLedger.projects
                        .getNames(ids)
                        .then((names) => {
                            if (requestId === pageRequest.current)
                                setProjectNames((c) => ({ ...c, ...names }));
                        })
                        .catch(() => undefined);
                    const taskIds = page.items.map((t) => t.id);
                    if (typeof window.devLedger.tasks.relationSummaries === 'function') {
                        void window.devLedger.tasks
                            .relationSummaries(taskIds)
                            .then((summaries) => {
                                if (requestId === pageRequest.current) setRelationSummaries(summaries);
                            })
                            .catch(() => undefined);
                    }
                }
            } finally {
                if (requestId === pageRequest.current) setPageLoading(false);
            }
        },
        [deferredQuery, pageOffset, projectId, showCompleted, viewTab],
    );

    useEffect(() => {
        void loadPage().catch((cause: unknown) =>
            setError(friendlyError(cause, 'Tasks could not be loaded.')),
        );
    }, [loadPage]);

    const orderedVisible = useMemo(() => {
        const matched =
            viewTab === 'active' ? pageTasks : pageTasks.filter((task) => task.status === viewTab);
        return orderVisibleTasks(matched, pageTasks, collapsedIds);
    }, [pageTasks, viewTab, collapsedIds]);
    const inspectedTask =
        pageTasks.find((t) => t.id === inspectedTaskId) ??
        (inspectedFallback?.id === inspectedTaskId ? inspectedFallback : null);

    useEffect(() => {
        if (!inspectedTaskId || pageTasks.some((t) => t.id === inspectedTaskId)) {
            setInspectedFallback(null);
            return;
        }
        let active = true;
        void window.devLedger.tasks
            .listPage({ limit: 200, offset: 0, includeCompleted: true })
            .then((page) => {
                if (active) setInspectedFallback(page.items.find((t) => t.id === inspectedTaskId) ?? null);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [inspectedTaskId, pageTasks]);

    function openCreateModal() {
        setError('');
        createTaskForm.clearErrors();
        createTaskForm.reset({
            title: '',
            projectId: projectId === 'all' ? '' : projectId,
            parentId: '',
            dueAt: '',
            estimate: '',
            priority: 'medium',
            description: '',
        });
        setCreateOpen(true);
    }

    function beginEdit(task: TaskRecord) {
        setEditingTask(task);
        editTaskForm.reset({
            title: task.title,
            description: task.description,
            parentId: task.parentId ?? '',
            dueAt: formatTaskDueEditValue(task),
            estimate: task.estimateMinutes === null ? '' : String(task.estimateMinutes),
            priority: task.priority,
            status: task.status,
        });
        setError('');
    }

    const saveEdit = editTaskForm.handleSubmit(async (values) => {
        if (!editingTask) return;
        setError('');
        editTaskForm.clearErrors('root');
        setBusyId(editingTask.id);
        try {
            await onUpdate(editingTask.id, {
                title: values.title.trim(),
                description: values.description,
                parentId: values.parentId || null,
                ...resolveDueDate(values.dueAt),
                estimateMinutes: values.estimate ? Number(values.estimate) : null,
                priority: values.priority,
                status: values.status,
            });
            await loadPage();
            setEditingTask(null);
        } catch (caught) {
            editTaskForm.setError('root', {
                type: 'server',
                message: friendlyError(caught, 'Task could not be saved.'),
            });
        } finally {
            setBusyId(null);
        }
    });

    const create = createTaskForm.handleSubmit(async (values) => {
        setError('');
        createTaskForm.clearErrors('root');
        setCreating(true);
        try {
            await onCreate({
                projectId: values.projectId,
                parentId: values.parentId || null,
                title: values.title.trim(),
                description: values.description,
                ...resolveDueDate(values.dueAt),
                estimateMinutes: values.estimate ? Number(values.estimate) : null,
                priority: values.priority,
            });
            setPageOffset(0);
            await loadPage(0);
            setCreateOpen(false);
        } catch (caught) {
            createTaskForm.setError('root', {
                type: 'server',
                message: friendlyError(caught, 'Task could not be created.'),
            });
        } finally {
            setCreating(false);
        }
    });

    async function run(id: string, action: () => Promise<unknown>) {
        setBusyId(id);
        setError('');
        try {
            await action();
            await refresh();
            await loadPage();
        } catch (caught) {
            setError(friendlyError(caught, 'Task action failed.'));
        } finally {
            setBusyId(null);
        }
    }

    async function requestRemoveTask(item: { id: string; title: string }) {
        if (
            await confirm({
                title: 'Move task to trash?',
                description: `“${item.title}” will be moved to trash.`,
                confirmLabel: 'Move to trash',
                destructive: true,
            })
        ) {
            await run(item.id, () => onRemove(item.id));
        }
    }

    async function recoverTimer(action: 'resume' | 'stop' | 'discard') {
        if (!activeTimer) return;
        if (
            action === 'discard' &&
            !(await confirm({
                title: 'Discard interrupted timer?',
                description: 'The unconfirmed session will be deleted.',
                confirmLabel: 'Discard',
                destructive: true,
            }))
        )
            return;
        await run(activeTimer.taskId, () =>
            onResolveTimerRecovery(
                activeTimer.taskId,
                action,
                action === 'stop' ? new Date(recoveryEndAt).toISOString() : undefined,
            ),
        );
    }

    async function stopActiveTimer(taskId: string) {
        if (
            (elapsedHours >= 8 || crossedLocalDay) &&
            !(await confirm({
                title: 'Save long timer session?',
                description: `Save full duration (${elapsedLabel})? You can edit entries later inside the task inspector.`,
                confirmLabel: 'Stop and save',
            }))
        )
            return;
        await run(taskId, () => onStopTimer(taskId));
    }

    return (
        <div className="workspace-page page-tasks mx-auto space-y-4">
            <PageHeader
                title="Tasks"
                description={pageTotal ? `${pageTotal} ${pageTotal === 1 ? 'task' : 'tasks'}` : undefined}
                actions={
                    <Button size="sm" onClick={openCreateModal}>
                        <Plus className="size-3.5" />
                        New task
                    </Button>
                }
            />
            {error && (
                <Alert variant="destructive" className="py-2">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {activeTimer && (
                <TaskActiveTimerBanner
                    activeTimer={activeTimer}
                    timerTitle={timerTitle}
                    elapsedLabel={elapsedLabel}
                    elapsedHours={elapsedHours}
                    crossedLocalDay={crossedLocalDay}
                    recoveryEndAt={recoveryEndAt}
                    onRecoveryEndAtChange={setRecoveryEndAt}
                    onInspectTask={setInspectedTaskId}
                    onStopTimer={stopActiveTimer}
                    onRecoverTimer={recoverTimer}
                />
            )}

            <div className="workspace-toolbar justify-between">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                    <div
                        className="workspace-segmented flex-wrap"
                        role="group"
                        aria-label="Filter tasks by state"
                    >
                        {(
                            [
                                ['active', 'Active'],
                                ['in_progress', 'In progress'],
                                ['waiting', 'Waiting'],
                                ['blocked', 'Blocked'],
                                ['completed', 'Completed'],
                            ] as const
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                data-active={viewTab === key}
                                onClick={() => {
                                    setPageOffset(0);
                                    setViewTab(key);
                                }}
                                className="workspace-segmented-item"
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <SearchFilterInput
                        aria-label="Filter tasks by title or description"
                        clearLabel="Clear task filter"
                        value={query}
                        onValueChange={(next) => {
                            setPageOffset(0);
                            setQuery(next);
                        }}
                        placeholder="Filter tasks…"
                        className="min-w-[200px] max-w-xs flex-1"
                    />
                    <RemoteRecordPicker
                        entityType="project"
                        value={projectId === 'all' ? '' : projectId}
                        onValueChange={(v) => {
                            setPageOffset(0);
                            setProjectId(v || 'all');
                        }}
                        onChoiceChange={(c) => {
                            if (c) setProjectNames((cur) => ({ ...cur, [c.id]: c.label }));
                        }}
                        placeholder="All projects"
                        selectedLabel={projectId === 'all' ? undefined : projectNames[projectId]}
                        className="w-48"
                    />
                </div>
                {(viewTab !== 'active' || query || projectId !== 'all') && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                        {orderedVisible.length} matching
                    </span>
                )}
            </div>

            <div className="workspace-surface task-queue @container overflow-hidden rounded-[var(--workspace-radius)]">
                <div className="hidden grid-cols-[minmax(180px,1.5fr)_116px_132px_78px_98px_98px] gap-2.5 border-b border-border bg-surface-subtle/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground @[680px]:grid">
                    <span>Task</span>
                    <span>Project</span>
                    <span>Status</span>
                    <span>Priority</span>
                    <span>Due</span>
                    <span className="text-right">Actions</span>
                </div>
                {pageLoading ? (
                    <p className="py-12 text-center text-xs text-muted-foreground">Loading tasks…</p>
                ) : (
                    <VirtualList
                        items={orderedVisible}
                        itemKey={taskItemKey}
                        itemHeight={76}
                        label="Workspace tasks"
                        className="max-h-[min(70vh,740px)]"
                        empty={
                            <div className="py-14 text-center">
                                <ListTodo className="mx-auto mb-2.5 size-5 text-muted-foreground" />
                                <p className="text-sm font-medium">
                                    {query || projectId !== 'all' || viewTab !== 'active'
                                        ? 'No tasks match this view'
                                        : 'No tasks yet'}
                                </p>
                                <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                                    Break down deliverables into tracked tasks with optional due times and
                                    blockers.
                                </p>
                                <Button size="sm" className="mt-4" onClick={openCreateModal}>
                                    <Plus className="size-3.5" />
                                    Create first task
                                </Button>
                            </div>
                        }
                        renderItem={({ task, depth, hasChildren, contextOnly }) => (
                            <TaskRow
                                task={task}
                                depth={depth}
                                hasChildren={hasChildren}
                                contextOnly={contextOnly}
                                collapsed={collapsedIds.has(task.id)}
                                projectName={projectNames[task.projectId] ?? 'Project'}
                                activeTimer={activeTimer}
                                relations={relationSummaries[task.id]}
                                busy={busyId === task.id}
                                onToggleCollapse={(id) =>
                                    setCollapsedIds((c) => {
                                        const n = new Set(c);
                                        if (n.has(id)) n.delete(id);
                                        else n.add(id);
                                        return n;
                                    })
                                }
                                onInspect={setInspectedTaskId}
                                onStatusChange={(id, status) => void run(id, () => onUpdate(id, { status }))}
                                onEdit={beginEdit}
                                onStartTimer={(id) => void run(id, () => onStartTimer(id))}
                                onStopTimer={(id) => void stopActiveTimer(id)}
                                onDelete={(item) => void requestRemoveTask(item)}
                                onNavigateTarget={onNavigateTarget}
                            />
                        )}
                    />
                )}
                {!pageLoading && orderedVisible.length > 0 && (
                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="flex w-full items-center gap-2 border-t border-border/50 bg-surface-subtle/20 px-4 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-subtle/60 hover:text-foreground"
                    >
                        <Plus className="size-3.5" />
                        <span>Create another task…</span>
                    </button>
                )}
            </div>

            <PageControls
                offset={pageOffset}
                limit={PAGE_SIZE}
                total={pageTotal}
                disabled={pageLoading}
                onPageChange={setPageOffset}
            />
            <TaskInspectorSheet
                task={inspectedTask}
                projectName={inspectedTask ? projectNames[inspectedTask.projectId] : undefined}
                activeTimer={activeTimer}
                onClose={() => setInspectedTaskId(null)}
                onEdit={beginEdit}
                onUpdate={onUpdate}
                onRemove={(id) => {
                    const target =
                        inspectedTask?.id === id ? inspectedTask : pageTasks.find((t) => t.id === id);
                    return target ? requestRemoveTask(target) : requestRemoveTask({ id, title: 'this task' });
                }}
                onStartTimer={onStartTimer}
                onStopTimer={onStopTimer}
                onSelectTask={setInspectedTaskId}
                onNavigate={onNavigateTarget}
                onRefreshParent={async () => {
                    await refresh();
                    await loadPage();
                }}
            />
            <TaskCreateDialog
                open={createOpen}
                form={createTaskForm}
                busy={creating}
                error={error}
                selectedProject={selectedProject}
                selectedProjectLabel={projectNames[selectedProject]}
                selectedParentLabel={pageTasks.find((i) => i.id === parentId)?.title}
                onProjectChange={(v, l) => {
                    createTaskForm.setValue('projectId', v, { shouldValidate: true });
                    createTaskForm.setValue('parentId', '');
                    if (v && l) setProjectNames((c) => ({ ...c, [v]: l }));
                }}
                onClose={() => setCreateOpen(false)}
                onSubmit={create}
            />
            <TaskEditDialog
                task={editingTask}
                form={editTaskForm}
                busy={busyId === editingTask?.id}
                error={error}
                selectedParentLabel={pageTasks.find((i) => i.id === editParentId)?.title}
                onClose={() => setEditingTask(null)}
                onSave={saveEdit}
            />
        </div>
    );
}
