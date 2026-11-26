import type { ReactNode } from 'react';
import { FileText, FolderKanban, HelpCircle, ListTodo, NotebookPen, Users } from 'lucide-react';
import type { EntityType, SearchResult } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatRelative } from '@/lib/utils';

export function SearchSyntaxPopover() {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                    <HelpCircle className="size-3.5" />
                    Syntax
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-76 space-y-2 p-3 text-xs">
                <p className="font-semibold">Query operators</p>
                <div className="grid grid-cols-2 gap-1.5 text-muted-foreground">
                    <div>
                        <code className="text-foreground">p:"Name"</code> Project
                    </div>
                    <div>
                        <code className="text-foreground">#tag</code> Tag
                    </div>
                    <div>
                        <code className="text-foreground">type:note</code> Type
                    </div>
                    <div>
                        <code className="text-foreground">type:pdf</code> File type
                    </div>
                    <div>
                        <code className="text-foreground">is:blocked</code> Task state
                    </div>
                    <div>
                        <code className="text-foreground">after:YYYY-MM-DD</code> Date
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

const ENTITY_ICON = {
    project: FolderKanban,
    note: NotebookPen,
    task: ListTodo,
    document: FileText,
    contact: Users,
};
const TYPE_FILTERS: Array<{ id: 'all' | EntityType; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'note', label: 'Notes' },
    { id: 'task', label: 'Tasks' },
    { id: 'project', label: 'Projects' },
    { id: 'document', label: 'Documents' },
    { id: 'contact', label: 'Contacts' },
];

interface SearchResultsListProps {
    visibleResults: SearchResult[];
    filteredCount: number;
    typeFilter: 'all' | EntityType;
    typeCounts: Record<'all' | EntityType, number>;
    projectNames: Record<string, string>;
    busy: boolean;
    semanticBusy: boolean;
    aiEnabled: boolean;
    aiBusy: boolean;
    totalResults: number;
    error: string;
    page: number;
    pageCount: number;
    onTypeFilterChange: (next: 'all' | EntityType) => void;
    onPageChange: (page: number) => void;
    onOpenResult: (result: SearchResult) => void;
    onRequestSummary: () => void;
    renderExcerpt: (rawExcerpt: string) => ReactNode;
}

export function SearchResultsList({
    visibleResults,
    filteredCount,
    typeFilter,
    typeCounts,
    projectNames,
    busy,
    semanticBusy,
    aiEnabled,
    aiBusy,
    totalResults,
    error,
    page,
    pageCount,
    onTypeFilterChange,
    onPageChange,
    onOpenResult,
    onRequestSummary,
    renderExcerpt,
}: SearchResultsListProps) {
    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
                <div
                    className="flex flex-wrap items-center gap-1"
                    role="tablist"
                    aria-label="Filter results by record type"
                >
                    {TYPE_FILTERS.map((item) => {
                        const count = typeCounts[item.id];
                        const active = typeFilter === item.id;
                        const isEmptyType = item.id !== 'all' && count === 0;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                disabled={isEmptyType}
                                onClick={() => onTypeFilterChange(item.id)}
                                className={`-mb-px inline-flex min-h-9 items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs transition-colors ${active ? 'border-primary font-semibold text-foreground' : isEmptyType ? 'cursor-default border-transparent text-muted-foreground/45 opacity-60' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                            >
                                <span>{item.label}</span>
                                {count > 0 && (
                                    <span className="tabular-nums text-xs text-muted-foreground">
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
                    <span>
                        {busy
                            ? 'Searching…'
                            : semanticBusy
                              ? 'Ranking semantic matches…'
                              : `${filteredCount} result${filteredCount === 1 ? '' : 's'}`}
                    </span>
                    {aiEnabled && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs"
                            disabled={!totalResults || aiBusy}
                            onClick={onRequestSummary}
                        >
                            {aiBusy ? 'Summarizing…' : 'Refresh summary'}
                        </Button>
                    )}
                </div>
            </div>

            <div className="divide-y divide-border/55">
                {visibleResults.map((result) => {
                    const Icon = ENTITY_ICON[result.type];
                    return (
                        <article
                            key={`${result.type}:${result.id}`}
                            className="search-result py-3.5 transition-colors"
                        >
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Icon className="size-3.5 shrink-0" />
                                <span className="truncate">
                                    {projectNames[result.projectId ?? ''] ?? 'Workspace'}
                                </span>
                                <span>·</span>
                                <span className="capitalize">{result.type}</span>
                                <span>·</span>
                                <span>{formatRelative(result.updatedAt)}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => onOpenResult(result)}
                                className="mt-1 inline-flex min-h-6 max-w-full items-center truncate text-left text-base font-medium text-primary hover:underline"
                            >
                                {result.title}
                            </button>
                            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                                {renderExcerpt(result.excerpt)}
                            </p>
                        </article>
                    );
                })}
                {!busy && !filteredCount && !error && (
                    <div className="py-12 text-center">
                        <p className="text-sm font-medium">No matching results</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Try different keywords, operators, or clear project filter.
                        </p>
                    </div>
                )}
            </div>

            {pageCount > 1 && (
                <Pagination className="pt-2">
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                href="#results"
                                aria-disabled={page === 1}
                                className={page === 1 ? 'pointer-events-none opacity-40' : undefined}
                                onClick={(e) => {
                                    e.preventDefault();
                                    onPageChange(Math.max(1, page - 1));
                                }}
                            />
                        </PaginationItem>
                        {Array.from({ length: pageCount }, (_, idx) => idx + 1).map((pageNumber) => (
                            <PaginationItem key={pageNumber}>
                                <PaginationLink
                                    href="#results"
                                    isActive={pageNumber === page}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onPageChange(pageNumber);
                                    }}
                                >
                                    {pageNumber}
                                </PaginationLink>
                            </PaginationItem>
                        ))}
                        <PaginationItem>
                            <PaginationNext
                                href="#results"
                                aria-disabled={page === pageCount}
                                className={page === pageCount ? 'pointer-events-none opacity-40' : undefined}
                                onClick={(e) => {
                                    e.preventDefault();
                                    onPageChange(Math.min(pageCount, page + 1));
                                }}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
        </>
    );
}
