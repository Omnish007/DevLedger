import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, LoaderCircle, X } from 'lucide-react';
import type { EntityType } from '@shared/contracts';
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
import { cn, friendlyError } from '@/lib/utils';
import {
    loadRecordChoices,
    RECORD_PICKER_PAGE_SIZE,
    type RecordChoice,
    type RecordSearchOptions,
} from './record-search';

type RemoteRecordPickerProps = {
    entityType: EntityType;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
    projectId?: string | null | undefined;
    includeCompleted?: boolean | undefined;
    excludeId?: string | null | undefined;
    selectedLabel?: string | undefined;
    onChoiceChange?: (choice: RecordChoice | null) => void;
};

/** Search-backed entity selector with widened floating menu and clean option hierarchy. */
export function RemoteRecordPicker({
    entityType,
    value,
    onValueChange,
    placeholder = 'Choose a record…',
    searchPlaceholder,
    ariaLabel,
    disabled,
    className,
    projectId,
    includeCompleted,
    excludeId,
    selectedLabel,
    onChoiceChange,
}: RemoteRecordPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [choices, setChoices] = useState<RecordChoice[]>([]);
    const [selected, setSelected] = useState<RecordChoice | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const requestId = useRef(0);

    useEffect(() => {
        if (!value) {
            setSelected(null);
            return;
        }
        if (selected?.id === value) return;
        if (selectedLabel) {
            setSelected({ id: value, label: selectedLabel });
            return;
        }
        let active = true;
        const resolveLabel = async () => {
            try {
                let label: string | undefined;
                if (entityType === 'project')
                    label = (await window.devLedger.projects.getNames([value]))[value];
                if (entityType === 'task') label = (await window.devLedger.tasks.getTitles([value]))[value];
                if (entityType === 'contact') label = (await window.devLedger.contacts.get(value))?.name;
                if (active && label) setSelected({ id: value, label });
            } catch {
                /* Keep placeholder when record is deleted or unavailable. */
            }
        };
        void resolveLabel();
        return () => {
            active = false;
        };
    }, [entityType, value, selected?.id, selectedLabel]);

    useEffect(() => {
        if (!open) return;
        const currentRequest = ++requestId.current;
        let active = true;
        const timer = window.setTimeout(
            () => {
                setLoading(true);
                setError('');
                const options: RecordSearchOptions = { projectId, includeCompleted, excludeId };
                void loadRecordChoices(window.devLedger, entityType, query.trim(), options)
                    .then((rows) => {
                        if (active && requestId.current === currentRequest) setChoices(rows);
                    })
                    .catch((caught: unknown) => {
                        if (active && requestId.current === currentRequest) {
                            setChoices([]);
                            setError(friendlyError(caught, 'Records could not be searched.'));
                        }
                    })
                    .finally(() => {
                        if (active && requestId.current === currentRequest) setLoading(false);
                    });
            },
            query.trim() ? 220 : 0,
        );
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

    const resolvedSearchPlaceholder = searchPlaceholder ?? `Search ${entityType}s…`;
    const hasMaxOnly = /\bmax-w-\S+/.test(className ?? '') && !/\bw-\S+/.test(className ?? '');
    const displayValue = (selected?.id === value ? selected.label : selectedLabel) ?? placeholder;

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setQuery('');
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-label={ariaLabel ?? displayValue}
                    disabled={disabled}
                    className={cn(
                        hasMaxOnly ? 'w-auto' : 'w-full',
                        'justify-between gap-2 rounded-lg border-border/90 bg-card font-medium shadow-[var(--shadow-xs)] transition-[border-color,background-color,box-shadow] hover:border-border hover:bg-surface-subtle/60 data-[state=open]:border-ring/75 data-[state=open]:ring-2 data-[state=open]:ring-ring/20',
                        selected?.id !== value && !selectedLabel && 'font-normal text-muted-foreground',
                        className,
                    )}
                >
                    <span className="min-w-0 truncate text-left">{displayValue}</span>
                    <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-[max(18rem,var(--radix-popover-trigger-width))] max-w-[min(25rem,calc(100vw-24px))] overflow-hidden p-0"
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder={resolvedSearchPlaceholder}
                    />
                    <CommandList>
                        {loading && (
                            <div className="flex items-center justify-center gap-2 px-3 py-5 text-xs text-muted-foreground">
                                <LoaderCircle className="size-3.5 animate-spin text-primary" />
                                Searching…
                            </div>
                        )}
                        {!loading && error && (
                            <div role="status" className="px-3 py-4 text-xs text-danger">
                                {error}
                            </div>
                        )}
                        {!loading && !error && choices.length === 0 && (
                            <CommandEmpty>
                                {query.trim()
                                    ? `No matching ${entityType}s.`
                                    : `No ${entityType} records yet.`}
                            </CommandEmpty>
                        )}
                        {!loading && !error && choices.length > 0 && (
                            <CommandGroup heading={`Matching ${entityType}s`}>
                                {choices.map((choice) => {
                                    const isChecked = value === choice.id;
                                    return (
                                        <CommandItem
                                            key={choice.id}
                                            value={choice.id}
                                            onSelect={() => selectChoice(choice)}
                                            className={cn('py-2', isChecked && 'bg-primary/[0.08]')}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-medium">{choice.label}</div>
                                                {choice.description && (
                                                    <div className="truncate text-[11px] text-muted-foreground">
                                                        {choice.description}
                                                    </div>
                                                )}
                                            </div>
                                            <Check
                                                className={cn(
                                                    'ml-auto size-3.5 shrink-0 text-primary transition-opacity',
                                                    isChecked ? 'opacity-100' : 'opacity-0',
                                                )}
                                            />
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
                {value && (
                    <div className="flex items-center justify-between border-t border-border/60 bg-surface-subtle/30 px-3 py-2">
                        <span className="text-[11px] text-muted-foreground">
                            Up to {RECORD_PICKER_PAGE_SIZE} matches
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                                setSelected(null);
                                onValueChange('');
                                onChoiceChange?.(null);
                                setOpen(false);
                            }}
                        >
                            <X className="mr-1 size-3" />
                            Clear
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
