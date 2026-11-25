import type { EntityType, WorkspaceNavigationTarget } from '@shared/contracts';

const VIEW_BY_ENTITY: Record<EntityType, WorkspaceNavigationTarget['view']> = {
  project: 'projects',
  note: 'notes',
  task: 'tasks',
  document: 'documents',
  contact: 'contacts',
};

export function targetFromRecord(
  type: EntityType,
  id: string,
  projectId?: string | null,
): WorkspaceNavigationTarget {
  return { view: VIEW_BY_ENTITY[type], recordId: id, projectId: projectId ?? null };
}

export const TAG_DOT_CLASS: Record<string, string> = {
  neutral: 'bg-zinc-400',
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  violet: 'bg-violet-500',
};
