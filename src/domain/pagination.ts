export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface NormalizedPage { limit: number; offset: number; query: string; }

export function normalizePage(input: { limit?: number; offset?: number; query?: string } = {}): NormalizedPage {
  const requestedLimit = Number.isFinite(input.limit) ? Math.trunc(input.limit!) : DEFAULT_PAGE_SIZE;
  const requestedOffset = Number.isFinite(input.offset) ? Math.trunc(input.offset!) : 0;
  return {
    limit: Math.min(MAX_PAGE_SIZE, Math.max(1, requestedLimit)),
    offset: Math.max(0, requestedOffset),
    query: String(input.query ?? '').trim().slice(0, 200),
  };
}

export function escapeLikeQuery(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
