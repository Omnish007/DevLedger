import { CircleAlert, GitBranch, ShieldCheck } from 'lucide-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import type { PageResult, TaskBlockerRecord } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SmartDateField } from '@/components/shared/SmartDateField';
import type { BlockerFormValues } from './operation-form-schema';

interface DependenciesTabProps {
  taskId: string;
  prerequisiteId: string;
  dependencyData: { dependsOn: PageResult<string>; blocks: PageResult<string> };
  taskTitles: Record<string, string>;
  busy: boolean;
  onTaskIdChange: (value: string) => void;
  onPrerequisiteIdChange: (value: string) => void;
  onAddDependency: () => void;
  onRemoveDependency: (dependentId: string, prereqId: string) => void;
  onDependsOnOffsetChange: (offset: number) => void;
  onBlocksOffsetChange: (offset: number) => void;
}

export function OperationsDependenciesTab({
  taskId, prerequisiteId, dependencyData, taskTitles, busy,
  onTaskIdChange, onPrerequisiteIdChange, onAddDependency, onRemoveDependency,
  onDependsOnOffsetChange, onBlocksOffsetChange,
}: DependenciesTabProps) {
  return (
    <section className="space-y-5">
      <div className="workspace-surface p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground"><GitBranch className="size-4" /></div>
          <div>
            <h3 className="text-sm font-semibold">Task dependency graph</h3>
            <p className="text-xs text-muted-foreground">A dependency means the first task waits until the prerequisite completes. Cycles and cross-project links are rejected.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-1.5 text-xs font-medium">
            <span>Task that depends</span>
            <RemoteRecordPicker entityType="task" value={taskId} onValueChange={onTaskIdChange} placeholder="Choose dependent task" />
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            <span>Prerequisite</span>
            <RemoteRecordPicker entityType="task" value={prerequisiteId} onValueChange={onPrerequisiteIdChange} placeholder="Choose prerequisite" />
          </label>
          <div className="flex items-end">
            <Button className="w-full md:w-auto" disabled={busy || !taskId || !prerequisiteId || taskId === prerequisiteId} onClick={onAddDependency}>Add dependency</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {[
          { title: 'Depends on', subtitle: 'Tasks that must finish first', badge: 'Prerequisite', variant: 'outline' as const, page: dependencyData.dependsOn, onPage: onDependsOnOffsetChange, empty: 'No prerequisites for this task.', onRemove: (id: string) => onRemoveDependency(taskId, id) },
          { title: 'Blocks', subtitle: 'Downstream tasks waiting on this task', badge: 'Downstream', variant: 'secondary' as const, page: dependencyData.blocks, onPage: onBlocksOffsetChange, empty: 'No downstream tasks blocked.', onRemove: (id: string) => onRemoveDependency(id, taskId) },
        ].map((panel) => (
          <div key={panel.title} className="workspace-surface p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">{panel.title}</h3>
                <p className="text-[11px] text-muted-foreground">{panel.subtitle}</p>
              </div>
              <Badge variant="secondary">{panel.page.total}</Badge>
            </div>
            {panel.page.items.length ? (
              <div className="divide-y divide-border">
                {panel.page.items.map((id) => (
                  <div key={id} className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{taskTitles[id] ?? `Task ${id.slice(0, 8)}`}</span>
                    <Badge variant={panel.variant}>{panel.badge}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => panel.onRemove(id)}>Remove</Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">{panel.empty}</div>
            )}
            <PageControls offset={panel.page.offset} limit={panel.page.limit} total={panel.page.total} onPageChange={panel.onPage} disabled={busy} className="mt-3 border-t border-border pt-3" />
          </div>
        ))}
      </div>
    </section>
  );
}

interface BlockersTabProps {
  blockerForm: UseFormReturn<BlockerFormValues>;
  blockersPage: PageResult<TaskBlockerRecord>;
  taskTitles: Record<string, string>;
  busy: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onResolve: (id: string) => void;
  onOffsetChange: (offset: number) => void;
}

export function OperationsBlockersTab({
  blockerForm, blockersPage, taskTitles, busy, onSubmit, onResolve, onOffsetChange,
}: BlockersTabProps) {
  const blockers = blockersPage.items;
  return (
    <section className="grid gap-5 lg:grid-cols-[0.95fr_1.15fr]">
      <form className="workspace-surface h-fit space-y-4 p-5 sm:p-6" onSubmit={onSubmit} noValidate>
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning"><CircleAlert className="size-4" /></div>
          <div>
            <h3 className="text-sm font-semibold">Record a blocker</h3>
            <p className="text-xs text-muted-foreground">Marks the selected task as blocked and tracks who or what it is waiting on.</p>
          </div>
        </div>
        <label className="block space-y-1.5 text-xs font-medium">
          <span>Task</span>
          <Controller control={blockerForm.control} name="taskId" render={({ field }) => <RemoteRecordPicker entityType="task" value={field.value} onValueChange={field.onChange} placeholder="Choose task" />} />
          {blockerForm.formState.errors.taskId && <p role="alert" className="text-[11px] text-danger">{blockerForm.formState.errors.taskId.message}</p>}
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          <span>Reason</span>
          <Textarea {...blockerForm.register('reason')} maxLength={4000} rows={3} placeholder="e.g. Waiting for API credentials from client" aria-invalid={Boolean(blockerForm.formState.errors.reason)} />
          {blockerForm.formState.errors.reason && <p role="alert" className="text-[11px] text-danger">{blockerForm.formState.errors.reason.message}</p>}
        </label>
        <div className="space-y-1.5 text-xs font-medium">
          <span className="block">Waiting on <span className="font-normal text-muted-foreground">(optional)</span></span>
          <Controller control={blockerForm.control} name="waitingContactId" render={({ field }) => <RemoteRecordPicker entityType="contact" value={field.value} onValueChange={field.onChange} placeholder="Not specified" />} />
        </div>
        <Controller control={blockerForm.control} name="followUpAt" render={({ field }) => <SmartDateField label="Follow-up date (optional)" value={field.value} onChange={field.onChange} helpText="Optional follow-up date (@today, @friday, or dd/mm/yyyy)." />} />
        {blockerForm.formState.errors.followUpAt && <p role="alert" className="text-[11px] text-danger">{blockerForm.formState.errors.followUpAt.message}</p>}
        <Button type="submit" className="w-full" disabled={busy || blockerForm.formState.isSubmitting}>Save blocker</Button>
      </form>

      <div className="workspace-surface p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Open blockers</h3>
            <p className="text-xs text-muted-foreground">Resolving a blocker restores the task back to active work.</p>
          </div>
          <Badge variant={blockersPage.total > 0 ? 'warning' : 'secondary'}>{blockersPage.total}</Badge>
        </div>
        {blockers.length ? (
          <div className="divide-y divide-border">
            {blockers.map((item) => (
              <article key={item.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-warning/10 text-warning"><CircleAlert className="size-3.5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">{taskTitles[item.taskId] ?? `Task ${item.taskId.slice(0, 8)}`}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
                  {item.followUpAt && <p className="mt-1.5 text-[11px] text-muted-foreground">Follow up {formatDate(item.followUpAt)}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => onResolve(item.id)}>Resolve</Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <ShieldCheck className="mx-auto mb-2 size-5 text-muted-foreground" />
            <p className="text-xs font-medium">No open blockers.</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Everything is moving forward without external wait states.</p>
          </div>
        )}
        <PageControls offset={blockersPage.offset} limit={blockersPage.limit} total={blockersPage.total} onPageChange={onOffsetChange} disabled={busy} className="mt-4 border-t border-border pt-3" />
      </div>
    </section>
  );
}
