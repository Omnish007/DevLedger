import { useState } from 'react';
import { AlarmClock, Plus } from 'lucide-react';
import type { ReminderRecord } from '@shared/contracts';
import { resolveSmartDateInstant } from '@domain/smart-date-resolution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SmartDateField } from '@/components/shared/SmartDateField';
import { formatDate, friendlyError } from '@/lib/utils';

interface ReminderConnectionsSectionProps {
    entityType: ReminderRecord['entityType'];
    entityId: string;
    headingLevel: 'h3' | 'h4';
    reminders: ReminderRecord[];
    busy: boolean;
    onBusyChange: (busy: boolean) => void;
    onRefresh: () => Promise<void>;
    onError: (message: string) => void;
}

export function ReminderConnectionsSection({
    entityType,
    entityId,
    headingLevel: SectionHeading,
    reminders,
    busy,
    onBusyChange,
    onRefresh,
    onError,
}: ReminderConnectionsSectionProps) {
    const [showReminderForm, setShowReminderForm] = useState(false);
    const [reminderWhen, setReminderWhen] = useState('@tomorrow 9am');
    const [reminderNote, setReminderNote] = useState('');

    async function addReminder(event: React.FormEvent) {
        event.preventDefault();
        onBusyChange(true);
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
            await onRefresh();
        } catch (caught) {
            onError(friendlyError(caught, 'Reminder could not be scheduled.'));
        } finally {
            onBusyChange(false);
        }
    }

    return (
        <section className="space-y-2.5 border-t border-border/70 pt-3.5">
            <div className="flex items-center justify-between">
                <SectionHeading className="text-xs font-semibold text-foreground">Reminders</SectionHeading>
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
                    <SmartDateField label="When" value={reminderWhen} onChange={setReminderWhen} required />
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
                                        .then(onRefresh)
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
                                        .then(onRefresh)
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
    );
}
