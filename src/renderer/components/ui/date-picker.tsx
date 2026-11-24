import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { isLocalCalendarDateDisabled } from '@domain/local-calendar-date';

type DatePickerProps = { value?: Date; onChange: (value?: Date) => void; placeholder?: string; disabled?: boolean; className?: string; minDate?: Date; maxDate?: Date; };
function DatePicker({ value, onChange, placeholder = 'Pick a date', disabled, className, minDate, maxDate }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const display = value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value) : placeholder;
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" disabled={disabled} className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground', className)}><CalendarDays className="size-4"/>{display}</Button></PopoverTrigger><PopoverContent align="start" className="w-auto p-0"><Calendar mode="single" selected={value} onSelect={(date) => { onChange(date); if (date) setOpen(false); }} disabled={(date) => isLocalCalendarDateDisabled(date, minDate, maxDate)}/></PopoverContent></Popover>;
}
export { DatePicker, type DatePickerProps };
