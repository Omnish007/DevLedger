import { useEffect, useState } from 'react';
import { CircleAlert, ShieldCheck, UserRound } from 'lucide-react';
import type { TaskBlockerRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { resolveSmartDateInstant } from '@domain/smart-date-resolution';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SmartDateField } from '@/components/shared/SmartDateField';
import { formatDate, friendlyError } from '@/lib/utils';

interface TaskBlockerSectionProps {
    taskId: string;
    blockers: TaskBlockerRecord[];
    onUpdated: () => Promise<void>;
    onError: (message: string) => void;
    onNavigate?: ((target: WorkspaceNavigationTarget) => void) | undefined;
}

export function TaskBlockerSection({
    taskId,
    blockers,
    onUpdated,
    onError,
    onNavigate,
}: TaskBlockerSectionProps) {
    const [adding, setAdding] = useState(false);
    const [reason, setReason] = useState('');
    const [waitingContactId, setWaitingContactId] = useState('');
    const [followUpAt, setFollowUpAt] = useState('');
    const [busy, setBusy] = useState(false);
    const [waitingContactName, setWaitingContactName] = useState<string | null>(null);

    const openBlocker = blockers.find((item) => !item.resolvedAt) ?? null;

    useEffect(() => {
        const contactId = openBlocker?.waitingContactId;
        if (!contactId) {
            setWaitingContactName(null);
            return;
        }
        let active = true;
        void window.devLedger.operations
            .resolveRecordSummaries([{ type: 'contact', id: contactId }])
            .then((resolved) => {
                if (active) setWaitingContactName(resolved[`contact:${contactId}`]?.title ?? null);
            })
            .catch(() => {
                if (active) setWaitingContactName(null);
            });
        return () => {
            active = false;
        };
    }, [openBlocker?.waitingContactId]);

    async function submitBlocker(event: React.FormEvent) {
        event.preventDefault();
        if (!reason.trim()) return;
        setBusy(true);
        try {
            const followUpIso = followUpAt.trim() ? resolveSmartDateInstant(followUpAt).isoUtc : null;
            await window.devLedger.operations.createBlocker(
                taskId,
                reason.trim(),
                waitingContactId || null,
                followUpIso,
            );
            setReason('');
            setWaitingContactId('');
            setFollowUpAt('');
            setAdding(false);
            await onUpdated();
        } catch (caught) {
            onError(friendlyError(caught, 'Blocker could not be recorded.'));
        } finally {
            setBusy(false);
        }
    }

    async function resolveActive(id: string) {
        setBusy(true);
        try {
            await window.devLedger.operations.resolveBlocker(id, 'Resolved from task inspector.');
            await onUpdated();
        } catch (caught) {
            onError(friendlyError(caught, 'Blocker could not be resolved.'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground">Blocker & waiting status</h3>
                {!openBlocker && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setAdding((v) => !v)}
                    >
                        {adding ? 'Cancel' : 'Mark blocked'}
                    </Button>
                )}
            </div>

            {openBlocker ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-subtle p-3">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                    <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-medium text-warning-foreground">{openBlocker.reason}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-warning-foreground/85">
                            {openBlocker.waitingContactId && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        onNavigate?.({
                                            view: 'contacts',
                                            recordId: openBlocker.waitingContactId!,
                                        })
                                    }
                                    className="inline-flex min-h-6 items-center gap-1 rounded px-1 font-medium underline-offset-2 hover:underline"
                                >
                                    <UserRound className="size-3" />
                                    Waiting on {waitingContactName ?? 'contact'}
                                </button>
                            )}
                            {openBlocker.followUpAt && (
                                <span>· Follow up {formatDate(openBlocker.followUpAt)}</span>
                            )}
                        </div>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 bg-card text-xs"
                        disabled={busy}
                        onClick={() => void resolveActive(openBlocker.id)}
                    >
                        Resolve
                    </Button>
                </div>
            ) : adding ? (
                <form
                    onSubmit={(event) => void submitBlocker(event)}
                    className="space-y-2.5 rounded-md border border-border bg-surface-subtle p-3"
                >
                    <Textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={2}
                        maxLength={4000}
                        placeholder="What is blocking this task?"
                        className="text-xs"
                    />
                    <div className="space-y-1">
                        <span className="text-muted-foreground">Waiting on contact (optional)</span>
                        <RemoteRecordPicker
                            entityType="contact"
                            value={waitingContactId}
                            onValueChange={setWaitingContactId}
                            placeholder="Select contact…"
                        />
                    </div>
                    <SmartDateField
                        label="Follow-up date (optional)"
                        value={followUpAt}
                        onChange={setFollowUpAt}
                    />
                    <Button type="submit" size="sm" className="h-7 w-full" disabled={busy || !reason.trim()}>
                        Save blocker
                    </Button>
                </form>
            ) : (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                    <ShieldCheck className="size-3.5 text-success" />
                    No active blocker.
                </p>
            )}
        </section>
    );
}
