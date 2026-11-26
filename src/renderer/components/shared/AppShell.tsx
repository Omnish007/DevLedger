import { useEffect, useState, type ReactNode } from 'react';
import {
    Activity,
    ArrowLeft,
    BookOpen,
    CheckSquare2,
    FileText,
    FolderKanban,
    Plus,
    RefreshCw,
    Search,
    Settings2,
    Users,
} from 'lucide-react';
import type { SearchResult, WorkspaceNavigationTarget, WorkspaceViewId } from '@shared/contracts';
import { DevLedgerLogo } from '@/components/shared/BrandMark';
import { Button } from '@/components/ui/button';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarSeparator,
    SidebarTrigger,
} from '@/components/ui/sidebar';
import { Kbd } from '@/components/ui/kbd';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { NotificationsPopover } from '@/components/shared/NotificationsPopover';
import { targetFromRecord } from '@/lib/navigation';

export type ViewId = WorkspaceViewId;

const navigation: Array<{ id: ViewId; label: string; icon: typeof Activity; shortcut?: string }> = [
    { id: 'dashboard', label: 'Overview', icon: Activity },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'notes', label: 'Notes', icon: BookOpen },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare2 },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'settings', label: 'Settings', icon: Settings2 },
];

const workspaceNavigation = navigation.filter((item) => item.id !== 'search' && item.id !== 'settings');
const utilityNavigation = navigation.filter((item) => item.id === 'search' || item.id === 'settings');

interface AppShellProps {
    activeView: ViewId;
    canGoBack: boolean;
    onGoBack: () => void;
    onNavigate: (view: ViewId) => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
    onQuickCapture: () => void;
    children: ReactNode;
    onRefresh: () => void;
    sidebarOpen: boolean;
    onSidebarOpenChange: (open: boolean) => void;
}

