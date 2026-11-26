import * as React from 'react';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { ContextMenu as ContextMenuPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const CTX_SURFACE =
    'z-50 min-w-[12.5rem] overflow-hidden rounded-xl border border-border/80 bg-popover/98 p-1.5 text-popover-foreground shadow-[var(--shadow-popover)] backdrop-blur-md outline-none';

function ContextMenu(props: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
    return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}
function ContextMenuTrigger(props: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
    return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />;
}
function ContextMenuContent({
    className,
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
    return (
        <ContextMenuPrimitive.Portal>
            <ContextMenuPrimitive.Content
                data-slot="context-menu-content"
                className={cn(CTX_SURFACE, className)}
                {...props}
            />
        </ContextMenuPrimitive.Portal>
    );
}
function ContextMenuItem({
    className,
    inset,
    variant = 'default',
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: 'default' | 'destructive';
}) {
    return (
        <ContextMenuPrimitive.Item
            data-slot="context-menu-item"
            data-inset={inset}
            data-variant={variant}
            className={cn(
                'relative flex min-h-8 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-danger data-[variant=destructive]:focus:bg-danger-subtle data-[variant=destructive]:focus:text-danger-foreground data-[variant=destructive]:[&_svg]:text-danger/85 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[inset=true]:pl-8 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
                className,
            )}
            {...props}
        />
    );
}
function ContextMenuCheckboxItem({
    className,
    children,
    checked,
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
    return (
        <ContextMenuPrimitive.CheckboxItem
            data-slot="context-menu-checkbox-item"
            checked={checked}
            className={cn(
                'relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2.5 text-[13px] outline-none focus:bg-accent/85',
                className,
            )}
            {...props}
        >
            <span className="absolute left-2.5">
                <ContextMenuPrimitive.ItemIndicator>
                    <Check className="size-3.5 text-primary" />
                </ContextMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </ContextMenuPrimitive.CheckboxItem>
    );
}
function ContextMenuRadioGroup(props: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
    return <ContextMenuPrimitive.RadioGroup data-slot="context-menu-radio-group" {...props} />;
}
function ContextMenuRadioItem({
    className,
    children,
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
    return (
        <ContextMenuPrimitive.RadioItem
            data-slot="context-menu-radio-item"
            className={cn(
                'relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2.5 text-[13px] outline-none focus:bg-accent/85',
                className,
            )}
            {...props}
        >
            <span className="absolute left-2.5">
                <ContextMenuPrimitive.ItemIndicator>
                    <Circle className="size-2 fill-primary text-primary" />
                </ContextMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </ContextMenuPrimitive.RadioItem>
    );
}
function ContextMenuLabel({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Label>) {
    return (
        <ContextMenuPrimitive.Label
            data-slot="context-menu-label"
            className={cn(
                'px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground',
                className,
            )}
            {...props}
        />
    );
}
function ContextMenuSeparator({
    className,
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
    return (
        <ContextMenuPrimitive.Separator
            data-slot="context-menu-separator"
            className={cn('-mx-1 my-1 h-px bg-border/60', className)}
            {...props}
        />
    );
}
function ContextMenuSub(props: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
    return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />;
}
function ContextMenuSubTrigger({
    className,
    children,
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
    return (
        <ContextMenuPrimitive.SubTrigger
            data-slot="context-menu-sub-trigger"
            className={cn(
                'flex cursor-default select-none items-center rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:bg-accent/85',
                className,
            )}
            {...props}
        >
            {children}
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
        </ContextMenuPrimitive.SubTrigger>
    );
}
function ContextMenuSubContent({
    className,
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
    return (
        <ContextMenuPrimitive.Portal>
            <ContextMenuPrimitive.SubContent
                data-slot="context-menu-sub-content"
                className={cn(CTX_SURFACE, className)}
                {...props}
            />
        </ContextMenuPrimitive.Portal>
    );
}

export {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuCheckboxItem,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubTrigger,
    ContextMenuSubContent,
};
