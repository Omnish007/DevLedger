import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

function NativeSelect({
    className,
    size = 'default',
    ...props
}: Omit<React.ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default' }) {
    // Shrink-wrap the icon wrapper when a caller passes an explicit non-full width so the chevron stays inside <select>.
    const hasExplicitWidth = /\b(?:w-(?!full\b)\S+|min-w-\S+|max-w-\S+)\b/.test(className ?? '');
    return (
        <div
            className={cn(
                'group/native-select relative has-[select:disabled]:opacity-50',
                hasExplicitWidth ? 'w-fit max-w-full shrink-0' : 'w-full',
            )}
            data-slot="native-select-wrapper"
        >
            <select
                data-slot="native-select"
                data-size={size}
                className={cn(
                    'h-9 w-full min-w-0 appearance-none rounded-lg border border-input/85 bg-surface-subtle/40 px-3 py-1.5 text-[13px] font-medium shadow-xs transition-[color,background-color,border-color,box-shadow] outline-none hover:border-border hover:bg-surface-subtle/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8 data-[size=sm]:px-2.5 data-[size=sm]:py-1 data-[size=sm]:text-xs aria-invalid:border-destructive aria-invalid:ring-destructive/20',
                    className,
                    'pr-9',
                )}
                {...props}
            />
            <ChevronDown
                className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground opacity-70 transition-colors group-hover/native-select:text-foreground"
                aria-hidden="true"
                data-slot="native-select-icon"
            />
        </div>
    );
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<'option'>) {
    return (
        <option
            data-slot="native-select-option"
            className={cn('bg-popover text-popover-foreground', className)}
            {...props}
        />
    );
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<'optgroup'>) {
    return (
        <optgroup
            data-slot="native-select-optgroup"
            className={cn('bg-popover text-popover-foreground', className)}
            {...props}
        />
    );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
