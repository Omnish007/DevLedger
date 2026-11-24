import * as React from 'react';
import { PanelLeft } from 'lucide-react';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type SidebarContextValue = { open: boolean; state: 'expanded' | 'collapsed'; setOpen: (open: boolean) => void; toggleSidebar: () => void };
const SidebarContext = React.createContext<SidebarContextValue | null>(null);
function useSidebar() { const context = React.useContext(SidebarContext); if (!context) throw new Error('useSidebar must be used within SidebarProvider.'); return context; }
function SidebarProvider({ defaultOpen = true, open: openProp, onOpenChange, className, children, ...props }: React.ComponentProps<'div'> & { defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = openProp ?? internalOpen;
  const setOpen = React.useCallback((next: boolean) => { if (openProp === undefined) setInternalOpen(next); onOpenChange?.(next); }, [onOpenChange, openProp]);
  const toggleSidebar = React.useCallback(() => setOpen(!open), [open, setOpen]);
  React.useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleSidebar(); } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [toggleSidebar]);
  const value = React.useMemo(() => ({ open, state: open ? 'expanded' as const : 'collapsed' as const, setOpen, toggleSidebar }), [open, setOpen, toggleSidebar]);
  return <SidebarContext.Provider value={value}><div data-slot="sidebar-provider" data-state={value.state} className={cn('group/sidebar-provider flex min-h-0 w-full', className)} {...props}>{children}</div></SidebarContext.Provider>;
}
function Sidebar({ className, side = 'left', variant = 'sidebar', collapsible = 'offcanvas', ...props }: React.ComponentProps<'aside'> & { side?: 'left' | 'right'; variant?: 'sidebar' | 'floating' | 'inset'; collapsible?: 'offcanvas' | 'icon' | 'none' }) {
  const { open, state } = useSidebar();
  if (collapsible === 'none') return <aside data-slot="sidebar" data-side={side} data-variant={variant} className={cn('flex h-full min-h-0 w-[var(--sidebar-width,15rem)] shrink-0 flex-col bg-sidebar text-sidebar-foreground', className)} {...props}/>;
  return <aside data-slot="sidebar" data-side={side} data-variant={variant} data-collapsible={collapsible} data-state={state} className={cn('relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out', open ? 'w-[var(--sidebar-width,15rem)]' : collapsible === 'icon' ? 'w-[var(--sidebar-width-icon,3.25rem)]' : 'w-0', variant === 'floating' && 'm-2 rounded-lg border border-sidebar-border shadow-sm', className)} {...props}/>;
}
function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) { const { toggleSidebar } = useSidebar(); return <Button type="button" data-slot="sidebar-trigger" variant="ghost" size="icon" aria-label="Toggle sidebar" title="Toggle sidebar (Ctrl+B)" className={cn('size-8 shrink-0', className)} onClick={(event) => { onClick?.(event); toggleSidebar(); }} {...props}><PanelLeft className="size-4"/></Button>; }
function SidebarRail({ className, onClick, ...props }: React.ComponentProps<'button'>) { const { toggleSidebar } = useSidebar(); return <button type="button" data-slot="sidebar-rail" aria-label="Toggle sidebar" onClick={(event) => { onClick?.(event); toggleSidebar(); }} className={cn('absolute inset-y-0 right-0 z-20 hidden w-3 -translate-x-1/2 cursor-ew-resize opacity-0 transition-opacity hover:opacity-100 group-hover/sidebar-provider:sm:block', className)} {...props}/>; }
function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="sidebar-header" className={cn('flex shrink-0 flex-col gap-2 p-3', className)} {...props}/>; }
function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="sidebar-content" className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 py-1', className)} {...props}/>; }
function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="sidebar-footer" className={cn('flex shrink-0 flex-col gap-2 p-3', className)} {...props}/>; }
function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) { return <section data-slot="sidebar-group" className={cn('relative flex w-full min-w-0 flex-col p-1', className)} {...props}/>; }
function SidebarGroupLabel({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="sidebar-group-label" className={cn('flex h-8 shrink-0 items-center rounded-md px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/55', className)} {...props}/>; }
function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="sidebar-group-content" className={cn('w-full text-sm', className)} {...props}/>; }
function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) { return <ul data-slot="sidebar-menu" className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props}/>; }
function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) { return <li data-slot="sidebar-menu-item" className={cn('group/menu-item relative', className)} {...props}/>; }
function SidebarMenuButton({ className, asChild = false, isActive = false, tooltip, ...props }: React.ComponentProps<'button'> & { asChild?: boolean; isActive?: boolean; tooltip?: string }) {
  const Component = asChild ? Slot.Root : 'button';
  const { state } = useSidebar();
  return <Component data-slot="sidebar-menu-button" data-active={isActive} data-state={state} aria-current={isActive ? 'page' : undefined} title={state === 'collapsed' ? tooltip : undefined} className={cn('flex h-9 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4 [&>svg]:shrink-0', isActive ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground', state === 'collapsed' && 'justify-center px-2', className)} {...props}/>;
}
function SidebarGroupAction({ className, ...props }: React.ComponentProps<'button'>) {
  return <button data-slot="sidebar-group-action" type="button" className={cn('absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-sidebar-foreground/65 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4', className)} {...props}/>;
}
function SidebarMenuAction({ className, showOnHover = true, ...props }: React.ComponentProps<'button'> & { showOnHover?: boolean }) {
  return <button data-slot="sidebar-menu-action" type="button" className={cn('absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-md text-sidebar-foreground/65 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4', showOnHover && 'opacity-0 group-hover/menu-item:opacity-100 focus-visible:opacity-100', className)} {...props}/>;
}
function SidebarMenuBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="sidebar-menu-badge" className={cn('pointer-events-none absolute right-2 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-sidebar-accent px-1 text-[10px] font-medium tabular-nums text-sidebar-accent-foreground', className)} {...props}/>;
}
function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul data-slot="sidebar-menu-sub" className={cn('mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5', className)} {...props}/>;
}
function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="sidebar-menu-sub-item" className={cn('group/menu-sub-item relative min-w-0', className)} {...props}/>;
}
function SidebarMenuSubButton({ className, asChild = false, isActive = false, size = 'md', ...props }: React.ComponentProps<'button'> & { asChild?: boolean; isActive?: boolean; size?: 'sm' | 'md' }) {
  const Component = asChild ? Slot.Root : 'button';
  return <Component data-slot="sidebar-menu-sub-button" data-active={isActive} data-size={size} aria-current={isActive ? 'page' : undefined} className={cn('flex h-8 min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-left text-xs text-sidebar-foreground/75 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[size=sm]:h-7 data-[size=sm]:text-[11px]', className)} {...props}/>;
}
function SidebarMenuSkeleton({ className, showIcon = false, ...props }: React.ComponentProps<'div'> & { showIcon?: boolean }) {
  return <div data-slot="sidebar-menu-skeleton" className={cn('flex h-9 items-center gap-2 rounded-md px-2', className)} {...props}>{showIcon && <div className="size-4 shrink-0 animate-pulse rounded bg-sidebar-accent"/>}<div className="h-3 max-w-[var(--skeleton-width,70%)] flex-1 animate-pulse rounded bg-sidebar-accent"/></div>;
}
function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) { return <main data-slot="sidebar-inset" className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col bg-background', className)} {...props}/>; }
export { SidebarProvider, Sidebar, SidebarTrigger, SidebarRail, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarGroupAction, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarMenuBadge, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, SidebarMenuSkeleton, SidebarSeparator, SidebarInset, useSidebar };
