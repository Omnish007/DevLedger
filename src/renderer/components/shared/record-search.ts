import type { EntityType, DevLedgerApi, PageRequest } from '@shared/contracts';

export type RecordChoice = { id: string; label: string; description?: string };
type RecordSearchApi = Pick<DevLedgerApi, 'projects' | 'notes' | 'tasks' | 'documents' | 'contacts'>;

export const RECORD_PICKER_PAGE_SIZE = 30;

/** Search one entity type without transferring the workspace's full collection. */
export interface RecordSearchOptions { projectId?: string | null; includeCompleted?: boolean; excludeId?: string | null; }

export async function loadRecordChoices(api: RecordSearchApi, entityType: EntityType, query: string, options: RecordSearchOptions = {}): Promise<RecordChoice[]> {
  const input: PageRequest = { limit: RECORD_PICKER_PAGE_SIZE, offset: 0, query: query.trim().slice(0, 200) };
  switch (entityType) {
    case 'project': {
      const page = await api.projects.listPage({ ...input, includeArchived: true });
      return page.items.map((item) => ({ id: item.id, label: item.name, description: item.status.replaceAll('_', ' ') }));
    }
    case 'note': {
      const page = await api.notes.listPage(input);
      return page.items.map((item) => ({ id: item.id, label: item.title, description: `Updated ${new Date(item.updatedAt).toLocaleDateString()}` }));
    }
    case 'task': {
      const page = await api.tasks.listPage({ ...input, projectId: options.projectId, includeCompleted: options.includeCompleted ?? true });
      return page.items.filter((item) => item.id !== options.excludeId).map((item) => ({ id: item.id, label: item.title, description: `${item.status.replaceAll('_', ' ')} · ${item.priority}` }));
    }
    case 'document': {
      const page = await api.documents.listPage(input);
      return page.items.map((item) => ({ id: item.id, label: item.title, description: item.originalName !== item.title ? item.originalName : item.status.replaceAll('_', ' ') }));
    }
    case 'contact': {
      const page = await api.contacts.listPage(input);
      return page.items.map((item) => ({ id: item.id, label: item.name, description: [item.role, item.company].filter(Boolean).join(' · ') }));
    }
  }
}
