import * as React from 'react';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';
import { cn } from '@/lib/utils';

function Sonner({ className, toastOptions, ...props }: ToasterProps) {
  const mergedToastOptions = {
    ...toastOptions,
    classNames: {
      toast: 'group toast group-[.toaster]:border-border group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-lg',
      description: 'group-[.toast]:text-muted-foreground',
      actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
      cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
      ...toastOptions?.classNames,
    },
  };
  return <SonnerToaster data-slot="sonner" className={cn('toaster group', className)} toastOptions={mergedToastOptions} {...props} />;
}

export { Sonner };
