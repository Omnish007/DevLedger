import { useEffect, useState, type ReactNode } from 'react';
import { Activity, BookOpen, CheckSquare2, FileText, FolderKanban, Plus, RefreshCw, Search, Settings2, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarSeparator, SidebarTrigger } from '@/components/ui/sidebar';
import { Kbd } from '@/components/ui/kbd';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export type ViewId = 'dashboard' | 'projects' | 'notes' | 'tasks' | 'documents' | 'search' | 'settings' | 'contacts' | 'operations';

const navigation: Array<{ id: ViewId; label: string; icon: typeof Activity; shortcut?: string }> = [
  { id: 'dashboard', label: 'Overview', icon: Activity },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'notes', label: 'Notes', icon: BookOpen },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare2 },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'operations', label: 'Operations', icon: Activity },
  { id: 'search', label: 'Search', icon: Search, shortcut: '⌘ K' },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

interface AppShellProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  onQuickCapture: () => void;
  children: ReactNode;
  title: string;
  subtitle?: string;
  onRefresh: () => void;
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
}

export function AppShell({ activeView, onNavigate, onQuickCapture, children, title, subtitle, onRefresh, sidebarOpen, onSidebarOpenChange }: AppShellProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={onSidebarOpenChange} className="h-full w-full">
      <div className="flex h-full min-h-0 w-full bg-background">
        <Sidebar collapsible="icon" className="border-r border-sidebar-border">
          <SidebarHeader>
            <div className="flex min-h-9 items-center gap-3 px-1">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><BookOpen className="size-4" /></div>
              <div className="min-w-0 group-data-[state=collapsed]/sidebar-provider:hidden">
                <div className="text-[13px] font-semibold tracking-tight">DevLedger</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Developer workspace</div>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton asChild isActive={activeView === item.id} tooltip={item.label}>
                          <button type="button" onClick={() => onNavigate(item.id)}>
                            <Icon aria-hidden="true" strokeWidth={1.8} />
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                          </button>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <div className="flex items-center justify-between px-2">
                <SidebarGroupLabel className="px-0">Capture</SidebarGroupLabel>
                <Button size="icon" variant="ghost" className="size-6 group-data-[state=collapsed]/sidebar-provider:hidden" aria-label="New quick capture" onClick={onQuickCapture}><Plus className="size-3.5" /></Button>
              </div>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Capture a thought">
                      <button type="button" onClick={onQuickCapture}>
                        <Sparkles className="size-3.5" />
                        <span className="flex-1 truncate">Capture a thought</span>
                        <span className="text-[10px] text-muted-foreground">⌘ ⇧ Space</span>
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <SidebarSeparator />
            <div className="flex items-center gap-2 rounded-md px-2 py-2 text-[11px] text-muted-foreground">
              <div className="size-1.5 shrink-0 rounded-full bg-success" />
              <span className="group-data-[state=collapsed]/sidebar-provider:hidden">Local workspace · Offline-ready</span>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="window-drag flex h-[58px] shrink-0 items-center justify-between border-b border-border bg-background px-5 sm:px-7">
            <div className="window-no-drag flex min-w-0 items-center gap-2">
              <SidebarTrigger />
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>
                {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
              </div>
            </div>
            <div className="window-no-drag flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)}><Search className="size-3.5" /><span className="hidden sm:inline">Search workspace</span><Kbd className="ml-1">⌘ K</Kbd></Button>
              <Button variant="ghost" size="icon" aria-label="Refresh workspace" onClick={onRefresh}><RefreshCw className="size-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Open settings" onClick={() => onNavigate('settings')}><Settings2 className="size-4" /></Button>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-auto px-5 py-6 sm:px-7">{children}</main>
          <footer className="flex h-7 shrink-0 items-center border-t border-border bg-surface px-5 text-[10px] text-muted-foreground sm:px-7">
            <span>DevLedger</span>
            <span className="mx-2">·</span>
            <span>Local-first · Single-user</span>
            <span className="ml-auto">Your data stays on this device</span>
          </footer>
        </div>
      </div>
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} title="DevLedger command palette" description="Navigate your workspace or start a quick capture.">
          <CommandInput placeholder="Search pages and actions…" />
          <CommandList>
            <CommandEmpty>No matching command.</CommandEmpty>
            <CommandGroup heading="Navigate">
              {navigation.map((item) => { const Icon = item.icon; return <CommandItem key={item.id} value={`${item.label} ${item.id}`} onSelect={() => { setCommandOpen(false); onNavigate(item.id); }}><Icon className="size-4 text-muted-foreground"/><span>{item.label}</span>{item.shortcut && <Kbd className="ml-auto">{item.shortcut}</Kbd>}</CommandItem>; })}
            </CommandGroup>
            <CommandGroup heading="Create">
              <CommandItem value="quick capture new note" onSelect={() => { setCommandOpen(false); onQuickCapture(); }}><Plus className="size-4 text-muted-foreground"/><span>Quick capture</span><Kbd className="ml-auto">⌘ ⇧ Space</Kbd></CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </SidebarProvider>
  );
}
