import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
    ({ className, ...props }, ref) => (
        <textarea
            ref={ref}
            className={cn(
                'flex min-h-28 w-full resize-y rounded-lg border border-input/90 bg-card px-3 py-2 text-sm text-foreground shadow-[var(--shadow-xs)] transition-colors placeholder:text-muted-foreground hover:border-input focus-visible:border-ring/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 aria-invalid:border-destructive/55 aria-invalid:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            {...props}
        />
    ),
);
Textarea.displayName = 'Textarea';
