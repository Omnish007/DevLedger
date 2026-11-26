import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    Archive,
    ArrowUpRight,
    FolderKanban,
    MoreHorizontal,
    Pencil,
    Plus,
    RotateCcw,
    Upload,
    Download,
} from 'lucide-react';
import type {
    ProjectInput,
    ProjectRecord,
    ProjectStatus,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageControls } from '@/components/shared/PageControls';
import { SearchFilterInput } from '@/components/shared/SearchFilterInput';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { formatRelative, friendlyError } from '@/lib/utils';
import { emptyProjectForm, projectFormSchema, type ProjectFormValues } from './project-form-schema';
import { ProjectDetailSheet } from './ProjectDetailSheet';

interface Props {
    focusId?: string | undefined;
    onConsumeFocus?: () => void;
    onCreate: (input: ProjectInput) => Promise<void>;
    onUpdate: (id: string, input: Partial<ProjectInput> & { status?: ProjectStatus }) => Promise<void>;
    onArchive: (id: string) => Promise<void>;
    onRestore: (id: string) => Promise<void>;
    onExport: (id: string) => Promise<string | null>;
    onImport: () => Promise<void>;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
    loading: boolean;
}

const STATUS_DOT: Record<ProjectStatus, string> = {
    active: 'bg-success',
    on_hold: 'bg-warning',
    completed: 'bg-primary',
    archived: 'bg-muted-foreground/60',
};

