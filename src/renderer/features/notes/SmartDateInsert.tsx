import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { getSmartDatePresets, parseSmartDate, type SmartDateResult } from '@domain/smart-date';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function SmartDateInsert({ onInsert }: { onInsert: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const presets = useMemo(() => getSmartDatePresets(), []);
  const preview = useMemo((): { parsed: SmartDateResult | null; error: string } => {
    if (!value.trim()) return { parsed: null, error: '' };
    try { return { parsed: parseSmartDate(value), error: '' }; }
    catch (caught) { return { parsed: null, error: caught instanceof Error ? caught.message : 'Invalid date reference.' }; }
  }, [value]);

  function insert(rawValue = value) {
    if (!rawValue.trim()) return;
    onInsert(rawValue.trim());
    setValue('');
    setOpen(false);
  }

  function handleCalendarSelect(date?: Date) {
    if (!date) return;
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    insert(`${dd}/${mm}/${yyyy}`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px]" aria-label="Insert smart date">
          <CalendarClock className="mr-1 size-3.5" />Date
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[330px] p-3">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold">Insert date</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Tip: type <code className="rounded bg-muted px-1">@today</code> or <code className="rounded bg-muted px-1">@friday</code> directly in a note.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.slice(0, 4).map((preset) => (
              <Button key={preset.id} type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => insert(preset.token)}>
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="rounded-md border border-border/70 p-1">
            <Calendar
              mode="single"
              selected={preview.parsed ? new Date(`${preview.parsed.date}T12:00:00`) : undefined}
              onSelect={handleCalendarSelect}
              className="mx-auto [--cell-size:2.1rem]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-smart-date" className="text-[11px]">Or type @date / date-time</Label>
            <div className="flex gap-1.5">
              <Input
                id="note-smart-date"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && preview.parsed) { event.preventDefault(); insert(); } }}
                placeholder="@friday, tomorrow 14:30, 18/12/2026"
                className="h-8 text-xs"
              />
              <Button type="button" size="sm" className="h-8 shrink-0" disabled={!preview.parsed} onClick={() => insert()}>
                Insert
              </Button>
            </div>
          </div>
          {preview.error && <p role="alert" className="text-[11px] text-destructive">{preview.error}</p>}
          {preview.parsed && (
            <div className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[11px]">
              <span className="font-medium">{new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(`${preview.parsed.date}T12:00:00`))}</span>
              {preview.parsed.kind === 'datetime' && <span className="text-muted-foreground"> · {preview.parsed.time}</span>}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
