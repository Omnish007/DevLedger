import * as React from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const POPOVER_ELEVATED =
    'z-50 w-72 rounded-xl border border-border/85 bg-popover p-3.5 text-popover-foreground shadow-[0_16px_40px_-12px_rgba(0,0,0,0.45),0_2px_10px_-2px_rgba(0,0,0,0.18)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
    return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor(props: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
    return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverContent({
    className,
    align = 'center',
    sideOffset = 6,
    collisionPadding = 12,
    ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
                data-slot="popover-content"
                align={align}
                sideOffset={sideOffset}
                collisionPadding={collisionPadding}
                className={cn(POPOVER_ELEVATED, className)}
                {...props}
            />
        </PopoverPrimitive.Portal>
    );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div data-slot="popover-header" className={cn('flex flex-col gap-1 text-sm', className)} {...props} />
    );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<'h2'>) {
    return <h2 data-slot="popover-title" className={cn('font-medium', className)} {...props} />;
}

function PopoverDescription({ className, ...props }: React.ComponentProps<'p'>) {
    return (
        <p data-slot="popover-description" className={cn('text-muted-foreground', className)} {...props} />
    );
}

export {
    Popover,
    PopoverTrigger,
    PopoverAnchor,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverDescription,
};
