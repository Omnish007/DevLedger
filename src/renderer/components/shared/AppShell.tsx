import { useEffect, useState, type ReactNode } from 'react';
import {
    Activity,
    ArrowLeft,
    BookOpen,
    CheckSquare2,
    FileText,
    FolderKanban,
    PanelLeft,
    Plus,
    RefreshCw,
    Search,
    Settings2,
    Users,
} from 'lucide-react';
import type { WorkspaceNavigationTarget, WorkspaceViewId } from '@shared/contracts';
import { DevLedgerLogo } from '@/components/shared/BrandMark';
import { CommandPaletteDialog, type CommandPaletteNavItem } from '@/components/shared/CommandPaletteDialog';
import { NotificationsPopover } from '@/components/shared/NotificationsPopover';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
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
import { useMediaQuery } from '@/hooks/useMediaQuery';

export type ViewId = WorkspaceViewId;

const navigation: CommandPaletteNavItem[] = [
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
    const isMobile = useMediaQuery('(max-width: 639px)');
    const isTablet = useMediaQuery('(max-width: 899px)');
    const viewportMode: 'desktop' | 'tablet' | 'mobile' = isMobile
        ? 'mobile'
        : isTablet
          ? 'tablet'
          : 'desktop';
    const [compactSidebarOpen, setCompactSidebarOpen] = useState(false);

    useEffect(() => {
        if (viewportMode !== 'desktop') setCompactSidebarOpen(false);
    }, [viewportMode]);

    const isCompactViewport = viewportMode !== 'desktop';
    const handleSelectView = (view: ViewId) => {
        if (isCompactViewport) setCompactSidebarOpen(false);
        onNavigate(view);
    };

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

    const renderNavigation = (items: typeof navigation) =>
        items.map((item) => {
            const Icon = item.icon;
            return (
                <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild isActive={activeView === item.id} tooltip={item.label}>
                        <button
                            type="button"
                            onClick={() => handleSelectView(item.id)}
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
            data-viewport={viewportMode}
            data-compact-open={compactSidebarOpen ? 'true' : 'false'}
            className="h-full min-h-0 w-full min-w-0"
        >
            <div className="relative flex h-full min-h-0 w-full min-w-0 bg-background">
                {isCompactViewport && compactSidebarOpen && (
                    <button
                        type="button"
                        aria-label="Close navigation menu"
                        onClick={() => setCompactSidebarOpen(false)}
                        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px]"
                    />
                )}
                <Sidebar
                    collapsible={viewportMode === 'mobile' ? 'offcanvas' : 'icon'}
                    className="border-r border-sidebar-border [--sidebar-width:15.75rem] [--sidebar-width-icon:3.45rem]"
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
                            className="h-9 w-full justify-start gap-2 px-2.5 text-xs group-data-[state=collapsed]/sidebar-provider:mx-auto group-data-[state=collapsed]/sidebar-provider:size-9 group-data-[state=collapsed]/sidebar-provider:justify-center group-data-[state=collapsed]/sidebar-provider:p-0"
                            onClick={() => {
                                if (viewportMode === 'mobile') setCompactSidebarOpen(false);
                                onQuickCapture();
                            }}
                        >
                            <Plus className="size-3.5 shrink-0" />
                            <span className="flex-1 truncate text-left group-data-[state=collapsed]/sidebar-provider:sr-only">
                                Quick capture
                            </span>
                            <Kbd className="px-1.5 text-[11px] tracking-tight group-data-[state=collapsed]/sidebar-provider:hidden">
                                Ctrl ⇧ Space
                            </Kbd>
                        </Button>
                    </SidebarFooter>
                </Sidebar>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <header className="workspace-shell-header window-drag z-10 flex shrink-0 items-center justify-between px-4 sm:px-5">
                        <div className="window-no-drag flex min-w-0 items-center gap-1.5">
                            {isCompactViewport ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Toggle navigation menu"
                                    aria-expanded={compactSidebarOpen}
                                    className="size-8 shrink-0"
                                    onClick={() => setCompactSidebarOpen((v) => !v)}
                                >
                                    <PanelLeft className="size-4" />
                                </Button>
                            ) : (
                                <SidebarTrigger />
                            )}
                            {canGoBack && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    title="Go back"
                                    aria-label="Go back"
                                    onClick={onGoBack}
                                >
                                    <ArrowLeft className="size-4" />
                                </Button>
                            )}
                        </div>
                        <div className="window-no-drag flex shrink-0 items-center gap-2">
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

            <CommandPaletteDialog
                open={commandOpen}
                navigation={navigation}
                onOpenChange={setCommandOpen}
                onNavigate={onNavigate}
                onNavigateTarget={onNavigateTarget}
                onQuickCapture={onQuickCapture}
            />
        </SidebarProvider>
    );
}
