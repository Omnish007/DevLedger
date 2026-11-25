import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
    return (
        <CommandPrimitive
            data-slot="command"
            className={cn(
                'flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground',
                className,
            )}
            {...props}
        />
    );
}
function CommandDialog({
    title = 'Command palette',
    description = 'Search for an action',
    children,
    className,
    ...props
}: React.ComponentProps<typeof Dialog> & { title?: string; description?: string; className?: string }) {
    return (
        <Dialog {...props}>
            <DialogHeader className="sr-only">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <DialogContent
                className={cn('overflow-hidden rounded-2xl border-border/85 p-0 shadow-2xl', className)}
            >
                <Command>{children}</Command>
            </DialogContent>
        </Dialog>
    );
}
function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
    return (
        <div
            data-slot="command-input-wrapper"
            className="flex h-10 items-center gap-2.5 border-b border-border/60 bg-surface-subtle/35 px-3"
        >
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
                data-slot="command-input"
                className={cn(
                    'h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-50',
                    className,
                )}
                {...props}
            />
        </div>
    );
}
function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
    return (
        <CommandPrimitive.List
            data-slot="command-list"
            className={cn('max-h-72 overflow-y-auto overflow-x-hidden scroll-py-1 p-1.5', className)}
            {...props}
        />
    );
}
function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
    return (
        <CommandPrimitive.Empty
            data-slot="command-empty"
            className={cn('py-6 text-center text-xs text-muted-foreground', className)}
            {...props}
        />
    );
}
function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
    return (
        <CommandPrimitive.Group
            data-slot="command-group"
            className={cn(
                'overflow-hidden p-0 text-foreground [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground',
                className,
            )}
            {...props}
        />
    );
}
function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
    return (
        <CommandPrimitive.Item
            data-slot="command-item"
            className={cn(
                'relative flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none transition-colors aria-selected:bg-accent/85 aria-selected:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0',
                className,
            )}
            {...props}
        />
    );
}
function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
    return (
        <CommandPrimitive.Separator
            data-slot="command-separator"
            className={cn('-mx-1 my-1 h-px bg-border/60', className)}
            {...props}
        />
    );
}
function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            data-slot="command-shortcut"
            className={cn('ml-auto text-[11px] tracking-widest text-muted-foreground', className)}
            {...props}
        />
    );
}

export {
    Command,
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandSeparator,
    CommandShortcut,
};
