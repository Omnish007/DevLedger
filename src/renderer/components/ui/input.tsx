import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
    ({ className, type, ...props }, ref) => (
        <input
            ref={ref}
            type={type}
            className={cn(
                'flex h-9 w-full rounded-lg border border-input/90 bg-card px-3 py-1.5 text-sm text-foreground shadow-[var(--shadow-xs)] transition-colors placeholder:text-muted-foreground hover:border-input focus-visible:border-ring/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 aria-invalid:border-destructive/55 aria-invalid:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            {...props}
        />
    ),
);
Input.displayName = 'Input';
