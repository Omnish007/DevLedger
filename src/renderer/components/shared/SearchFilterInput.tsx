import type { ComponentProps } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchFilterInputProps extends Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
    value: string;
    onValueChange: (next: string) => void;
    clearLabel?: string;
}

/**
 * Shared filter input with leading search icon and accessible clear affordance.
 */
export function SearchFilterInput({
    value,
    onValueChange,
    clearLabel = 'Clear filter',
    className,
    ...props
}: SearchFilterInputProps) {
    return (
        <div className={cn('relative flex min-w-0 items-center', className)}>
            <Search
                className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
                aria-hidden="true"
            />
            <Input
                type="text"
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                className={cn('pl-8.5', value ? 'pr-8.5' : undefined)}
                {...props}
            />
            {value && (
                <button
                    type="button"
                    aria-label={clearLabel}
                    title={clearLabel}
                    onClick={() => onValueChange('')}
                    className="absolute right-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                    <X className="size-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}
