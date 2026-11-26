import { ArrowUpRight, FolderKanban, LockKeyhole, NotebookPen, SquareCheckBig } from 'lucide-react';
import type {
    DashboardChecklistItem,
    NoteRecord,
    ProjectRecord,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/utils';
import { stripHtmlToPlainText as cleanHtml } from '@domain/html-text';

export function DashboardNoteChecklistsSection({
    noteActionItems,
    onOpenNotes,
    onNavigateTarget,
}: {
    noteActionItems: DashboardChecklistItem[];
    onOpenNotes: () => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}) {
    if (noteActionItems.length === 0) return null;
    return (
        <section className="rounded-[var(--workspace-radius)] border border-border bg-card shadow-[var(--shadow-xs)]">
            <div className="flex items-center justify-between border-b border-border/75 px-4 py-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Pending in notes</h2>
                    <Badge variant="secondary" className="tabular-nums">
                        {noteActionItems.length}
                    </Badge>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={onOpenNotes}
                >
                    All notes <ArrowUpRight className="size-3.5" />
                </Button>
            </div>
            <div className="divide-y divide-border/60">
                {noteActionItems.map((item, idx) => (
                    <button
                        key={`${item.noteId}-${idx}`}
                        type="button"
                        onClick={() =>
                            onNavigateTarget({
                                view: 'notes',
                                recordId: item.noteId,
                                projectId: item.projectId,
                            })
                        }
                        className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-subtle/50"
                    >
                        <SquareCheckBig
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground group-hover:text-primary">
                            {item.text}
                        </span>
                        <span className="max-w-[160px] shrink-0 truncate rounded-md border border-border/60 bg-surface-subtle px-2 py-0.5 text-xs text-muted-foreground">
                            {item.noteTitle}
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}

export function DashboardActiveProjectsSection({
    loading,
    activeProjects,
    onOpenProjects,
    onNavigateTarget,
}: {
    loading: boolean;
    activeProjects: ProjectRecord[];
    onOpenProjects: () => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}) {
    return (
        <section className="flex min-w-0 flex-col rounded-[var(--workspace-radius)] border border-border bg-card shadow-[var(--shadow-xs)]">
            <div className="flex items-center justify-between border-b border-border/75 px-4 py-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Active projects</h2>
                    {activeProjects.length ? (
                        <Badge variant="secondary" className="tabular-nums">
                            {activeProjects.length}
                        </Badge>
                    ) : null}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={onOpenProjects}
                >
                    All projects <ArrowUpRight className="size-3.5" />
                </Button>
            </div>
            {loading ? (
                <p className="py-10 text-center text-xs text-muted-foreground">Loading projects…</p>
            ) : activeProjects.length ? (
                <div className="divide-y divide-border/60">
                    {activeProjects.slice(0, 6).map((project) => {
                        const done = Math.max(0, project.taskCount - project.openTaskCount);
                        const pct = project.taskCount > 0 ? Math.round((done / project.taskCount) * 100) : 0;
                        return (
                            <button
                                key={project.id}
                                type="button"
                                onClick={() => onNavigateTarget({ view: 'projects', recordId: project.id })}
                                className="group flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-subtle/60"
                            >
                                <div className="flex items-center justify-between gap-2.5">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground">
                                            <FolderKanban className="size-3.5" />
                                        </span>
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                                                {project.name}
                                            </div>
                                            <div className="text-xs tabular-nums text-muted-foreground">
                                                {project.openTaskCount} open · {project.noteCount} notes
                                            </div>
                                        </div>
                                    </div>
                                    <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
                                </div>
                                {project.taskCount > 0 && (
                                    <div className="flex items-center gap-2 pl-9">
                                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-subtle">
                                            <div
                                                className="h-full rounded-full bg-primary/85 transition-all"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <span className="text-xs tabular-nums text-muted-foreground">
                                            {done}/{project.taskCount}
                                        </span>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center text-xs text-muted-foreground">
                    <FolderKanban className="mb-2 size-4 opacity-70" />
                    <p className="font-medium text-foreground">No active projects yet.</p>
                    <Button className="mt-3" size="sm" variant="outline" onClick={onOpenProjects}>
                        Create project
                    </Button>
                </div>
            )}
        </section>
    );
}

export function DashboardRecentNotesSection({
    recentNotes,
    onOpenNotes,
    onNavigateTarget,
}: {
    recentNotes: NoteRecord[];
    onOpenNotes: () => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}) {
    if (recentNotes.length === 0) return null;
    return (
        <section className="rounded-[var(--workspace-radius)] border border-border bg-card shadow-[var(--shadow-xs)]">
            <div className="flex items-center justify-between border-b border-border/75 px-4 py-3">
                <h2 className="text-sm font-semibold">Recent notes</h2>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={onOpenNotes}
                >
                    Open notes <ArrowUpRight className="size-3.5" />
                </Button>
            </div>
            <div className="divide-y divide-border/60">
                {recentNotes.slice(0, 4).map((note) => (
                    <button
                        key={note.id}
                        type="button"
                        onClick={() =>
                            onNavigateTarget({
                                view: 'notes',
                                recordId: note.id,
                                projectId: note.projectId,
                            })
                        }
                        className="group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-subtle/55"
                    >
                        {note.locked ? (
                            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-warning" />
                        ) : (
                            <NotebookPen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                                {note.locked ? 'Locked note' : note.title || 'Untitled note'}
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                {note.locked ? 'Protected content' : cleanHtml(note.content) || 'Empty note'}
                            </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                            {formatRelative(note.updatedAt)}
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}
