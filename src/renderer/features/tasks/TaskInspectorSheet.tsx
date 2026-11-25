import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, FolderKanban, GitBranch, Pencil, Trash2 } from 'lucide-react';
import type { ActiveTimerRecord, PageResult, TaskBlockerRecord, TaskInput, TaskRecord, TaskStatus, TimeEntryRecord, WorkspaceNavigationTarget } from '@shared/contracts';
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
  onRefreshParent: () => Promise<void>;
}

export function TaskInspectorSheet({
  task, projectName, activeTimer, onClose, onEdit, onUpdate, onRemove, onStartTimer, onStopTimer, onNavigate, onRefreshParent,
}: TaskInspectorSheetProps) {
  const [blockers, setBlockers] = useState<TaskBlockerRecord[]>([]);
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<string[]>([]);
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({});
  const [prereqId, setPrereqId] = useState('');
  const [timePage, setTimePage] = useState<PageResult<TimeEntryRecord>>({ items: [], total: 0, limit: 25, offset: 0, hasMore: false });
  const [timeOffset, setTimeOffset] = useState(0);
  const [error, setError] = useState('');

  const inspectedId = task?.id ?? null;
  const loadDetails = useCallback(async () => {
    if (!inspectedId) return;
    try {
      const [blockerRes, depRes, timeRes] = await Promise.all([
        window.devLedger.operations.listBlockersPage({ taskId: inspectedId, includeResolved: false, limit: 10, offset: 0 }),
        window.devLedger.operations.listDependencies(inspectedId, { dependsOn: { limit: 25, offset: 0 }, blocks: { limit: 25, offset: 0 } }),
        window.devLedger.operations.listTimeEntriesPage(inspectedId, { limit: 25, offset: timeOffset }),
      ]);
      setBlockers(blockerRes.items);
      setDependsOn(depRes.dependsOn.items);
      setBlocks(depRes.blocks.items);
      setTimePage(timeRes);
      const ids = [...new Set([...depRes.dependsOn.items, ...depRes.blocks.items])];
      if (ids.length) setTaskTitles(await window.devLedger.tasks.getTitles(ids));
      else setTaskTitles({});
      setError('');
    } catch (caught) {
      setError(friendlyError(caught, 'Task details could not be loaded.'));
    }
  }, [inspectedId, timeOffset]);

  useEffect(() => { setTimeOffset(0); setPrereqId(''); setError(''); }, [task?.id]);
  useEffect(() => { void loadDetails(); }, [loadDetails]);

  async function refreshBoth() {
    await Promise.all([loadDetails(), onRefreshParent()]);
  }

  return (
    <Sheet open={Boolean(task)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {task && (
          <div className="space-y-5 pb-6">
            <SheetHeader className="pr-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-hover hover:text-foreground" onClick={() => { onClose(); onNavigate({ view: 'projects', recordId: task.projectId }); }}>
                  <FolderKanban className="size-3.5" />{projectName ?? 'Project'}<ArrowUpRight className="size-3" />
                </button>
              </div>
              <SheetTitle className="text-lg leading-snug">{task.title}</SheetTitle>
              <SheetDescription className={task.description ? undefined : 'sr-only'}>{task.description || 'Task inspector details'}</SheetDescription>
            </SheetHeader>

            {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p>}

            <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
              <label className="block space-y-1.5 font-medium">
                <span className="block text-muted-foreground">Status</span>
                <NativeSelect value={task.status} onChange={(e) => void onUpdate(task.id, { status: e.target.value as TaskStatus }).then(refreshBoth)} className="h-8 w-full text-xs">
                  {statuses.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <label className="block space-y-1.5 font-medium">
                <span className="block text-muted-foreground">Priority</span>
                <NativeSelect value={task.priority} onChange={(e) => void onUpdate(task.id, { priority: e.target.value as TaskRecord['priority'] }).then(refreshBoth)} className="h-8 w-full text-xs">
                  {(['low', 'medium', 'high', 'urgent'] as const).map((level) => <NativeSelectOption key={level} value={level}>{`${level[0]!.toUpperCase()}${level.slice(1)}`}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <div className="text-muted-foreground">Due: <span className="text-foreground">{task.dueDate || task.dueAt ? formatDate(task.dueDate ?? task.dueAt) : 'None'}</span></div>
              <div className="text-muted-foreground">Estimate: <span className="text-foreground">{task.estimateMinutes !== null ? `${task.estimateMinutes} min` : 'None'}</span></div>
            </div>

            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onEdit(task)}><Pencil className="size-3.5" />Edit details</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground hover:text-danger" onClick={() => { onClose(); void onRemove(task.id); }}><Trash2 className="size-3.5" />Trash</Button>
            </div>

            <TaskBlockerSection taskId={task.id} blockers={blockers} onUpdated={refreshBoth} onError={setError} />

            <section className="space-y-2.5 border-t border-border pt-4 text-xs">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 font-medium text-muted-foreground"><GitBranch className="size-3.5" />Dependencies</h4>
                <Badge variant="secondary">{dependsOn.length + blocks.length}</Badge>
              </div>
              <div className="flex gap-2">
                <RemoteRecordPicker entityType="task" projectId={task.projectId} excludeId={task.id} value={prereqId} onValueChange={setPrereqId} placeholder="Add prerequisite task…" className="flex-1" />
                <Button type="button" size="sm" className="h-9" disabled={!prereqId} onClick={() => void window.devLedger.operations.addDependency(task.id, prereqId).then(() => { setPrereqId(''); return loadDetails(); }).catch((e) => setError(friendlyError(e, 'Could not add dependency.')))}>Add</Button>
              </div>
              {[
                { label: 'Depends on', list: dependsOn, onRemoveDep: (id: string) => window.devLedger.operations.removeDependency(task.id, id) },
                { label: 'Blocks', list: blocks, onRemoveDep: (id: string) => window.devLedger.operations.removeDependency(id, task.id) },
              ].map((group) => group.list.length > 0 && (
                <div key={group.label} className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground">{group.label}</p>
                  <div className="divide-y divide-border rounded-md border border-border">
                    {group.list.map((id) => (
                      <div key={id} className="flex items-center gap-2 px-2.5 py-1.5">
                        <button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => onNavigate({ view: 'tasks', recordId: id, projectId: task.projectId })}>
                          {taskTitles[id] ?? 'Linked task'}
                        </button>
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => void group.onRemoveDep(id).then(loadDetails)}>Remove</Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <TaskTimeSection taskId={task.id} entries={timePage.items} total={timePage.total} offset={timeOffset} activeTimer={activeTimer} onStartTimer={() => onStartTimer(task.id)} onStopTimer={() => onStopTimer(task.id)} onOffsetChange={setTimeOffset} onUpdated={loadDetails} onError={setError} />

            <RecordConnectionsPanel entityType="task" entityId={task.id} onNavigate={(target) => { onClose(); onNavigate(target); }} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
