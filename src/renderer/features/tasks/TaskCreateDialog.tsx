import { useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { getSmartDatePresets, parseSmartDate } from '@domain/smart-date';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import type { CreateTaskForm } from './task-form-schema';

interface Props {
  open: boolean;
  form: UseFormReturn<CreateTaskForm>;
  busy: boolean;
  error: string;
  selectedProject: string;
  selectedProjectLabel?: string;
  selectedParentLabel?: string;
  onProjectChange: (projectId: string, label?: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function TaskCreateDialog({
  open,
  form,
  busy,
  error,
  selectedProject,
  selectedProjectLabel,
  selectedParentLabel,
  onProjectChange,
  onClose,
  onSubmit,
}: Props) {
  const parentId = form.watch('parentId');
  const dueAt = form.watch('dueAt');
  const presets = useMemo(() => getSmartDatePresets().slice(0, 4), []);
  const dueDatePreview = useMemo(() => {
    if (!dueAt.trim()) return null;
    try { return { parsed: parseSmartDate(dueAt), error: '' }; }
    catch (caught) { return { parsed: null, error: caught instanceof Error ? caught.message : 'Invalid date' }; }
  }, [dueAt]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="w-[min(94vw,560px)]">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Capture the next concrete action. Due date, estimate, parent task, and description are optional.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium">
            <span>Task title</span>
            <Input
              autoFocus
              {...form.register('title')}
              placeholder="What needs to be done?"
              maxLength={240}
              aria-invalid={Boolean(form.formState.errors.title)}
            />
            {form.formState.errors.title && <p className="text-[11px] text-danger" role="alert">{form.formState.errors.title.message}</p>}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 text-xs font-medium">
              <span>Project</span>
              <RemoteRecordPicker
                entityType="project"
                value={selectedProject}
                onValueChange={(value) => onProjectChange(value)}
                onChoiceChange={(choice) => onProjectChange(choice?.id ?? '', choice?.label)}
                placeholder="Choose project"
                selectedLabel={selectedProjectLabel}
              />
              {form.formState.errors.projectId && <p className="text-[11px] text-danger" role="alert">{form.formState.errors.projectId.message}</p>}
            </div>
            <label className="space-y-1.5 text-xs font-medium">
              <span>Priority</span>
              <NativeSelect aria-label="Priority" {...form.register('priority')} className="h-9 w-full text-xs">
                <NativeSelectOption value="low">Low priority</NativeSelectOption>
                <NativeSelectOption value="medium">Medium priority</NativeSelectOption>
                <NativeSelectOption value="high">High priority</NativeSelectOption>
                <NativeSelectOption value="urgent">Urgent</NativeSelectOption>
              </NativeSelect>
            </label>
          </div>

          <div className="space-y-3 rounded-lg border border-border/80 bg-surface-subtle/40 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Optional details</p>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="create-task-due-at" className="text-xs font-medium">Due date <span className="font-normal text-muted-foreground">(optional)</span></label>
                <div className="flex flex-wrap gap-1">
                  {presets.map((preset) => (
                    <button key={preset.id} type="button" onClick={() => form.setValue('dueAt', preset.token, { shouldValidate: true })} className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      {preset.label}
                    </button>
                  ))}
                  {dueAt.trim() && (
                    <button type="button" onClick={() => form.setValue('dueAt', '', { shouldValidate: true })} className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <Input id="create-task-due-at" type="text" {...form.register('dueAt')} placeholder="@today, @friday, 22/11/2026" aria-invalid={Boolean(form.formState.errors.dueAt)} />
              {dueAt.trim() && (
                <p className={`text-[11px] ${dueDatePreview?.error ? 'text-danger' : 'text-muted-foreground'}`} role={dueDatePreview?.error ? 'alert' : 'status'}>
                  {dueDatePreview?.error || (dueDatePreview?.parsed?.kind === 'datetime' ? `Due ${dueDatePreview.parsed.date} at ${dueDatePreview.parsed.time} (local time)` : `Due ${dueDatePreview?.parsed?.date}`)}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium">
                <span>Estimate <span className="font-normal text-muted-foreground">(optional, min)</span></span>
                <Input type="number" min="0" max="525600" {...form.register('estimate')} placeholder="e.g. 45" aria-invalid={Boolean(form.formState.errors.estimate)} />
                {form.formState.errors.estimate && <p className="text-[11px] text-danger" role="alert">{form.formState.errors.estimate.message}</p>}
              </label>
              <div className="space-y-1.5 text-xs font-medium">
                <span>Parent task <span className="font-normal text-muted-foreground">(optional)</span></span>
                <RemoteRecordPicker
                  entityType="task"
                  value={parentId}
                  onValueChange={(value) => form.setValue('parentId', value)}
                  projectId={selectedProject || null}
                  includeCompleted={false}
                  disabled={!selectedProject}
                  placeholder={selectedProject ? 'Top-level task' : 'Select a project first'}
                  selectedLabel={selectedParentLabel}
                />
              </div>
            </div>

            <label className="block space-y-1.5 text-xs font-medium">
              <span>Description <span className="font-normal text-muted-foreground">(optional)</span></span>
              <Textarea aria-label="Task description" {...form.register('description')} placeholder="Context, links or acceptance notes…" rows={3} />
              {form.formState.errors.description && <p className="text-[11px] text-danger" role="alert">{form.formState.errors.description.message}</p>}
            </label>
          </div>

          {(form.formState.errors.root?.message || error) && (
            <Alert variant="destructive" className="py-2"><AlertDescription>{form.formState.errors.root?.message || error}</AlertDescription></Alert>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create task'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
