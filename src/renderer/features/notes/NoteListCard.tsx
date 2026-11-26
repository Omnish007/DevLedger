import { FileText, FolderKanban, LockKeyhole } from 'lucide-react';
import { stripHtmlToPlainText } from '@domain/html-text';
import type { NoteRecord } from '@shared/contracts';
import { cn, formatRelative } from '@/lib/utils';

interface NoteListCardProps {
    note: NoteRecord;
    selected: boolean;
    projectName: string | null;
    onSelect: () => void;
}

/**
 * Tactile note card rendered inside the virtualized Notes sidebar.
 */
export function NoteListCard({ note, selected, projectName, onSelect }: NoteListCardProps) {
    const excerpt = note.locked ? 'Protected content' : stripHtmlToPlainText(note.content) || 'Empty note';

    return (
        <div className="h-full pb-2.5">
            <button
                type="button"
                onClick={onSelect}
                className={cn(
                    'notes-record group relative flex h-full w-full flex-col justify-between overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-inset',
                    selected
                        ? 'border-primary/28 bg-card shadow-[var(--shadow-sm)] ring-1 ring-primary/12'
                        : 'border-border/60 bg-card/70 shadow-[0_1px_2px_rgb(0_0_0/0.03)] hover:border-border/90 hover:bg-card hover:shadow-[var(--shadow-xs)]',
                )}
                aria-current={selected ? 'true' : undefined}
            >
                {selected && (
                    <span
                        aria-hidden="true"
                        className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-primary"
                    />
                )}
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        {note.locked ? (
                            <span className="grid size-4.5 shrink-0 place-items-center rounded-md bg-warning-subtle text-warning-foreground">
                                <LockKeyhole className="size-2.5" aria-hidden="true" />
                            </span>
                        ) : (
                            selected && (
                                <span
                                    aria-hidden="true"
                                    className="size-1.5 shrink-0 rounded-full bg-primary"
                                />
                            )
                        )}
                        <span
                            className={cn(
                                'min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug tracking-[-0.01em]',
                                selected
                                    ? 'text-foreground'
                                    : 'text-foreground/92 group-hover:text-foreground',
                            )}
                        >
                            {note.locked ? 'Locked note' : note.title || 'Untitled note'}
                        </span>
                        <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground/80">
                            {formatRelative(note.updatedAt)}
                        </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-[1.42] text-muted-foreground">
                        {excerpt}
                    </p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                    {projectName ? (
                        <span className="inline-flex max-w-[168px] items-center gap-1.5 rounded-md border border-border/60 bg-surface-subtle/80 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                            <FolderKanban
                                className="size-3 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <span className="truncate">{projectName}</span>
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/75">
                            <FileText className="size-3 shrink-0 opacity-70" aria-hidden="true" />
                            <span>General note</span>
                        </span>
                    )}
                    {note.locked ? (
                        <span className="inline-flex items-center rounded-md border border-warning/20 bg-warning-subtle px-1.5 py-0.5 text-[10.5px] font-medium text-warning-foreground">
                            Protected
                        </span>
                    ) : (
                        selected && <span className="text-[10.5px] font-medium text-primary">Editing</span>
                    )}
                </div>
            </button>
        </div>
    );
}
