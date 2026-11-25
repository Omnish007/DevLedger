import { PageHeader } from '@/components/shared/PageHeader';
import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Mail, MoreHorizontal, Phone, Plus, Search, Trash2, UserRound, Pencil, X } from 'lucide-react';
import type { ContactInput, ContactRecord } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { contactFormSchema, emptyContactForm, type ContactFormValues } from './contact-form-schema';

interface Props {
  onCreate: (input: ContactInput) => Promise<void>;
  onUpdate: (id: string, input: Partial<ContactInput>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function ContactsPage({ onCreate, onUpdate, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ContactRecord | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const form = useForm<ContactFormValues>({ resolver: zodResolver(contactFormSchema), defaultValues: emptyContactForm, mode: 'onChange' });
  const { fields: attributeFields, append: appendAttribute, remove: removeAttribute } = useFieldArray({ control: form.control, name: 'customAttributes' });
  const role = form.watch('role');
  const projectId = form.watch('projectId');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const [visible, setVisible] = useState<ContactRecord[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const requestRef = useRef(0);
  const pageSize = 30;

  const loadPage = useCallback(async (requestedOffset = offset) => {
    const requestId = ++requestRef.current;
    setPageLoading(true);
    try {
      const page = await window.devLedger.contacts.listPage({ limit: pageSize, offset: requestedOffset, query: deferredQuery });
      if (requestId === requestRef.current) {
        setVisible(page.items); setTotal(page.total); setPageError('');
        const ids = [...new Set(page.items.flatMap((contact) => contact.projectIds))];
        void window.devLedger.projects.getNames(ids).then((names) => { if (requestId === requestRef.current) setProjectNames((current) => ({ ...current, ...names })); }).catch(() => undefined);
      }
    } finally { if (requestId === requestRef.current) setPageLoading(false); }
  }, [deferredQuery, offset]);

  useEffect(() => { void loadPage().catch((cause: unknown) => setPageError(cause instanceof Error ? cause.message : 'Contacts could not be loaded.')); }, [loadPage]);

  function beginEdit(contact: ContactRecord) {
    setEditingId(contact.id);
    form.reset({ name: contact.name, role: contact.role || 'other', company: contact.company, email: contact.email, phone: contact.phone, notes: contact.notes, projectId: contact.projectIds[0] ?? '', customAttributes: Object.entries(contact.customAttributes ?? {}).map(([key, value]) => ({ key, value })) });
    setOpen(true);
  }
  function resetForm() {
    setEditingId(null); form.reset(emptyContactForm); setError(''); form.clearErrors();
  }
  async function submit(values: ContactFormValues) {
    setBusy(true); setError(''); form.clearErrors('root');
    const customAttributes = Object.fromEntries(values.customAttributes.filter(({ key, value }) => key && value).map(({ key, value }) => [key, value]));
    const input = { name: values.name, role: values.role, company: values.company, email: values.email, phone: values.phone, notes: values.notes, customAttributes, projectId: values.projectId || null };
    try {
      if (editingId) await onUpdate(editingId, input); else { setOffset(0); await onCreate(input); }
      resetForm(); setOpen(false); await loadPage(editingId ? offset : 0);
    } catch (cause) {
      form.setError('root', { type: 'server', message: cause instanceof Error ? cause.message : 'Contact could not be saved.' });
    } finally { setBusy(false); }
  }
  async function confirmRemoval() {
    if (!pendingRemoval) return;
    setBusy(true);
    try { await onRemove(pendingRemoval.id); setPendingRemoval(null); setPageError(''); await loadPage(); }
    catch (cause) { setPageError(cause instanceof Error ? cause.message : 'Contact could not be removed.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="workspace-page page-contacts mx-auto space-y-6">
      <PageHeader title="Contacts" description="Keep client, project manager and delivery contacts close to the work." actions={<Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="size-4"/>Add contact</Button>} />
      {pageError && <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger">{pageError}</div>}
      <div className="workspace-toolbar contacts-toolbar relative max-w-xl"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={query} onChange={(event) => { setOffset(0); setQuery(event.target.value); }} placeholder="Search contacts…"/></div>

      {pageLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading contacts…</p> : visible.length > 0 && <div className="contact-directory">{visible.map((contact) => {
        const associatedProjectNames = contact.projectIds.map((id) => projectNames[id] ?? 'Project');
        const initials = contact.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
        const card = (
          <article className="contact-record rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-border/80 hover:bg-surface-subtle/50">
            <div className="flex items-start gap-3">
              <Avatar><AvatarFallback>{initials || <UserRound className="size-4"/>}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <HoverCard openDelay={300}>
                  <HoverCardTrigger asChild><button type="button" className="max-w-full truncate text-left text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{contact.name}</button></HoverCardTrigger>
                  <HoverCardContent align="start" className="space-y-2">
                    <div className="text-sm font-semibold">{contact.name}</div>
                    <p className="text-xs text-muted-foreground">{contact.role.replaceAll('_', ' ')}{contact.company ? ` · ${contact.company}` : ''}</p>
                    {contact.email && <p className="break-all text-xs">{contact.email}</p>}
                    {contact.phone && <p className="text-xs">{contact.phone}</p>}
                    {contact.notes && <p className="border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">{contact.notes}</p>}
                  </HoverCardContent>
                </HoverCard>
                <div className="mt-1 flex flex-wrap gap-1.5"><Badge variant="secondary">{contact.role.replaceAll('_', ' ')}</Badge>{contact.company && <Badge variant="outline">{contact.company}</Badge>}</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${contact.name}`}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => beginEdit(contact)}><Pencil className="size-4"/>Edit contact</DropdownMenuItem>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setPendingRemoval(contact)}><Trash2 className="size-4"/>Move to trash</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="contact-details mt-4 space-y-2 text-[11px] text-muted-foreground">
              {contact.email && <p className="flex items-center gap-2"><Mail className="size-3.5"/>{contact.email}</p>}
              {contact.phone && <p className="flex items-center gap-2"><Phone className="size-3.5"/>{contact.phone}</p>}
              {contact.company && <p className="flex items-center gap-2"><Building2 className="size-3.5"/>{contact.company}</p>}
            </div>
            {associatedProjectNames.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{associatedProjectNames.map((projectName, index) => <Badge key={`${contact.projectIds[index]}-${index}`} variant="outline">{projectName}</Badge>)}</div>}
            {Object.keys(contact.customAttributes ?? {}).length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">{Object.entries(contact.customAttributes).map(([key, value]) => <div key={key} className="min-w-0"><p className="truncate text-[10px] text-muted-foreground">{key}</p><p className="truncate text-xs font-medium">{value}</p></div>)}</div>}
            {contact.notes && <p className="mt-3 line-clamp-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">{contact.notes}</p>}
          </article>
        );
        return <ContextMenu key={contact.id}><ContextMenuTrigger asChild>{card}</ContextMenuTrigger><ContextMenuContent><ContextMenuItem onSelect={() => beginEdit(contact)}><Pencil className="size-4"/>Edit contact</ContextMenuItem><ContextMenuSeparator/><ContextMenuItem onSelect={() => setPendingRemoval(contact)} className="text-destructive focus:text-destructive"><Trash2 className="size-4"/>Move to trash</ContextMenuItem></ContextMenuContent></ContextMenu>;
      })}</div>}

      {!pageLoading && !visible.length && !pageError && <Empty className="min-h-64"><EmptyHeader><EmptyMedia variant="icon"><UserRound/></EmptyMedia><EmptyTitle>{query ? 'No matching contacts' : 'No contacts yet'}</EmptyTitle><EmptyDescription>{query ? 'Try another name, role or company, or clear your filter.' : 'Add a client or project contact to connect people with your work.'}</EmptyDescription></EmptyHeader><EmptyContent>{query ? <Button variant="outline" size="sm" onClick={() => setQuery('')}>Clear filter</Button> : <Button size="sm" onClick={() => { resetForm(); setOpen(true); }}><Plus className="size-3.5"/> Add first contact</Button>}</EmptyContent></Empty>}

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
        <DialogContent><DialogHeader><DialogTitle>{editingId ? 'Edit contact' : 'Add a contact'}</DialogTitle><DialogDescription>{editingId ? 'Update this local contact record.' : 'Create a local contact record and optionally associate it with a project.'}</DialogDescription></DialogHeader>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-3">
            <label className="block space-y-1.5 text-xs font-medium">Name<Input autoFocus {...form.register('name')} maxLength={160} placeholder="Full name" aria-invalid={Boolean(form.formState.errors.name)}/>{form.formState.errors.name && <span role="alert" className="text-[10px] text-destructive">{form.formState.errors.name.message}</span>}</label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-xs font-medium">Role<NativeSelect {...form.register('role')}><NativeSelectOption value="client">Main client</NativeSelectOption><NativeSelectOption value="project_manager">Project manager</NativeSelectOption><NativeSelectOption value="technical_manager">Technical manager</NativeSelectOption><NativeSelectOption value="developer">Developer</NativeSelectOption><NativeSelectOption value="designer">Designer</NativeSelectOption><NativeSelectOption value="vendor">Vendor</NativeSelectOption><NativeSelectOption value="other">Other</NativeSelectOption>{!['client','project_manager','technical_manager','developer','designer','vendor','other'].includes(role) && <NativeSelectOption value={role}>{role.replaceAll('_', ' ')}</NativeSelectOption>}</NativeSelect></label>
              <label className="space-y-1.5 text-xs font-medium">Project<RemoteRecordPicker entityType="project" value={projectId} onValueChange={(value) => form.setValue('projectId', value, { shouldDirty: true, shouldValidate: true })} placeholder="No project" selectedLabel={projectNames[projectId]} /></label>
            </div>
            <label className="block space-y-1.5 text-xs font-medium">Company<Input {...form.register('company')} maxLength={160}/>{form.formState.errors.company && <span role="alert" className="text-[10px] text-destructive">{form.formState.errors.company.message}</span>}</label>
            <div className="grid grid-cols-2 gap-3"><label className="space-y-1.5 text-xs font-medium">Email<Input type="email" {...form.register('email')} maxLength={254} aria-invalid={Boolean(form.formState.errors.email)}/>{form.formState.errors.email && <span role="alert" className="text-[10px] text-destructive">{form.formState.errors.email.message}</span>}</label><label className="space-y-1.5 text-xs font-medium">Phone<Input {...form.register('phone')} maxLength={80}/>{form.formState.errors.phone && <span role="alert" className="text-[10px] text-destructive">{form.formState.errors.phone.message}</span>}</label></div>
            <label className="block space-y-1.5 text-xs font-medium">Notes<Textarea {...form.register('notes')} rows={3} maxLength={10000}/>{form.formState.errors.notes && <span role="alert" className="text-[10px] text-destructive">{form.formState.errors.notes.message}</span>}</label>
            <section className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-medium">Custom attributes</p><p className="text-[11px] text-muted-foreground">Optional project-specific details, up to 20 fields.</p></div><Button type="button" size="sm" variant="outline" onClick={() => appendAttribute({ key: '', value: '' })} disabled={attributeFields.length >= 20}><Plus className="size-3.5"/> Add field</Button></div>
              {attributeFields.map((field, index) => <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <div><Input aria-label={`Custom attribute ${index + 1} name`} placeholder="Field name" maxLength={40} {...form.register(`customAttributes.${index}.key`)}/>{form.formState.errors.customAttributes?.[index]?.key && <span role="alert" className="text-[10px] text-destructive">{form.formState.errors.customAttributes[index]?.key?.message}</span>}</div>
                <div><Input aria-label={`Custom attribute ${index + 1} value`} placeholder="Value" maxLength={500} {...form.register(`customAttributes.${index}.value`)}/>{form.formState.errors.customAttributes?.[index]?.value && <span role="alert" className="text-[10px] text-destructive">{form.formState.errors.customAttributes[index]?.value?.message}</span>}</div>
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove custom attribute ${index + 1}`} onClick={() => removeAttribute(index)}><X className="size-4"/></Button>
              </div>)}
            </section>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}{form.formState.errors.root?.message && <p role="alert" className="text-xs text-destructive">{form.formState.errors.root.message}</p>}
            <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Save contact'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingRemoval)} onOpenChange={(isOpen) => { if (!isOpen && !busy) setPendingRemoval(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Move contact to trash?</AlertDialogTitle><AlertDialogDescription>{pendingRemoval ? `${pendingRemoval.name} will be moved to trash. Their historical mentions and activity remain in the project history.` : 'This contact will be moved to trash.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void confirmRemoval(); }}>{busy ? 'Moving…' : 'Move to trash'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
