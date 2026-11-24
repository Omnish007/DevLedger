import { z } from 'zod';
import { parseSmartDate } from '@domain/smart-date';

const reminderTypes = ['task', 'project', 'contact', 'note'] as const;

const smartDateSchema = z.string().max(80).superRefine((value, context) => {
  if (!value.trim()) return;
  try { parseSmartDate(value); }
  catch (error) { context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Enter a valid date.' }); }
});

export const blockerFormSchema = z.object({
  taskId: z.string().min(1, 'Choose a task.'),
  reason: z.string().trim().min(1, 'Enter the reason this task is blocked.').max(4000, 'Blocker reasons must be 4,000 characters or fewer.'),
  waitingContactId: z.string(),
  followUpAt: smartDateSchema,
});
export type BlockerFormValues = z.infer<typeof blockerFormSchema>;

export const reminderFormSchema = z.object({
  entityType: z.enum(reminderTypes),
  recordId: z.string().min(1, 'Choose a record.'),
  dueAt: smartDateSchema.refine((value) => Boolean(value.trim()), 'Choose when the reminder should be delivered.'),
  message: z.string().max(500, 'Reminder messages must be 500 characters or fewer.'),
});
export type ReminderFormValues = z.infer<typeof reminderFormSchema>;

function isValidLocalDateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year!, month! - 1, day, hour, minute);
  return date.getFullYear() === year && date.getMonth() === month! - 1 && date.getDate() === day
    && date.getHours() === hour && date.getMinutes() === minute;
}

const localDateTime = z.string().min(1, 'Enter a date and time.')
  .refine(isValidLocalDateTime, 'Enter a valid local date and time.');

export const timeEntryFormSchema = z.object({
  startedAt: localDateTime,
  endedAt: localDateTime,
  note: z.string().max(1000, 'Time-entry notes must be 1,000 characters or fewer.'),
}).superRefine((value, context) => {
  const start = Date.parse(value.startedAt);
  const end = Date.parse(value.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  if (end <= start) context.addIssue({ code: 'custom', path: ['endedAt'], message: 'End time must be after start time.' });
  else if (end - start > 7 * 24 * 60 * 60 * 1000) context.addIssue({ code: 'custom', path: ['endedAt'], message: 'A time entry cannot exceed seven days. Split longer periods into separate entries.' });
});
export type TimeEntryFormValues = z.infer<typeof timeEntryFormSchema>;

export const emptyBlockerForm: BlockerFormValues = { taskId: '', reason: '', waitingContactId: '', followUpAt: '' };
export const emptyReminderForm: ReminderFormValues = { entityType: 'task', recordId: '', dueAt: '', message: '' };
export const emptyTimeEntryForm: TimeEntryFormValues = { startedAt: '', endedAt: '', note: '' };
