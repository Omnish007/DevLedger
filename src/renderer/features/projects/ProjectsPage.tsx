import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ArrowUpRight, Download, FolderKanban, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Upload } from 'lucide-react';
import type { ProjectInput, ProjectRecord, ProjectStatus, WorkspaceNavigationTarget } from '@shared/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageControls } from '@/components/shared/PageControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, friendlyError } from '@/lib/utils';
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

export function ProjectsPage({ focusId, onConsumeFocus, onCreate, onUpdate, onArchive, onRestore, onExport, onImport, onNavigateTarget, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRecord | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const form = useForm<ProjectFormValues>({ resolver: zodResolver(projectFormSchema), defaultValues: emptyProjectForm, mode: 'onChange' });
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

  const loadPage = useCallback(async (requestedOffset = offset) => {
    const requestId = ++requestRef.current;
    setPageLoading(true); setPageError('');
    try {
      const page = await window.devLedger.projects.listPage({ limit: pageSize, offset: requestedOffset, query: deferredQuery, includeArchived: showArchived });
      if (requestId === requestRef.current) { setPageRows(page.items); setTotal(page.total); }
    } catch (cause) {
      if (requestId === requestRef.current) { setPageRows([]); setTotal(0); setPageError(friendlyError(cause, 'Projects could not be loaded.')); }
    } finally { if (requestId === requestRef.current) setPageLoading(false); }
  }, [deferredQuery, offset, showArchived]);

  useEffect(() => { void loadPage(); }, [loadPage]);
  useEffect(() => {
    if (!focusId || !pageRows.length) return;
    const match = pageRows.find((item) => item.id === focusId);
    if (match) { setSelectedProject(match); onConsumeFocus?.(); }
  }, [focusId, pageRows, onConsumeFocus]);

  async function runPageAction(action: () => Promise<unknown>, fallback: string) {
    setPageError('');
    try { await action(); await loadPage(); }
    catch (cause) { setPageError(friendlyError(cause, fallback)); }
  }
  function resetForm() { setEditing(null); form.reset(emptyProjectForm); }
  function editProject(project: ProjectRecord) { setEditing(project); form.reset({ name: project.name, description: project.description, type: project.type }); setOpen(true); }

  async function submit(values: ProjectFormValues) {
    setSaving(true); form.clearErrors('root');
    try {
      if (editing) await onUpdate(editing.id, values);
      else { setOffset(0); await onCreate(values); }
      resetForm(); setOpen(false); await loadPage(editing ? offset : 0);
    } catch (caught) {
      form.setError('root', { type: 'server', message: friendlyError(caught, 'Project could not be saved.') });
    } finally { setSaving(false); }
  }

  return (
    <div className="workspace-page page-projects mx-auto space-y-5">
      <PageHeader title="Projects" description={total ? `${total} ${total === 1 ? 'project' : 'projects'}` : undefined} actions={<><Button variant="outline" size="sm" onClick={() => void runPageAction(onImport, 'Project archive could not be imported.')}><Upload className="size-3.5" />Import archive</Button><Button size="sm" onClick={() => { resetForm(); setOpen(true); }}><Plus className="size-3.5" />New project</Button></>} />
      {pageError && <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-xs text-danger">{pageError}</div>}

      <div className="workspace-toolbar">
        <div className="relative min-w-[220px] max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Filter projects by name or description" value={query} onChange={(e) => { setOffset(0); setQuery(e.target.value); }} placeholder="Filter projects…" className="pl-8" />
        </div>
        <Button variant={showArchived ? 'secondary' : 'outline'} size="sm" onClick={() => { setOffset(0); setShowArchived((v) => !v); }}><Archive className="size-3.5" />{showArchived ? 'Hide archived' : 'Show archived'}</Button>
      </div>

      {loading || pageLoading ? <p className="py-12 text-center text-xs text-muted-foreground">Loading projects…</p> : pageRows.length ? (
        <div className="workspace-surface overflow-x-auto">
          <Table className="min-w-[48rem]">
            <TableHeader className="bg-surface-subtle"><TableRow><TableHead>Project</TableHead><TableHead>Status</TableHead><TableHead>Type</TableHead><TableHead>Open tasks</TableHead><TableHead>Notes</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {pageRows.map((project) => (
                <TableRow key={project.id} className="cursor-pointer" onClick={() => setSelectedProject(project)}>
                  <TableCell className="min-w-[240px]">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{project.name}</div>
                        {project.description && <div className="max-w-[400px] truncate text-xs text-muted-foreground">{project.description}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={project.status === 'on_hold' ? 'warning' : project.status === 'active' ? 'secondary' : 'outline'} className="capitalize">{project.status.replaceAll('_', ' ')}</Badge></TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{project.type === 'greenfield' ? 'Greenfield' : 'Ongoing'}</span></TableCell>
                  <TableCell className="tabular-nums">{project.openTaskCount}</TableCell>
                  <TableCell className="tabular-nums">{project.noteCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(project.updatedAt)}</TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${project.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setSelectedProject(project)}><FolderKanban className="size-4" />Inspect hub</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => editProject(project)}><Pencil className="size-4" />Edit project</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void runPageAction(() => onExport(project.id), 'Project could not be exported.')}><Download className="size-4" />Export project</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {project.status === 'archived'
                            ? <DropdownMenuItem onSelect={() => void runPageAction(() => onRestore(project.id), 'Project could not be restored.')}><RotateCcw className="size-4" />Restore project</DropdownMenuItem>
                            : <DropdownMenuItem onSelect={() => void runPageAction(() => onArchive(project.id), 'Project could not be archived.')}><Archive className="size-4" />Archive project</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : !pageError && (
        <div className="rounded-lg border border-dashed border-border py-14 text-center">
          <FolderKanban className="mx-auto mb-2.5 size-5 text-muted-foreground" />
          <p className="text-sm font-medium">{query ? 'No matching projects' : 'No projects yet'}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Create a project to keep notes, tasks, documents and contacts together.</p>
          {!query && <Button className="mt-4" size="sm" onClick={() => { resetForm(); setOpen(true); }}><Plus className="size-3.5" />Create project</Button>}
        </div>
      )}

      <PageControls offset={offset} limit={pageSize} total={total} disabled={pageLoading} onPageChange={setOffset} />

      <ProjectDetailSheet
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
        onStatusChange={async (id, status) => { await runPageAction(() => onUpdate(id, { status }), 'Status update failed.'); setSelectedProject((c) => c && c.id === id ? { ...c, status } : c); }}
        onNavigate={onNavigateTarget}
      />

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit project' : 'Create a project'}</DialogTitle><DialogDescription>{editing ? 'Update project details.' : 'Start a new workspace project.'}</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <label className="block space-y-1.5 text-xs font-medium"><span>Project name</span><Input autoFocus {...form.register('name')} placeholder="e.g. Retail POS" maxLength={160} aria-invalid={Boolean(form.formState.errors.name)} />{form.formState.errors.name && <p role="alert" className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</label>
            <label className="block space-y-1.5 text-xs font-medium"><span>Description <span className="font-normal text-muted-foreground">(optional)</span></span><Textarea {...form.register('description')} rows={3} maxLength={10000} /></label>
            {!editing && <fieldset className="space-y-2"><legend className="text-xs font-medium">Project type</legend><RadioGroup value={type} onValueChange={(value) => form.setValue('type', value as ProjectInput['type'], { shouldDirty: true, shouldValidate: true })} className="grid grid-cols-2 gap-2">
              <label htmlFor="project-type-greenfield" data-selected={type === 'greenfield'} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3 text-xs data-[selected=true]:border-ring data-[selected=true]:bg-accent"><RadioGroupItem id="project-type-greenfield" value="greenfield" className="mt-0.5" /><span><span className="block font-semibold">Greenfield</span><span className="text-muted-foreground">Starting from scratch</span></span></label>
              <label htmlFor="project-type-ongoing" data-selected={type === 'ongoing'} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3 text-xs data-[selected=true]:border-ring data-[selected=true]:bg-accent"><RadioGroupItem id="project-type-ongoing" value="ongoing" className="mt-0.5" /><span><span className="block font-semibold">Ongoing</span><span className="text-muted-foreground">Existing maintenance</span></span></label>
            </RadioGroup></fieldset>}
            {form.formState.errors.root?.message && <p role="alert" className="text-xs text-destructive">{form.formState.errors.root.message}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create project'} <ArrowUpRight className="size-3.5" /></Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
