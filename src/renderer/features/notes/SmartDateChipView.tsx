import { useMemo, useState } from 'react';
import { BellRing, CalendarDays } from 'lucide-react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { formatNotionDateLabel, type SmartDateDisplayFormat } from '@domain/smart-date';
import type { SmartDateReference } from '@domain/smart-date-markdown';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { friendlyError } from '@/lib/utils';
import { SmartDateOptionsFooter, type RemindOffset } from './SmartDateOptionsFooter';
import {
    buildDateAttrsFromSelection,
    computeReminderDueIso,
    isoDateToLocalDate,
    parseIntoDateAttrs,
    toDateString,
} from './smart-date-ui-helpers';

export interface SmartDateNodeOptions {
    onReminderSync?:
        ((attrs: SmartDateReference, dueAtIso: string | null) => Promise<string | null>) | undefined;
}

export function SmartDateChipView({ node, updateAttributes, extension, selected }: ReactNodeViewProps) {
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

    const displayLabel = useMemo(
        () =>
            date
                ? formatNotionDateLabel({ date, time, endDate, format })
                : String(node.attrs['source'] ?? 'Date'),
        [date, time, endDate, format, node.attrs],
    );

    async function syncAndCommit(nextAttrs: SmartDateReference, offset = remindOffset) {
        updateAttributes(nextAttrs);
        if (!options.onReminderSync) return;
        if (!nextAttrs.isReminder) {
            if (nextAttrs.reminderId) {
                await options.onReminderSync(nextAttrs, null).catch(() => undefined);
                updateAttributes({ ...nextAttrs, reminderId: null });
            }
            return;
        }
        try {
            const dueAtIso = computeReminderDueIso(
                nextAttrs.date,
                nextAttrs.time,
                offset === 'none' ? 0 : Number(offset),
            );
            const nextId = await options.onReminderSync(nextAttrs, dueAtIso);
            updateAttributes({ ...nextAttrs, reminderId: nextId });
        } catch (caught) {
            setDraftError(friendlyError(caught, 'Reminder could not be updated.'));
        }
    }

    async function applyDraft() {
        if (!draft.trim()) return;
        try {
            const next = parseIntoDateAttrs(draft, {
                format,
                endDate: rangeEnabled ? endDate : null,
                forceReminder: isReminder || undefined,
                reminderId,
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
                        className={`smart-date-pill ${isReminder ? 'is-reminder' : ''} ${selected ? 'is-selected' : ''}`}
                        title={
                            isReminder
                                ? 'Reminder · Click to reschedule or edit'
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
                    className="w-[328px] max-h-[min(calc(var(--radix-popover-content-available-height)-8px),82vh)] overflow-y-auto p-2.5"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-subtle/60 px-2.5 py-1.5 text-xs">
                            <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-medium">
                                {isReminder ? (
                                    <BellRing className="size-3.5 shrink-0 text-warning" />
                                ) : (
                                    <CalendarDays className="size-3.5 shrink-0 text-primary" />
                                )}
                                <span className="truncate">
                                    {formatNotionDateLabel({ date, time, endDate, format: 'full' })}
                                </span>
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                                {isReminder ? 'Reminder' : 'Date'}
                            </span>
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
                                placeholder="@May 15, @last fri, @remind 9am…"
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

                        <div className="rounded-lg border border-border/80 bg-surface-subtle/25 p-1">
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
                                                reminderId,
                                            }),
                                        );
                                    }}
                                    className="mx-auto p-1 [--cell-size:1.85rem]"
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
                                                reminderId,
                                            }),
                                        );
                                    }}
                                    className="mx-auto p-1 [--cell-size:1.85rem]"
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
                                        reminderId,
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
                                        reminderId,
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
                                        reminderId,
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
                                        reminderId,
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
                                        reminderId,
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