export function AppShell({
    activeView,
    canGoBack,
    onGoBack,
    onNavigate,
    onNavigateTarget,
    onQuickCapture,
    children,
    onRefresh,
    sidebarOpen,
    onSidebarOpenChange,
}: AppShellProps) {
    const [commandOpen, setCommandOpen] = useState(false);
    const [commandQuery, setCommandQuery] = useState('');
    const [quickResults, setQuickResults] = useState<SearchResult[]>([]);

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

    useEffect(() => {
        if (!commandOpen || !commandQuery.trim()) {
            setQuickResults([]);
            return;
        }
        let active = true;
        const timer = window.setTimeout(() => {
            void window.devLedger.search
                .query({ query: commandQuery.trim(), limit: 8 })
                .then((rows) => {
                    if (active) setQuickResults(rows);
                })
                .catch(() => undefined);
        }, 150);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [commandOpen, commandQuery]);

    const renderNavigation = (items: typeof navigation) =>
        items.map((item) => {
            const Icon = item.icon;
            return (
                <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild isActive={activeView === item.id} tooltip={item.label}>
                        <button
                            type="button"
                            onClick={() => onNavigate(item.id)}
                            aria-current={activeView === item.id ? 'page' : undefined}
                        >
                            <Icon aria-hidden="true" strokeWidth={1.75} />
                            <span className="min-w-0 flex-1 truncate group-data-[state=collapsed]/sidebar-provider:sr-only">
                                {item.label}
                            </span>
                            {item.shortcut && (
                                <Kbd className="group-data-[state=collapsed]/sidebar-provider:hidden">
                                    {item.shortcut}
                                </Kbd>
                            )}
                        </button>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            );
        });

    return (
        <SidebarProvider
            open={sidebarOpen}
            onOpenChange={onSidebarOpenChange}
            className="h-full min-h-0 w-full min-w-0"
        >
            <div className="flex h-full min-h-0 w-full min-w-0 bg-background">
                <Sidebar
                    collapsible="icon"
                    className="border-r border-sidebar-border [--sidebar-width:14.75rem] [--sidebar-width-icon:3.45rem]"
                >
                    <SidebarHeader className="px-3.5 pb-4 pt-4 group-data-[state=collapsed]/sidebar-provider:items-center group-data-[state=collapsed]/sidebar-provider:px-0">
                        <DevLedgerLogo />
                    </SidebarHeader>

                    <SidebarContent className="gap-4 px-2.5 py-1 group-data-[state=collapsed]/sidebar-provider:px-2">
                        <SidebarGroup className="p-0">
                            <SidebarGroupLabel className="h-6 px-2">Workspace</SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu className="gap-0.5">
                                    {renderNavigation(workspaceNavigation)}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                        <SidebarGroup className="p-0">
                            <SidebarGroupLabel className="h-6 px-2">Tools</SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu className="gap-0.5">
                                    {renderNavigation(utilityNavigation)}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    </SidebarContent>

                    <SidebarFooter className="px-2.5 pb-3 pt-2 group-data-[state=collapsed]/sidebar-provider:px-2">
                        <SidebarSeparator className="mb-2.5 group-data-[state=collapsed]/sidebar-provider:mx-0" />
                        <Button
                            variant="outline"
                            title="Quick capture (Ctrl+Shift+Space)"
                            className="h-8 w-full justify-start gap-2 px-2.5 text-xs group-data-[state=collapsed]/sidebar-provider:mx-auto group-data-[state=collapsed]/sidebar-provider:size-8 group-data-[state=collapsed]/sidebar-provider:justify-center group-data-[state=collapsed]/sidebar-provider:p-0"
                            onClick={onQuickCapture}
                        >
                            <Plus className="size-3.5 shrink-0" />
                            <span className="flex-1 truncate text-left group-data-[state=collapsed]/sidebar-provider:sr-only">
                                Quick capture
                            </span>
                            <Kbd className="px-1 text-[10px] tracking-tight group-data-[state=collapsed]/sidebar-provider:hidden">
                                Ctrl⇧Space
                            </Kbd>
                        </Button>
                    </SidebarFooter>
                </Sidebar>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <header className="workspace-shell-header window-drag z-10 flex shrink-0 items-center justify-between px-4 sm:px-5">
                        <div className="window-no-drag flex min-w-0 items-center gap-1.5">
                            <SidebarTrigger />
                            {canGoBack && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    aria-label="Go back"
                                    onClick={onGoBack}
                                >
                                    <ArrowLeft className="size-4" />
                                </Button>
                            )}
                        </div>
                        <div className="window-no-drag flex shrink-0 items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-2 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setCommandOpen(true)}
                                aria-label="Open command menu"
                            >
                                <Search className="size-3.5" />
                                <span className="hidden sm:inline">Search workspace…</span>
                                <Kbd className="ml-1">Ctrl K</Kbd>
                            </Button>
                            <NotificationsPopover onNavigateTarget={onNavigateTarget} />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                title="Refresh workspace"
                                aria-label="Refresh workspace"
                                onClick={onRefresh}
                            >
                                <RefreshCw className="size-3.5" />
                            </Button>
                        </div>
                    </header>

                    <main
                        id="main-content"
                        className={`workspace-main${activeView === 'notes' ? ' is-edge-to-edge' : ''}`}
                    >
                        {children}
                    </main>
                </div>
            </div>

            <CommandDialog
                open={commandOpen}
                onOpenChange={(open) => {
                    setCommandOpen(open);
                    if (!open) setCommandQuery('');
                }}
                title="DevLedger command palette"
                description="Jump to a record, switch views or capture a quick note."
            >
                <CommandInput
                    value={commandQuery}
                    onValueChange={setCommandQuery}
                    placeholder="Jump to a note, task, project, contact or view…"
                />
                <CommandList>
                    <CommandEmpty>No matching command or record.</CommandEmpty>
                    {quickResults.length > 0 && (
                        <CommandGroup heading="Records">
                            {quickResults.map((result) => (
                                <CommandItem
                                    key={`${result.type}:${result.id}`}
                                    value={`record-${result.type}-${result.title}-${result.id}`}
                                    onSelect={() => {
                                        setCommandOpen(false);
                                        onNavigateTarget(
                                            targetFromRecord(result.type, result.id, result.projectId),
                                        );
                                    }}
                                >
                                    <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                        {result.type}
                                    </span>
                                    <span className="truncate">{result.title}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                    <CommandGroup heading="Navigate">
                        {navigation.map((item) => {
                            const Icon = item.icon;
                            return (
                                <CommandItem
                                    key={item.id}
                                    value={`${item.label} ${item.id}`}
                                    onSelect={() => {
                                        setCommandOpen(false);
                                        onNavigate(item.id);
                                    }}
                                >
                                    <Icon className="size-4 text-muted-foreground" />
                                    <span>{item.label}</span>
                                    {item.shortcut && <Kbd className="ml-auto">{item.shortcut}</Kbd>}
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                    <CommandGroup heading="Create">
                        <CommandItem
                            value="quick capture new note"
                            onSelect={() => {
                                setCommandOpen(false);
                                onQuickCapture();
                            }}
                        >
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
