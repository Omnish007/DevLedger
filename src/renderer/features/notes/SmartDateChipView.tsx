import { useMemo, useState } from 'react';
import { BellRing, CalendarDays } from 'lucide-react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { formatNotionDateLabel, SMART_TIME_PRESETS, type SmartDateDisplayFormat } from '@domain/smart-date';
import type { SmartDateReference } from '@domain/smart-date-markdown';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { friendlyError } from '@/lib/utils';
import {
  buildDateAttrsFromSelection,
  computeReminderDueIso,
  isoDateToLocalDate,
  parseIntoDateAttrs,
  toDateString,
} from './smart-date-ui-helpers';

export interface SmartDateNodeOptions {
  onReminderSync?: ((attrs: SmartDateReference, dueAtIso: string | null) => Promise<string | null>) | undefined;
}

export function SmartDateChipView({ node, updateAttributes, extension, selected }: ReactNodeViewProps) {
  const date = String(node.attrs['date'] ?? '');
  const endDate = node.attrs['endDate'] ? String(node.attrs['endDate']) : null;
  const time = node.attrs['time'] ? String(node.attrs['time']) : null;
  const format = (node.attrs['format'] as SmartDateDisplayFormat | undefined) ?? 'relative';
  const isReminder = Boolean(node.attrs['isReminder']);
  const reminderId = node.attrs['reminderId'] ? String(node.attrs['reminderId']) : null;
  const hasTime = Boolean(time);
  const options = extension.options as SmartDateNodeOptions;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const [rangeEnabled, setRangeEnabled] = useState(() => Boolean(endDate));
  const [displayMonth, setDisplayMonth] = useState<Date>(() => isoDateToLocalDate(date) ?? new Date());
  const [remindOffset, setRemindOffset] = useState<'none' | '0' | '15' | '60' | '1440'>(() => (isReminder ? '0' : 'none'));

  const displayLabel = useMemo(
    () => (date ? formatNotionDateLabel({ date, time, endDate, format }) : String(node.attrs['source'] ?? 'Date')),
    [date, time, endDate, format, node.attrs],
  );

  function commitAttrs(next: SmartDateReference) {
    updateAttributes(next);
  }

  async function applyDraft() {
    if (!draft.trim()) return;
    try {
      const next = parseIntoDateAttrs(draft, { format, endDate: rangeEnabled ? endDate : null, forceReminder: isReminder || undefined, reminderId });
      commitAttrs(next);
      setDisplayMonth(isoDateToLocalDate(next.date) ?? displayMonth);
      if (next.isReminder) {
        setRemindOffset('0');
        if (options.onReminderSync) {
          const nextId = await options.onReminderSync(next, next.isoUtc ?? computeReminderDueIso(next.date, next.time));
          updateAttributes({ ...next, reminderId: nextId });
        }
      }
      setDraft('');
      setDraftError('');
    } catch (caught) {
      setDraftError(caught instanceof Error ? caught.message : 'Unsupported Notion date expression.');
    }
  }

  async function handleReminderChange(nextValue: typeof remindOffset) {
    setRemindOffset(nextValue);
    const active = nextValue !== 'none';
    const nextAttrs = buildDateAttrsFromSelection({ date, endDate, time, format, isReminder: active, reminderId });
    commitAttrs(nextAttrs);
    if (!options.onReminderSync) return;
    try {
      const dueAtIso = active ? computeReminderDueIso(date, time, Number(nextValue)) : null;
      const nextId = await options.onReminderSync(nextAttrs, dueAtIso);
      updateAttributes({ ...nextAttrs, reminderId: nextId });
    } catch (caught) {
      setDraftError(friendlyError(caught, 'Reminder could not be updated.'));
    }
  }

  const startObj = isoDateToLocalDate(date);
  const endObj = isoDateToLocalDate(endDate);

  return (
    <NodeViewWrapper as="span" className="inline-block align-baseline">
      <Popover open={open} onOpenChange={(next) => {
        setOpen(next);
        setDraftError('');
        if (next) {
          setRangeEnabled(Boolean(endDate));
          setDisplayMonth(isoDateToLocalDate(date) ?? new Date());
          setRemindOffset(isReminder ? (remindOffset === 'none' ? '0' : remindOffset) : 'none');
        }
      }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-type="smart-date"
            data-reminder={isReminder ? '1' : '0'}
            className={`smart-date-pill ${isReminder ? 'is-reminder' : ''} ${selected ? 'is-selected' : ''}`}
            title={isReminder ? 'Reminder · Click to reschedule or edit' : 'Date reference · Click to edit date, range, format or reminder'}
          >
            {isReminder ? <BellRing className="smart-date-icon size-3.5 shrink-0" /> : <CalendarDays className="smart-date-icon size-3.5 shrink-0" />}
            <span>@{displayLabel}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[336px] p-3" onOpenAutoFocus={(event) => event.preventDefault()}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-medium">
                {isReminder ? <BellRing className="size-3.5 shrink-0 text-warning" /> : <CalendarDays className="size-3.5 shrink-0 text-primary" />}
                <span className="truncate">{formatNotionDateLabel({ date, time, endDate, format: 'full' })}</span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{isReminder ? 'Reminder' : 'Date'}</span>
            </div>

            <div className="flex gap-1.5">
              <Input
                value={draft}
                onChange={(event) => { setDraft(event.target.value); setDraftError(''); }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void applyDraft(); } }}
                placeholder="Type @May 15, @last fri, @remind 9am…"
                className="h-8 text-xs"
              />
              <Button type="button" size="sm" variant="secondary" className="h-8 shrink-0 text-xs" disabled={!draft.trim()} onClick={() => void applyDraft()}>Apply</Button>
            </div>
            {draftError && <p role="alert" className="text-[11px] text-danger">{draftError}</p>}

            <div className="rounded-md border border-border p-1">
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
                    const nextEnd = rawEnd && rawEnd !== nextStart ? rawEnd : null;
                    setDisplayMonth(range.to ?? range.from);
                    commitAttrs(buildDateAttrsFromSelection({ date: nextStart, endDate: nextEnd, time, format, isReminder, reminderId }));
                  }}
                  className="mx-auto [--cell-size:2.05rem]"
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
                    commitAttrs(buildDateAttrsFromSelection({ date: toDateString(picked), endDate: null, time, format, isReminder, reminderId }));
                  }}
                  className="mx-auto [--cell-size:2.05rem]"
                />
              )}
            </div>

            <div className="space-y-2 border-t border-border pt-2.5 text-xs">
              <div className="flex items-center justify-between">
                <Label htmlFor={`range-${date}`} className="text-xs font-normal">End date range</Label>
                <Switch
                  id={`range-${date}`}
                  size="sm"
                  checked={rangeEnabled}
                  onCheckedChange={(checked) => {
                    setRangeEnabled(checked);
                    if (!checked) {
                      commitAttrs(buildDateAttrsFromSelection({ date, endDate: null, time, format, isReminder, reminderId }));
                      return;
                    }
                    const fallbackEnd = startObj ? toDateString(new Date(startObj.getFullYear(), startObj.getMonth(), startObj.getDate() + 1, 12)) : date;
                    commitAttrs(buildDateAttrsFromSelection({ date, endDate: endDate ?? fallbackEnd, time, format, isReminder, reminderId }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`time-${date}`} className="text-xs font-normal">Include time</Label>
                  <div className="flex items-center gap-2">
                    {hasTime && (
                      <Input
                        type="time"
                        value={time ?? '09:00'}
                        onChange={(event) => commitAttrs(buildDateAttrsFromSelection({ date, endDate, time: event.target.value, format, isReminder, reminderId }))}
                        className="h-7 w-24 text-xs"
                      />
                    )}
                    <Switch
                      id={`time-${date}`}
                      size="sm"
                      checked={hasTime}
                      onCheckedChange={(checked) => commitAttrs(buildDateAttrsFromSelection({ date, endDate, time: checked ? (time ?? '09:00') : null, format, isReminder, reminderId }))}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {SMART_TIME_PRESETS.map((presetTime) => (
                    <Button key={presetTime} type="button" size="sm" variant={time === presetTime ? 'secondary' : 'outline'} className="h-6 px-2 text-[11px] tabular-nums" onClick={() => commitAttrs(buildDateAttrsFromSelection({ date, endDate, time: presetTime, format, isReminder, reminderId }))}>
                      {presetTime}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <label className="space-y-1 text-[11px] text-muted-foreground">
                  <span>Date format</span>
                  <NativeSelect value={format} onChange={(event) => commitAttrs(buildDateAttrsFromSelection({ date, endDate, time, format: event.target.value as SmartDateDisplayFormat, isReminder, reminderId }))} className="h-8 w-full text-xs">
                    <NativeSelectOption value="relative">Relative</NativeSelectOption>
                    <NativeSelectOption value="full">Full date</NativeSelectOption>
                    <NativeSelectOption value="short">DD/MM/YYYY</NativeSelectOption>
                    <NativeSelectOption value="iso">YYYY-MM-DD</NativeSelectOption>
                  </NativeSelect>
                </label>
                <label className="space-y-1 text-[11px] text-muted-foreground">
                  <span>Remind</span>
                  <NativeSelect value={isReminder ? remindOffset : 'none'} onChange={(event) => void handleReminderChange(event.target.value as typeof remindOffset)} className="h-8 w-full text-xs">
                    <NativeSelectOption value="none">Off</NativeSelectOption>
                    <NativeSelectOption value="0">{time ? 'At time of event' : 'On day (9:00 AM)'}</NativeSelectOption>
                    <NativeSelectOption value="15">15 min before</NativeSelectOption>
                    <NativeSelectOption value="60">1 hour before</NativeSelectOption>
                    <NativeSelectOption value="1440">1 day before</NativeSelectOption>
                  </NativeSelect>
                </label>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}
