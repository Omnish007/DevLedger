import { useCallback, useEffect, useState } from 'react';
import {
    AlarmClock,
    ArrowUpRight,
    CornerDownLeft,
    FileText,
    FolderKanban,
    Link2,
    ListTodo,
    NotebookPen,
    Plus,
    Trash2,
    Users,
} from 'lucide-react';
import type {
    EntityLinkRecord,
    EntityType,
    RecordSummary,
    ReminderRecord,
    TagRecord,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { resolveSmartDateInstant } from '@domain/smart-date-resolution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SmartDateField } from '@/components/shared/SmartDateField';
import { TagSelector } from '@/components/shared/TagSelectorPopover';
import { targetFromRecord } from '@/lib/navigation';
import { formatDate, friendlyError } from '@/lib/utils';

const entityIcon: Record<EntityType, typeof FolderKanban> = {
    project: FolderKanban,
    note: NotebookPen,
    task: ListTodo,
    document: FileText,
    contact: Users,
};

interface RecordConnectionsPanelProps {
    entityType: EntityType;
    entityId: string;
    onNavigate?: ((target: WorkspaceNavigationTarget) => void) | undefined;
    onChanged?: (() => void) | undefined;
    hideReminders?: boolean;
    headingLevel?: 'h3' | 'h4';
}

export function RecordConnectionsPanel({
    entityType,
    entityId,
    onNavigate,
    onChanged,
    hideReminders = false,
    headingLevel = 'h3',
}: RecordConnectionsPanelProps) {
    const SectionHeading = headingLevel;
    const [tags, setTags] = useState<TagRecord[]>([]);
    const [links, setLinks] = useState<EntityLinkRecord[]>([]);
    const [summaries, setSummaries] = useState<Record<string, RecordSummary>>({});
    const [reminders, setReminders] = useState<ReminderRecord[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const [targetType, setTargetType] = useState<EntityType>(entityType === 'note' ? 'task' : 'note');
    const [targetId, setTargetId] = useState('');
    const [relation, setRelation] = useState('related');
    const [showLinkForm, setShowLinkForm] = useState(false);

    const [showReminderForm, setShowReminderForm] = useState(false);
    const [reminderWhen, setReminderWhen] = useState('@tomorrow 9am');
    const [reminderNote, setReminderNote] = useState('');

    const refresh = useCallback(async () => {
        try {
            const reminderType = entityType === 'document' || hideReminders ? null : entityType;
            const [entityTags, linkPage, reminderPage] = await Promise.all([
                window.devLedger.operations.listEntityTags(entityType, entityId),
                window.devLedger.operations.listLinksPage(entityType, entityId, { limit: 40, offset: 0 }),
                reminderType
                    ? window.devLedger.operations.listRemindersPage({
                          entityType: reminderType,
                          entityId,
                          limit: 20,
                          offset: 0,
                      })
                    : Promise.resolve({
                          items: [] as ReminderRecord[],
                          total: 0,
                          limit: 20,
                          offset: 0,
                          hasMore: false,
                      }),
            ]);
            setTags(entityTags);
            setLinks(linkPage.items);
            setReminders(reminderPage.items);
            const refs = linkPage.items.map((link) =>
                link.direction === 'outgoing'
                    ? { type: link.targetType, id: link.targetId }
                    : { type: link.sourceType, id: link.sourceId },
            );
            if (refs.length) {
                const resolved = await window.devLedger.operations.resolveRecordSummaries(refs);
                setSummaries(resolved);
            } else {
                setSummaries({});
            }
            setError('');
        } catch (caught) {
            setError(friendlyError(caught, 'Connections could not be loaded.'));
        }
    }, [entityType, entityId, hideReminders]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    async function refreshAndNotify() {
        await refresh();
        onChanged?.();
    }

    async function addLink() {
        if (!targetId) return;
        setBusy(true);
        try {
            await window.devLedger.operations.createLink(
                entityType,
                entityId,
                targetType,
                targetId,
                relation.trim() || 'related',
            );
            setTargetId('');
            setShowLinkForm(false);
            await refreshAndNotify();
        } catch (caught) {
            setError(friendlyError(caught, 'Link could not be created.'));
        } finally {
            setBusy(false);
        }
    }

    async function addReminder(event: React.FormEvent) {
        event.preventDefault();
        if (entityType === 'document') return;
        setBusy(true);
        try {
            const instant = resolveSmartDateInstant(reminderWhen);
            await window.devLedger.operations.createReminder(
                entityType,
                entityId,
                instant.isoUtc,
                reminderNote,
            );
            setReminderNote('');
            setShowReminderForm(false);
            await refreshAndNotify();
        } catch (caught) {
            setError(friendlyError(caught, 'Reminder could not be scheduled.'));
        } finally {
            setBusy(false);
        }
    }

    const outgoingLinks = links.filter((item) => item.direction === 'outgoing');
    const incomingLinks = links.filter((item) => item.direction === 'incoming');

    function renderLinkGroup(title: string, groupLinks: EntityLinkRecord[], incoming: boolean) {
        if (!groupLinks.length) return null;
        return (
            <div className="space-y-1.5">
                <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    {incoming && <CornerDownLeft className="size-3" />}
                    <span>
                        {title} ({groupLinks.length})
                    </span>
                </p>
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                    {groupLinks.map((link) => {
                        const otherType = link.direction === 'outgoing' ? link.targetType : link.sourceType;
                        const otherId = link.direction === 'outgoing' ? link.targetId : link.sourceId;
                        const summary = summaries[`${otherType}:${otherId}`];
                        const Icon = entityIcon[otherType];
                        return (
                            <div key={link.id} className="flex items-center gap-2 px-3 py-2">
                                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                                <button
                                    type="button"
                                    className="min-w-0 flex-1 text-left hover:underline"
                                    onClick={() =>
                                        onNavigate?.(targetFromRecord(otherType, otherId, summary?.projectId))
                                    }
                                >
                                    <span className="block truncate text-xs font-medium text-foreground">
                                        {summary?.title ?? `${otherType} record`}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {link.relationship} · {summary?.subtitle ?? otherType}
                                    </span>
                                </button>
                                {onNavigate && (
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="size-7 shrink-0"
                                        aria-label={`Open ${summary?.title ?? otherType}`}
                                        onClick={() =>
                                            onNavigate(
                                                targetFromRecord(otherType, otherId, summary?.projectId),
                                            )
                                        }
                                    >
                                        <ArrowUpRight className="size-3.5" />
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-7 shrink-0 text-muted-foreground hover:text-danger"
                                    aria-label="Remove link"
                                    onClick={() =>
                                        void window.devLedger.operations
                                            .removeLink(link.id)
                                            .then(refreshAndNotify)
                                    }
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5 text-xs">
            {error && (
                <p
                    role="alert"
                    className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-danger-foreground"
                >
                    {error}
                </p>
            )}

            <section className="space-y-2">
                <SectionHeading className="text-xs font-semibold text-muted-foreground">Tags</SectionHeading>
                <TagSelector
                    entityType={entityType}
                    entityId={entityId}
                    assigned={tags}
                    onChanged={() => void refreshAndNotify()}
                    onError={setError}
                />
            </section>

            {entityType !== 'document' && !hideReminders && (
                <section className="space-y-2.5 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                        <SectionHeading className="text-xs font-semibold text-muted-foreground">
                            Reminders
                        </SectionHeading>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => setShowReminderForm((v) => !v)}
                        >
                            <Plus className="size-3" />
                            {showReminderForm ? 'Cancel' : 'Add reminder'}
                        </Button>
                    </div>
                    {showReminderForm && (
                        <form
                            onSubmit={(event) => void addReminder(event)}
                            className="space-y-2.5 rounded-md border border-border bg-surface-subtle p-3"
                        >
                            <SmartDateField
                                label="When"
                                value={reminderWhen}
                                onChange={setReminderWhen}
                                required
                            />
                            <Input
                                value={reminderNote}
                                onChange={(event) => setReminderNote(event.target.value)}
                                placeholder="Reminder note (optional)"
                                maxLength={500}
                                className="h-8 text-xs"
                            />
                            <Button
                                type="submit"
                                size="sm"
                                className="h-7 w-full"
                                disabled={busy || !reminderWhen.trim()}
                            >
                                Schedule reminder
                            </Button>
                        </form>
                    )}
                    {reminders.length ? (
                        <div className="space-y-1.5">
                            {reminders.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2"
                                >
                                    <AlarmClock className="size-3.5 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">{item.message || 'Follow up'}</p>
                                        <p className="text-muted-foreground">
                                            {formatDate(item.dueAt)} · {item.status}
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2 text-xs"
                                        onClick={() =>
                                            void window.devLedger.operations
                                                .updateReminder(item.id, 'snooze', undefined, 60)
                                                .then(refreshAndNotify)
                                        }
                                    >
                                        Snooze
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2 text-xs text-muted-foreground"
                                        onClick={() =>
                                            void window.devLedger.operations
                                                .updateReminder(item.id, 'dismiss')
                                                .then(refreshAndNotify)
                                        }
                                    >
                                        Dismiss
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        !showReminderForm && <p className="text-muted-foreground">No active reminders.</p>
                    )}
                </section>
            )}

            <section className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                    <SectionHeading className="text-xs font-semibold text-muted-foreground">
                        Links & backlinks
                    </SectionHeading>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => setShowLinkForm((v) => !v)}
                    >
                        <Link2 className="size-3" />
                        {showLinkForm ? 'Cancel' : 'Connect record'}
                    </Button>
                </div>
                {showLinkForm && (
                    <div className="space-y-2 rounded-md border border-border bg-surface-subtle p-3">
                        <div className="grid grid-cols-[110px_1fr] gap-2">
                            <NativeSelect
                                value={targetType}
                                onChange={(event) => {
                                    setTargetType(event.target.value as EntityType);
                                    setTargetId('');
                                }}
                                className="h-8 w-full text-xs"
                            >
                                {(['task', 'note', 'project', 'document', 'contact'] as EntityType[]).map(
                                    (type) => (
                                        <NativeSelectOption key={type} value={type}>
                                            {type}
                                        </NativeSelectOption>
                                    ),
                                )}
                            </NativeSelect>
                            <RemoteRecordPicker
                                entityType={targetType}
                                value={targetId}
                                onValueChange={setTargetId}
                                excludeId={targetType === entityType ? entityId : null}
                                placeholder="Search record…"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Input
                                value={relation}
                                onChange={(event) => setRelation(event.target.value)}
                                placeholder="Relationship (e.g. blocks, reference)"
                                maxLength={64}
                                className="h-8 flex-1 text-xs"
                            />
                            <Button
                                type="button"
                                size="sm"
                                className="h-8"
                                disabled={busy || !targetId}
                                onClick={() => void addLink()}
                            >
                                Link
                            </Button>
                        </div>
                    </div>
                )}
                {links.length ? (
                    <div className="space-y-3">
                        {renderLinkGroup('Links to', outgoingLinks, false)}
                        {renderLinkGroup('Referenced by (backlinks)', incomingLinks, true)}
                    </div>
                ) : (
                    !showLinkForm && <p className="text-muted-foreground">No linked items yet.</p>
                )}
            </section>
        </div>
    );
}
