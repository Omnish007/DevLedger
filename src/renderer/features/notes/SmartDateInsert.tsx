import { useMemo, useState } from 'react';
import { BellRing, CalendarClock, CalendarDays } from 'lucide-react';
import { formatNotionDateLabel, getSmartDatePresets, parseSmartDate, type SmartDateDisplayFormat } from '@domain/smart-date';
import type { SmartDateReference } from '@domain/smart-date-markdown';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SmartDateOptionsFooter } from './SmartDateOptionsFooter';
import { buildDateAttrsFromSelection, isoDateToLocalDate, parseIntoDateAttrs, toDateString } from './smart-date-ui-helpers';

export function SmartDateInsert({ onInsert }: { onInsert: (value: SmartDateReference) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [includeTime, setIncludeTime] = useState(false);
  const [time, setTime] = useState('09:00');
  const [remind, setRemind] = useState(false);
  const [format, setFormat] = useState<SmartDateDisplayFormat>('relative');
  const [endDate, setEndDate] = useState<string | null>(null);
  const [displayMonth, setDisplayMonth] = useState<Date>(() => new Date());
  const presets = useMemo(() => getSmartDatePresets(), []);

  const preview = useMemo((): { parsed: SmartDateReference | null; error: string } => {
    if (value.trim()) {
      try {
        const parsed = parseSmartDate(value);
        return {
          parsed: buildDateAttrsFromSelection({
            date: parsed.date,
            endDate: rangeMode ? endDate : null,
            time: parsed.kind === 'datetime' ? parsed.time : (includeTime ? time : null),
            format,
            isReminder: remind || Boolean(parsed.isReminder),
          }),
          error: '',
        };
      } catch (caught) {
        return { parsed: null, error: caught instanceof Error ? caught.message : 'Invalid date reference.' };
      }
    }
    if (!pickedDate) return { parsed: null, error: '' };
    return {
      parsed: buildDateAttrsFromSelection({
        date: pickedDate,
        endDate: rangeMode ? endDate : null,
        time: includeTime ? time : null,
        format,
        isReminder: remind,
      }),
      error: '',
    };
  }, [value, pickedDate, format, rangeMode, endDate, includeTime, time, remind]);

  function commitReference(reference: SmartDateReference) {
    onInsert(reference);
    setValue('');
    setPickedDate(null);
    setEndDate(null);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setDisplayMonth(isoDateToLocalDate(preview.parsed?.date) ?? new Date()); }}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" aria-label="Insert smart date">
          <CalendarClock className="mr-1.5 size-3.5" />Date
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[328px] max-h-[min(calc(var(--radix-popover-content-available-height)-8px),82vh)] overflow-y-auto p-2.5">
        <div className="space-y-2.5">
          <div className="flex gap-1.5">
            <Input
              aria-label="Date or reminder expression"
              value={value}
              onChange={(event) => {
                const next = event.target.value;
                setValue(next);
                try { const p = parseSmartDate(next); setDisplayMonth(isoDateToLocalDate(p.date) ?? displayMonth); } catch { /* partial expression */ }
              }}
              onKeyDown={(event) => { if (event.key === 'Enter' && preview.parsed) { event.preventDefault(); commitReference(preview.parsed); } }}
              placeholder="@May 15, @friday 3pm, @remind…"
              className="h-8 text-xs"
            />
            <Button type="button" size="sm" className="h-8 shrink-0" disabled={!preview.parsed} onClick={() => preview.parsed && commitReference(preview.parsed)}>
              {remind || preview.parsed?.isReminder ? 'Remind' : 'Insert'}
            </Button>
          </div>
          {preview.error && <p role="alert" className="text-[11px] text-danger">{preview.error}</p>}

          <div className="grid grid-cols-4 gap-1">
            {presets.slice(0, 4).map((preset) => (
              <Button key={preset.id} type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[11px]" onClick={() => commitReference(parseIntoDateAttrs(preset.token, { format, forceReminder: remind || preset.result.isReminder }))}>
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="rounded-lg border border-border/80 bg-surface-subtle/25 p-1">
            {rangeMode ? (
              <Calendar
                mode="range"
                resetOnSelect
                captionLayout="dropdown"
                startMonth={new Date(2000, 0)}
                endMonth={new Date(2040, 11)}
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                selected={preview.parsed ? { from: isoDateToLocalDate(preview.parsed.date), to: isoDateToLocalDate(endDate) } : undefined}
                onSelect={(range) => {
                  if (!range?.from) return;
                  const fromIso = toDateString(range.from);
                  const rawTo = range.to ? toDateString(range.to) : null;
                  setValue(''); setPickedDate(fromIso); setEndDate(rawTo && rawTo !== fromIso ? rawTo : null); setDisplayMonth(range.to ?? range.from);
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
                selected={preview.parsed ? isoDateToLocalDate(preview.parsed.date) : undefined}
                onSelect={(picked) => {
                  if (!picked) return;
                  setValue(''); setPickedDate(toDateString(picked)); setEndDate(null); setDisplayMonth(picked);
                }}
                className="mx-auto p-1 [--cell-size:1.85rem]"
              />
            )}
          </div>

          <SmartDateOptionsFooter
            idPrefix="insert-date"
            rangeEnabled={rangeMode}
            onRangeChange={(checked) => { setRangeMode(checked); if (!checked) setEndDate(null); }}
            hasTime={includeTime}
            time={includeTime ? time : null}
            onTimeToggle={(checked) => { setIncludeTime(checked); if (checked && !pickedDate && !value.trim()) setPickedDate(toDateString(new Date())); }}
            onTimeChange={(nextTime) => { setIncludeTime(true); setTime(nextTime); if (!pickedDate && !value.trim()) setPickedDate(toDateString(new Date())); }}
            format={format}
            onFormatChange={setFormat}
            remindMode="switch"
            remindChecked={remind}
            onRemindCheckedChange={setRemind}
          />

          {preview.parsed && (
            <div className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${preview.parsed.isReminder ? 'border-warning/40 bg-warning/10' : 'border-border/80 bg-muted/40'}`}>
              <span className="inline-flex items-center gap-1.5 font-medium">
                {preview.parsed.isReminder ? <BellRing className="size-3.5 text-warning" /> : <CalendarDays className="size-3.5 text-primary" />}
                {formatNotionDateLabel({ date: preview.parsed.date, time: preview.parsed.time, endDate: preview.parsed.endDate ?? null, format: 'full' })}
              </span>
              {preview.parsed.isReminder && <span className="text-[11px] font-medium text-warning">Reminder</span>}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
