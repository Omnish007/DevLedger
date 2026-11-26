import { Suspense } from 'react';
import { toast } from 'sonner';
import { AppShell } from '@/components/shared/AppShell';
import { Sonner } from '@/components/ui/sonner';
import { QuickCapturePage } from '@/features/capture/QuickCapturePage';
import { friendlyError } from '@/lib/utils';
import { FatalStartupError, RouteFallback } from './RouteFallback';
import { useAppNotifications } from './useAppNotifications';
import { useWorkspaceSession } from './useWorkspaceSession';
import { WorkspaceRoutes } from './WorkspaceRoutes';

export function App() {
    const captureWindow = new URLSearchParams(window.location.search).get('capture') === '1';
    const session = useWorkspaceSession(captureWindow);

    useAppNotifications({
        captureWindow,
        loading: session.loading,
        settings: session.settings,
        onNavigateTarget: (target) => session.navigateToTarget(target),
    });

    if (captureWindow) {
        return (
            <Suspense fallback={<RouteFallback />}>
                <QuickCapturePage
                    onSave={async (input) => {
                        await window.devLedger.capture.save(input);
                    }}
                />
                <Sonner position="bottom-right" theme={session.isDarkTheme ? 'dark' : 'light'} />
            </Suspense>
        );
    }

    if (session.fatalError) {
        return <FatalStartupError message={session.fatalError} />;
    }

    return (
        <AppShell
            activeView={session.activeView}
            canGoBack={session.navHistory.length > 0}
            onGoBack={() => void session.handleGoBack()}
            onNavigate={(view) => void session.navigateToTarget({ view })}
            onNavigateTarget={(target) => void session.navigateToTarget(target)}
            onQuickCapture={() => void session.openCapture()}
            onRefresh={() =>
                void session
                    .refreshAll()
                    .catch((e: unknown) => toast.error(friendlyError(e, 'Refresh failed')))
            }
            sidebarOpen={session.settings['sidebarOpen'] !== false}
            onSidebarOpenChange={(open) => {
                void window.devLedger.settings
                    .set('sidebarOpen', open)
                    .then(() => session.setSettings((c) => ({ ...c, sidebarOpen: open })))
                    .catch((e: unknown) =>
                        toast.error(friendlyError(e, 'Sidebar preference could not be saved.')),
                    );
            }}
        >
            {session.loading ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                    Opening your local workspace…
                </div>
            ) : (
                <WorkspaceRoutes
                    activeView={session.activeView}
                    navTarget={session.navTarget}
                    loading={session.loading}
                    viewLoading={session.viewLoading}
                    metadata={session.metadata}
                    summary={session.summary}
                    projects={session.projects}
                    notes={session.notes}
                    vaultStatus={session.vaultStatus}
                    activeTimer={session.activeTimer}
                    settings={session.settings}
                    setNavTarget={session.setNavTarget}
                    setNotes={session.setNotes}
                    setVaultStatus={session.setVaultStatus}
                    setActiveTimer={session.setActiveTimer}
                    setSettings={session.setSettings}
                    onRegisterNotesFlush={(flush) => {
                        session.notesFlushRef.current = flush;
                    }}
                    onNavigateTarget={(target) => session.navigateToTarget(target)}
                    onRefreshAll={session.refreshAll}
                    onImportProject={session.importProject}
                    onOpenSearchResult={session.openSearchResult}
                />
            )}
            <Sonner position="bottom-right" theme={session.isDarkTheme ? 'dark' : 'light'} />
        </AppShell>
    );
}
