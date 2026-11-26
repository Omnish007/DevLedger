import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const variants = {
    default: 'border-transparent bg-primary text-primary-foreground',
    secondary: 'border-border/65 bg-surface-subtle text-foreground/85',
    outline: 'border-border bg-transparent text-foreground',
    success: 'border-success/20 bg-success-subtle text-success-foreground',
    warning: 'border-warning/25 bg-warning-subtle text-warning-foreground',
    destructive: 'border-danger/20 bg-danger-subtle text-danger-foreground',
    info: 'border-info/20 bg-info-subtle text-info-foreground',
};

export function Badge({
    className,
    variant = 'secondary',
    ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
    return (
        <span
            className={cn(
                'inline-flex h-5.5 items-center gap-1 rounded-md border px-2 text-xs font-medium leading-none tracking-[-0.005em] whitespace-nowrap',
                variants[variant],
                className,
            )}
            {...props}
        />
    );
}
