import { PageHeader } from '@/components/shared/PageHeader';
import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ArrowUpRight, Download, FolderKanban, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Upload } from 'lucide-react';
import type { ProjectInput, ProjectRecord, ProjectStatus } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils';
import { PageControls } from '@/components/shared/PageControls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { emptyProjectForm, projectFormSchema, type ProjectFormValues } from './project-form-schema';

interface Props {
  onCreate: (input: ProjectInput) => Promise<void>;
  onUpdate: (id: string, input: Partial<ProjectInput> & { status?: ProjectStatus }) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onExport: (id: string) => Promise<string | null>;
  onImport: () => Promise<void>;
  loading: boolean;
}

export function ProjectsPage({ onCreate, onUpdate, onArchive, onRestore, onExport, onImport, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRecord | null>(null);
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
    setPageLoading(true);
    setPageError('');
    try {
      const page = await window.devLedger.projects.listPage({ limit: pageSize, offset: requestedOffset, query: deferredQuery, includeArchived: showArchived });
      if (requestId === requestRef.current) { setPageRows(page.items); setTotal(page.total); }
    } catch (cause) {
      if (requestId === requestRef.current) { setPageRows([]); setTotal(0); setPageError(cause instanceof Error ? cause.message : 'Projects could not be loaded.'); }
    } finally { if (requestId === requestRef.current) setPageLoading(false); }
  }, [deferredQuery, offset, showArchived]);

  useEffect(() => { void loadPage(); }, [loadPage]);
  const filtered = pageRows;

  async function runPageAction(action: () => Promise<unknown>, fallback: string) {
    setPageError('');
    try { await action(); await loadPage(); }
    catch (cause) { setPageError(cause instanceof Error ? cause.message : fallback); }
  }
  async function archiveAndReload(id: string) { await runPageAction(() => onArchive(id), 'Project could not be archived.'); }
  async function restoreAndReload(id: string) { await runPageAction(() => onRestore(id), 'Project could not be restored.'); }
  async function importAndReload() { await runPageAction(onImport, 'Project archive could not be imported.'); }
  async function exportProject(id: string) { await runPageAction(() => onExport(id), 'Project could not be exported.'); }

  function resetForm() {
    setEditing(null); form.reset(emptyProjectForm);
  }

  function editProject(project: ProjectRecord) {
    setEditing(project); form.reset({ name: project.name, description: project.description, type: project.type }); setOpen(true);
  }

  async function submit(values: ProjectFormValues) {
    setSaving(true);
    form.clearErrors('root');
    try {
      if (editing) await onUpdate(editing.id, values);
      else { setOffset(0); await onCreate(values); }
      resetForm(); setOpen(false); await loadPage(editing ? offset : 0);
    } catch (caught) {
      form.setError('root', { type: 'server', message: caught instanceof Error ? caught.message : 'Project could not be saved.' });
    } finally { setSaving(false); }
  }

  return (
    <div className="workspace-page page-projects mx-auto space-y-6">
      <PageHeader title="Projects" description="Keep project context, tasks, documents and decisions connected." actions={<><Button variant="outline" onClick={() => void importAndReload()}><Upload className="size-4"/>Import archive</Button><Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="size-4"/>New project</Button></>} />
      {pageError && <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger">{pageError}</div>}
      <div className="workspace-toolbar projects-toolbar">
        <div className="relative min-w-[220px] max-w-md flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input aria-label="Filter projects by name or description" value={query} onChange={(event) => { setOffset(0); setQuery(event.target.value); }} placeholder="Filter projects…" className="pl-9" /></div>
        <Button variant={showArchived ? 'secondary' : 'outline'} size="sm" onClick={() => { setOffset(0); setShowArchived((value) => !value); }}><Archive className="size-3.5" /> {showArchived ? 'Hide archived' : 'Show archived'}</Button>
      </div>
      {loading || pageLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading projects…</p> : filtered.length ? (
        <div className="workspace-surface projects-table">
          <div className="overflow-x-auto">
          <Table className="min-w-[52rem]">
            <TableHeader className="projects-table-head bg-muted/50">
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Open tasks</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="min-w-[250px]">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><FolderKanban className="size-4"/></div>
                      <div className="min-w-0"><div className="project-name truncate text-[13px] font-medium">{project.name}</div>{project.description && <div className="project-description max-w-[420px] truncate text-xs text-muted-foreground">{project.description}</div>}</div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{project.type === 'greenfield' ? 'Greenfield' : 'Ongoing'}</Badge></TableCell>
                  <TableCell className="tabular-nums">{project.openTaskCount}</TableCell>
                  <TableCell className="tabular-nums">{project.noteCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(project.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${project.name}`}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => editProject(project)}><Pencil className="size-4"/>Edit project</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void exportProject(project.id)}><Download className="size-4"/>Export project</DropdownMenuItem>
                          <DropdownMenuSeparator/>
                          {project.status === 'archived'
                            ? <DropdownMenuItem onSelect={() => void restoreAndReload(project.id)}><RotateCcw className="size-4"/>Restore project</DropdownMenuItem>
                            : <DropdownMenuItem onSelect={() => void archiveAndReload(project.id)}><Archive className="size-4"/>Archive project</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>
      ) : pageError ? null : <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center"><FolderKanban className="mx-auto mb-3 size-6 text-muted-foreground"/><p className="text-sm font-medium">{query ? 'No matching projects' : 'Your project space is ready'}</p><p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Create a project to bring notes, tasks, client context and technical documents together.</p>{!query && <Button className="mt-4" size="sm" onClick={() => { resetForm(); setOpen(true); }}><Plus className="size-3.5"/> Create your first project</Button>}</div>}

      <PageControls offset={offset} limit={pageSize} total={total} disabled={pageLoading} onPageChange={setOffset} />

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit project' : 'Create a project'}</DialogTitle><DialogDescription>{editing ? 'Update the project details used throughout your workspace.' : 'Start fresh or bring an existing piece of work into your workspace.'}</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <label className="block space-y-1.5"><span className="text-xs font-medium">Project name</span><Input autoFocus {...form.register('name')} placeholder="e.g. Retail POS" maxLength={160} aria-invalid={Boolean(form.formState.errors.name)} />{form.formState.errors.name && <p role="alert" className="text-[11px] text-destructive">{form.formState.errors.name.message}</p>}</label>
            <label className="block space-y-1.5"><span className="text-xs font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span></span><Textarea {...form.register('description')} placeholder="What is this project about?" rows={3} maxLength={10000}/>{form.formState.errors.description && <p role="alert" className="text-[11px] text-destructive">{form.formState.errors.description.message}</p>}</label>
            {!editing && <fieldset className="space-y-2"><legend className="text-xs font-medium">Project type</legend><RadioGroup value={type} onValueChange={(value) => form.setValue('type', value as ProjectInput['type'], { shouldDirty: true, shouldValidate: true })} className="grid grid-cols-2 gap-2">
              <label htmlFor="project-type-greenfield" data-selected={type === 'greenfield'} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-surface-hover data-[selected=true]:border-ring data-[selected=true]:bg-accent"><RadioGroupItem id="project-type-greenfield" value="greenfield" className="mt-0.5"/><span><span className="block text-xs font-semibold">Greenfield</span><span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">A new project starting from scratch.</span></span></label>
              <label htmlFor="project-type-ongoing" data-selected={type === 'ongoing'} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-surface-hover data-[selected=true]:border-ring data-[selected=true]:bg-accent"><RadioGroupItem id="project-type-ongoing" value="ongoing" className="mt-0.5"/><span><span className="block text-xs font-semibold">Ongoing</span><span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">Existing work you are continuing.</span></span></label>
            </RadioGroup></fieldset>}
            {form.formState.errors.root?.message && <p role="alert" className="text-xs text-destructive">{form.formState.errors.root.message}</p>}
            <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create project'} <ArrowUpRight className="size-3.5"/></Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
