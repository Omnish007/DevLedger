import {
    Archive,
    ArrowUpRight,
    Download,
    FolderKanban,
    MoreHorizontal,
    Pencil,
    RotateCcw,
} from 'lucide-react';
import type { ProjectRecord, ProjectStatus } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRelative } from '@/lib/utils';

const STATUS_DOT: Record<ProjectStatus, string> = {
    active: 'bg-success',
    on_hold: 'bg-warning',
    completed: 'bg-primary',
    archived: 'bg-muted-foreground/60',
};

interface ProjectCardProps {
    project: ProjectRecord;
    onInspect: (project: ProjectRecord) => void;
    onEdit: (project: ProjectRecord) => void;
    onExport: (id: string) => void;
    onArchive: (id: string) => void;
    onRestore: (id: string) => void;
}

export function ProjectCard({
    project,
    onInspect,
    onEdit,
    onExport,
    onArchive,
    onRestore,
}: ProjectCardProps) {
    const done = Math.max(0, project.taskCount - project.openTaskCount);
    const pct = project.taskCount > 0 ? Math.round((done / project.taskCount) * 100) : 0;

    return (
        <article
            onClick={() => onInspect(project)}
            className="group flex cursor-pointer flex-col justify-between rounded-[var(--workspace-radius)] border border-border bg-card p-4 shadow-[var(--shadow-xs)] transition-colors hover:border-border hover:bg-surface-subtle/40"
        >
            <div>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground">
                            <FolderKanban className="size-4" />
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/75 bg-surface-subtle px-2.5 py-0.5 text-xs font-medium capitalize text-foreground">
                            <span className={`size-1.5 rounded-full ${STATUS_DOT[project.status]}`} />
                            {project.status.replaceAll('_', ' ')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {project.type === 'greenfield' ? 'Greenfield' : 'Ongoing'}
                        </span>
                    </div>
                    <div onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-muted-foreground hover:text-foreground"
                                    aria-label={`Actions for ${project.name}`}
                                >
                                    <MoreHorizontal className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => onInspect(project)}>
                                    <FolderKanban className="size-3.5" />
                                    Inspect hub
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onEdit(project)}>
                                    <Pencil className="size-3.5" />
                                    Edit project
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onExport(project.id)}>
                                    <Download className="size-3.5" />
                                    Export project
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {project.status === 'archived' ? (
                                    <DropdownMenuItem onSelect={() => onRestore(project.id)}>
                                        <RotateCcw className="size-3.5" />
                                        Restore project
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onSelect={() => onArchive(project.id)}
                                    >
                                        <Archive className="size-3.5" />
                                        Archive project
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <h2 className="mt-3 truncate text-base font-semibold tracking-tight text-foreground group-hover:text-primary">
                    {project.name}
                </h2>
                {project.description && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {project.description}
                    </p>
                )}
            </div>

            <div className="mt-4 space-y-2.5 border-t border-border/65 pt-3">
                {project.taskCount > 0 ? (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                            <span>
                                {done} of {project.taskCount} tasks done
                            </span>
                            <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-subtle">
                            <div
                                className="h-full rounded-full bg-primary/85 transition-all"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">No tasks queued yet</p>
                )}
                <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                    <span>
                        {project.openTaskCount} open · {project.noteCount} notes
                    </span>
                    <span className="inline-flex items-center gap-1">
                        Updated {formatRelative(project.updatedAt)}
                        <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-80" />
                    </span>
                </div>
            </div>
        </article>
    );
}
