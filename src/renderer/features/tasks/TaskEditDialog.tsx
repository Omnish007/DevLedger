import { useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { TaskRecord } from '@shared/contracts';
import { parseSmartDate } from '@domain/smart-date';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { statuses, type EditTaskForm } from './task-form-schema';

interface Props {
  task: TaskRecord | null;
  form: UseFormReturn<EditTaskForm>;
  busy: boolean;
  error: string;
  selectedParentLabel?: string;
  onClose: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function TaskEditDialog({ task, form, busy, error, selectedParentLabel, onClose, onSave }: Props) {
  const parentId = form.watch('parentId');
  const dueAt = form.watch('dueAt');
  const dueDatePreview = useMemo(() => {
    if (!dueAt.trim()) return null;
    try { return { parsed: parseSmartDate(dueAt), error: '' }; }
    catch (caught) { return { parsed: null, error: caught instanceof Error ? caught.message : 'Invalid date' }; }
  }, [dueAt]);

  return <Dialog open={Boolean(task)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Edit task</DialogTitle><DialogDescription>Update details, hierarchy, timing and execution status. Changes are saved to your local workspace.</DialogDescription></DialogHeader>
      {task && <form onSubmit={onSave} noValidate className="space-y-3">
        <label className="block space-y-1 text-xs font-medium">Title<Input {...form.register('title')} maxLength={240} aria-invalid={Boolean(form.formState.errors.title)}/>{form.formState.errors.title && <p role="alert" className="text-[11px] text-danger">{form.formState.errors.title.message}</p>}</label>
        <label className="block space-y-1 text-xs font-medium">Description<Textarea {...form.register('description')} rows={3} maxLength={20_000}/>{form.formState.errors.description && <p role="alert" className="text-[11px] text-danger">{form.formState.errors.description.message}</p>}</label>
        <label className="block space-y-1 text-xs font-medium">Parent task<RemoteRecordPicker entityType="task" value={parentId} onValueChange={(value) => form.setValue('parentId', value, { shouldDirty: true, shouldValidate: true })} projectId={task.projectId} includeCompleted={false} excludeId={task.id} placeholder="Top-level task" selectedLabel={selectedParentLabel}/></label>
        <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-medium">Status<NativeSelect {...form.register('status')} className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs">{statuses.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}</NativeSelect></label><label className="space-y-1 text-xs font-medium">Priority<NativeSelect {...form.register('priority')} className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"><NativeSelectOption value="low">Low</NativeSelectOption><NativeSelectOption value="medium">Medium</NativeSelectOption><NativeSelectOption value="high">High</NativeSelectOption><NativeSelectOption value="urgent">Urgent</NativeSelectOption></NativeSelect></label></div>
        <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-medium">Due date<Input {...form.register('dueAt')} placeholder="dd/mm/yyyy or @DDMMYYHHmm" aria-invalid={Boolean(form.formState.errors.dueAt)}/>{form.formState.errors.dueAt && <p role="alert" className="text-[11px] text-danger">{form.formState.errors.dueAt.message}</p>}</label><label className="space-y-1 text-xs font-medium">Estimate (minutes)<Input type="number" min="0" max="525600" {...form.register('estimate')} aria-invalid={Boolean(form.formState.errors.estimate)}/>{form.formState.errors.estimate && <p role="alert" className="text-[11px] text-danger">{form.formState.errors.estimate.message}</p>}</label></div>
        {dueAt.trim() && <p className={`text-[11px] ${dueDatePreview?.error ? 'text-danger' : 'text-muted-foreground'}`} role={dueDatePreview?.error ? 'alert' : 'status'}>{dueDatePreview?.error || (dueDatePreview?.parsed?.kind === 'datetime' ? `Due ${dueDatePreview.parsed.date} at ${dueDatePreview.parsed.time}` : `Due ${dueDatePreview?.parsed?.date}`)}</p>}
        {(form.formState.errors.root?.message || error) && <Alert variant="destructive" className="py-2"><AlertDescription>{form.formState.errors.root?.message || error}</AlertDescription></Alert>}
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>Save changes</Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}
