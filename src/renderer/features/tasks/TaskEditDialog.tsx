import type { UseFormReturn } from 'react-hook-form';
import type { TaskRecord } from '@shared/contracts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SmartDateField } from '@/components/shared/SmartDateField';
import { statuses, type EditTaskForm } from './task-form-schema';

interface Props {
  task: TaskRecord | null;
  form: UseFormReturn<EditTaskForm>;
  busy: boolean;
  error: string;
  selectedParentLabel?: string | undefined;
  onClose: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function TaskEditDialog({ task, form, busy, error, selectedParentLabel, onClose, onSave }: Props) {
  const parentId = form.watch('parentId');
  const dueAt = form.watch('dueAt');

  return (
    <Dialog open={Boolean(task)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[min(94vw,640px)] p-6">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>Update details, schedule, estimate and status for this task.</DialogDescription>
        </DialogHeader>
        {task && (
          <form onSubmit={onSave} noValidate className="space-y-4">
            <div className="space-y-2.5">
              <label className="block space-y-1 text-xs font-medium">
                <span>Title</span>
                <Input {...form.register('title')} maxLength={240} className="h-10 text-sm font-medium" aria-invalid={Boolean(form.formState.errors.title)} />
                {form.formState.errors.title && <p role="alert" className="text-[11px] text-danger">{form.formState.errors.title.message}</p>}
              </label>
              <label className="block space-y-1 text-xs font-medium">
                <span>Description <span className="font-normal text-muted-foreground">(optional)</span></span>
                <Textarea {...form.register('description')} rows={3} maxLength={20_000} />
                {form.formState.errors.description && <p role="alert" className="text-[11px] text-danger">{form.formState.errors.description.message}</p>}
              </label>
            </div>

            <div className="grid gap-3 border-t border-border pt-3.5 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium">
                <span>Status</span>
                <NativeSelect {...form.register('status')} className="h-9 w-full text-xs">
                  {statuses.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <label className="space-y-1.5 text-xs font-medium">
                <span>Priority</span>
                <NativeSelect {...form.register('priority')} className="h-9 w-full text-xs">
                  <NativeSelectOption value="low">Low</NativeSelectOption>
                  <NativeSelectOption value="medium">Medium</NativeSelectOption>
                  <NativeSelectOption value="high">High</NativeSelectOption>
                  <NativeSelectOption value="urgent">Urgent</NativeSelectOption>
                </NativeSelect>
              </label>

              <div className="sm:col-span-2">
                <SmartDateField
                  label="Due date & time"
                  value={dueAt}
                  onChange={(next) => form.setValue('dueAt', next, { shouldDirty: true, shouldValidate: true })}
                  compact
                />
                {form.formState.errors.dueAt && <p role="alert" className="mt-1 text-[11px] text-danger">{form.formState.errors.dueAt.message}</p>}
              </div>

              <label className="space-y-1.5 text-xs font-medium">
                <span>Estimate <span className="font-normal text-muted-foreground">(optional)</span></span>
                <div className="relative">
                  <Input type="number" min="0" max="525600" {...form.register('estimate')} className="pr-11" aria-invalid={Boolean(form.formState.errors.estimate)} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">min</span>
                </div>
                {form.formState.errors.estimate && <p role="alert" className="text-[11px] text-danger">{form.formState.errors.estimate.message}</p>}
              </label>

              <div className="space-y-1.5 text-xs font-medium">
                <span>Parent task <span className="font-normal text-muted-foreground">(optional)</span></span>
                <RemoteRecordPicker
                  entityType="task"
                  value={parentId}
                  onValueChange={(value) => form.setValue('parentId', value, { shouldDirty: true, shouldValidate: true })}
                  projectId={task.projectId}
                  includeCompleted={false}
                  excludeId={task.id}
                  placeholder="Top-level task"
                  selectedLabel={selectedParentLabel}
                />
              </div>
            </div>

            {(form.formState.errors.root?.message || error) && <Alert variant="destructive" className="py-2"><AlertDescription>{form.formState.errors.root?.message || error}</AlertDescription></Alert>}
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy}>Save changes</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
