import { z } from 'zod';

export const projectInput = z.object({ name: z.string().trim().min(1).max(160), description: z.string().max(10_000).optional(), type: z.enum(['greenfield', 'ongoing']) });
export const projectUpdate = projectInput.partial().extend({ status: z.enum(['active', 'on_hold', 'completed', 'archived']).optional() });
export const contactInput = z.object({
  name: z.string().trim().min(1).max(160), role: z.string().max(80).optional(), company: z.string().max(160).optional(),
  email: z.string().max(254).optional(), phone: z.string().max(80).optional(), notes: z.string().max(10_000).optional(),
  customAttributes: z.record(z.string().max(40), z.string().max(500)).refine((value) => Object.keys(value).length <= 20, 'At most 20 custom attributes are allowed.').optional(),
  projectId: z.string().uuid().nullable().optional(),
});
export const noteInput = z.object({ projectId: z.string().uuid().nullable().optional(), title: z.string().max(240).default('Untitled note'), content: z.string().max(2_000_000) });
export const noteUpdate = noteInput.partial();
export const taskInput = z.object({
  projectId: z.string().uuid(), parentId: z.string().uuid().nullable().optional(), title: z.string().trim().min(1).max(240),
  description: z.string().max(50_000).optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueAt: z.string().datetime().nullable().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estimateMinutes: z.number().int().min(0).max(525_600).nullable().optional(),
});
export const taskUpdate = taskInput.partial().extend({ status: z.enum(['not_started', 'in_progress', 'blocked', 'waiting', 'completed', 'cancelled']).optional() });
export const searchInput = z.object({ query: z.string().trim().min(1).max(300), projectId: z.string().uuid().nullable().optional(), types: z.array(z.enum(['project', 'note', 'task', 'document', 'contact'])).max(5).optional(), limit: z.number().int().min(1).max(50).optional() });
export const idInput = z.string().uuid();
export const projectFilter = z.string().uuid().nullable().optional();
export const pageRequest = z.object({
  limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).max(10_000_000).optional(),
  query: z.string().max(200).optional(), projectId: z.string().uuid().nullable().optional(),
  includeArchived: z.boolean().optional(), includeCompleted: z.boolean().optional(), includeLocked: z.boolean().optional(),
}).optional();
export const operationsPageRequest = z.object({ limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).max(10_000_000).optional() }).optional();
export const blockerPageRequest = operationsPageRequest.unwrap().extend({ includeResolved: z.boolean().optional() }).optional();
export const reminderPageRequest = operationsPageRequest.unwrap().extend({ status: z.enum(['scheduled', 'delivered', 'snoozed', 'dismissed', 'cancelled']).optional() }).optional();
export const noInput = z.undefined();
export const entityType = z.enum(['project', 'note', 'task', 'document', 'contact']);
