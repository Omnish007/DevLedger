import { SMART_TIME_PRESETS, type SmartDateDisplayFormat } from '@domain/smart-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';

export type RemindOffset = 'none' | '0' | '15' | '60' | '1440';

interface SmartDateOptionsFooterProps {
    idPrefix: string;
    rangeEnabled: boolean;
    onRangeChange: (checked: boolean) => void;
    hasTime: boolean;
    time: string | null;
    onTimeToggle: (checked: boolean) => void;
    onTimeChange: (nextTime: string) => void;
    format: SmartDateDisplayFormat;
    onFormatChange: (format: SmartDateDisplayFormat) => void;
    remindMode: 'switch' | 'select';
    remindChecked?: boolean;
    onRemindCheckedChange?: (checked: boolean) => void;
    remindOffset?: RemindOffset;
    onRemindOffsetChange?: (offset: RemindOffset) => void;
}

export function SmartDateOptionsFooter({
    idPrefix,
    rangeEnabled,
    onRangeChange,
    hasTime,
    time,
    onTimeToggle,
    onTimeChange,
    format,
    onFormatChange,
    remindMode,
    remindChecked,
    onRemindCheckedChange,
    remindOffset,
    onRemindOffsetChange,
}: SmartDateOptionsFooterProps) {
    return (
        <div className="space-y-2 border-t border-border/60 pt-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-subtle/45 px-2 py-1.5">
                <label className="flex cursor-pointer items-center gap-1.5">
                    <Switch
                        id={`${idPrefix}-range`}
                        size="sm"
                        checked={rangeEnabled}
                        onCheckedChange={onRangeChange}
                    />
                    <span>End date</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                    <Switch
                        id={`${idPrefix}-time`}
                        size="sm"
                        checked={hasTime}
                        onCheckedChange={onTimeToggle}
                    />
                    <span>Time</span>
                </label>
                {remindMode === 'switch' && (
                    <label className="flex cursor-pointer items-center gap-1.5">
                        <Switch
                            id={`${idPrefix}-remind`}
                            size="sm"
                            checked={Boolean(remindChecked)}
                            onCheckedChange={(c) => onRemindCheckedChange?.(c)}
                        />
                        <span className={remindChecked ? 'font-medium text-warning' : ''}>Remind me</span>
                    </label>
                )}
            </div>

            {hasTime && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-subtle/50 p-1.5">
                    <Input
                        type="time"
                        aria-label="Time of day"
                        value={time ?? '09:00'}
                        onChange={(event) => onTimeChange(event.target.value || '09:00')}
                        className="h-7 w-24 text-xs"
                    />
                    <div className="flex flex-wrap gap-1">
                        {SMART_TIME_PRESETS.map((presetTime) => (
                            <Button
                                key={presetTime}
                                type="button"
                                size="sm"
                                variant={time === presetTime ? 'secondary' : 'outline'}
                                className="h-6 px-1.5 text-[11px] tabular-nums"
                                onClick={() => onTimeChange(presetTime)}
                            >
                                {presetTime}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            <div
                className={
                    remindMode === 'select'
                        ? 'grid grid-cols-2 gap-2'
                        : 'flex items-center justify-between gap-2'
                }
            >
                <label
                    className={
                        remindMode === 'select'
                            ? 'space-y-1 text-[11px] text-muted-foreground'
                            : 'flex flex-1 items-center justify-between gap-2 text-muted-foreground'
                    }
                >
                    <Label className="text-[11px] font-normal text-muted-foreground">Format</Label>
                    <NativeSelect
                        aria-label="Date format"
                        value={format}
                        onChange={(e) => onFormatChange(e.target.value as SmartDateDisplayFormat)}
                        className="h-7 w-28 text-xs"
                    >
                        <NativeSelectOption value="relative">Relative</NativeSelectOption>
                        <NativeSelectOption value="full">Full date</NativeSelectOption>
                        <NativeSelectOption value="short">DD/MM/YYYY</NativeSelectOption>
                        <NativeSelectOption value="iso">YYYY-MM-DD</NativeSelectOption>
                    </NativeSelect>
                </label>
                {remindMode === 'select' && (
                    <label className="space-y-1 text-[11px] text-muted-foreground">
                        <span>Remind</span>
                        <NativeSelect
                            aria-label="Reminder timing"
                            value={remindOffset ?? 'none'}
                            onChange={(e) => onRemindOffsetChange?.(e.target.value as RemindOffset)}
                            className="h-7 w-full text-xs"
                        >
                            <NativeSelectOption value="none">Off</NativeSelectOption>
                            <NativeSelectOption value="0">
                                {hasTime ? 'At time' : '9:00 AM'}
                            </NativeSelectOption>
                            <NativeSelectOption value="15">15m before</NativeSelectOption>
                            <NativeSelectOption value="60">1h before</NativeSelectOption>
                            <NativeSelectOption value="1440">1d before</NativeSelectOption>
                        </NativeSelect>
                    </label>
                )}
            </div>
        </div>
    );
}
