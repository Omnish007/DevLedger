import { z } from 'zod';
import type { PageRequest } from '../../shared/contracts.ts';
import type { IpcHandlerContext, IpcRegistrar } from './contracts.ts';
import { blockerPageRequest, entityType, idInput, pageRequest, reminderPageRequest, operationsPageRequest } from './schemas.ts';

export function registerOperationsHandlers(register: IpcRegistrar, context: IpcHandlerContext): void {
  const { operations, jobs } = context;
  register('operations:tags:listPage', pageRequest, (input) => operations.listTagsPage((input ?? {}) as PageRequest));
  register('operations:tags:create', z.tuple([z.string().min(1).max(64), z.string().optional()]), ([name, color]) => operations.createTag(name, color));
  register('operations:tags:delete', idInput, (id) => operations.deleteTag(id));
  register('operations:tags:forEntity', z.tuple([entityType, idInput]), ([type, id]) => operations.listEntityTags(type, id));
  register('operations:tags:assign', z.tuple([entityType, idInput, idInput]), ([type, id, tagId]) => operations.assignTag(type, id, tagId));
  register('operations:tags:unassign', z.tuple([entityType, idInput, idInput]), ([type, id, tagId]) => operations.unassignTag(type, id, tagId));
  register('operations:links:create', z.tuple([entityType, idInput, entityType, idInput, z.string().max(64).optional()]), ([sourceType, sourceId, targetType, targetId, relation]) => operations.createLink(sourceType, sourceId, targetType, targetId, relation));
  register('operations:links:listPage', z.tuple([entityType, idInput, pageRequest]), ([type, id, input]) => operations.listLinksPage(type, id, (input ?? {}) as PageRequest));
  register('operations:links:remove', idInput, (id) => operations.removeLink(id));
  register('operations:dependencies:add', z.tuple([idInput, idInput]), ([taskId, dependsOn]) => operations.addDependency(taskId, dependsOn));
  register('operations:dependencies:remove', z.tuple([idInput, idInput]), ([taskId, dependsOn]) => operations.removeDependency(taskId, dependsOn));
  register('operations:dependencies:list', z.tuple([idInput, z.object({ dependsOn: pageRequest.optional(), blocks: pageRequest.optional() }).optional()]), ([taskId, input]) => operations.listDependencies(taskId, (input ?? {}) as { dependsOn?: PageRequest | undefined; blocks?: PageRequest | undefined }));
  register('operations:blockers:create', z.tuple([idInput, z.string().trim().min(1).max(4000), idInput.nullable(), z.string().datetime().nullable()]), ([taskId, reason, contactId, followUp]) => operations.createBlocker(taskId, reason, contactId, followUp));
  register('operations:blockers:listPage', blockerPageRequest, (input) => operations.listBlockersPage(input ?? {}));
  register('operations:blockers:resolve', z.tuple([idInput, z.string().max(4000).optional()]), ([id, note]) => operations.resolveBlocker(id, note));
  register('operations:reminders:create', z.tuple([z.enum(['task', 'project', 'contact', 'note']), idInput, z.string().datetime(), z.string().max(500).optional()]), ([type, id, dueAt, message]) => operations.createReminder(type, id, dueAt, message));
  register('operations:reminders:listPage', reminderPageRequest, (input) => operations.listRemindersPage(input ?? {}));
  register('operations:reminders:update', z.tuple([idInput, z.enum(['snooze', 'dismiss', 'reschedule', 'cancel']), z.string().datetime().optional(), z.union([z.literal(15), z.literal(60), z.literal(240), z.literal(1440)]).optional()]), ([id, action, dueAt, snoozeMinutes]) => operations.updateReminder(id, action, dueAt, snoozeMinutes));
  register('operations:records:summaries', z.array(z.object({ type: entityType, id: idInput })).max(200), (refs) => operations.resolveRecordSummaries(refs));
  register('operations:time:listPage', z.tuple([idInput, operationsPageRequest]), ([taskId, input]) => operations.listTimeEntriesPage(taskId, (input ?? {}) as PageRequest));
  register('operations:time:add', z.tuple([idInput, z.string().datetime(), z.string().datetime(), z.string().max(1000).optional()]), ([taskId, start, end, note]) => operations.addManualTimeEntry(taskId, start, end, note));
  register('operations:time:update', z.tuple([idInput, z.string().datetime(), z.string().datetime(), z.string().max(1000).optional()]), ([entryId, start, end, note]) => operations.updateTimeEntry(entryId, start, end, note));
  register('operations:time:delete', idInput, (entryId) => operations.deleteTimeEntry(entryId));
  register('operations:activity:listPage', pageRequest, (input) => operations.listActivityPage((input ?? {}) as PageRequest));
  register('operations:jobs:listPage', pageRequest, (input) => operations.listJobsPage((input ?? {}) as PageRequest));
  register('operations:jobs:enqueue', z.enum(['search.rebuild', 'storage.audit', 'maintenance.optimize']), (kind) => operations.enqueueMaintenanceJob(kind));
  register('operations:jobs:cancel', idInput, (jobId) => jobs.requestCancel(jobId));
}
