import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { toggleVariants } from '@/components/ui/toggle';
import type { VariantProps } from 'class-variance-authority';

type ToggleGroupContextValue = VariantProps<typeof toggleVariants>;
const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({});
function ToggleGroup({
    className,
    variant = 'default',
    size = 'default',
    children,
    ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & VariantProps<typeof toggleVariants>) {
    return (
        <ToggleGroupPrimitive.Root
            data-slot="toggle-group"
            data-variant={variant}
            data-size={size}
            className={cn('group/toggle-group flex w-fit items-center rounded-md', className)}
            {...props}
        >
            <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
        </ToggleGroupPrimitive.Root>
    );
}
function ToggleGroupItem({
    className,
    children,
    variant,
    size,
    ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
    const context = React.useContext(ToggleGroupContext);
    return (
        <ToggleGroupPrimitive.Item
            data-slot="toggle-group-item"
            data-variant={variant ?? context.variant}
            data-size={size ?? context.size}
            className={cn(
                toggleVariants({ variant: variant ?? context.variant, size: size ?? context.size }),
                'rounded-none first:rounded-l-md last:rounded-r-md focus-visible:z-10',
                className,
            )}
            {...props}
        >
            {children}
        </ToggleGroupPrimitive.Item>
    );
}
export { ToggleGroup, ToggleGroupItem };
