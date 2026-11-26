import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FolderKanban, Plus, Upload } from 'lucide-react';
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
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch';
import { friendlyError } from '@/lib/utils';
import { ProjectCard } from './ProjectCard';
import { ProjectDetailSheet } from './ProjectDetailSheet';
import { ProjectFormDialog } from './ProjectFormDialog';
import { emptyProjectForm, projectFormSchema, type ProjectFormValues } from './project-form-schema';

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

const PAGE_SIZE = 30;

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
    const [saving, setSaving] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [offset, setOffset] = useState(0);

    const fetchProjects = useCallback(
        (requestedOffset: number) =>
            window.devLedger.projects.listPage({
                limit: PAGE_SIZE,
                offset: requestedOffset,
                query: deferredQuery,
                includeArchived: showArchived,
            }),
        [deferredQuery, showArchived],
    );

    const {
        items: pageRows,
        total,
        loading: pageLoading,
        error: pageError,
        setError: setPageError,
        loadPage,
    } = usePaginatedFetch({
        fetcher: fetchProjects,
        offset,
        errorFallback: 'Projects could not be loaded.',
        clearOnError: true,
    });

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
                    {pageRows.map((project) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            onInspect={setSelectedProject}
                            onEdit={editProject}
                            onExport={(id) =>
                                void runPageAction(() => onExport(id), 'Project could not be exported.')
                            }
                            onArchive={(id) =>
                                void runPageAction(() => onArchive(id), 'Project could not be archived.')
                            }
                            onRestore={(id) =>
                                void runPageAction(() => onRestore(id), 'Project could not be restored.')
                            }
                        />
                    ))}
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
                limit={PAGE_SIZE}
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

            <ProjectFormDialog
                open={open}
                editing={Boolean(editing)}
                saving={saving}
                form={form}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (!next) resetForm();
                }}
                onSubmit={submit}
            />
        </div>
    );
}
