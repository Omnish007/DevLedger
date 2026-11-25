import { useEffect, useState, type ReactNode } from 'react';
import { Activity, BookOpen, CheckSquare2, FileText, FolderKanban, Plus, RefreshCw, Search, Settings2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarSeparator, SidebarTrigger } from '@/components/ui/sidebar';
import { Kbd } from '@/components/ui/kbd';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

type ViewId = 'dashboard' | 'projects' | 'notes' | 'tasks' | 'documents' | 'search' | 'settings' | 'contacts' | 'operations';

const navigation: Array<{ id: ViewId; label: string; icon: typeof Activity; shortcut?: string }> = [
  { id: 'dashboard', label: 'Overview', icon: Activity },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'notes', label: 'Notes', icon: BookOpen },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare2 },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'operations', label: 'Operations', icon: Activity },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

const workspaceNavigation = navigation.filter((item) => item.id !== 'search' && item.id !== 'settings');
const utilityNavigation = navigation.filter((item) => item.id === 'search' || item.id === 'settings');

interface AppShellProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  onQuickCapture: () => void;
  children: ReactNode;
  onRefresh: () => void;
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
}

export function AppShell({ activeView, onNavigate, onQuickCapture, children, onRefresh, sidebarOpen, onSidebarOpenChange }: AppShellProps) {
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const renderNavigation = (items: typeof navigation) => items.map((item) => {
    const Icon = item.icon;
    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton asChild isActive={activeView === item.id} tooltip={item.label}>
          <button type="button" onClick={() => onNavigate(item.id)} aria-current={activeView === item.id ? 'page' : undefined}>
            <Icon aria-hidden="true" strokeWidth={1.8} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
          </button>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  });

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={onSidebarOpenChange} className="h-full min-h-0 w-full min-w-0">
      <div className="flex h-full min-h-0 w-full min-w-0 bg-background">
        <Sidebar collapsible="icon" className="border-r border-sidebar-border [--sidebar-width:15.5rem] [--sidebar-width-icon:3.55rem]">
          <SidebarHeader className="px-4 pb-5 pt-5">
            <div className="flex min-h-10 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <BookOpen className="size-[18px]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 group-data-[state=collapsed]/sidebar-provider:hidden">
                <div className="text-[15px] font-semibold tracking-[-0.035em]">DevLedger</div>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-5 px-3 py-1">
            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="h-7 px-2">Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">{renderNavigation(workspaceNavigation)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="h-7 px-2">Tools</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">{renderNavigation(utilityNavigation)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="px-3 pb-3 pt-2">
            <SidebarSeparator className="mb-3" />
            <Button variant="outline" className="h-9 w-full justify-start gap-2 group-data-[state=collapsed]/sidebar-provider:justify-center group-data-[state=collapsed]/sidebar-provider:px-0" onClick={onQuickCapture}>
              <Plus className="size-4" />
              <span className="flex-1 text-left group-data-[state=collapsed]/sidebar-provider:hidden">Quick capture</span>
              <Kbd className="group-data-[state=collapsed]/sidebar-provider:hidden">Ctrl ⇧ Space</Kbd>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="workspace-shell-header window-drag z-10 flex shrink-0 items-center justify-between px-4 sm:px-6">
            <div className="window-no-drag flex min-w-0 items-center">
              <SidebarTrigger />
            </div>
            <div className="window-no-drag flex shrink-0 items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-9 gap-2 px-3" onClick={() => setCommandOpen(true)} aria-label="Open command menu">
                <Search className="size-3.5" />
                <span className="hidden sm:inline">Command menu</span>
                <Kbd className="ml-1">Ctrl K</Kbd>
              </Button>
              <Button variant="ghost" size="sm" className="h-9 gap-2 px-2.5 sm:px-3" onClick={onQuickCapture}>
                <Plus className="size-4" />
                <span className="hidden md:inline">Capture</span>
              </Button>
              <Button variant="ghost" size="icon" className="size-9" aria-label="Refresh workspace" onClick={onRefresh}>
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </header>

          <main id="main-content" className="workspace-main">
            {children}
          </main>

        </div>
      </div>
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} title="DevLedger command palette" description="Navigate your workspace or start a quick capture.">
        <CommandInput placeholder="Search pages and actions…" />
        <CommandList>
          <CommandEmpty>No matching command.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.id} value={`${item.label} ${item.id}`} onSelect={() => { setCommandOpen(false); onNavigate(item.id); }}>
                  <Icon className="size-4 text-muted-foreground" />
                  <span>{item.label}</span>
                  {item.shortcut && <Kbd className="ml-auto">{item.shortcut}</Kbd>}
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup heading="Create">
            <CommandItem value="quick capture new note" onSelect={() => { setCommandOpen(false); onQuickCapture(); }}>
              <Plus className="size-4 text-muted-foreground" />
              <span>Quick capture</span>
              <Kbd className="ml-auto">Ctrl ⇧ Space</Kbd>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </SidebarProvider>
  );
}

export type { ViewId };
