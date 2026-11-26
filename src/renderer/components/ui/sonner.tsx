import * as React from 'react';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';
import { cn } from '@/lib/utils';

function Sonner({ className, toastOptions, ...props }: ToasterProps) {
    const mergedToastOptions = {
        ...toastOptions,
        classNames: {
            toast: 'group toast group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-[var(--shadow-popover)]',
            title: 'group-[.toast]:text-sm group-[.toast]:font-medium group-[.toast]:text-popover-foreground',
            description: 'group-[.toast]:text-xs group-[.toast]:text-muted-foreground',
            actionButton:
                'group-[.toast]:min-h-7 group-[.toast]:rounded-md group-[.toast]:bg-primary group-[.toast]:px-2.5 group-[.toast]:py-1 group-[.toast]:text-primary-foreground group-[.toast]:text-xs group-[.toast]:font-medium',
            cancelButton:
                'group-[.toast]:min-h-7 group-[.toast]:rounded-md group-[.toast]:bg-surface-subtle group-[.toast]:px-2.5 group-[.toast]:py-1 group-[.toast]:text-foreground group-[.toast]:text-xs',
            ...toastOptions?.classNames,
        },
    };
    return (
        <SonnerToaster
            data-slot="sonner"
            className={cn('toaster group', className)}
            toastOptions={mergedToastOptions}
            {...props}
        />
    );
}

export { Sonner };
