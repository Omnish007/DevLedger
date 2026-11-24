import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { parseSmartDate, type SmartDateResult } from '@domain/smart-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function SmartDateInsert({ onInsert }: { onInsert: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const preview = useMemo((): { parsed: SmartDateResult | null; error: string } => {
    if (!value.trim()) return { parsed: null, error: '' };
    try { return { parsed: parseSmartDate(value), error: '' }; }
    catch (caught) { return { parsed: null, error: caught instanceof Error ? caught.message : 'Invalid date reference.' }; }
  }, [value]);

  function insert() {
    if (!preview.parsed) return;
    onInsert(value.trim());
    setValue('');
    setOpen(false);
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px]" aria-label="Insert smart date"><CalendarClock className="mr-1 size-3.5"/>Date</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-80">
      <div className="space-y-3">
        <div><p className="text-sm font-medium">Insert a date reference</p><p className="mt-1 text-xs text-muted-foreground">Try Friday, tomorrow, 18/12/2026 or @0102261325.</p></div>
        <div className="space-y-1.5"><Label htmlFor="note-smart-date">Date or date-time</Label><Input id="note-smart-date" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Friday or dd/mm/yyyy" autoFocus/></div>
        {preview.error && <p role="alert" className="text-xs text-destructive">{preview.error}</p>}
        {preview.parsed && <div className="rounded-md border border-border bg-muted/40 p-2 text-xs"><p className="font-medium">{new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(`${preview.parsed.date}T12:00:00`))}</p>{preview.parsed.kind === 'datetime' && <p className="mt-1 text-muted-foreground">{preview.parsed.time} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>}</div>}
        <Button type="button" size="sm" className="w-full" disabled={!preview.parsed} onClick={insert}>Insert reference</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
