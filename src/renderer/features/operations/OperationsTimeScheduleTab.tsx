import { AlarmClock, Clock3, Pencil, Trash2 } from 'lucide-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import type { PageResult, ReminderRecord, TimeEntryRecord } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { formatDate } from '@/lib/utils';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SmartDateField } from '@/components/shared/SmartDateField';
import { useConfirm } from '@/components/shared/ConfirmProvider';
import type { ReminderFormValues, TimeEntryFormValues } from './operation-form-schema';

interface RemindersTabProps {
  reminderForm: UseFormReturn<ReminderFormValues>;
  remindersPage: PageResult<ReminderRecord>;
  snoozeMinutes: 15 | 60 | 240 | 1440;
  busy: boolean;
  onSnoozeMinutesChange: (minutes: 15 | 60 | 240 | 1440) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onSnooze: (id: string) => void;
  onDismiss: (id: string) => void;
  onOffsetChange: (offset: number) => void;
}

export function OperationsRemindersTab({
  reminderForm, remindersPage, snoozeMinutes, busy,
  onSnoozeMinutesChange, onSubmit, onSnooze, onDismiss, onOffsetChange,
}: RemindersTabProps) {
  const reminders = remindersPage.items;
  return (
    <section className="grid gap-5 lg:grid-cols-[0.95fr_1.15fr]">
      <form className="workspace-surface h-fit space-y-4 p-5 sm:p-6" onSubmit={onSubmit} noValidate>
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground"><AlarmClock className="size-4" /></div>
          <div>
            <h3 className="text-sm font-semibold">Schedule a reminder</h3>
            <p className="text-xs text-muted-foreground">Persists locally and delivers grouped notifications while the app runs.</p>
          </div>
        </div>
        <label className="block space-y-1.5 text-xs font-medium">
          <span>Record type</span>
          <Controller control={reminderForm.control} name="entityType" render={({ field }) => (
            <NativeSelect value={field.value} onChange={(event) => { field.onChange(event.target.value); reminderForm.setValue('recordId', '', { shouldDirty: true, shouldValidate: true }); }} className="h-9 w-full text-xs">
              {(['task', 'project', 'contact', 'note'] as const).map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}
            </NativeSelect>
          )} />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          <span>Record</span>
          <Controller control={reminderForm.control} name="recordId" render={({ field }) => <RemoteRecordPicker entityType={reminderForm.watch('entityType')} value={field.value} onValueChange={field.onChange} placeholder="Choose a record" />} />
          {reminderForm.formState.errors.recordId && <p role="alert" className="text-[11px] text-danger">{reminderForm.formState.errors.recordId.message}</p>}
        </label>
        <Controller control={reminderForm.control} name="dueAt" render={({ field }) => <SmartDateField label="When" value={field.value} onChange={field.onChange} required helpText="Enter @today, @friday, a date, or @DDMMYYHHmm. Date-only reminders use 09:00 local time." />} />
        {reminderForm.formState.errors.dueAt && <p role="alert" className="text-[11px] text-danger">{reminderForm.formState.errors.dueAt.message}</p>}
        <label className="block space-y-1.5 text-xs font-medium">
          <span>Message <span className="font-normal text-muted-foreground">(optional)</span></span>
          <Input {...reminderForm.register('message')} maxLength={500} placeholder="Follow up on review…" />
          {reminderForm.formState.errors.message && <p role="alert" className="text-[11px] text-danger">{reminderForm.formState.errors.message.message}</p>}
        </label>
        <Button type="submit" className="w-full" disabled={busy || reminderForm.formState.isSubmitting}>Schedule</Button>
      </form>

      <div className="workspace-surface p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Scheduled reminders</h3>
            <p className="text-xs text-muted-foreground">Snooze or dismiss upcoming follow-ups.</p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Snooze</span>
            <NativeSelect value={String(snoozeMinutes)} onChange={(event) => onSnoozeMinutesChange(Number(event.target.value) as typeof snoozeMinutes)} className="h-8 w-28 text-xs">
              <NativeSelectOption value="15">15 minutes</NativeSelectOption>
              <NativeSelectOption value="60">1 hour</NativeSelectOption>
              <NativeSelectOption value="240">4 hours</NativeSelectOption>
              <NativeSelectOption value="1440">1 day</NativeSelectOption>
            </NativeSelect>
          </label>
        </div>
        {reminders.length ? (
          <div className="divide-y divide-border">
            {reminders.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-subtle text-muted-foreground"><AlarmClock className="size-3.5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{item.message || `${item.entityType} reminder`}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(item.dueAt)} · {item.status}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onSnooze(item.id)}>Snooze</Button>
                <Button size="sm" variant="ghost" onClick={() => onDismiss(item.id)}>Dismiss</Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <AlarmClock className="mx-auto mb-2 size-5 text-muted-foreground" />
            <p className="text-xs font-medium">No reminders scheduled.</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Schedule a reminder on the left to keep follow-ups visible.</p>
          </div>
        )}
        <PageControls offset={remindersPage.offset} limit={remindersPage.limit} total={remindersPage.total} onPageChange={onOffsetChange} disabled={busy} className="mt-4 border-t border-border pt-3" />
      </div>
    </section>
  );
}

