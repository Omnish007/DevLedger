import { BookOpen, FolderKanban, Plus, Search, X } from 'lucide-react';
import type { NoteRecord } from '@shared/contracts';
import { PageControls } from '@/components/shared/PageControls';
import { VirtualList } from '@/components/shared/VirtualList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NoteListCard } from './NoteListCard';

const noteItemKey = (note: NoteRecord): string => note.id;

interface NotesSidebarProps {
    notes: NoteRecord[];
    total: number;
    offset: number;
    pageSize: number;
    loading: boolean;
    selectedId: string | null;
    filter: string;
    filterProjectId: string;
    projectNames: Record<string, string>;
    onCreateNote: () => void;
    onFilterChange: (next: string) => void;
    onClearProjectFilter: () => void;
    onSelectNote: (id: string) => void;
    onPageChange: (nextOffset: number) => void;
}

/**
 * Filterable, paginated, virtualized Notes sidebar list.
 */
export function NotesSidebar({
    notes,
    total,
    offset,
    pageSize,
    loading,
    selectedId,
    filter,
    filterProjectId,
    projectNames,
    onCreateNote,
    onFilterChange,
    onClearProjectFilter,
    onSelectNote,
    onPageChange,
}: NotesSidebarProps) {
    return (
        <aside className="notes-sidebar flex h-full w-full min-h-0 flex-col border-r border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3.5">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h1 className="workspace-page-title text-xl leading-none">Notes</h1>
                        <span className="inline-flex h-5 items-center rounded-md border border-border/60 bg-surface-subtle/80 px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                            {total}
                        </span>
                    </div>
                </div>
                <Button
                    size="icon"
                    variant="outline"
                    className="size-8 shrink-0 rounded-lg border-border/80 bg-card/90 shadow-[var(--shadow-xs)] hover:bg-surface-hover"
                    onClick={onCreateNote}
                    aria-label="Create note"
                    title="Create note"
                >
                    <Plus className="size-4 text-primary" aria-hidden="true" />
                </Button>
            </div>
            <div className="space-y-2 border-b border-border/50 px-3.5 py-2.5">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        aria-label="Filter notes by title or contents"
                        value={filter}
                        onChange={(e) => onFilterChange(e.target.value)}
                        placeholder="Filter notes…"
                        className="h-8.5 rounded-lg pl-8.5 pr-8 text-xs"
                    />
                    {filter && (
                        <button
                            type="button"
                            aria-label="Clear note filter"
                            className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                            onClick={() => onFilterChange('')}
                        >
                            <X className="size-3.5" aria-hidden="true" />
                        </button>
                    )}
                </div>
                {filterProjectId && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/[0.06] px-2.5 py-1 text-xs">
                        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                            <FolderKanban className="size-3 shrink-0 text-primary" aria-hidden="true" />
                            <span className="truncate">
                                {projectNames[filterProjectId] ?? 'Project filter'}
                            </span>
                        </span>
                        <button
                            type="button"
                            aria-label="Clear project filter"
                            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                            onClick={onClearProjectFilter}
                        >
                            <X className="size-3" aria-hidden="true" />
                        </button>
                    </div>
                )}
            </div>
            {loading ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Loading notes…</p>
            ) : (
                <VirtualList
                    items={notes}
                    itemKey={noteItemKey}
                    itemHeight={116}
                    label="Workspace notes"
                    className="min-h-0 flex-1 px-3 py-2.5"
                    empty={
                        <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                            <BookOpen className="mx-auto mb-2 size-4 opacity-70" />
                            <p>No matching notes</p>
                        </div>
                    }
                    renderItem={(note) => (
                        <NoteListCard
                            note={note}
                            selected={selectedId === note.id}
                            projectName={note.projectId ? (projectNames[note.projectId] ?? 'Project') : null}
                            onSelect={() => onSelectNote(note.id)}
                        />
                    )}
                />
            )}
            <PageControls
                offset={offset}
                limit={pageSize}
                total={total}
                disabled={loading}
                className="border-t border-border px-3 py-2"
                onPageChange={onPageChange}
            />
        </aside>
    );
}
