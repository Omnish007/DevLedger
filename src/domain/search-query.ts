export interface ParsedSearchQuery {
  text: string;
  project?: string | undefined;
  tag?: string | undefined;
  entityType?: 'project' | 'note' | 'task' | 'document' | 'contact' | undefined;
  extension?: string | undefined;
  status?: 'blocked' | 'overdue' | 'completed' | 'in_progress' | undefined;
  after?: string | undefined;
  before?: string | undefined;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Parse a deliberately small, deterministic search language; unknown operators remain literal text. */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const parsed: ParsedSearchQuery = { text: '' };
  const words: string[] = [];
  const tokens = query.match(/(?:[a-z]+:"[^"]+"|"[^"]+"|\S+)/gi) ?? [];
  for (const token of tokens) {
    const project = /^p:(.+)$/i.exec(token);
    if (project) { parsed.project = project[1]!.replace(/^"|"$/g, '').trim(); continue; }
    if (token.startsWith('#') && /^#[\p{L}\p{N}_-]{1,64}$/u.test(token)) { parsed.tag = token.slice(1).toLowerCase(); continue; }
    const type = /^type:(.+)$/i.exec(token);
    if (type) {
      const value = type[1]!.toLowerCase().replace(/^"|"$/g, '');
      if (['project', 'note', 'task', 'document', 'contact'].includes(value)) parsed.entityType = value as ParsedSearchQuery['entityType'];
      else if (['pdf', 'docx', 'xlsx', 'csv', 'txt', 'md'].includes(value)) { parsed.entityType = 'document'; parsed.extension = `.${value}`; }
      else words.push(token);
      continue;
    }
    const state = /^is:(.+)$/i.exec(token);
    if (state) {
      const value = state[1]!.toLowerCase();
      if (['blocked', 'overdue', 'completed', 'in-progress'].includes(value)) parsed.status = value.replace('-', '_') as ParsedSearchQuery['status'];
      else words.push(token);
      continue;
    }
    const after = /^after:(.+)$/i.exec(token);
    if (after) { if (!validDate(after[1]!)) throw new Error('Use after:YYYY-MM-DD for a valid date filter.'); parsed.after = after[1]!; continue; }
    const before = /^before:(.+)$/i.exec(token);
    if (before) { if (!validDate(before[1]!)) throw new Error('Use before:YYYY-MM-DD for a valid date filter.'); parsed.before = before[1]!; continue; }
    words.push(token.replace(/^"|"$/g, ''));
  }
  parsed.text = words.join(' ').trim();
  if (parsed.project && parsed.project.length > 160) throw new Error('Project filter is too long.');
  if (parsed.tag && parsed.tag.length > 64) throw new Error('Tag filter is too long.');
  return parsed;
}