interface TimeTabProps {
  timeTaskId: string;
  editingTimeEntryId: string | null;
  timeEntryForm: UseFormReturn<TimeEntryFormValues>;
  timeEntriesPage: PageResult<TimeEntryRecord>;
  busy: boolean;
  onTaskChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancelEdit: () => void;
  onBeginEdit: (entry: TimeEntryRecord) => void;
  onDeleteEntry: (id: string) => void;
  onOffsetChange: (offset: number) => void;
}

export function OperationsTimeTab({
  timeTaskId, editingTimeEntryId, timeEntryForm, timeEntriesPage, busy,
  onTaskChange, onSubmit, onCancelEdit, onBeginEdit, onDeleteEntry, onOffsetChange,
}: TimeTabProps) {
  const confirm = useConfirm();
  const timeEntries = timeEntriesPage.items;
  const totalMinutes = timeEntries.reduce((sum, entry) => sum + Math.round((entry.durationSeconds ?? 0) / 60), 0);

  return (
    <section className="workspace-surface space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground"><Clock3 className="size-4" /></div>
          <div>
            <h3 className="text-sm font-semibold">Manual time entries</h3>
            <p className="text-xs text-muted-foreground">Add or correct historical work time separately from running timers.</p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          {timeTaskId && <Badge variant="secondary" className="mb-2 tabular-nums">{totalMinutes} min shown</Badge>}
          <label className="min-w-64 space-y-1 text-xs font-medium">
            <span>Task</span>
            <RemoteRecordPicker entityType="task" value={timeTaskId} onValueChange={onTaskChange} placeholder="Choose a task" />
          </label>
        </div>
      </div>

      <form className="grid gap-3 rounded-lg border border-border/80 bg-surface-subtle/30 p-3.5 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={onSubmit} noValidate>
        <label className="space-y-1 text-xs font-medium">
          <span>Start</span>
          <Input type="datetime-local" {...timeEntryForm.register('startedAt')} aria-invalid={Boolean(timeEntryForm.formState.errors.startedAt)} />
          {timeEntryForm.formState.errors.startedAt && <p role="alert" className="text-[11px] text-danger">{timeEntryForm.formState.errors.startedAt.message}</p>}
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>End</span>
          <Input type="datetime-local" {...timeEntryForm.register('endedAt')} aria-invalid={Boolean(timeEntryForm.formState.errors.endedAt)} />
          {timeEntryForm.formState.errors.endedAt && <p role="alert" className="text-[11px] text-danger">{timeEntryForm.formState.errors.endedAt.message}</p>}
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>Note</span>
          <Input {...timeEntryForm.register('note')} maxLength={1000} placeholder="Work summary…" />
          {timeEntryForm.formState.errors.note && <p role="alert" className="text-[11px] text-danger">{timeEntryForm.formState.errors.note.message}</p>}
        </label>
        <div className="flex items-end gap-1.5">
          <Button type="submit" disabled={busy || !timeTaskId || timeEntryForm.formState.isSubmitting}>{editingTimeEntryId ? 'Save correction' : 'Add'}</Button>
          {editingTimeEntryId && <Button type="button" size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Button>}
        </div>
      </form>

      {timeEntries.length ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {timeEntries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-3.5 py-2.5 text-xs">
              <Clock3 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium">{formatDate(entry.startedAt)}</span>
              <Badge variant="outline" className="tabular-nums">{entry.durationSeconds === null ? 'Running' : `${Math.round(entry.durationSeconds / 60)} min`}</Badge>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.note}</span>
              {entry.active ? <Badge variant="warning">Active</Badge> : (
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="size-7" title="Correct time entry" aria-label="Correct time entry" onClick={() => onBeginEdit(entry)}><Pencil className="size-3" /></Button>
                  <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-danger" title="Remove time entry" aria-label="Remove time entry" onClick={() => {
                    void (async () => {
                      const accepted = await confirm({ title: 'Remove time entry?', description: 'The entry will be removed. The action will be recorded in activity history.', confirmLabel: 'Remove entry', destructive: true });
                      if (accepted) onDeleteEntry(entry.id);
                    })();
                  }}><Trash2 className="size-3" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">No time entries for this task.</div>
      )}
      <PageControls offset={timeEntriesPage.offset} limit={timeEntriesPage.limit} total={timeEntriesPage.total} onPageChange={onOffsetChange} disabled={busy} />
    </section>
  );
}
