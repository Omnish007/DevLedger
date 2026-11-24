import { useId, useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { parseSmartDate, type SmartDateResult } from '@domain/smart-date';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface SmartDateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  defaultTimeLabel?: string;
}

export function SmartDateField({
  label,
  value,
  onChange,
  placeholder = 'Tomorrow, Friday, 18/12/2026 or @DDMMYYHHmm',
  required = false,
  helpText,
  defaultTimeLabel = '09:00 local time',
}: SmartDateFieldProps) {
  const id = useId();
  const parsed = useMemo((): { result: SmartDateResult | null; error: string } => {
    if (!value.trim()) return { result: null, error: '' };
    try { return { result: parseSmartDate(value), error: '' }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : 'Enter a supported date.' }; }
  }, [value]);
  const dateLabel = parsed.result
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(`${parsed.result.date}T12:00:00`))
    : '';
  const timeLabel = parsed.result?.kind === 'datetime'
    ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(parsed.result.isoUtc))
    : parsed.result ? defaultTimeLabel : '';

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <CalendarClock className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} aria-invalid={Boolean(parsed.error)} aria-describedby={`${id}-help ${id}-preview`} className="pl-8" />
      </div>
      <p id={`${id}-help`} className="text-[10px] text-muted-foreground">{helpText ?? 'Use a written date or @DDMMYYHHmm. Date-only reminders are scheduled at 09:00 local time.'}</p>
      {parsed.error && <p id={`${id}-preview`} role="alert" className="text-[11px] text-destructive">{parsed.error}</p>}
      {parsed.result && !parsed.error && <p id={`${id}-preview`} className="text-[11px] text-foreground"><span className="font-medium">{dateLabel}</span><span className="text-muted-foreground"> · {timeLabel} · {parsed.result.kind === 'date' ? 'date-only' : 'exact local date-time converted to UTC'}</span></p>}
    </div>
  );
}
