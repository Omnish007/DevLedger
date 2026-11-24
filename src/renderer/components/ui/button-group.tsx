import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

const buttonGroupVariants = cva('flex w-fit items-stretch [&>*:focus-visible]:relative [&>*:focus-visible]:z-10', {
  variants: { orientation: { horizontal: '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none', vertical: 'flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none' } },
  defaultVariants: { orientation: 'horizontal' },
});
function ButtonGroup({ className, orientation, ...props }: React.ComponentProps<'div'> & VariantProps<typeof buttonGroupVariants>) {
  return <div role="group" data-slot="button-group" data-orientation={orientation} className={cn(buttonGroupVariants({ orientation }), className)} {...props} />;
}
function ButtonGroupText({ className, asChild = false, ...props }: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : 'div';
  return <Component data-slot="button-group-text" className={cn('flex items-center gap-2 rounded-md border bg-muted px-3 text-sm font-medium text-muted-foreground', className)} {...props} />;
}
function ButtonGroupSeparator({ className, orientation = 'vertical', ...props }: React.ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  return <div role="separator" aria-orientation={orientation} data-slot="button-group-separator" className={cn('shrink-0 bg-border', orientation === 'vertical' ? 'my-1 w-px self-stretch' : 'mx-1 h-px w-full', className)} {...props} />;
}
export { ButtonGroup, ButtonGroupText, ButtonGroupSeparator, buttonGroupVariants };
