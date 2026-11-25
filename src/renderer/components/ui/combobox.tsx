import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type ComboboxOption = { value: string; label: string; description?: string; disabled?: boolean };
type ComboboxProps = { options: ComboboxOption[]; value?: string; onValueChange: (value: string) => void; placeholder?: string; searchPlaceholder?: string; emptyLabel?: string; disabled?: boolean; className?: string; };
function Combobox({ options, value, onValueChange, placeholder = 'Select an option…', searchPlaceholder = 'Search options…', emptyLabel = 'No options found.', disabled, className }: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}>{selected?.label ?? placeholder}<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50"/></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command><CommandInput placeholder={searchPlaceholder}/><CommandList><CommandEmpty>{emptyLabel}</CommandEmpty><CommandGroup>{options.map((option) => <CommandItem key={option.value} value={`${option.label} ${option.value}`} disabled={Boolean(option.disabled)} onSelect={() => { onValueChange(option.value); setOpen(false); }}><Check className={cn('mr-2 size-4', value === option.value ? 'opacity-100' : 'opacity-0')}/><span className="min-w-0 flex-1">{option.label}{option.description && <span className="block text-xs text-muted-foreground">{option.description}</span>}</span></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>;
}
export { Combobox };