export function ProjectsPage({
    focusId,
    onConsumeFocus,
    onCreate,
    onUpdate,
    onArchive,
    onRestore,
    onExport,
    onImport,
    onNavigateTarget,
    loading,
}: Props) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<ProjectRecord | null>(null);
    const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
    const form = useForm<ProjectFormValues>({
        resolver: zodResolver(projectFormSchema),
        defaultValues: emptyProjectForm,
        mode: 'onChange',
    });
    const type = form.watch('type');
    const [saving, setSaving] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [pageRows, setPageRows] = useState<ProjectRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [pageLoading, setPageLoading] = useState(true);
    const [pageError, setPageError] = useState('');
    const requestRef = useRef(0);
    const pageSize = 30;

    const loadPage = useCallback(
        async (requestedOffset = offset) => {
            const requestId = ++requestRef.current;
            setPageLoading(true);
            setPageError('');
            try {
                const page = await window.devLedger.projects.listPage({
                    limit: pageSize,
                    offset: requestedOffset,
                    query: deferredQuery,
                    includeArchived: showArchived,
                });
                if (requestId === requestRef.current) {
                    setPageRows(page.items);
                    setTotal(page.total);
                }
            } catch (cause) {
                if (requestId === requestRef.current) {
                    setPageRows([]);
                    setTotal(0);
                    setPageError(friendlyError(cause, 'Projects could not be loaded.'));
                }
            } finally {
                if (requestId === requestRef.current) setPageLoading(false);
            }
        },
        [deferredQuery, offset, showArchived],
    );

    useEffect(() => {
        void loadPage();
    }, [loadPage]);
    useEffect(() => {
        if (!focusId || !pageRows.length) return;
        const match = pageRows.find((item) => item.id === focusId);
        if (match) {
            setSelectedProject(match);
            onConsumeFocus?.();
        }
    }, [focusId, pageRows, onConsumeFocus]);

    async function runPageAction(action: () => Promise<unknown>, fallback: string) {
        setPageError('');
        try {
            await action();
            await loadPage();
        } catch (cause) {
            setPageError(friendlyError(cause, fallback));
        }
    }
    function resetForm() {
        setEditing(null);
        form.reset(emptyProjectForm);
    }
    function editProject(project: ProjectRecord) {
        setEditing(project);
        form.reset({ name: project.name, description: project.description, type: project.type });
        setOpen(true);
    }

    async function submit(values: ProjectFormValues) {
        setSaving(true);
        form.clearErrors('root');
        try {
            if (editing) await onUpdate(editing.id, values);
            else {
                setOffset(0);
                await onCreate(values);
            }
            resetForm();
            setOpen(false);
            await loadPage(editing ? offset : 0);
        } catch (caught) {
            form.setError('root', {
                type: 'server',
                message: friendlyError(caught, 'Project could not be saved.'),
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="workspace-page page-projects mx-auto space-y-5">
            <PageHeader
                title="Projects"
                description={total ? `${total} ${total === 1 ? 'project' : 'projects'}` : undefined}
                actions={
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                void runPageAction(onImport, 'Project archive could not be imported.')
                            }
                        >
                            <Upload className="size-3.5" />
                            Import archive
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => {
                                resetForm();
                                setOpen(true);
                            }}
                        >
                            <Plus className="size-3.5" />
                            New project
                        </Button>
                    </>
                }
            />
            {pageError && (
                <div
                    role="alert"
                    className="rounded-md border border-danger/20 bg-danger/5 px-3.5 py-2.5 text-xs text-danger"
                >
                    {pageError}
                </div>
            )}

            <div className="workspace-toolbar justify-between">
                <SearchFilterInput
                    aria-label="Filter projects by name or description"
                    clearLabel="Clear project filter"
                    value={query}
                    onValueChange={(next) => {
                        setOffset(0);
                        setQuery(next);
                    }}
                    placeholder="Filter projects…"
                    className="min-w-[220px] max-w-sm flex-1"
                />
                <div className="workspace-segmented" role="group" aria-label="Filter by archive status">
                    {([false, true] as const).map((archivedTab) => (
                        <button
                            key={String(archivedTab)}
                            type="button"
                            data-active={showArchived === archivedTab}
                            onClick={() => {
                                setOffset(0);
                                setShowArchived(archivedTab);
                            }}
                            className="workspace-segmented-item"
                        >
                            {archivedTab ? 'Show archived' : 'Active'}
                        </button>
                    ))}
                </div>
            </div>

            {loading || pageLoading ? (
                <p className="py-12 text-center text-xs text-muted-foreground">Loading projects…</p>
            ) : pageRows.length ? (
                <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                    {pageRows.map((project) => {
                        const done = Math.max(0, project.taskCount - project.openTaskCount);
                        const pct = project.taskCount > 0 ? Math.round((done / project.taskCount) * 100) : 0;
                        return (
                            <article
                                key={project.id}
                                onClick={() => setSelectedProject(project)}
                                className="group flex cursor-pointer flex-col justify-between rounded-[var(--workspace-radius)] border border-border bg-card p-4 shadow-[var(--shadow-xs)] transition-colors hover:border-border hover:bg-surface-subtle/40"
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground">
                                                <FolderKanban className="size-4" />
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/75 bg-surface-subtle px-2.5 py-0.5 text-xs font-medium capitalize text-foreground">
                                                <span
                                                    className={`size-1.5 rounded-full ${STATUS_DOT[project.status]}`}
                                                />
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
                                                    <DropdownMenuItem
                                                        onSelect={() => setSelectedProject(project)}
                                                    >
                                                        <FolderKanban className="size-3.5" />
                                                        Inspect hub
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => editProject(project)}>
                                                        <Pencil className="size-3.5" />
                                                        Edit project
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onSelect={() =>
                                                            void runPageAction(
                                                                () => onExport(project.id),
                                                                'Project could not be exported.',
                                                            )
                                                        }
                                                    >
                                                        <Download className="size-3.5" />
                                                        Export project
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    {project.status === 'archived' ? (
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                void runPageAction(
                                                                    () => onRestore(project.id),
                                                                    'Project could not be restored.',
                                                                )
                                                            }
                                                        >
                                                            <RotateCcw className="size-3.5" />
                                                            Restore project
                                                        </DropdownMenuItem>
                                                    ) : (
                                                        <DropdownMenuItem
                                                            variant="destructive"
                                                            onSelect={() =>
                                                                void runPageAction(
                                                                    () => onArchive(project.id),
                                                                    'Project could not be archived.',
                                                                )
                                                            }
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
                    })}
                </div>
            ) : (
                !pageError && (
                    <div className="rounded-xl border border-dashed border-border/80 bg-card/50 py-14 text-center">
                        <FolderKanban className="mx-auto mb-2.5 size-5 text-muted-foreground" />
                        <p className="text-sm font-medium">
                            {query ? 'No matching projects' : 'No projects yet'}
                        </p>
                        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                            Create a project to keep notes, tasks, documents and contacts together.
                        </p>
                        {!query && (
                            <Button
                                className="mt-4"
                                size="sm"
                                onClick={() => {
                                    resetForm();
                                    setOpen(true);
                                }}
                            >
                                <Plus className="size-3.5" />
                                Create project
                            </Button>
                        )}
                    </div>
                )
            )}

            <PageControls
                offset={offset}
                limit={pageSize}
                total={total}
                disabled={pageLoading}
                onPageChange={setOffset}
            />

            <ProjectDetailSheet
                project={selectedProject}
                onClose={() => setSelectedProject(null)}
                onStatusChange={async (id, status) => {
                    await runPageAction(() => onUpdate(id, { status }), 'Status update failed.');
                    setSelectedProject((c) => (c && c.id === id ? { ...c, status } : c));
                }}
                onNavigate={onNavigateTarget}
            />

            <Dialog
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (!next) resetForm();
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit project' : 'Create a project'}</DialogTitle>
                        <DialogDescription>
                            {editing ? 'Update project details.' : 'Start a new workspace project.'}
                        </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
                        <label className="block space-y-1.5 text-xs font-medium">
                            <span>Project name</span>
                            <Input
                                autoFocus
                                {...form.register('name')}
                                placeholder="e.g. Retail POS"
                                maxLength={160}
                                aria-invalid={Boolean(form.formState.errors.name)}
                            />
                            {form.formState.errors.name && (
                                <p role="alert" className="text-xs text-destructive">
                                    {form.formState.errors.name.message}
                                </p>
                            )}
                        </label>
                        <label className="block space-y-1.5 text-xs font-medium">
                            <span>
                                Description{' '}
                                <span className="font-normal text-muted-foreground">(optional)</span>
                            </span>
                            <Textarea {...form.register('description')} rows={3} maxLength={10000} />
                        </label>
                        {!editing && (
                            <fieldset className="space-y-2">
                                <legend className="text-xs font-medium">Project type</legend>
                                <RadioGroup
                                    value={type}
                                    onValueChange={(value) =>
                                        form.setValue('type', value as ProjectInput['type'], {
                                            shouldDirty: true,
                                            shouldValidate: true,
                                        })
                                    }
                                    className="grid grid-cols-2 gap-2"
                                >
                                    <label
                                        htmlFor="project-type-greenfield"
                                        data-selected={type === 'greenfield'}
                                        className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-xs data-[selected=true]:border-ring data-[selected=true]:bg-accent"
                                    >
                                        <RadioGroupItem
                                            id="project-type-greenfield"
                                            value="greenfield"
                                            className="mt-0.5"
                                        />
                                        <span>
                                            <span className="block font-semibold">Greenfield</span>
                                            <span className="text-muted-foreground">
                                                Starting from scratch
                                            </span>
                                        </span>
                                    </label>
                                    <label
                                        htmlFor="project-type-ongoing"
                                        data-selected={type === 'ongoing'}
                                        className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-xs data-[selected=true]:border-ring data-[selected=true]:bg-accent"
                                    >
                                        <RadioGroupItem
                                            id="project-type-ongoing"
                                            value="ongoing"
                                            className="mt-0.5"
                                        />
                                        <span>
                                            <span className="block font-semibold">Ongoing</span>
                                            <span className="text-muted-foreground">
                                                Existing maintenance
                                            </span>
                                        </span>
                                    </label>
                                </RadioGroup>
                            </fieldset>
                        )}
                        {form.formState.errors.root?.message && (
                            <p role="alert" className="text-xs text-destructive">
                                {form.formState.errors.root.message}
                            </p>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create project'}{' '}
                                <ArrowUpRight className="size-3.5" />
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
