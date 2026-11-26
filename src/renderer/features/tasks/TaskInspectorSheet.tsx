import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    ArrowUpRight,
    CalendarClock,
    Clock3,
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
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RecordConnectionsPanel } from '@/components/shared/RecordConnectionsPanel';
import { TaskBlockerSection } from './TaskBlockerSection';
import { TaskDependencySection } from './TaskDependencySection';
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
            <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[540px]">
                {task && (
                    <>
                        <SheetHeader className="shrink-0 border-b border-border/80 bg-card px-6 pt-5 pb-4 pr-12">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <button
                                    type="button"
                                    className="inline-flex min-h-6 items-center gap-1.5 rounded-md border border-border/70 bg-surface-subtle/60 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-surface-hover hover:text-foreground"
                                    onClick={() => {
                                        onClose();
                                        onNavigate({ view: 'projects', recordId: task.projectId });
                                    }}
                                >
                                    <FolderKanban className="size-3.5 text-primary/80" />
                                    <span>{projectName ?? 'Project'}</span>
                                    <ArrowUpRight className="size-3 opacity-70" />
                                </button>
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1.5 px-2.5 text-xs"
                                        onClick={() => onEdit(task)}
                                    >
                                        <Pencil className="size-3" />
                                        Edit details
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:bg-danger-subtle hover:text-danger-foreground"
                                        onClick={() => {
                                            onClose();
                                            void onRemove(task.id);
                                        }}
                                    >
                                        <Trash2 className="size-3" />
                                        Trash
                                    </Button>
                                </div>
                            </div>

                            <SheetTitle className="mt-2.5 text-[18px] font-semibold leading-snug tracking-tight">
                                {task.title}
                            </SheetTitle>
                            <SheetDescription
                                className={
                                    task.description
                                        ? 'mt-1.5 rounded-lg border border-border/60 bg-surface-subtle/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground'
                                        : 'sr-only'
                                }
                            >
                                {task.description || 'Task inspector details'}
                            </SheetDescription>
                        </SheetHeader>

                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                            <div
                                className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
                                    openBlocker || task.status === 'blocked'
                                        ? 'border-warning/22 bg-warning-subtle text-warning-foreground'
                                        : openPrereqCount > 0
                                          ? 'border-border bg-surface-subtle text-muted-foreground'
                                          : 'border-success/20 bg-success-subtle text-success-foreground'
                                }`}
                            >
                                {openBlocker || task.status === 'blocked' ? (
                                    <>
                                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                        <span>
                                            Blocked:{' '}
                                            {openBlocker?.reason ?? 'Resolve active blocker before shipping'}
                                        </span>
                                    </>
                                ) : openPrereqCount > 0 ? (
                                    <>
                                        <GitBranch className="mt-0.5 size-4 shrink-0" />
                                        <span>
                                            Waiting on {openPrereqCount}{' '}
                                            {openPrereqCount === 1 ? 'prerequisite' : 'prerequisites'} before
                                            starting
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                                        <span>
                                            Ready to build
                                            {blocks.length > 0
                                                ? ` · Unlocks ${blocks.length} downstream`
                                                : ''}
                                        </span>
                                    </>
                                )}
                            </div>

                            {error && (
                                <p
                                    role="alert"
                                    className="rounded-xl border border-danger/20 bg-danger-subtle px-3.5 py-2.5 text-xs text-danger-foreground"
                                >
                                    {error}
                                </p>
                            )}

                            <div className="rounded-xl border border-border/80 bg-surface-subtle/30 p-3.5">
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="space-y-1.5 font-medium">
                                        <label
                                            htmlFor="task-inspector-status"
                                            className="block text-[11px] uppercase tracking-wider text-muted-foreground"
                                        >
                                            Status
                                        </label>
                                        <NativeSelect
                                            id="task-inspector-status"
                                            value={task.status}
                                            onChange={(e) =>
                                                void onUpdate(task.id, {
                                                    status: e.target.value as TaskStatus,
                                                }).then(refreshBoth)
                                            }
                                            className="h-8 w-full text-xs"
                                        >
                                            {statuses.map((item) => (
                                                <NativeSelectOption key={item.value} value={item.value}>
                                                    {item.label}
                                                </NativeSelectOption>
                                            ))}
                                        </NativeSelect>
                                    </div>
                                    <div className="space-y-1.5 font-medium">
                                        <label
                                            htmlFor="task-inspector-priority"
                                            className="block text-[11px] uppercase tracking-wider text-muted-foreground"
                                        >
                                            Priority
                                        </label>
                                        <NativeSelect
                                            id="task-inspector-priority"
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
                                    </div>
                                    <div className="flex items-center gap-2 rounded-lg border border-border/65 bg-card px-2.5 py-2">
                                        <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                                Due
                                            </span>
                                            <span className="block truncate font-medium text-foreground tabular-nums">
                                                {task.dueDate || task.dueAt
                                                    ? formatDate(task.dueDate ?? task.dueAt)
                                                    : 'No due date'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 rounded-lg border border-border/65 bg-card px-2.5 py-2">
                                        <Clock3 className="size-3.5 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                                Estimate
                                            </span>
                                            <span className="block truncate font-medium text-foreground tabular-nums">
                                                {task.estimateMinutes !== null
                                                    ? `${task.estimateMinutes} min`
                                                    : 'Unestimated'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-[var(--shadow-xs)]">
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
                            </div>

                            <TaskDependencySection
                                taskId={task.id}
                                projectId={task.projectId}
                                dependsOn={dependsOn}
                                blocks={blocks}
                                depSummaries={depSummaries}
                                onOpenLinkedTask={openLinkedTask}
                                onRefreshBoth={refreshBoth}
                                onError={setError}
                            />

                            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-[var(--shadow-xs)]">
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
                            </div>

                            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-[var(--shadow-xs)]">
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
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
