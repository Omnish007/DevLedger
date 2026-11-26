import { useCallback, useEffect, useState } from 'react';
import {
    ArrowRight,
    ArrowUpRight,
    CheckCircle2,
    FolderKanban,
    GitBranch,
    Pencil,
    ShieldCheck,
    Trash2,
} from 'lucide-react';
import type {
    ActiveTimerRecord,
    PageResult,
    RecordSummary,
    TaskBlockerRecord,
    TaskInput,
    TaskRecord,
    TaskStatus,
    TimeEntryRecord,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { RecordConnectionsPanel } from '@/components/shared/RecordConnectionsPanel';
import { TaskBlockerSection } from './TaskBlockerSection';
import { TaskTimeSection } from './TaskTimeSection';
import { statuses } from './task-form-schema';
import { formatDate, friendlyError } from '@/lib/utils';

interface TaskInspectorSheetProps {
    task: TaskRecord | null;
    projectName?: string | undefined;
    activeTimer: ActiveTimerRecord | null;
    onClose: () => void;
    onEdit: (task: TaskRecord) => void;
    onUpdate: (id: string, input: Partial<TaskInput> & { status?: TaskStatus }) => Promise<TaskRecord>;
    onRemove: (id: string) => Promise<void>;
    onStartTimer: (id: string) => Promise<void>;
    onStopTimer: (id: string) => Promise<number>;
    onNavigate: (target: WorkspaceNavigationTarget) => void;
    onSelectTask?: ((id: string) => void) | undefined;
    onRefreshParent: () => Promise<void>;
}

const DEP_STATUS_DOT: Record<string, string> = {
    completed: 'bg-success',
    cancelled: 'bg-muted-foreground/40',
    blocked: 'bg-warning',
    waiting: 'bg-info',
    in_progress: 'bg-primary',
    not_started: 'bg-muted-foreground/50',
};

export function TaskInspectorSheet({
    task,
    projectName,
    activeTimer,
    onClose,
    onEdit,
    onUpdate,
    onRemove,
    onStartTimer,
    onStopTimer,
    onNavigate,
    onSelectTask,
    onRefreshParent,
}: TaskInspectorSheetProps) {
    const [blockers, setBlockers] = useState<TaskBlockerRecord[]>([]);
    const [dependsOn, setDependsOn] = useState<string[]>([]);
    const [blocks, setBlocks] = useState<string[]>([]);
    const [depSummaries, setDepSummaries] = useState<Record<string, RecordSummary>>({});
    const [prereqId, setPrereqId] = useState('');
    const [timePage, setTimePage] = useState<PageResult<TimeEntryRecord>>({
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
        hasMore: false,
    });
    const [timeOffset, setTimeOffset] = useState(0);
    const [error, setError] = useState('');

    const inspectedId = task?.id ?? null;
    const loadDetails = useCallback(async () => {
        if (!inspectedId) return;
        try {
            const [blockerRes, depRes, timeRes] = await Promise.all([
                window.devLedger.operations.listBlockersPage({
                    taskId: inspectedId,
                    includeResolved: false,
                    limit: 10,
                    offset: 0,
                }),
                window.devLedger.operations.listDependencies(inspectedId, {
                    dependsOn: { limit: 25, offset: 0 },
                    blocks: { limit: 25, offset: 0 },
                }),
                window.devLedger.operations.listTimeEntriesPage(inspectedId, {
                    limit: 25,
                    offset: timeOffset,
                }),
            ]);
            setBlockers(blockerRes.items);
            setDependsOn(depRes.dependsOn.items);
            setBlocks(depRes.blocks.items);
            setTimePage(timeRes);
            const ids = [...new Set([...depRes.dependsOn.items, ...depRes.blocks.items])];
            if (ids.length) {
                const resolved = await window.devLedger.operations.resolveRecordSummaries(
                    ids.map((id) => ({ type: 'task', id })),
                );
                setDepSummaries(resolved);
            } else {
                setDepSummaries({});
            }
            setError('');
        } catch (caught) {
            setError(friendlyError(caught, 'Task details could not be loaded.'));
        }
    }, [inspectedId, timeOffset]);

    useEffect(() => {
        setTimeOffset(0);
        setPrereqId('');
        setError('');
    }, [task?.id]);
    useEffect(() => {
        void loadDetails();
    }, [loadDetails]);

    async function refreshBoth() {
        await Promise.all([loadDetails(), onRefreshParent()]);
    }

    const openPrereqCount = dependsOn.filter((id) => {
        const st = depSummaries[`task:${id}`]?.status;
        return st !== 'completed' && st !== 'cancelled';
    }).length;
    const openBlocker = blockers.find((b) => !b.resolvedAt);

    function openLinkedTask(id: string) {
        if (onSelectTask) {
            onSelectTask(id);
            return;
        }
        if (task) onNavigate({ view: 'tasks', recordId: id, projectId: task.projectId });
    }

    return (
        <Sheet
            open={Boolean(task)}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                {task && (
                    <div className="space-y-5 pb-6">
                        <SheetHeader className="pr-6">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <button
                                    type="button"
                                    className="inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-surface-hover hover:text-foreground"
                                    onClick={() => {
                                        onClose();
                                        onNavigate({ view: 'projects', recordId: task.projectId });
                                    }}
                                >
                                    <FolderKanban className="size-3.5" />
                                    {projectName ?? 'Project'}
                                    <ArrowUpRight className="size-3" />
                                </button>
                            </div>
                            <SheetTitle className="text-lg leading-snug">{task.title}</SheetTitle>
                            <SheetDescription className={task.description ? undefined : 'sr-only'}>
                                {task.description || 'Task inspector details'}
                            </SheetDescription>
                        </SheetHeader>

                        <div
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                                openBlocker || task.status === 'blocked'
                                    ? 'border-warning/30 bg-warning-subtle text-warning-foreground'
                                    : openPrereqCount > 0
                                      ? 'border-border bg-surface-subtle text-muted-foreground'
                                      : 'border-success/25 bg-success-subtle text-success-foreground'
                            }`}
                        >
                            {openBlocker || task.status === 'blocked' ? (
                                <span>
                                    Blocked: {openBlocker?.reason ?? 'Resolve active blocker before shipping'}
                                </span>
                            ) : openPrereqCount > 0 ? (
                                <span>
                                    Waiting on {openPrereqCount}{' '}
                                    {openPrereqCount === 1 ? 'prerequisite' : 'prerequisites'} before starting
                                </span>
                            ) : (
                                <>
                                    <ShieldCheck className="size-3.5 shrink-0" />
                                    <span>
                                        Ready to build
                                        {blocks.length > 0 ? ` · Unlocks ${blocks.length} downstream` : ''}
                                    </span>
                                </>
                            )}
                        </div>

                        {error && (
                            <p
                                role="alert"
                                className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
                            >
                                {error}
                            </p>
                        )}

                        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
                            <label className="block space-y-1.5 font-medium">
                                <span className="block text-muted-foreground">Status</span>
                                <NativeSelect
                                    value={task.status}
                                    onChange={(e) =>
                                        void onUpdate(task.id, { status: e.target.value as TaskStatus }).then(
                                            refreshBoth,
                                        )
                                    }
                                    className="h-8 w-full text-xs"
                                >
                                    {statuses.map((item) => (
                                        <NativeSelectOption key={item.value} value={item.value}>
                                            {item.label}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </label>
                            <label className="block space-y-1.5 font-medium">
                                <span className="block text-muted-foreground">Priority</span>
                                <NativeSelect
                                    value={task.priority}
                                    onChange={(e) =>
                                        void onUpdate(task.id, {
                                            priority: e.target.value as TaskRecord['priority'],
                                        }).then(refreshBoth)
                                    }
                                    className="h-8 w-full text-xs"
                                >
                                    {(['low', 'medium', 'high', 'urgent'] as const).map((level) => (
                                        <NativeSelectOption
                                            key={level}
                                            value={level}
                                        >{`${level[0]!.toUpperCase()}${level.slice(1)}`}</NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </label>
                            <div className="text-muted-foreground">
                                Due:{' '}
                                <span className="text-foreground">
                                    {task.dueDate || task.dueAt
                                        ? formatDate(task.dueDate ?? task.dueAt)
                                        : 'None'}
                                </span>
                            </div>
                            <div className="text-muted-foreground">
                                Estimate:{' '}
                                <span className="text-foreground">
                                    {task.estimateMinutes !== null ? `${task.estimateMinutes} min` : 'None'}
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5"
                                onClick={() => onEdit(task)}
                            >
                                <Pencil className="size-3.5" />
                                Edit details
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1.5 text-muted-foreground hover:text-danger"
                                onClick={() => {
                                    onClose();
                                    void onRemove(task.id);
                                }}
                            >
                                <Trash2 className="size-3.5" />
                                Trash
                            </Button>
                        </div>

                        <TaskBlockerSection
                            taskId={task.id}
                            blockers={blockers}
                            onUpdated={refreshBoth}
                            onError={setError}
                            onNavigate={(target) => {
                                onClose();
                                onNavigate(target);
                            }}
                        />

                        <section className="space-y-2.5 border-t border-border pt-4 text-xs">
                            <div className="flex items-center justify-between">
                                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                    <GitBranch className="size-3.5" />
                                    Dependency flow
                                </h3>
                                <Badge variant="secondary">{dependsOn.length + blocks.length}</Badge>
                            </div>
                            <div className="flex gap-2">
                                <RemoteRecordPicker
                                    entityType="task"
                                    projectId={task.projectId}
                                    excludeId={task.id}
                                    value={prereqId}
                                    onValueChange={setPrereqId}
                                    placeholder="Add prerequisite task…"
                                    className="flex-1"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-9"
                                    disabled={!prereqId}
                                    onClick={() =>
                                        void window.devLedger.operations
                                            .addDependency(task.id, prereqId)
                                            .then(() => {
                                                setPrereqId('');
                                                return refreshBoth();
                                            })
                                            .catch((e) =>
                                                setError(friendlyError(e, 'Could not add dependency.')),
                                            )
                                    }
                                >
                                    Add
                                </Button>
                            </div>
                            {[
                                {
                                    label: 'Prerequisites (must finish first)',
                                    list: dependsOn,
                                    directionIcon: ArrowRight,
                                    onRemoveDep: (id: string) =>
                                        window.devLedger.operations.removeDependency(task.id, id),
                                },
                                {
                                    label: 'Unlocks downstream (waiting on this task)',
                                    list: blocks,
                                    directionIcon: CheckCircle2,
                                    onRemoveDep: (id: string) =>
                                        window.devLedger.operations.removeDependency(id, task.id),
                                },
                            ].map(
                                (group) =>
                                    group.list.length > 0 && (
                                        <div key={group.label} className="space-y-1.5">
                                            <p className="text-xs font-medium text-muted-foreground">
                                                {group.label}
                                            </p>
                                            <div className="divide-y divide-border rounded-lg border border-border bg-card">
                                                {group.list.map((id) => {
                                                    const summary = depSummaries[`task:${id}`];
                                                    const depStatus = summary?.status ?? 'not_started';
                                                    const isDone = depStatus === 'completed';
                                                    return (
                                                        <div
                                                            key={id}
                                                            className="flex items-center gap-2 px-3 py-2"
                                                        >
                                                            <span
                                                                className={`size-2 shrink-0 rounded-full ${DEP_STATUS_DOT[depStatus] ?? 'bg-muted-foreground/50'}`}
                                                                aria-hidden="true"
                                                            />
                                                            <button
                                                                type="button"
                                                                className={`inline-flex min-h-6 min-w-0 flex-1 items-center truncate text-left font-medium hover:text-primary hover:underline ${isDone ? 'text-muted-foreground line-through' : ''}`}
                                                                onClick={() => openLinkedTask(id)}
                                                            >
                                                                {summary?.title ?? 'Linked task'}
                                                            </button>
                                                            <span className="shrink-0 text-xs capitalize text-muted-foreground">
                                                                {depStatus.replaceAll('_', ' ')}
                                                            </span>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                                                onClick={() =>
                                                                    void group
                                                                        .onRemoveDep(id)
                                                                        .then(refreshBoth)
                                                                }
                                                            >
                                                                Remove
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ),
                            )}
                        </section>

                        <TaskTimeSection
                            taskId={task.id}
                            entries={timePage.items}
                            total={timePage.total}
                            offset={timeOffset}
                            activeTimer={activeTimer}
                            onStartTimer={() => onStartTimer(task.id)}
                            onStopTimer={() => onStopTimer(task.id)}
                            onOffsetChange={setTimeOffset}
                            onUpdated={loadDetails}
                            onError={setError}
                        />

                        <RecordConnectionsPanel
                            entityType="task"
                            entityId={task.id}
                            onChanged={() => void onRefreshParent()}
                            onNavigate={(target) => {
                                onClose();
                                onNavigate(target);
                            }}
                        />
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
