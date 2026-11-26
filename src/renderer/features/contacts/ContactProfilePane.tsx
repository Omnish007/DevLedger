import { Building2, FolderKanban, Mail, Pencil, Phone, Trash2, UserRound } from 'lucide-react';
import type { ContactRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RecordConnectionsPanel } from '@/components/shared/RecordConnectionsPanel';

interface ContactProfilePaneProps {
    contact: ContactRecord;
    projectNames: Record<string, string>;
    onEdit: (contact: ContactRecord) => void;
    onDelete: (contact: ContactRecord) => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}

export function ContactProfilePane({
    contact,
    projectNames,
    onEdit,
    onDelete,
    onNavigateTarget,
}: ContactProfilePaneProps) {
    const initials = contact.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('');
    const attributeEntries = Object.entries(contact.customAttributes ?? {});

    return (
        <section className="flex min-w-0 flex-col divide-y divide-border overflow-y-auto p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
                <div className="flex min-w-0 items-center gap-3.5">
                    <Avatar className="size-12 rounded-xl border border-border bg-surface-subtle">
                        <AvatarFallback className="rounded-xl text-sm font-semibold">
                            {initials || <UserRound className="size-4" />}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold tracking-tight">{contact.name}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="capitalize">
                                {contact.role.replaceAll('_', ' ')}
                            </Badge>
                            {contact.company && (
                                <Badge variant="outline" className="font-normal">
                                    {contact.company}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => onEdit(contact)}>
                        <Pencil className="size-3.5" />
                        Edit
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-danger"
                        onClick={() => onDelete(contact)}
                        aria-label={`Move ${contact.name} to trash`}
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            </div>

            <dl className="grid grid-cols-1 gap-4 py-4 text-xs sm:grid-cols-3">
                <div className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Mail className="size-3.5" />
                        Email
                    </dt>
                    <dd className="mt-1">
                        {contact.email ? (
                            <a
                                href={`mailto:${contact.email}`}
                                className="inline-flex min-h-6 max-w-full items-center truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                            >
                                {contact.email}
                            </a>
                        ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                        )}
                    </dd>
                </div>
                <div className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Phone className="size-3.5" />
                        Phone
                    </dt>
                    <dd className="mt-1">
                        {contact.phone ? (
                            <a
                                href={`tel:${contact.phone}`}
                                className="inline-flex min-h-6 max-w-full items-center truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                            >
                                {contact.phone}
                            </a>
                        ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                        )}
                    </dd>
                </div>
                <div className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Building2 className="size-3.5" />
                        Company
                    </dt>
                    <dd
                        className={`mt-1 min-h-6 truncate text-sm ${contact.company ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                    >
                        {contact.company || '—'}
                    </dd>
                </div>
            </dl>

            {contact.projectIds.length > 0 && (
                <div className="py-4">
                    <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Associated projects</h3>
                    <div className="flex flex-wrap gap-1.5">
                        {contact.projectIds.map((pid) => (
                            <button
                                key={pid}
                                type="button"
                                onClick={() => onNavigateTarget({ view: 'projects', recordId: pid })}
                                className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
                            >
                                <FolderKanban className="size-3.5 text-muted-foreground" />
                                {projectNames[pid] ?? 'Project'}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {(contact.notes || attributeEntries.length > 0) && (
                <div className="space-y-4 py-4">
                    {contact.notes && (
                        <div>
                            <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">Notes</h3>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                                {contact.notes}
                            </p>
                        </div>
                    )}
                    {attributeEntries.length > 0 && (
                        <div>
                            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                                Custom details
                            </h3>
                            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-surface-subtle/55 p-3 text-xs sm:grid-cols-3">
                                {attributeEntries.map(([key, value]) => (
                                    <div key={key} className="min-w-0">
                                        <dt className="truncate text-xs text-muted-foreground">{key}</dt>
                                        <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
                                            {value}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    )}
                </div>
            )}

            <div className="pt-4">
                <RecordConnectionsPanel
                    entityType="contact"
                    entityId={contact.id}
                    headingLevel="h3"
                    onNavigate={onNavigateTarget}
                />
            </div>
        </section>
    );
}
