import { useMemo, useState } from 'react';
import { BellRing, CalendarClock, CalendarDays } from 'lucide-react';
import { formatNotionDateLabel, getSmartDatePresets, parseSmartDate, SMART_TIME_PRESETS, type SmartDateDisplayFormat } from '@domain/smart-date';
import type { SmartDateReference } from '@domain/smart-date-markdown';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
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
        const resolved = buildDateAttrsFromSelection({
          date: parsed.date,
          endDate: rangeMode ? endDate : null,
          time: parsed.kind === 'datetime' ? parsed.time : (includeTime ? time : null),
          format,
          isReminder: remind || Boolean(parsed.isReminder),
        });
        return { parsed: resolved, error: '' };
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
      <PopoverContent align="end" className="w-[344px] p-3">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold">Insert Notion date or reminder</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Type <code className="rounded bg-muted px-1">@</code> anywhere in a note, or pick below.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.slice(0, 5).map((preset) => (
              <Button key={preset.id} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => commitReference(parseIntoDateAttrs(preset.token, { format, forceReminder: remind || preset.result.isReminder }))}>
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="rounded-md border border-border p-1">
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
                  const toIso = rawTo && rawTo !== fromIso ? rawTo : null;
                  setValue('');
                  setPickedDate(fromIso);
                  setEndDate(toIso);
                  setDisplayMonth(range.to ?? range.from);
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
                selected={preview.parsed ? isoDateToLocalDate(preview.parsed.date) : undefined}
                onSelect={(picked) => {
                  if (!picked) return;
                  const iso = toDateString(picked);
                  setValue('');
                  setPickedDate(iso);
                  setEndDate(null);
                  setDisplayMonth(picked);
                }}
                className="mx-auto [--cell-size:2.05rem]"
              />
            )}
          </div>
          <div className="space-y-2 border-t border-border pt-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2"><Switch size="sm" checked={rangeMode} onCheckedChange={(checked) => { setRangeMode(checked); if (!checked) setEndDate(null); }} /><span>Range</span></label>
              <label className="flex items-center gap-2"><Switch size="sm" checked={remind} onCheckedChange={setRemind} /><span>Remind me</span></label>
              <NativeSelect aria-label="Default format" value={format} onChange={(event) => setFormat(event.target.value as SmartDateDisplayFormat)} className="h-7 w-24 text-xs">
                <NativeSelectOption value="relative">Relative</NativeSelectOption>
                <NativeSelectOption value="full">Full</NativeSelectOption>
                <NativeSelectOption value="short">Short</NativeSelectOption>
                <NativeSelectOption value="iso">ISO</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2"><Switch size="sm" checked={includeTime} onCheckedChange={(checked) => { setIncludeTime(checked); if (checked && !pickedDate && !value.trim()) setPickedDate(toDateString(new Date())); }} /><span>Include time</span></label>
                {includeTime && <Input type="time" value={time} onChange={(event) => { setTime(event.target.value); if (!pickedDate && !value.trim()) setPickedDate(toDateString(new Date())); }} className="h-7 w-24 text-xs" />}
              </div>
              <div className="flex flex-wrap gap-1">
                {SMART_TIME_PRESETS.map((presetTime) => (
                  <Button key={presetTime} type="button" size="sm" variant={includeTime && time === presetTime ? 'secondary' : 'outline'} className="h-6 px-2 text-[11px] tabular-nums" onClick={() => { setIncludeTime(true); setTime(presetTime); if (!pickedDate && !value.trim()) setPickedDate(toDateString(new Date())); }}>
                    {presetTime}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-smart-date" className="text-xs">Or type @May 15, @last friday, @remind tomorrow 9am</Label>
            <div className="flex gap-1.5">
              <Input
                id="note-smart-date"
                value={value}
                onChange={(event) => {
                  const next = event.target.value;
                  setValue(next);
                  try { const p = parseSmartDate(next); setDisplayMonth(isoDateToLocalDate(p.date) ?? displayMonth); } catch { /* partial expression */ }
                }}
                onKeyDown={(event) => { if (event.key === 'Enter' && preview.parsed) { event.preventDefault(); commitReference(preview.parsed); } }}
                placeholder="@May 15, @in 2 weeks, @friday 3pm"
                className="h-8 text-xs"
              />
              <Button type="button" size="sm" className="h-8 shrink-0" disabled={!preview.parsed} onClick={() => preview.parsed && commitReference(preview.parsed)}>
                {remind || preview.parsed?.isReminder ? 'Set reminder' : 'Insert'}
              </Button>
            </div>
          </div>
          {preview.error && <p role="alert" className="text-xs text-danger">{preview.error}</p>}
          {preview.parsed && (
            <div className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs ${preview.parsed.isReminder ? 'border-warning/40 bg-warning/10 text-foreground' : 'border-border bg-muted/40'}`}>
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
