import * as React from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
    return <SelectPrimitive.Root data-slot="select" {...props} />;
}
function SelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
    return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}
function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
    return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}
function SelectTrigger({
    className,
    size = 'default',
    children,
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & { size?: 'sm' | 'default' }) {
    return (
        <SelectPrimitive.Trigger
            data-slot="select-trigger"
            data-size={size}
            className={cn(
                'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-[var(--shadow-xs)] transition-[color,background-color,border-color,box-shadow] outline-none hover:border-border hover:bg-surface-subtle/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20 [&[data-state=open]_svg]:rotate-180 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground data-[size=sm]:h-8 data-[size=sm]:px-2.5 data-[size=sm]:text-xs',
                className,
            )}
            {...props}
        >
            <span className="min-w-0 flex-1 truncate text-left">{children}</span>
            <SelectPrimitive.Icon asChild>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150" />
            </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    );
}
function SelectContent({
    className,
    position = 'popper',
    sideOffset = 6,
    collisionPadding = 10,
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
    return (
        <SelectPrimitive.Portal>
            <SelectPrimitive.Content
                data-slot="select-content"
                position={position}
                sideOffset={sideOffset}
                collisionPadding={collisionPadding}
                className={cn(
                    'relative z-50 max-h-80 min-w-[max(11rem,var(--radix-select-trigger-width))] overflow-hidden rounded-xl border border-border/90 bg-popover/98 text-popover-foreground shadow-[var(--shadow-popover)] backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                    className,
                )}
                {...props}
            >
                <SelectScrollUpButton />
                <SelectPrimitive.Viewport className="p-1.5">
                    <>{props.children}</>
                </SelectPrimitive.Viewport>
                <SelectScrollDownButton />
            </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
    );
}
function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
    return (
        <SelectPrimitive.Label
            data-slot="select-label"
            className={cn(
                'px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                className,
            )}
            {...props}
        />
    );
}
function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
    return (
        <SelectPrimitive.Item
            data-slot="select-item"
            className={cn(
                'relative flex min-h-8 w-full cursor-default select-none items-center rounded-lg py-1.5 pl-2.5 pr-8 text-[13px] outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:bg-primary/[0.08] data-[state=checked]:font-medium data-[state=checked]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
                className,
            )}
            {...props}
        >
            <span className="absolute right-2.5 flex size-4 items-center justify-center">
                <SelectPrimitive.ItemIndicator>
                    <Check className="size-3.5 text-primary" />
                </SelectPrimitive.ItemIndicator>
            </span>
            <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        </SelectPrimitive.Item>
    );
}
function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
    return (
        <SelectPrimitive.Separator
            data-slot="select-separator"
            className={cn('-mx-1 my-1 h-px bg-border/60', className)}
            {...props}
        />
    );
}
function SelectScrollUpButton({
    className,
    ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
    return (
        <SelectPrimitive.ScrollUpButton
            data-slot="select-scroll-up-button"
            className={cn(
                'flex cursor-default items-center justify-center py-1 text-muted-foreground',
                className,
            )}
            {...props}
        >
            <ChevronUp className="size-3.5" />
        </SelectPrimitive.ScrollUpButton>
    );
}
function SelectScrollDownButton({
    className,
    ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
    return (
        <SelectPrimitive.ScrollDownButton
            data-slot="select-scroll-down-button"
            className={cn(
                'flex cursor-default items-center justify-center py-1 text-muted-foreground',
                className,
            )}
            {...props}
        >
            <ChevronDown className="size-3.5" />
        </SelectPrimitive.ScrollDownButton>
    );
}

export {
    Select,
    SelectGroup,
    SelectValue,
    SelectTrigger,
    SelectContent,
    SelectLabel,
    SelectItem,
    SelectSeparator,
    SelectScrollUpButton,
    SelectScrollDownButton,
};
