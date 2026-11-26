import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { isLocalCalendarDateDisabled } from '@domain/local-calendar-date';

type DatePickerProps = {
    value?: Date;
    onChange: (value?: Date) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    minDate?: Date;
    maxDate?: Date;
};
function DatePicker({
    value,
    onChange,
    placeholder = 'Pick a date',
    disabled,
    className,
    minDate,
    maxDate,
}: DatePickerProps) {
    const [open, setOpen] = React.useState(false);
    const display = value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value)
        : placeholder;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        'w-full justify-start text-left font-normal',
                        !value && 'text-muted-foreground',
                        className,
                    )}
                >
                    <CalendarDays className="size-4" />
                    {display}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[310px] overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-border/70 bg-surface-subtle/40 px-3 py-2 text-xs">
                    <span className="font-semibold text-foreground">Choose date</span>
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-primary"
                            onClick={() => {
                                onChange(new Date());
                                setOpen(false);
                            }}
                        >
                            Today
                        </Button>
                        {value && (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs text-muted-foreground"
                                onClick={() => {
                                    onChange(undefined);
                                    setOpen(false);
                                }}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                </div>
                <Calendar
                    mode="single"
                    captionLayout="dropdown"
                    startMonth={minDate ?? new Date(2000, 0)}
                    endMonth={maxDate ?? new Date(2040, 11)}
                    selected={value}
                    onSelect={(date) => {
                        onChange(date);
                        if (date) setOpen(false);
                    }}
                    disabled={(date) => isLocalCalendarDateDisabled(date, minDate, maxDate)}
                    className="border-0 p-2.5 [--cell-size:2.15rem]"
                />
            </PopoverContent>
        </Popover>
    );
}
export { DatePicker, type DatePickerProps };
