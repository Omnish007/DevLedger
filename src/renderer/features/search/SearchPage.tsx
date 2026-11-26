import { useRef, useState } from 'react';
import { AlertCircle, Search as SearchIcon, Sparkles, X } from 'lucide-react';
import type { AiSummary, EntityType, OllamaStatus, SearchResult } from '@shared/contracts';
import { stripHtmlToPlainText } from '@domain/html-text';
import { PageHeader } from '@/components/shared/PageHeader';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useProjectNames } from '@/hooks/useProjectNames';
import { friendlyError } from '@/lib/utils';
import { SearchAiAnswerCard } from './SearchAiAnswerCard';
import { SearchResultsList, SearchSyntaxPopover } from './SearchResultsList';

type Props = {
    onSearch: (query: string, projectId?: string | null) => Promise<SearchResult[]>;
    onHybridSearch: (query: string, projectId?: string | null) => Promise<SearchResult[]>;
    onOpenResult: (result: SearchResult) => void;
    onAiStatus: () => Promise<OllamaStatus>;
    onSummarize: (query: string, projectId?: string | null) => Promise<AiSummary>;
};

const PAGE_SIZE = 20;

export function SearchPage({ onSearch, onHybridSearch, onOpenResult, onAiStatus, onSummarize }: Props) {
    const [query, setQuery] = useState('');
    const [projectId, setProjectId] = useState('all');
    const [pickedProjectLabels, setPickedProjectLabels] = useState<Record<string, string>>({});
    const [typeFilter, setTypeFilter] = useState<'all' | EntityType>('all');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [page, setPage] = useState(1);
    const filteredResults =
        typeFilter === 'all' ? results : results.filter((item) => item.type === typeFilter);
    const pageCount = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
    const visibleResults = filteredResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
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
    const summaryRequestSequence = useRef(0);

    const { projectNames: resolvedProjectNames } = useProjectNames(results.map((r) => r.projectId));
    const projectNames = { ...resolvedProjectNames, ...pickedProjectLabels };

    async function requestSummary(queryValue = query, scope = projectId) {
        if (!queryValue.trim()) return;
        const requestId = ++summaryRequestSequence.current;
        setAiBusy(true);
        setAiError('');
        setAiSummary(null);
        try {
            const status = await onAiStatus();
            if (!status.available) throw new Error(status.error ?? 'Ollama is unavailable.');
            const summary = await onSummarize(queryValue.trim(), scope === 'all' ? null : scope);
            if (requestId === summaryRequestSequence.current) setAiSummary(summary);
        } catch (caught) {
            if (requestId === summaryRequestSequence.current)
                setAiError(friendlyError(caught, 'AI summary could not be generated.'));
        } finally {
            if (requestId === summaryRequestSequence.current) setAiBusy(false);
        }
    }

    async function rerankSemantically(queryValue = query, scope = projectId, summarizeIfFound = false) {
        if (!queryValue.trim()) return;
        const requestId = ++semanticRequestSequence.current;
        setSemanticBusy(true);
        setSemanticError('');
        try {
            const ranked = await onHybridSearch(queryValue.trim(), scope === 'all' ? null : scope);
            if (requestId === semanticRequestSequence.current) {
                setResults(ranked);
                setPage(1);
                if (summarizeIfFound && ranked.length > 0) void requestSummary(queryValue, scope);
            }
        } catch (caught) {
            if (requestId === semanticRequestSequence.current)
                setSemanticError(
                    friendlyError(caught, 'Semantic search is unavailable. FTS5 results remain available.'),
                );
        } finally {
            if (requestId === semanticRequestSequence.current) setSemanticBusy(false);
        }
    }

    async function runQuery(nextQuery: string, nextScope = projectId) {
        if (!nextQuery.trim()) return;
        setQuery(nextQuery);
        semanticRequestSequence.current += 1;
        summaryRequestSequence.current += 1;
        setBusy(true);
        setAiBusy(false);
        setError('');
        setSearched(true);
        setAiSummary(null);
        setAiError('');
        setSemanticError('');
        let lexicalCount = 0;
        let succeeded = false;
        try {
            const lexicalResults = await onSearch(nextQuery.trim(), nextScope === 'all' ? null : nextScope);
            setResults(lexicalResults);
            setTypeFilter('all');
            setPage(1);
            lexicalCount = lexicalResults.length;
            succeeded = true;
        } catch (caught) {
            setError(friendlyError(caught, 'Search failed.'));
            setResults([]);
        } finally {
            setBusy(false);
        }
        if (!succeeded) return;
        // Only invoke AI summary once at least one matching search result exists.
        if (aiEnabled && lexicalCount > 0) void requestSummary(nextQuery, nextScope);
        if (semanticEnabled)
            void rerankSemantically(nextQuery.trim(), nextScope, aiEnabled && lexicalCount === 0);
    }

    function search(event?: React.FormEvent) {
        event?.preventDefault();
        void runQuery(query, projectId);
    }

    function toggleSemantic(enabled: boolean) {
        setSemanticEnabled(enabled);
        setSemanticError('');
        if (!enabled) {
            semanticRequestSequence.current += 1;
            setSemanticBusy(false);
            setPage(1);
        }
        if (enabled && searched && query.trim())
            void rerankSemantically(query, projectId, aiEnabled && results.length === 0);
        if (!enabled && searched && query.trim())
            void onSearch(query.trim(), projectId === 'all' ? null : projectId)
                .then(setResults)
                .catch(() => undefined);
    }

    function toggleAi(enabled: boolean) {
        setAiEnabled(enabled);
        if (!enabled) {
            summaryRequestSequence.current += 1;
            setAiBusy(false);
            setAiSummary(null);
            setAiError('');
        } else if (searched && results.length) void requestSummary(query, projectId);
    }

    function renderExcerpt(rawExcerpt: string) {
        const clean = stripHtmlToPlainText(rawExcerpt, { preserveMark: true });
        return clean
            .split(/(<mark>[\s\S]*?<\/mark>)/g)
            .map((part, index) =>
                part.startsWith('<mark>') && part.endsWith('</mark>') ? (
                    <mark key={index}>{part.slice(6, -7)}</mark>
                ) : (
                    <span key={index}>{part}</span>
                ),
            );
    }

    const typeCounts: Record<'all' | EntityType, number> = {
        all: results.length,
        note: 0,
        task: 0,
        project: 0,
        document: 0,
        contact: 0,
    };
    for (const item of results) typeCounts[item.type] += 1;

    return (
        <div className="workspace-page page-search mx-auto">
            <div className="mx-auto max-w-[820px] space-y-5">
                <PageHeader
                    title="Search"
                    description={
                        !searched ? 'Search notes, tasks, projects, documents, and contacts.' : undefined
                    }
                    actions={
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                            <label
                                htmlFor="search-semantic"
                                className="flex min-h-7 cursor-pointer items-center gap-2 text-muted-foreground hover:text-foreground"
                                title="Re-rank with local Ollama embeddings"
                            >
                                <Switch
                                    id="search-semantic"
                                    aria-label="Semantic"
                                    checked={semanticEnabled}
                                    onCheckedChange={toggleSemantic}
                                />
                                <span>Semantic</span>
                            </label>
                            <label
                                htmlFor="search-ai-summary"
                                className="flex min-h-7 cursor-pointer items-center gap-2 text-muted-foreground hover:text-foreground"
                                title="Summarize matches with local Ollama"
                            >
                                <Switch
                                    id="search-ai-summary"
                                    aria-label="AI summary"
                                    checked={aiEnabled}
                                    onCheckedChange={toggleAi}
                                />
                                <Sparkles className="size-3.5" />
                                <span>AI summary</span>
                            </label>
                            <SearchSyntaxPopover />
                        </div>
                    }
                />

                <form onSubmit={(event) => search(event)} className="search-pill">
                    <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <input
                        autoFocus
                        aria-label="Search workspace"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search notes, tasks, projects, contacts or documents…"
                        className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {query && (
                        <button
                            type="button"
                            aria-label="Clear search"
                            onClick={() => {
                                setQuery('');
                                setResults([]);
                                setSearched(false);
                                setAiSummary(null);
                                setError('');
                            }}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                    <span className="h-5 w-px shrink-0 bg-border/80" aria-hidden="true" />
                    <div className="search-scope shrink-0">
                        <RemoteRecordPicker
                            entityType="project"
                            value={projectId === 'all' ? '' : projectId}
                            onValueChange={(value) => setProjectId(value || 'all')}
                            onChoiceChange={(c) => {
                                if (c) setPickedProjectLabels((cur) => ({ ...cur, [c.id]: c.label }));
                            }}
                            placeholder="All projects"
                            selectedLabel={projectId === 'all' ? undefined : projectNames[projectId]}
                            className="w-36 text-xs"
                        />
                    </div>
                    <Button
                        type="submit"
                        size="sm"
                        className="h-9 rounded-lg px-4"
                        disabled={busy || !query.trim()}
                    >
                        {busy ? 'Searching…' : 'Search'}
                    </Button>
                </form>

                {!searched && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Try operator:</span>
                        {(['type:note', 'type:task', 'is:blocked', 'type:pdf'] as const).map((chip) => (
                            <button
                                key={chip}
                                type="button"
                                onClick={() => void runQuery(chip)}
                                className="inline-flex min-h-7 items-center rounded-full border border-border/80 bg-card px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-border hover:bg-surface-subtle hover:text-foreground"
                            >
                                {chip}
                            </button>
                        ))}
                    </div>
                )}

                {error && (
                    <p
                        role="alert"
                        className="rounded-lg border border-danger/20 bg-danger-subtle px-3 py-2 text-xs text-danger-foreground"
                    >
                        {error}
                    </p>
                )}
                {semanticError && (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/20 bg-warning-subtle px-3 py-2 text-xs text-warning-foreground"
                    >
                        <span>{semanticError}</span>
                        {semanticError.toLowerCase().includes('index') && (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={semanticBusy}
                                onClick={() => {
                                    setSemanticBusy(true);
                                    setSemanticError('');
                                    void window.devLedger.ai
                                        .indexSemanticKnowledge()
                                        .then(() =>
                                            query.trim()
                                                ? rerankSemantically(query.trim(), projectId)
                                                : undefined,
                                        )
                                        .catch((caught) =>
                                            setSemanticError(
                                                friendlyError(
                                                    caught,
                                                    'Could not build local semantic index.',
                                                ),
                                            ),
                                        )
                                        .finally(() => setSemanticBusy(false));
                                }}
                            >
                                Build index now
                            </Button>
                        )}
                    </div>
                )}
                {aiError && (
                    <div
                        role="alert"
                        className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-subtle p-3 text-xs text-warning-foreground"
                    >
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <span>{aiError}</span>
                    </div>
                )}

                {aiEnabled && aiSummary && (
                    <SearchAiAnswerCard aiSummary={aiSummary} onOpenResult={onOpenResult} />
                )}

                {searched && (
                    <SearchResultsList
                        visibleResults={visibleResults}
                        filteredCount={filteredResults.length}
                        typeFilter={typeFilter}
                        typeCounts={typeCounts}
                        projectNames={projectNames}
                        busy={busy}
                        semanticBusy={semanticBusy}
                        aiEnabled={aiEnabled}
                        aiBusy={aiBusy}
                        totalResults={results.length}
                        error={error}
                        page={page}
                        pageCount={pageCount}
                        onTypeFilterChange={(next) => {
                            setTypeFilter(next);
                            setPage(1);
                        }}
                        onPageChange={setPage}
                        onOpenResult={onOpenResult}
                        onRequestSummary={() => void requestSummary()}
                        renderExcerpt={renderExcerpt}
                    />
                )}
            </div>
        </div>
    );
}
