import { useCallback, useEffect, useState } from 'react';
import type {
    EntityLinkRecord,
    EntityType,
    RecordSummary,
    ReminderRecord,
    TagRecord,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { TagSelector } from '@/components/shared/TagSelectorPopover';
import { friendlyError } from '@/lib/utils';
import { LinkConnectionsSection } from './LinkConnectionsSection';
import { ReminderConnectionsSection } from './ReminderConnectionsSection';

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

    return (
        <div className="space-y-4 text-xs">
            {error && (
                <p
                    role="alert"
                    className="rounded-lg border border-danger/20 bg-danger-subtle px-3 py-2 text-danger-foreground"
                >
                    {error}
                </p>
            )}

            <section className="space-y-2">
                <SectionHeading className="text-xs font-semibold text-foreground">Tags</SectionHeading>
                <TagSelector
                    entityType={entityType}
                    entityId={entityId}
                    assigned={tags}
                    onChanged={() => void refreshAndNotify()}
                    onError={setError}
                />
            </section>

            {entityType !== 'document' && !hideReminders && (
                <ReminderConnectionsSection
                    entityType={entityType}
                    entityId={entityId}
                    headingLevel={headingLevel}
                    reminders={reminders}
                    busy={busy}
                    onBusyChange={setBusy}
                    onRefresh={refreshAndNotify}
                    onError={setError}
                />
            )}

            <LinkConnectionsSection
                entityType={entityType}
                entityId={entityId}
                headingLevel={headingLevel}
                links={links}
                summaries={summaries}
                busy={busy}
                onBusyChange={setBusy}
                onNavigate={onNavigate}
                onRefresh={refreshAndNotify}
                onError={setError}
            />
        </div>
    );
}
