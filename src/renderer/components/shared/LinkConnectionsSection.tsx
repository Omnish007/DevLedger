import { useState } from 'react';
import {
    ArrowUpRight,
    CornerDownLeft,
    FileText,
    FolderKanban,
    Link2,
    ListTodo,
    NotebookPen,
    Trash2,
    Users,
} from 'lucide-react';
import type {
    EntityLinkRecord,
    EntityType,
    RecordSummary,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { targetFromRecord } from '@/lib/navigation';
import { friendlyError } from '@/lib/utils';

const entityIcon: Record<EntityType, typeof FolderKanban> = {
    project: FolderKanban,
    note: NotebookPen,
    task: ListTodo,
    document: FileText,
    contact: Users,
};

interface LinkConnectionsSectionProps {
    entityType: EntityType;
    entityId: string;
    headingLevel: 'h3' | 'h4';
    links: EntityLinkRecord[];
    summaries: Record<string, RecordSummary>;
    busy: boolean;
    onBusyChange: (busy: boolean) => void;
    onNavigate?: ((target: WorkspaceNavigationTarget) => void) | undefined;
    onRefresh: () => Promise<void>;
    onError: (message: string) => void;
}

export function LinkConnectionsSection({
    entityType,
    entityId,
    headingLevel: SectionHeading,
    links,
    summaries,
    busy,
    onBusyChange,
    onNavigate,
    onRefresh,
    onError,
}: LinkConnectionsSectionProps) {
    const [targetType, setTargetType] = useState<EntityType>(entityType === 'note' ? 'task' : 'note');
    const [targetId, setTargetId] = useState('');
    const [relation, setRelation] = useState('related');
    const [showLinkForm, setShowLinkForm] = useState(false);

    async function addLink() {
        if (!targetId) return;
        onBusyChange(true);
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
            await onRefresh();
        } catch (caught) {
            onError(friendlyError(caught, 'Link could not be created.'));
        } finally {
            onBusyChange(false);
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
                                        void window.devLedger.operations.removeLink(link.id).then(onRefresh)
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
        <section className="space-y-3 border-t border-border/70 pt-3.5">
            <div className="flex items-center justify-between">
                <SectionHeading className="text-xs font-semibold text-foreground">
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
    );
}
