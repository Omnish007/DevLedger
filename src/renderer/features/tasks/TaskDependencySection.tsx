import { useState } from 'react';
import { ArrowRight, CheckCircle2, GitBranch } from 'lucide-react';
import type { RecordSummary } from '@shared/contracts';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { friendlyError } from '@/lib/utils';
import { TASK_STATUS_DOT } from './task-metadata';

interface TaskDependencySectionProps {
    taskId: string;
    projectId: string;
    dependsOn: string[];
    blocks: string[];
    depSummaries: Record<string, RecordSummary>;
    onOpenLinkedTask: (id: string) => void;
    onRefreshBoth: () => Promise<void>;
    onError: (message: string) => void;
}

export function TaskDependencySection({
    taskId,
    projectId,
    dependsOn,
    blocks,
    depSummaries,
    onOpenLinkedTask,
    onRefreshBoth,
    onError,
}: TaskDependencySectionProps) {
    const [prereqId, setPrereqId] = useState('');

    return (
        <section className="space-y-3 rounded-xl border border-border/80 bg-card p-4 text-xs shadow-[var(--shadow-xs)]">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    Dependency flow
                </h3>
                <Badge variant="secondary" className="tabular-nums">
                    {dependsOn.length + blocks.length}
                </Badge>
            </div>
            <div className="flex gap-2">
                <RemoteRecordPicker
                    entityType="task"
                    projectId={projectId}
                    excludeId={taskId}
                    value={prereqId}
                    onValueChange={setPrereqId}
                    placeholder="Add prerequisite task…"
                    className="flex-1"
                />
                <Button
                    type="button"
                    size="sm"
                    className="h-9 shrink-0"
                    disabled={!prereqId}
                    onClick={() =>
                        void window.devLedger.operations
                            .addDependency(taskId, prereqId)
                            .then(() => {
                                setPrereqId('');
                                return onRefreshBoth();
                            })
                            .catch((e) => onError(friendlyError(e, 'Could not add dependency.')))
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
                    onRemoveDep: (id: string) => window.devLedger.operations.removeDependency(taskId, id),
                },
                {
                    label: 'Unlocks downstream (waiting on this task)',
                    list: blocks,
                    directionIcon: CheckCircle2,
                    onRemoveDep: (id: string) => window.devLedger.operations.removeDependency(id, taskId),
                },
            ].map(
                (group) =>
                    group.list.length > 0 && (
                        <div key={group.label} className="space-y-1.5">
                            <p className="text-[11px] font-medium text-muted-foreground">{group.label}</p>
                            <div className="divide-y divide-border/75 rounded-lg border border-border/80 bg-surface-subtle/25">
                                {group.list.map((id) => {
                                    const summary = depSummaries[`task:${id}`];
                                    const depStatus = summary?.status ?? 'not_started';
                                    const isDone = depStatus === 'completed';
                                    const dotClass =
                                        depStatus in TASK_STATUS_DOT
                                            ? TASK_STATUS_DOT[depStatus as keyof typeof TASK_STATUS_DOT]
                                            : 'bg-muted-foreground/50';
                                    return (
                                        <div key={id} className="flex items-center gap-2 px-3 py-2">
                                            <span
                                                className={`size-2 shrink-0 rounded-full ${dotClass}`}
                                                aria-hidden="true"
                                            />
                                            <button
                                                type="button"
                                                className={`inline-flex min-h-6 min-w-0 flex-1 items-center truncate text-left font-medium hover:text-primary hover:underline ${isDone ? 'text-muted-foreground line-through' : ''}`}
                                                onClick={() => onOpenLinkedTask(id)}
                                            >
                                                {summary?.title ?? 'Linked task'}
                                            </button>
                                            <span className="shrink-0 text-[11px] capitalize text-muted-foreground">
                                                {depStatus.replaceAll('_', ' ')}
                                            </span>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                                onClick={() => void group.onRemoveDep(id).then(onRefreshBoth)}
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
    );
}
