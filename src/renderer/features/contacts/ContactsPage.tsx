import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, MoreHorizontal, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import type { ContactInput, ContactRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { friendlyError } from '@/lib/utils';
import { contactFormSchema, emptyContactForm, type ContactFormValues } from './contact-form-schema';
import { ContactProfilePane } from './ContactProfilePane';

interface Props {
  initialProjectId?: string | null | undefined;
  onConsumeFocus?: () => void;
  onCreate: (input: ContactInput) => Promise<void>;
  onUpdate: (id: string, input: Partial<ContactInput>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}

export function ContactsPage({ initialProjectId, onConsumeFocus, onCreate, onUpdate, onRemove, onNavigateTarget }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ContactRecord | null>(null);
  const [query, setQuery] = useState('');
  const [filterProjectId, setFilterProjectId] = useState(initialProjectId || '');
  const deferredQuery = useDeferredValue(query.trim());
  const form = useForm<ContactFormValues>({ resolver: zodResolver(contactFormSchema), defaultValues: emptyContactForm, mode: 'onChange' });
  const { fields: attributeFields, append: appendAttribute, remove: removeAttribute } = useFieldArray({ control: form.control, name: 'customAttributes' });
  const [role, projectId] = [form.watch('role'), form.watch('projectId')];
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const [visible, setVisible] = useState<ContactRecord[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const requestRef = useRef(0);
  const pageSize = 30;

  useEffect(() => {
    if (initialProjectId) { setFilterProjectId(initialProjectId); setOffset(0); onConsumeFocus?.(); }
  }, [initialProjectId, onConsumeFocus]);

  const loadPage = useCallback(async (requestedOffset = offset) => {
    const requestId = ++requestRef.current;
    setPageLoading(true);
    try {
      const page = await window.devLedger.contacts.listPage({ limit: pageSize, offset: requestedOffset, query: deferredQuery, projectId: filterProjectId || null });
      if (requestId === requestRef.current) {
        setVisible(page.items); setTotal(page.total); setPageError('');
        setSelectedId((cur) => (cur && page.items.some((item) => item.id === cur) ? cur : page.items[0]?.id ?? null));
        const ids = [...new Set(page.items.flatMap((c) => c.projectIds))];
        void window.devLedger.projects.getNames(ids).then((names) => { if (requestId === requestRef.current) setProjectNames((c) => ({ ...c, ...names })); }).catch(() => undefined);
      }
    } finally { if (requestId === requestRef.current) setPageLoading(false); }
  }, [deferredQuery, offset, filterProjectId]);

  useEffect(() => { void loadPage().catch((cause: unknown) => setPageError(friendlyError(cause, 'Contacts could not be loaded.'))); }, [loadPage]);

  const activeContact = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

  function beginEdit(contact: ContactRecord) {
    setEditingId(contact.id);
    form.reset({ name: contact.name, role: contact.role || 'other', company: contact.company, email: contact.email, phone: contact.phone, notes: contact.notes, projectId: contact.projectIds[0] ?? '', customAttributes: Object.entries(contact.customAttributes ?? {}).map(([key, value]) => ({ key, value })) });
    setOpen(true);
  }
  function resetForm() { setEditingId(null); form.reset(emptyContactForm); form.clearErrors(); }
  async function submit(values: ContactFormValues) {
    setBusy(true); form.clearErrors('root');
    const customAttributes = Object.fromEntries(values.customAttributes.filter(({ key, value }) => key && value).map(({ key, value }) => [key, value]));
    const input = { name: values.name, role: values.role, company: values.company, email: values.email, phone: values.phone, notes: values.notes, customAttributes, projectId: values.projectId || null };
    try {
      if (editingId) await onUpdate(editingId, input); else { setOffset(0); await onCreate(input); }
      resetForm(); setOpen(false); await loadPage(editingId ? offset : 0);
    } catch (cause) { form.setError('root', { type: 'server', message: friendlyError(cause, 'Contact could not be saved.') }); }
    finally { setBusy(false); }
  }
  async function confirmRemoval() {
    if (!pendingRemoval) return;
    setBusy(true);
    try { await onRemove(pendingRemoval.id); setPendingRemoval(null); setPageError(''); await loadPage(); }
    catch (cause) { setPageError(friendlyError(cause, 'Contact could not be removed.')); }
    finally { setBusy(false); }
  }

  return (
    <div className="workspace-page page-contacts mx-auto space-y-5">
      <PageHeader title="Contacts" description="People, roles and project associations connected across your workspace." actions={<Button size="sm" onClick={() => { resetForm(); setOpen(true); }}><Plus className="size-3.5" />Add contact</Button>} />
      {pageError && <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-xs text-danger">{pageError}</div>}

      <div className="workspace-toolbar">
        <div className="relative min-w-[220px] max-w-md flex-1"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" value={query} onChange={(e) => { setOffset(0); setQuery(e.target.value); }} placeholder="Search contacts by name, role or company…" /></div>
        <RemoteRecordPicker entityType="project" value={filterProjectId} onValueChange={(v) => { setOffset(0); setFilterProjectId(v); }} placeholder="All projects" selectedLabel={projectNames[filterProjectId]} className="w-48" />
        <Badge variant="secondary" className="ml-auto tabular-nums">{total} contact{total === 1 ? '' : 's'}</Badge>
      </div>

      {pageLoading ? <p className="py-12 text-center text-xs text-muted-foreground">Loading contacts…</p> : activeContact && (
        <div className="contact-shell workspace-surface grid min-h-[440px] grid-cols-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
          <aside className="flex flex-col border-b border-border bg-sidebar/35 lg:border-b-0 lg:border-r">
            <div className="divide-y divide-border overflow-y-auto">
              {visible.map((contact) => {
                const initials = contact.name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
                const isSelected = activeContact.id === contact.id;
                const row = (
                  <div
                    className={`contact-list-item group flex items-center gap-3 px-3.5 py-2.5 transition-colors ${isSelected ? 'bg-accent/70' : 'hover:bg-surface-subtle'}`}
                  >
                    <button type="button" onClick={() => setSelectedId(contact.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <Avatar className="size-8 shrink-0 rounded-lg border border-border/70">
                        <AvatarFallback className="rounded-lg text-xs font-medium">{initials || <UserRound className="size-3.5" />}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
                        <p className="truncate text-xs capitalize text-muted-foreground">{contact.role.replaceAll('_', ' ')}{contact.company ? ` · ${contact.company}` : ''}</p>
                      </div>
                      <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`} />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-7 shrink-0 opacity-70 hover:opacity-100" aria-label={`Actions for ${contact.name}`}><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => beginEdit(contact)}><Pencil className="size-4" />Edit contact</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setPendingRemoval(contact)}><Trash2 className="size-4" />Move to trash</DropdownMenuItem></DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
                return <ContextMenu key={contact.id}><ContextMenuTrigger asChild>{row}</ContextMenuTrigger><ContextMenuContent><ContextMenuItem onSelect={() => beginEdit(contact)}><Pencil className="size-4" />Edit contact</ContextMenuItem><ContextMenuSeparator /><ContextMenuItem onSelect={() => setPendingRemoval(contact)} className="text-destructive focus:text-destructive"><Trash2 className="size-4" />Move to trash</ContextMenuItem></ContextMenuContent></ContextMenu>;
              })}
            </div>
          </aside>
          <ContactProfilePane contact={activeContact} projectNames={projectNames} onEdit={beginEdit} onDelete={setPendingRemoval} onNavigateTarget={onNavigateTarget} />
        </div>
      )}

      {!pageLoading && !visible.length && !pageError && <Empty className="min-h-56"><EmptyHeader><EmptyMedia variant="icon"><UserRound /></EmptyMedia><EmptyTitle>{query || filterProjectId ? 'No matching contacts' : 'No contacts yet'}</EmptyTitle><EmptyDescription>Connect contacts to projects and mention them directly inside Notes with @.</EmptyDescription></EmptyHeader><EmptyContent>{query || filterProjectId ? <Button variant="outline" size="sm" onClick={() => { setQuery(''); setFilterProjectId(''); }}>Clear filters</Button> : <Button size="sm" onClick={() => { resetForm(); setOpen(true); }}><Plus className="size-3.5" />Add contact</Button>}</EmptyContent></Empty>}
      <PageControls offset={offset} limit={pageSize} total={total} disabled={pageLoading} onPageChange={setOffset} />

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
        <DialogContent><DialogHeader><DialogTitle>{editingId ? 'Edit contact' : 'Add a contact'}</DialogTitle><DialogDescription>Store local contact details and link to a project.</DialogDescription></DialogHeader>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-3 text-xs font-medium">
            <label className="block space-y-1">Name<Input autoFocus {...form.register('name')} maxLength={160} placeholder="Full name" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">Role<NativeSelect {...form.register('role')} className="h-9 w-full text-xs"><NativeSelectOption value="client">Main client</NativeSelectOption><NativeSelectOption value="project_manager">Project manager</NativeSelectOption><NativeSelectOption value="technical_manager">Technical manager</NativeSelectOption><NativeSelectOption value="developer">Developer</NativeSelectOption><NativeSelectOption value="designer">Designer</NativeSelectOption><NativeSelectOption value="vendor">Vendor</NativeSelectOption><NativeSelectOption value="other">Other</NativeSelectOption>{!['client','project_manager','technical_manager','developer','designer','vendor','other'].includes(role) && <NativeSelectOption value={role}>{role.replaceAll('_', ' ')}</NativeSelectOption>}</NativeSelect></label>
              <label className="space-y-1">Project<RemoteRecordPicker entityType="project" value={projectId} onValueChange={(v) => form.setValue('projectId', v, { shouldDirty: true })} placeholder="No project" selectedLabel={projectNames[projectId]} /></label>
            </div>
            <label className="block space-y-1">Company<Input {...form.register('company')} maxLength={160} /></label>
            <div className="grid grid-cols-2 gap-3"><label className="space-y-1">Email<Input type="email" {...form.register('email')} maxLength={254} /></label><label className="space-y-1">Phone<Input {...form.register('phone')} maxLength={80} /></label></div>
            <label className="block space-y-1">Notes<Textarea {...form.register('notes')} rows={2} maxLength={10000} /></label>
            <section className="space-y-2 rounded-md border border-border p-2.5"><div className="flex items-center justify-between"><span>Custom fields</span><Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => appendAttribute({ key: '', value: '' })} disabled={attributeFields.length >= 20}><Plus className="size-3" />Add</Button></div>{attributeFields.map((field, idx) => <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] gap-1.5"><Input placeholder="Field" maxLength={40} {...form.register(`customAttributes.${idx}.key`)} /><Input placeholder="Value" maxLength={500} {...form.register(`customAttributes.${idx}.value`)} /><Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => removeAttribute(idx)}><X className="size-3.5" /></Button></div>)}</section>
            {form.formState.errors.root?.message && <p role="alert" className="text-destructive">{form.formState.errors.root.message}</p>}
            <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingRemoval)} onOpenChange={(o) => { if (!o && !busy) setPendingRemoval(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Move contact to trash?</AlertDialogTitle><AlertDialogDescription>Historical activity and note mentions remain intact.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void confirmRemoval(); }}>Move to trash</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
