import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type ComboboxOption = { value: string; label: string; description?: string; disabled?: boolean };
type ComboboxProps = {
    options: ComboboxOption[];
    value?: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyLabel?: string;
    disabled?: boolean;
    className?: string;
};

function Combobox({
    options,
    value,
    onValueChange,
    placeholder = 'Select an option…',
    searchPlaceholder = 'Search options…',
    emptyLabel = 'No options found.',
    disabled,
    className,
}: ComboboxProps) {
    const [open, setOpen] = React.useState(false);
    const selected = options.find((option) => option.value === value);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        'w-full justify-between gap-2 rounded-lg border-input/85 bg-surface-subtle/40 font-normal hover:border-border hover:bg-surface-subtle/80',
                        !selected && 'text-muted-foreground',
                        className,
                    )}
                >
                    <span className="min-w-0 truncate text-left">{selected?.label ?? placeholder}</span>
                    <ChevronsUpDown className="size-3.5 shrink-0 opacity-55" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-[max(17rem,var(--radix-popover-trigger-width))] max-w-[min(24rem,calc(100vw-24px))] overflow-hidden p-0"
            >
                <Command>
                    <CommandInput placeholder={searchPlaceholder} />
                    <CommandList>
                        <CommandEmpty>{emptyLabel}</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={`${option.label} ${option.value}`}
                                    disabled={Boolean(option.disabled)}
                                    onSelect={() => {
                                        onValueChange(option.value);
                                        setOpen(false);
                                    }}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">{option.label}</span>
                                        {option.description && (
                                            <span className="block truncate text-[11px] text-muted-foreground">
                                                {option.description}
                                            </span>
                                        )}
                                    </span>
                                    <Check
                                        className={cn(
                                            'ml-auto size-3.5 shrink-0 text-primary',
                                            value === option.value ? 'opacity-100' : 'opacity-0',
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export { Combobox };
