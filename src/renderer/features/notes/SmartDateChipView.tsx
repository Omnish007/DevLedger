import { useEffect, useRef, useState } from 'react';
import { BellRing, CalendarDays, Trash2 } from 'lucide-react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { formatNotionDateLabel, getSmartDatePresets, type SmartDateDisplayFormat } from '@domain/smart-date';
import type { SmartDateReference } from '@domain/smart-date-markdown';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { friendlyError } from '@/lib/utils';
import { SmartDateOptionsFooter, type RemindOffset } from './SmartDateOptionsFooter';
import { SmartDateRangeSummary } from './SmartDateRangeSummary';
import {
    buildDateAttrsFromSelection,
    computeReminderDueIso,
    consumePendingDatePicker,
    extractReminderContextText,
    getReminderUrgency,
    isoDateToLocalDate,
    parseIntoDateAttrs,
    toDateString,
} from './smart-date-ui-helpers';

export interface SmartDateNodeOptions {
    onReminderSync?:
        | ((attrs: SmartDateReference, dueAtIso: string | null, noteText?: string) => Promise<string | null>)
        | undefined;
    onReminderError?: ((error: unknown) => void) | undefined;
}

export function SmartDateChipView({
    node,
    editor,
    getPos,
    updateAttributes,
    deleteNode,
    extension,
    selected,
}: ReactNodeViewProps) {
    const date = String(node.attrs['date'] ?? '');
    const endDate = node.attrs['endDate'] ? String(node.attrs['endDate']) : null;
    const time = node.attrs['time'] ? String(node.attrs['time']) : null;
    const format = (node.attrs['format'] as SmartDateDisplayFormat | undefined) ?? 'relative';
    const isReminder = Boolean(node.attrs['isReminder']);
    const reminderId = node.attrs['reminderId'] ? String(node.attrs['reminderId']) : null;
    const options = extension.options as SmartDateNodeOptions;

    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [draftError, setDraftError] = useState('');
    const [rangeEnabled, setRangeEnabled] = useState(() => Boolean(endDate));
    const [displayMonth, setDisplayMonth] = useState<Date>(() => isoDateToLocalDate(date) ?? new Date());
    const [remindOffset, setRemindOffset] = useState<RemindOffset>(() => (isReminder ? '0' : 'none'));
    const activeReminderIdRef = useRef<string | null>(reminderId);
    const prevReminderIdPropRef = useRef<string | null>(reminderId);
    if (reminderId !== prevReminderIdPropRef.current) {
        prevReminderIdPropRef.current = reminderId;
        activeReminderIdRef.current = reminderId;
    }
    const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
    const presets = getSmartDatePresets().slice(0, 4);

    useEffect(() => {
        if (!consumePendingDatePicker(date, time, isReminder)) return;
        setRangeEnabled(Boolean(endDate));
        setDisplayMonth(isoDateToLocalDate(date) ?? new Date());
        setRemindOffset(isReminder ? '0' : 'none');
        setOpen(true);
    }, [date, endDate, time, isReminder]);

    const urgency = isReminder ? getReminderUrgency(date, time) : null;
    const displayLabel = date
        ? formatNotionDateLabel({ date, time, endDate, format })
        : String(node.attrs['source'] ?? 'Date');

    function currentReminderId(): string | null {
        return activeReminderIdRef.current ?? reminderId;
    }

    function syncAndCommit(nextAttrs: SmartDateReference, offset = remindOffset): Promise<void> {
        updateAttributes(nextAttrs);
        if (!options.onReminderSync) return Promise.resolve();
        const runSync = syncQueueRef.current.then(async () => {
            const currentId = nextAttrs.reminderId ?? currentReminderId();
            const syncedAttrs = { ...nextAttrs, reminderId: currentId };
            if (!syncedAttrs.isReminder) {
                if (currentId) {
                    await options.onReminderSync!(syncedAttrs, null).catch(() => undefined);
                    activeReminderIdRef.current = null;
                    updateAttributes({ reminderId: null });
                }
                return;
            }
            try {
                const dueAtIso = computeReminderDueIso(
                    syncedAttrs.date,
                    syncedAttrs.time,
                    offset === 'none' ? 0 : Number(offset),
                );
                const noteText = extractReminderContextText(
                    editor,
                    typeof getPos === 'function' ? getPos() : undefined,
                );
                const nextId = await options.onReminderSync!(syncedAttrs, dueAtIso, noteText);
                activeReminderIdRef.current = nextId;
                updateAttributes({ reminderId: nextId });
                setDraftError('');
            } catch (caught) {
                setDraftError(friendlyError(caught, 'Reminder could not be updated.'));
                options.onReminderError?.(caught);
            }
        });
        syncQueueRef.current = runSync.catch(() => undefined);
        return runSync;
    }

    async function applyDraft() {
        if (!draft.trim()) return;
        try {
            const next = parseIntoDateAttrs(draft, {
                format,
                endDate: rangeEnabled ? endDate : null,
                forceReminder: isReminder || undefined,
                reminderId: currentReminderId(),
            });
            setDisplayMonth(isoDateToLocalDate(next.date) ?? displayMonth);
            if (next.isReminder) setRemindOffset('0');
            await syncAndCommit(next, '0');
            setDraft('');
            setDraftError('');
        } catch (caught) {
            setDraftError(caught instanceof Error ? caught.message : 'Unsupported Notion date expression.');
        }
    }

    async function handleRemove() {
        const snapshotAttrs: SmartDateReference = {
            date,
            time,
            isoUtc: node.attrs['isoUtc'] ? String(node.attrs['isoUtc']) : null,
            timezone: String(node.attrs['timezone'] ?? ''),
            source: displayLabel,
            endDate,
            format,
            isReminder,
            reminderId: currentReminderId(),
        };
        setOpen(false);
        deleteNode();
        if (!options.onReminderSync) return;
        const removeTask = syncQueueRef.current.then(async () => {
            const latestId = currentReminderId();
            if (!latestId) return;
            await options.onReminderSync!({ ...snapshotAttrs, reminderId: latestId }, null).catch(
                () => undefined,
            );
            activeReminderIdRef.current = null;
        });
        syncQueueRef.current = removeTask.catch(() => undefined);
        await removeTask;
    }

    const startObj = isoDateToLocalDate(date);
    const endObj = isoDateToLocalDate(endDate);

    return (
        <NodeViewWrapper as="span" className="inline-block align-baseline">
            <Popover
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    setDraftError('');
                    if (next) {
                        setRangeEnabled(Boolean(endDate));
                        setDisplayMonth(isoDateToLocalDate(date) ?? new Date());
                        setRemindOffset(isReminder ? (remindOffset === 'none' ? '0' : remindOffset) : 'none');
                    }
                }}
            >
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        data-type="smart-date"
                        data-reminder={isReminder ? '1' : '0'}
                        data-urgency={urgency ?? undefined}
                        className={`smart-date-pill ${isReminder ? 'is-reminder' : ''} ${selected ? 'is-selected' : ''}`}
                        title={
                            isReminder
                                ? urgency === 'overdue'
                                    ? 'Overdue reminder · Click to reschedule'
                                    : 'Reminder · Click to reschedule or edit'
                                : 'Date reference · Click to edit'
                        }
                    >
                        {isReminder ? (
                            <BellRing className="smart-date-icon size-3.5 shrink-0" />
                        ) : (
                            <CalendarDays className="smart-date-icon size-3.5 shrink-0" />
                        )}
                        <span>@{displayLabel}</span>
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    className="w-[356px] max-h-[min(calc(var(--radix-popover-content-available-height)-8px),84vh)] overflow-y-auto bg-popover p-3"
                >
                    <div className="space-y-2">
                        <div
                            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                                isReminder
                                    ? urgency === 'overdue'
                                        ? 'border-danger/22 bg-danger/10 text-danger'
                                        : 'border-warning/22 bg-warning/12 text-warning'
                                    : 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                            }`}
                        >
                            <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-medium">
                                {isReminder ? (
                                    <BellRing className="size-3.5 shrink-0" />
                                ) : (
                                    <CalendarDays className="size-3.5 shrink-0" />
                                )}
                                <span className="truncate">
                                    {formatNotionDateLabel({ date, time, endDate, format: 'full' })}
                                </span>
                            </span>
                            <div className="flex shrink-0 items-center gap-1.5">
                                <span className="rounded bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold">
                                    {isReminder ? (urgency === 'overdue' ? 'Overdue' : 'Reminder') : 'Date'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => void handleRemove()}
                                    title="Remove date chip"
                                    aria-label="Remove date"
                                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-danger/15 hover:text-danger"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-1.5">
                            <Input
                                value={draft}
                                onChange={(e) => {
                                    setDraft(e.target.value);
                                    setDraftError('');
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void applyDraft();
                                    }
                                }}
                                placeholder="@t, @tom 3pm, @May 15, @r fri 9am…"
                                className="h-8 text-xs"
                            />
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8 shrink-0 text-xs"
                                disabled={!draft.trim()}
                                onClick={() => void applyDraft()}
                            >
                                Apply
                            </Button>
                        </div>
                        {draftError && (
                            <p role="alert" className="text-[11px] text-danger">
                                {draftError}
                            </p>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                            {presets.map((preset) => (
                                <Button
                                    key={preset.id}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[11px]"
                                    onClick={() => {
                                        const currentId = currentReminderId();
                                        const parsed = parseIntoDateAttrs(preset.token, {
                                            format,
                                            endDate: rangeEnabled ? endDate : null,
                                            forceReminder: isReminder || undefined,
                                            reminderId: currentId,
                                        });
                                        const next =
                                            parsed.time == null && time
                                                ? buildDateAttrsFromSelection({
                                                      date: parsed.date,
                                                      endDate: parsed.endDate ?? null,
                                                      time,
                                                      format,
                                                      isReminder: Boolean(parsed.isReminder),
                                                      reminderId: currentId,
                                                  })
                                                : parsed;
                                        setDisplayMonth(isoDateToLocalDate(next.date) ?? displayMonth);
                                        void syncAndCommit(
                                            next,
                                            remindOffset === 'none' ? '0' : remindOffset,
                                        );
                                    }}
                                >
                                    {preset.label}
                                </Button>
                            ))}
                        </div>

                        {rangeEnabled && (
                            <SmartDateRangeSummary
                                startDate={date}
                                endDate={endDate}
                                emptyStartLabel="Pick date"
                                emptyEndLabel="Pick date"
                            />
                        )}

                        <div className="rounded-xl border border-border/75 bg-card/70 p-0.5">
                            {rangeEnabled ? (
                                <Calendar
                                    mode="range"
                                    resetOnSelect
                                    captionLayout="dropdown"
                                    startMonth={new Date(2000, 0)}
                                    endMonth={new Date(2040, 11)}
                                    month={displayMonth}
                                    onMonthChange={setDisplayMonth}
                                    selected={startObj ? { from: startObj, to: endObj } : undefined}
                                    onSelect={(range) => {
                                        if (!range?.from) return;
                                        const nextStart = toDateString(range.from);
                                        const rawEnd = range.to ? toDateString(range.to) : null;
                                        setDisplayMonth(range.to ?? range.from);
                                        void syncAndCommit(
                                            buildDateAttrsFromSelection({
                                                date: nextStart,
                                                endDate: rawEnd && rawEnd !== nextStart ? rawEnd : null,
                                                time,
                                                format,
                                                isReminder,
                                                reminderId: currentReminderId(),
                                            }),
                                        );
                                    }}
                                    className="mx-auto p-2 [--cell-size:2.1rem]"
                                />
                            ) : (
                                <Calendar
                                    mode="single"
                                    captionLayout="dropdown"
                                    startMonth={new Date(2000, 0)}
                                    endMonth={new Date(2040, 11)}
                                    month={displayMonth}
                                    onMonthChange={setDisplayMonth}
                                    selected={startObj}
                                    onSelect={(picked) => {
                                        if (!picked) return;
                                        setDisplayMonth(picked);
                                        void syncAndCommit(
                                            buildDateAttrsFromSelection({
                                                date: toDateString(picked),
                                                endDate: null,
                                                time,
                                                format,
                                                isReminder,
                                                reminderId: currentReminderId(),
                                            }),
                                        );
                                    }}
                                    className="mx-auto p-2 [--cell-size:2.1rem]"
                                />
                            )}
                        </div>

                        <SmartDateOptionsFooter
                            idPrefix={`chip-${date}`}
                            rangeEnabled={rangeEnabled}
                            onRangeChange={(checked) => {
                                setRangeEnabled(checked);
                                const fallbackEnd = startObj
                                    ? toDateString(
                                          new Date(
                                              startObj.getFullYear(),
                                              startObj.getMonth(),
                                              startObj.getDate() + 1,
                                              12,
                                          ),
                                      )
                                    : date;
                                updateAttributes(
                                    buildDateAttrsFromSelection({
                                        date,
                                        endDate: checked ? (endDate ?? fallbackEnd) : null,
                                        time,
                                        format,
                                        isReminder,
                                        reminderId: currentReminderId(),
                                    }),
                                );
                            }}
                            hasTime={Boolean(time)}
                            time={time}
                            onTimeToggle={(checked) =>
                                void syncAndCommit(
                                    buildDateAttrsFromSelection({
                                        date,
                                        endDate,
                                        time: checked ? (time ?? '09:00') : null,
                                        format,
                                        isReminder,
                                        reminderId: currentReminderId(),
                                    }),
                                )
                            }
                            onTimeChange={(nextTime) =>
                                void syncAndCommit(
                                    buildDateAttrsFromSelection({
                                        date,
                                        endDate,
                                        time: nextTime,
                                        format,
                                        isReminder,
                                        reminderId: currentReminderId(),
                                    }),
                                )
                            }
                            format={format}
                            onFormatChange={(nextFormat) =>
                                updateAttributes(
                                    buildDateAttrsFromSelection({
                                        date,
                                        endDate,
                                        time,
                                        format: nextFormat,
                                        isReminder,
                                        reminderId: currentReminderId(),
                                    }),
                                )
                            }
                            remindMode="select"
                            remindOffset={isReminder ? remindOffset : 'none'}
                            onRemindOffsetChange={(nextOffset) => {
                                setRemindOffset(nextOffset);
                                void syncAndCommit(
                                    buildDateAttrsFromSelection({
                                        date,
                                        endDate,
                                        time,
                                        format,
                                        isReminder: nextOffset !== 'none',
                                        reminderId: currentReminderId(),
                                    }),
                                    nextOffset,
                                );
                            }}
                        />
                    </div>
                </PopoverContent>
            </Popover>
        </NodeViewWrapper>
    );
}
