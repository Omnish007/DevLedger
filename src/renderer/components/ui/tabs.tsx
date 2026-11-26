import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
    return (
        <TabsPrimitive.List
            className={cn(
                'inline-flex min-h-9 max-w-full flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-surface-subtle p-1 text-muted-foreground',
                className,
            )}
            {...props}
        />
    );
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
    return (
        <TabsPrimitive.Trigger
            className={cn(
                'inline-flex h-7.5 items-center justify-center rounded-md px-3 text-xs font-medium whitespace-nowrap transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[var(--shadow-xs)]',
                className,
            )}
            {...props}
        />
    );
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
    return (
        <TabsPrimitive.Content
            className={cn('mt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
            {...props}
        />
    );
}
