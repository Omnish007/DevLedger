import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, LoaderCircle, X } from 'lucide-react';
import type { EntityType } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { loadRecordChoices, RECORD_PICKER_PAGE_SIZE, type RecordChoice, type RecordSearchOptions } from './record-search';

type RemoteRecordPickerProps = {
  entityType: EntityType;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  projectId?: string | null;
  includeCompleted?: boolean;
  excludeId?: string | null;
  selectedLabel?: string;
  onChoiceChange?: (choice: RecordChoice | null) => void;
};

/**
 * Search-backed entity selector. Only one 30-record result page crosses IPC at a
 * time; older records remain discoverable through server-side full-text search.
 */
export function RemoteRecordPicker({ entityType, value, onValueChange, placeholder = 'Choose a record…', searchPlaceholder = 'Search workspace records…', disabled, className, projectId, includeCompleted, excludeId, selectedLabel, onChoiceChange }: RemoteRecordPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState<RecordChoice[]>([]);
  const [selected, setSelected] = useState<RecordChoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    if (!value) { setSelected(null); return; }
    if (selected?.id === value) return;
    if (selectedLabel) { setSelected({ id: value, label: selectedLabel }); return; }
    let active = true;
    const resolveLabel = async () => {
      try {
        let label: string | undefined;
        if (entityType === 'project') label = (await window.devLedger.projects.getNames([value]))[value];
        if (entityType === 'task') label = (await window.devLedger.tasks.getTitles([value]))[value];
        if (entityType === 'contact') label = (await window.devLedger.contacts.get(value))?.name;
        if (active && label) setSelected({ id: value, label });
      } catch { /* Keep the caller's placeholder when a record was deleted or is unavailable. */ }
    };
    void resolveLabel();
    return () => { active = false; };
  }, [entityType, value, selected?.id, selectedLabel]);

  useEffect(() => {
    if (!open) return;
    const currentRequest = ++requestId.current;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const options: RecordSearchOptions = { projectId, includeCompleted, excludeId };
      void loadRecordChoices(window.devLedger, entityType, query.trim(), options).then((rows) => {
        if (active && requestId.current === currentRequest) setChoices(rows);
      }).catch((caught: unknown) => {
        if (active && requestId.current === currentRequest) {
          setChoices([]);
          setError(caught instanceof Error ? caught.message : 'Records could not be searched.');
        }
      }).finally(() => {
        if (active && requestId.current === currentRequest) setLoading(false);
      });
    }, query.trim() ? 220 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [entityType, open, query, projectId, includeCompleted, excludeId]);

  function selectChoice(choice: RecordChoice) {
    setSelected(choice);
    onValueChange(choice.id);
    onChoiceChange?.(choice);
    setOpen(false);
    setQuery('');
  }

  const hasMaxOnly = /\bmax-w-\S+/.test(className ?? '') && !/\bw-\S+/.test(className ?? '');
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className={cn(hasMaxOnly ? 'w-auto' : 'w-full', 'justify-between gap-2 font-normal', selected?.id !== value && !selectedLabel && 'text-muted-foreground', className)}>
          <span className="min-w-0 truncate text-left">{(selected?.id === value ? selected.label : selectedLabel) ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
          <CommandList>
            {loading && <div className="flex items-center justify-center gap-2 px-3 py-5 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Searching records…</div>}
            {!loading && error && <div role="status" className="px-3 py-4 text-xs text-destructive">{error}</div>}
            {!loading && !error && choices.length === 0 && <CommandEmpty>{query.trim() ? 'No matching records.' : `No ${entityType} records yet.`}</CommandEmpty>}
            {!loading && !error && choices.length > 0 && <CommandGroup heading={`Matching ${entityType}s`}>
              {choices.map((choice) => (
                <CommandItem key={choice.id} value={choice.id} onSelect={() => selectChoice(choice)}>
                  <Check className={cn('mr-2 size-4 shrink-0', value === choice.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{choice.label}{choice.description && <span className="block truncate text-xs text-muted-foreground">{choice.description}</span>}</span>
                </CommandItem>
              ))}
            </CommandGroup>}
          </CommandList>
        </Command>
        {value && <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <span className="text-[10px] text-muted-foreground">Showing up to {RECORD_PICKER_PAGE_SIZE} matches</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setSelected(null); onValueChange(''); onChoiceChange?.(null); }}><X className="mr-1 size-3" />Clear</Button>
        </div>}
      </PopoverContent>
    </Popover>
  );
}
