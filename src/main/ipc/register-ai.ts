import { z } from 'zod';
import type { SearchInput } from '../../shared/contracts.ts';
import type { IpcHandlerContext, IpcRegistrar } from './contracts.ts';
import { noInput, projectFilter, searchInput } from './schemas.ts';

export function registerAiHandlers(register: IpcRegistrar, context: IpcHandlerContext): void {
  const { jobs, ollama } = context;
  register('search:query', searchInput, (input) => context.workspace.search(input as SearchInput));
  register('ai:status', noInput, () => ollama.status());
  register('ai:summarize', z.tuple([z.string().trim().min(1).max(300), projectFilter]), ([query, projectId]) => jobs.enqueueAndWait('ai.summarize', 'workspace', 'local', { query, projectId: projectId ?? null }, { priority: 4 }));
  register('ai:indexSemantic', noInput, () => jobs.enqueueAndWait('semantic.index', 'workspace', 'local', {}, { priority: 5 }));
  register('ai:hybridSearch', z.tuple([z.string().trim().min(1).max(500), projectFilter]), ([query, projectId]) => ollama.hybridSearch(query, projectId));
}

