import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground shadow-[var(--shadow-xs)] hover:opacity-92',
                secondary: 'border border-border/60 bg-surface-subtle text-foreground hover:bg-surface-hover',
                outline:
                    'border border-border/90 bg-card text-foreground shadow-[var(--shadow-xs)] hover:border-border hover:bg-surface-hover',
                ghost: 'text-foreground hover:bg-surface-hover',
                destructive:
                    'bg-destructive text-destructive-foreground shadow-[var(--shadow-xs)] hover:opacity-92',
                link: 'text-foreground underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-9 px-3.5',
                sm: 'h-8 rounded-lg px-2.5 text-xs',
                lg: 'h-10 rounded-lg px-5',
                icon: 'size-9 rounded-lg',
            },
        },
        defaultVariants: { variant: 'default', size: 'default' },
    },
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
    const Component = asChild ? Slot.Root : 'button';
    return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
