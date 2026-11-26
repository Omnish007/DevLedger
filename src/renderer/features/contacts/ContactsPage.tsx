import { useCallback, useDeferredValue, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, UserRound } from 'lucide-react';
import type { ContactInput, ContactRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SearchFilterInput } from '@/components/shared/SearchFilterInput';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { useInitialProjectFilter } from '@/hooks/useInitialProjectFilter';
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch';
import { useProjectNames } from '@/hooks/useProjectNames';
import { friendlyError } from '@/lib/utils';
import { ContactFormDialog } from './ContactFormDialog';
import { ContactListSidebar } from './ContactListSidebar';
import { ContactProfilePane } from './ContactProfilePane';
import { contactFormSchema, emptyContactForm, type ContactFormValues } from './contact-form-schema';

interface Props {
    initialProjectId?: string | null | undefined;
    onConsumeFocus?: () => void;
    onCreate: (input: ContactInput) => Promise<void>;
    onUpdate: (id: string, input: Partial<ContactInput>) => Promise<void>;
    onRemove: (id: string) => Promise<void>;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}

const PAGE_SIZE = 30;

export function ContactsPage({
    initialProjectId,
    onConsumeFocus,
    onCreate,
    onUpdate,
    onRemove,
    onNavigateTarget,
}: Props) {
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [pendingRemoval, setPendingRemoval] = useState<ContactRecord | null>(null);
    const [query, setQuery] = useState('');
    const {
        projectId: filterProjectId,
        setProjectId: setFilterProjectId,
        offset,
        setOffset,
    } = useInitialProjectFilter(initialProjectId, '', onConsumeFocus);
    const deferredQuery = useDeferredValue(query.trim());
    const form = useForm<ContactFormValues>({
        resolver: zodResolver(contactFormSchema),
        defaultValues: emptyContactForm,
        mode: 'onChange',
    });
    const [busy, setBusy] = useState(false);

    const fetchContacts = useCallback(
        (requestedOffset: number) =>
            window.devLedger.contacts.listPage({
                limit: PAGE_SIZE,
                offset: requestedOffset,
                query: deferredQuery,
                projectId: filterProjectId || null,
            }),
        [deferredQuery, filterProjectId],
    );

    const {
        items: visible,
        total,
        loading: pageLoading,
        error: pageError,
        setError: setPageError,
        loadPage,
    } = usePaginatedFetch({
        fetcher: fetchContacts,
        offset,
        errorFallback: 'Contacts could not be loaded.',
        onLoaded: (page) => {
            setSelectedId((cur) =>
                cur && page.items.some((item) => item.id === cur) ? cur : (page.items[0]?.id ?? null),
            );
        },
    });

    const { projectNames } = useProjectNames(visible.flatMap((c) => c.projectIds));
    const activeContact = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

    function beginEdit(contact: ContactRecord) {
        setEditingId(contact.id);
        form.reset({
            name: contact.name,
            role: contact.role || 'other',
            company: contact.company,
            email: contact.email,
            phone: contact.phone,
            notes: contact.notes,
            projectId: contact.projectIds[0] ?? '',
            customAttributes: Object.entries(contact.customAttributes ?? {}).map(([key, value]) => ({
                key,
                value,
            })),
        });
        setOpen(true);
    }

    function resetForm() {
        setEditingId(null);
        form.reset(emptyContactForm);
        form.clearErrors();
    }

    async function submit(values: ContactFormValues) {
        setBusy(true);
        form.clearErrors('root');
        const customAttributes = Object.fromEntries(
            values.customAttributes
                .filter(({ key, value }) => key && value)
                .map(({ key, value }) => [key, value]),
        );
        const input = {
            name: values.name,
            role: values.role,
            company: values.company,
            email: values.email,
            phone: values.phone,
            notes: values.notes,
            customAttributes,
            projectId: values.projectId || null,
        };
        try {
            if (editingId) await onUpdate(editingId, input);
            else {
                setOffset(0);
                await onCreate(input);
            }
            resetForm();
            setOpen(false);
            await loadPage(editingId ? offset : 0);
        } catch (cause) {
            form.setError('root', {
                type: 'server',
                message: friendlyError(cause, 'Contact could not be saved.'),
            });
        } finally {
            setBusy(false);
        }
    }

    async function confirmRemoval() {
        if (!pendingRemoval) return;
        setBusy(true);
        try {
            await onRemove(pendingRemoval.id);
            setPendingRemoval(null);
            setPageError('');
            await loadPage();
        } catch (cause) {
            setPageError(friendlyError(cause, 'Contact could not be removed.'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="workspace-page page-contacts mx-auto space-y-5">
            <PageHeader
                title="Contacts"
                description={total ? `${total} ${total === 1 ? 'contact' : 'contacts'}` : undefined}
                actions={
                    <Button
                        size="sm"
                        onClick={() => {
                            resetForm();
                            setOpen(true);
                        }}
                    >
                        <Plus className="size-3.5" />
                        Add contact
                    </Button>
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

            <div className="workspace-toolbar">
                <SearchFilterInput
                    className="min-w-[220px] max-w-md flex-1"
                    value={query}
                    onValueChange={(next) => {
                        setOffset(0);
                        setQuery(next);
                    }}
                    placeholder="Filter contacts…"
                    aria-label="Search contacts by name, role or company"
                    clearLabel="Clear contact filter"
                />
                <RemoteRecordPicker
                    entityType="project"
                    value={filterProjectId}
                    onValueChange={(v) => {
                        setOffset(0);
                        setFilterProjectId(v);
                    }}
                    placeholder="All projects"
                    selectedLabel={projectNames[filterProjectId]}
                    className="w-48"
                />
            </div>

            {pageLoading ? (
                <p className="py-12 text-center text-xs text-muted-foreground">Loading contacts…</p>
            ) : (
                activeContact && (
                    <div className="contact-shell workspace-surface grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
                        <ContactListSidebar
                            contacts={visible}
                            activeContactId={activeContact.id}
                            onSelect={setSelectedId}
                            onEdit={beginEdit}
                            onRequestDelete={setPendingRemoval}
                        />
                        <ContactProfilePane
                            contact={activeContact}
                            projectNames={projectNames}
                            onEdit={beginEdit}
                            onDelete={setPendingRemoval}
                            onNavigateTarget={onNavigateTarget}
                        />
                    </div>
                )
            )}

            {!pageLoading && !visible.length && !pageError && (
                <Empty className="min-h-56">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <UserRound />
                        </EmptyMedia>
                        <EmptyTitle>
                            {query || filterProjectId ? 'No matching contacts' : 'No contacts yet'}
                        </EmptyTitle>
                        <EmptyDescription>
                            Connect contacts to projects and mention them directly inside Notes with @.
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        {query || filterProjectId ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setQuery('');
                                    setFilterProjectId('');
                                }}
                            >
                                Clear filters
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={() => {
                                    resetForm();
                                    setOpen(true);
                                }}
                            >
                                <Plus className="size-3.5" />
                                Add first contact
                            </Button>
                        )}
                    </EmptyContent>
                </Empty>
            )}
            <PageControls
                offset={offset}
                limit={PAGE_SIZE}
                total={total}
                disabled={pageLoading}
                onPageChange={setOffset}
            />

            <ContactFormDialog
                open={open}
                editing={Boolean(editingId)}
                busy={busy}
                form={form}
                projectNames={projectNames}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (!next) resetForm();
                }}
                onSubmit={submit}
            />

            <AlertDialog
                open={Boolean(pendingRemoval)}
                onOpenChange={(o) => {
                    if (!o && !busy) setPendingRemoval(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <div className="flex items-start gap-3.5">
                            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-subtle text-danger-foreground ring-1 ring-danger/25">
                                <Trash2 className="size-4.5" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                                <AlertDialogTitle>Move contact to trash?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    {pendingRemoval
                                        ? `“${pendingRemoval.name}” will be moved to trash. `
                                        : ''}
                                    Historical activity and note mentions remain intact.
                                </AlertDialogDescription>
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => {
                                e.preventDefault();
                                void confirmRemoval();
                            }}
                        >
                            Move to trash
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
