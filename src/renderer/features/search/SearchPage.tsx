import { useEffect, useRef, useState } from 'react';
import { AlertCircle, FileText, FolderKanban, ListTodo, NotebookPen, Search as SearchIcon, Sparkles, Users } from 'lucide-react';
import type { AiSummary, OllamaStatus, SearchResult } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { formatRelative } from '@/lib/utils';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';

type Props = {
  onSearch: (query: string, projectId?: string | null) => Promise<SearchResult[]>;
  onHybridSearch: (query: string, projectId?: string | null) => Promise<SearchResult[]>;
  onOpenResult: (result: SearchResult) => void;
  onAiStatus: () => Promise<OllamaStatus>;
  onSummarize: (query: string, projectId?: string | null) => Promise<AiSummary>;
};
const icon = { project: FolderKanban, note: NotebookPen, task: ListTodo, document: FileText, contact: Users };

export function SearchPage({ onSearch, onHybridSearch, onOpenResult, onAiStatus, onSummarize }: Props) {
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const visibleResults = results.slice((page - 1) * pageSize, page * pageSize);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiError, setAiError] = useState('');
  const [searched, setSearched] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  const [semanticBusy, setSemanticBusy] = useState(false);
  const [semanticError, setSemanticError] = useState('');
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const semanticRequestSequence = useRef(0);

  useEffect(() => {
    const ids = [...new Set(results.map((result) => result.projectId).filter((id): id is string => Boolean(id)))].slice(0, 200);
    let active = true;
    void window.devLedger.projects.getNames(ids).then((names) => { if (active) setProjectNames((current) => ({ ...current, ...names })); }).catch(() => undefined);
    return () => { active = false; };
  }, [results]);

  async function requestSummary() {
    if (!query.trim()) return;
    setAiBusy(true); setAiError(''); setAiSummary(null);
    try {
      const status = await onAiStatus();
      if (!status.available) throw new Error(status.error ?? 'Ollama is unavailable.');
      setAiSummary(await onSummarize(query.trim(), projectId === 'all' ? null : projectId));
    } catch (caught) {
      setAiError(caught instanceof Error ? caught.message : 'AI summary could not be generated.');
    } finally { setAiBusy(false); }
  }

  async function rerankSemantically(queryValue = query, scope = projectId) {
    if (!queryValue.trim()) return;
    const requestId = ++semanticRequestSequence.current;
    setSemanticBusy(true); setSemanticError('');
    try {
      const ranked = await onHybridSearch(queryValue.trim(), scope === 'all' ? null : scope);
      if (requestId === semanticRequestSequence.current) { setResults(ranked); setPage(1); }
    } catch (caught) {
      if (requestId === semanticRequestSequence.current) setSemanticError(caught instanceof Error ? caught.message : 'Semantic search is unavailable. FTS5 results remain available.');
    } finally {
      if (requestId === semanticRequestSequence.current) setSemanticBusy(false);
    }
  }

  async function search(event?: React.FormEvent) {
    event?.preventDefault();
    if (!query.trim()) return;
    semanticRequestSequence.current += 1;
    setBusy(true); setError(''); setSearched(true); setAiSummary(null); setAiError('');
    let summarizeAfterSearch = false;
    try {
      const lexicalResults = await onSearch(query.trim(), projectId === 'all' ? null : projectId);
      setResults(lexicalResults); setPage(1);
      summarizeAfterSearch = aiEnabled;
      if (semanticEnabled) void rerankSemantically(query.trim(), projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Search failed.');
      setResults([]);
    } finally { setBusy(false); }
    // Surface lexical results immediately; AI generation is a separate optional follow-up.
    if (summarizeAfterSearch) void requestSummary();
  }

  function toggleSemantic(enabled: boolean) {
    setSemanticEnabled(enabled); setSemanticError('');
    if (!enabled) { semanticRequestSequence.current += 1; setSemanticBusy(false); setPage(1); }
    if (enabled && searched && results.length) void rerankSemantically(query, projectId);
    if (!enabled && searched && query.trim()) void onSearch(query.trim(), projectId === 'all' ? null : projectId).then(setResults).catch(() => undefined);
  }

  function toggleAi(enabled: boolean) {
    setAiEnabled(enabled);
    if (!enabled) { setAiSummary(null); setAiError(''); }
    else if (searched && results.length) void requestSummary();
  }

  return <div className="mx-auto max-w-[1000px] space-y-6">
    <div><p className="mb-1 text-xs text-muted-foreground">Find knowledge across your local workspace</p><h2 className="text-2xl font-semibold tracking-tight">Search</h2><p className="mt-1 text-sm text-muted-foreground">Exact matching across projects, notes, tasks, contacts and indexed documents. AI is optional and never required for search.</p><p className="mt-2 text-[11px] text-muted-foreground">Filters: <code>p:"Project name"</code> · <code>#tag</code> · <code>type:pdf</code> · <code>is:blocked</code> · <code>after:YYYY-MM-DD</code> · <code>before:YYYY-MM-DD</code></p></div>
    <form onSubmit={(event) => void search(event)} className="flex flex-col gap-2 sm:flex-row"><InputGroup className="h-11 min-w-0 flex-1"><InputGroupAddon><SearchIcon className="size-4"/></InputGroupAddon><InputGroupInput autoFocus aria-label="Search workspace" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a decision, error message, task or document…" className="h-11 text-sm"/></InputGroup><RemoteRecordPicker entityType="project" value={projectId === 'all' ? '' : projectId} onValueChange={(value) => setProjectId(value || 'all')} placeholder="All projects" selectedLabel={projectId === 'all' ? undefined : projectNames[projectId]} className="h-11 w-52" /><Button type="submit" className="h-11 px-5" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</Button></form>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <label className="flex items-center gap-2 text-xs font-medium"><Switch checked={semanticEnabled} onCheckedChange={toggleSemantic} size="sm"/> Include local semantic matches <Badge variant="outline">Optional</Badge></label>
      {semanticEnabled && <Badge variant="secondary">{semanticBusy ? 'Finding related concepts…' : 'Local embeddings'}</Badge>}
      <p className="basis-full text-[11px] leading-relaxed text-muted-foreground">Semantic matching uses the local Ollama embedding model configured and indexed in Settings. Locked notes are excluded. FTS5 results appear first and remain usable when semantic search is off or unavailable.</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <label className="flex items-center gap-2 text-xs font-medium"><Switch checked={aiEnabled} onCheckedChange={toggleAi} size="sm"/> <Sparkles className="size-3.5 text-muted-foreground"/> Generate an AI summary <Badge variant="outline">Off by default</Badge></label>
      {aiEnabled && <Button size="sm" variant="outline" disabled={!searched || !results.length || aiBusy} onClick={() => void requestSummary()}>{aiBusy ? 'Summarizing…' : 'Generate summary'}</Button>}
      <p className="basis-full text-[11px] leading-relaxed text-muted-foreground">When enabled, only matching unlocked search excerpts are sent to your local Ollama service at 127.0.0.1. The model cannot change workspace records.</p>
    </div>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    {semanticError && <p role="alert" className="text-xs text-warning">{semanticError}</p>}
    {aiError && <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs"><AlertCircle className="mt-0.5 size-4 shrink-0 text-warning"/><span>{aiError}</span></div>}
    {aiEnabled && aiSummary && <section className="rounded-lg border border-border bg-surface p-4"><div className="mb-2 flex items-center gap-2"><Sparkles className="size-4 text-muted-foreground"/><h3 className="text-sm font-semibold">Evidence summary</h3><Badge variant="secondary">{aiSummary.model}</Badge>{aiSummary.cached && <Badge variant="outline">Cached</Badge>}</div><p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{aiSummary.summary}</p><div className="mt-4 border-t border-border pt-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Source records</p><div className="flex flex-wrap gap-2">{aiSummary.citations.map((source) => <button key={`${source.type}:${source.id}`} type="button" onClick={() => onOpenResult(source)} className="rounded-md border border-border px-2.5 py-1.5 text-[11px] hover:bg-surface-hover">{source.title}</button>)}</div></div></section>}
    {searched && <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{busy ? 'Searching local indexes…' : semanticBusy ? 'Ranking local semantic matches…' : `${results.length} result${results.length === 1 ? '' : 's'}`}</p><Badge variant="outline">SQLite FTS5 · AI not required</Badge></div>}
    <div className="divide-y divide-border rounded-lg border border-border bg-surface">{visibleResults.map((result) => { const Icon = icon[result.type]; return <article key={`${result.type}:${result.id}`} className="flex gap-3 px-4 py-4"><div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-surface-subtle text-muted-foreground"><Icon className="size-4"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => onOpenResult(result)} className="truncate text-left text-[13px] font-semibold hover:underline">{result.title}</button><Badge variant="secondary">{result.type}</Badge></div><p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{result.excerpt.replace(/<\/?mark>/g, '')}</p><p className="mt-2 text-[10px] text-muted-foreground">{projectNames[result.projectId ?? ''] ?? 'Workspace'} · {formatRelative(result.updatedAt)}</p></div></article>; })}
      {searched && !busy && !results.length && !error && <div className="py-14 text-center"><SearchIcon className="mx-auto mb-3 size-6 text-muted-foreground"/><p className="text-sm font-medium">No matching results</p><p className="mt-1 text-xs text-muted-foreground">Try a shorter phrase, a code identifier or a different project scope.</p></div>}
      {!searched && <div className="py-14 text-center"><SearchIcon className="mx-auto mb-3 size-6 text-muted-foreground"/><p className="text-sm font-medium">Search your project memory</p><p className="mt-1 text-xs text-muted-foreground">Exact terms are useful for stack traces, identifiers, configuration names and decisions.</p></div>}
    </div>
    {searched && pageCount > 1 && <Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#results" aria-disabled={page === 1} className={page === 1 ? 'pointer-events-none opacity-40' : undefined} onClick={(event) => { event.preventDefault(); setPage((current) => Math.max(1, current - 1)); }}/></PaginationItem>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <PaginationItem key={pageNumber}><PaginationLink href="#results" isActive={pageNumber === page} onClick={(event) => { event.preventDefault(); setPage(pageNumber); }}>{pageNumber}</PaginationLink></PaginationItem>)}<PaginationItem><PaginationNext href="#results" aria-disabled={page === pageCount} className={page === pageCount ? 'pointer-events-none opacity-40' : undefined} onClick={(event) => { event.preventDefault(); setPage((current) => Math.min(pageCount, current + 1)); }}/></PaginationItem></PaginationContent></Pagination>}
  </div>;
}
