import { useId, useMemo, useState } from 'react';
import { CalendarClock, Clock3, X } from 'lucide-react';
import {
    formatNotionDateLabel,
    getSmartDatePresets,
    parseSmartDate,
    SMART_TIME_PRESETS,
    type SmartDateResult,
} from '@domain/smart-date';
import { toDateString } from '@domain/smart-date-notion';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { friendlyError } from '@/lib/utils';

interface SmartDateFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    helpText?: string;
    defaultTimeLabel?: string;
    compact?: boolean;
}

function isoDateToLocal(isoDate?: string): Date | undefined {
    if (!isoDate) return undefined;
    const parsed = new Date(`${isoDate}T12:00:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

export function SmartDateField({
    label,
    value,
    onChange,
    placeholder = '@today, @friday 3pm, or pick date & time',
    required = false,
    helpText,
    defaultTimeLabel = 'All day',
    compact = false,
}: SmartDateFieldProps) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [displayMonth, setDisplayMonth] = useState<Date>(() => new Date());
    const presets = useMemo(() => getSmartDatePresets().slice(0, compact ? 3 : 4), [compact]);

    const parsed = useMemo((): { result: SmartDateResult | null; error: string } => {
        if (!value.trim()) return { result: null, error: '' };
        try {
            return { result: parseSmartDate(value), error: '' };
        } catch (error) {
            return { result: null, error: friendlyError(error, 'Enter a supported Notion date expression.') };
        }
    }, [value]);

    const selectedDate = isoDateToLocal(parsed.result?.date);
    const currentTime = parsed.result?.kind === 'datetime' ? parsed.result.time : null;
    const hasTime = Boolean(currentTime);
    const previewLabel = parsed.result
        ? formatNotionDateLabel({ date: parsed.result.date, time: currentTime, format: 'full' })
        : '';

    function commitDateTime(nextDate: string, nextTime: string | null) {
        onChange(nextTime ? `${nextDate} ${nextTime}` : nextDate);
    }

    function applyTimeSelection(nextTime: string | null) {
        const baseDate = parsed.result?.date ?? toDateString(new Date());
        commitDateTime(baseDate, nextTime);
    }

    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
                <Label htmlFor={id} className="text-xs font-medium">
                    {label}
                    {!required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
                </Label>
                <div className="flex flex-wrap items-center gap-1">
                    {presets.map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => onChange(preset.token)}
                            className="inline-flex min-h-6 items-center rounded-md border border-border/80 bg-surface-subtle/60 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                    <CalendarClock
                        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        id={id}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        placeholder={placeholder}
                        required={required}
                        aria-invalid={Boolean(parsed.error)}
                        aria-describedby={
                            `${compact ? '' : `${id}-help `}${parsed.result || parsed.error ? `${id}-preview` : ''}`.trim() ||
                            undefined
                        }
                        className="pl-8 pr-8 text-xs"
                    />
                    {value.trim() && (
                        <button
                            type="button"
                            onClick={() => onChange('')}
                            aria-label="Clear date and time"
                            className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>

                <Popover
                    open={open}
                    onOpenChange={(next) => {
                        setOpen(next);
                        if (next) setDisplayMonth(selectedDate ?? new Date());
                    }}
                >
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs"
                            aria-label={`Open calendar and time selector for ${label}`}
                        >
                            <Clock3 className="size-3.5 text-muted-foreground" />
                            <span>Pick</span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        className="w-[328px] max-h-[min(calc(var(--radix-popover-content-available-height)-8px),84vh)] overflow-y-auto p-0"
                    >
                        <div className="flex items-center justify-between border-b border-border/70 bg-surface-subtle/40 px-3 py-2 text-xs">
                            <span className="truncate font-semibold text-foreground">
                                {previewLabel || 'Pick date & time'}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    const today = new Date();
                                    setDisplayMonth(today);
                                    commitDateTime(toDateString(today), currentTime);
                                }}
                                className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                            >
                                Today
                            </button>
                        </div>
                        <div className="space-y-2.5 p-2.5">
                            <div className="rounded-xl border border-border/75 bg-card/70 p-0.5">
                                <Calendar
                                    mode="single"
                                    captionLayout="dropdown"
                                    startMonth={new Date(2000, 0)}
                                    endMonth={new Date(2040, 11)}
                                    month={displayMonth}
                                    onMonthChange={setDisplayMonth}
                                    selected={selectedDate}
                                    onSelect={(picked) => {
                                        if (!picked) return;
                                        setDisplayMonth(picked);
                                        commitDateTime(toDateString(picked), currentTime);
                                    }}
                                    className="mx-auto p-2 [--cell-size:2.15rem]"
                                />
                            </div>

                            <div className="space-y-2 rounded-xl border border-border/70 bg-surface-subtle/35 p-2.5 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                    <Label htmlFor={`${id}-time-toggle`} className="text-xs font-medium">
                                        Include time
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        {hasTime && (
                                            <Input
                                                type="time"
                                                value={currentTime ?? '09:00'}
                                                onChange={(event) =>
                                                    applyTimeSelection(event.target.value || null)
                                                }
                                                className="h-7 w-24 text-xs"
                                            />
                                        )}
                                        <Switch
                                            id={`${id}-time-toggle`}
                                            size="sm"
                                            checked={hasTime}
                                            onCheckedChange={(checked) =>
                                                applyTimeSelection(checked ? (currentTime ?? '09:00') : null)
                                            }
                                        />
                                    </div>
                                </div>
                                {hasTime && (
                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                        {SMART_TIME_PRESETS.map((presetTime) => (
                                            <Button
                                                key={presetTime}
                                                type="button"
                                                size="sm"
                                                variant={currentTime === presetTime ? 'secondary' : 'outline'}
                                                className="h-7 px-2 text-xs tabular-nums"
                                                onClick={() => applyTimeSelection(presetTime)}
                                            >
                                                {presetTime}
                                            </Button>
                                        ))}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-xs text-muted-foreground"
                                            onClick={() => applyTimeSelection(null)}
                                        >
                                            All day
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {!compact && (
                <p id={`${id}-help`} className="text-xs text-muted-foreground">
                    {helpText ?? 'Supports @today, @friday 3pm, @May 15, or use Pick for calendar & time.'}
                </p>
            )}
            {parsed.error && (
                <p id={`${id}-preview`} role="alert" className="text-xs text-danger">
                    {parsed.error}
                </p>
            )}
            {parsed.result && !parsed.error && (
                <p id={`${id}-preview`} className="text-xs text-foreground">
                    <span className="font-medium">{previewLabel}</span>
                    {!currentTime && <span className="text-muted-foreground"> · {defaultTimeLabel}</span>}
                </p>
            )}
        </div>
    );
}
