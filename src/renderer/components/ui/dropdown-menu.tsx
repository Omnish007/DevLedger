import * as React from 'react';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const MENU_SURFACE =
    'z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[12.5rem] overflow-x-hidden overflow-y-auto rounded-xl border border-border/90 bg-popover/98 p-1.5 text-popover-foreground shadow-[var(--shadow-popover)] backdrop-blur-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
    return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}
function DropdownMenuPortal(props: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
    return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}
function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
    return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}
function DropdownMenuGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
    return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}
function DropdownMenuContent({
    className,
    sideOffset = 6,
    collisionPadding = 10,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
    return (
        <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
                data-slot="dropdown-menu-content"
                sideOffset={sideOffset}
                collisionPadding={collisionPadding}
                className={cn(MENU_SURFACE, className)}
                {...props}
            />
        </DropdownMenuPrimitive.Portal>
    );
}
function DropdownMenuItem({
    className,
    inset,
    variant = 'default',
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: 'default' | 'destructive';
}) {
    return (
        <DropdownMenuPrimitive.Item
            data-slot="dropdown-menu-item"
            data-inset={inset}
            data-variant={variant}
            className={cn(
                'relative flex min-h-8 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[variant=destructive]:text-danger data-[variant=destructive]:focus:bg-danger-subtle data-[variant=destructive]:focus:text-danger-foreground data-[variant=destructive]:[&_svg]:text-danger/85 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[inset=true]:pl-8 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground focus:[&_svg]:text-accent-foreground',
                className,
            )}
            {...props}
        />
    );
}
function DropdownMenuCheckboxItem({
    className,
    children,
    checked,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
    return (
        <DropdownMenuPrimitive.CheckboxItem
            data-slot="dropdown-menu-checkbox-item"
            checked={checked}
            className={cn(
                'relative flex min-h-8 cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2.5 text-[13px] outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[state=checked]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
                className,
            )}
            {...props}
        >
            <span className="absolute left-2.5 flex size-3.5 items-center justify-center">
                <DropdownMenuPrimitive.ItemIndicator>
                    <Check className="size-3.5 text-primary" />
                </DropdownMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </DropdownMenuPrimitive.CheckboxItem>
    );
}
function DropdownMenuRadioGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
    return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}
function DropdownMenuRadioItem({
    className,
    children,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
    return (
        <DropdownMenuPrimitive.RadioItem
            data-slot="dropdown-menu-radio-item"
            className={cn(
                'relative flex min-h-8 cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2.5 text-[13px] outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[state=checked]:font-medium',
                className,
            )}
            {...props}
        >
            <span className="absolute left-2.5 flex size-3.5 items-center justify-center">
                <DropdownMenuPrimitive.ItemIndicator>
                    <Circle className="size-2 fill-primary text-primary" />
                </DropdownMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </DropdownMenuPrimitive.RadioItem>
    );
}
function DropdownMenuLabel({
    className,
    inset,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
    return (
        <DropdownMenuPrimitive.Label
            data-slot="dropdown-menu-label"
            data-inset={inset}
            className={cn(
                'px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground data-[inset=true]:pl-8',
                className,
            )}
            {...props}
        />
    );
}
function DropdownMenuSeparator({
    className,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
    return (
        <DropdownMenuPrimitive.Separator
            data-slot="dropdown-menu-separator"
            className={cn('-mx-1 my-1.5 h-px bg-border/65', className)}
            {...props}
        />
    );
}
function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            data-slot="dropdown-menu-shortcut"
            className={cn(
                'ml-auto inline-flex items-center rounded border border-border/70 bg-surface-subtle/80 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-muted-foreground',
                className,
            )}
            {...props}
        />
    );
}
function DropdownMenuSub(props: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
    return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}
function DropdownMenuSubTrigger({
    className,
    children,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
    return (
        <DropdownMenuPrimitive.SubTrigger
            data-slot="dropdown-menu-sub-trigger"
            className={cn(
                'flex cursor-default select-none items-center rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:bg-accent/85 data-[state=open]:bg-accent/85',
                className,
            )}
            {...props}
        >
            {children}
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
        </DropdownMenuPrimitive.SubTrigger>
    );
}
function DropdownMenuSubContent({
    className,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
    return (
        <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.SubContent
                data-slot="dropdown-menu-sub-content"
                className={cn(MENU_SURFACE, className)}
                {...props}
            />
        </DropdownMenuPrimitive.Portal>
    );
}

export {
    DropdownMenu,
    DropdownMenuPortal,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
};
