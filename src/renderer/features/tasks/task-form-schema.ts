import { z } from 'zod';
import type { TaskStatus } from '@shared/contracts';
import { parseSmartDate } from '@domain/smart-date';

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Enter a task title.').max(240, 'Task titles must be 240 characters or fewer.'),
  projectId: z.string().min(1, 'Choose a project.'),
  parentId: z.string(),
  dueAt: z.string().superRefine((value, context) => {
    if (!value.trim()) return;
    try { parseSmartDate(value); } catch (error) { context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Enter a valid date.' }); }
  }),
  estimate: z.string().refine((value) => !value.trim() || (/^\d+$/.test(value) && Number(value) <= 525600), 'Enter a whole number between 0 and 525600 minutes.'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  description: z.string().max(20_000, 'Description is too long.'),
});
export type CreateTaskForm = z.infer<typeof createTaskSchema>;
export const editTaskSchema = createTaskSchema.omit({ projectId: true }).extend({
  status: z.enum(['not_started', 'in_progress', 'blocked', 'waiting', 'completed', 'cancelled']),
});
export type EditTaskForm = z.infer<typeof editTaskSchema>;

export const statuses: Array<{ value: TaskStatus; label: string }> = [
  { value: 'not_started', label: 'Not started' }, { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' }, { value: 'waiting', label: 'Waiting' },
  { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
];

