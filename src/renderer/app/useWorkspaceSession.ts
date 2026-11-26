import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
    ActiveTimerRecord,
    AppMetadata,
    DashboardSummary,
    NoteRecord,
    ProjectRecord,
    SearchResult,
    VaultStatus,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import type { ViewId } from '@/components/shared/AppShell';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { targetFromRecord } from '@/lib/navigation';
import { friendlyError } from '@/lib/utils';

export function useWorkspaceSession(captureWindow: boolean) {
    const [navTarget, setNavTarget] = useState<WorkspaceNavigationTarget>({ view: 'dashboard' });
    const [navHistory, setNavHistory] = useState<WorkspaceNavigationTarget[]>([]);
    const activeView = navTarget.view;

    const [metadata, setMetadata] = useState<AppMetadata | null>(null);
    const [projects, setProjects] = useState<ProjectRecord[]>([]);
    const [notes, setNotes] = useState<NoteRecord[]>([]);
    const [vaultStatus, setVaultStatus] = useState<VaultStatus>({ configured: false, unlocked: false });
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [activeTimer, setActiveTimer] = useState<ActiveTimerRecord | null>(null);
    const [settings, setSettings] = useState<Record<string, unknown>>({});
    const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
    const [loading, setLoading] = useState(true);
    const [viewLoading, setViewLoading] = useState(false);
    const [fatalError, setFatalError] = useState('');

    const notesFlushRef = useRef<(() => Promise<boolean>) | null>(null);
    const viewRequestRef = useRef(0);
    const dashboardSummaryPrefetched = useRef(false);

    const loadViewData = useCallback(async (view: ViewId) => {
        switch (view) {
            case 'dashboard': {
                const [dashboard, projectPage] = await Promise.all([
                    dashboardSummaryPrefetched.current
                        ? Promise.resolve(null)
                        : window.devLedger.dashboard.getSummary(),
                    window.devLedger.projects.listPage({ limit: 6, offset: 0 }),
                ]);
                dashboardSummaryPrefetched.current = false;
                if (dashboard) setSummary(dashboard);
                setProjects(projectPage.items);
                break;
            }
            case 'tasks':
                setProjects([]);
                setActiveTimer(await window.devLedger.tasks.getActiveTimer());
                break;
            case 'documents':
                setProjects([]);
                setVaultStatus(await window.devLedger.vault.status());
                break;
            case 'settings': {
                const [meta, settingRows, vault] = await Promise.all([
                    window.devLedger.app.getMetadata(),
                    window.devLedger.settings.getAll(),
                    window.devLedger.vault.status(),
                ]);
                setMetadata(meta);
                setSettings(settingRows);
                setVaultStatus(vault);
                break;
            }
            default:
                setProjects([]);
                setNotes([]);
                break;
        }
    }, []);

    const refreshAll = useCallback(async () => {
        const [dashboard, timer] = await Promise.all([
            window.devLedger.dashboard.getSummary(),
            window.devLedger.tasks.getActiveTimer(),
        ]);
        setSummary(dashboard);
        setActiveTimer(timer);
        if (activeView === 'dashboard' || activeView === 'settings') await loadViewData(activeView);
    }, [activeView, loadViewData]);

    useEffect(() => {
        let mounted = true;
        if (captureWindow) {
            const syncCaptureSettings = () => {
                void window.devLedger.settings
                    .getAll()
                    .then((settingRows) => {
                        if (mounted) setSettings(settingRows);
                    })
                    .catch(() => undefined)
                    .finally(() => {
                        if (mounted) setLoading(false);
                    });
            };
            syncCaptureSettings();
            window.addEventListener('focus', syncCaptureSettings);
            return () => {
                mounted = false;
                window.removeEventListener('focus', syncCaptureSettings);
            };
        }
        void Promise.all([
            window.devLedger.app.getMetadata(),
            window.devLedger.dashboard.getSummary(),
            window.devLedger.tasks.getActiveTimer(),
            window.devLedger.settings.getAll(),
            window.devLedger.vault.status(),
        ])
            .then(([meta, dashboard, timer, settingRows, vault]) => {
                if (!mounted) return;
                setMetadata(meta);
                setSummary(dashboard);
                dashboardSummaryPrefetched.current = true;
                setActiveTimer(timer);
                setSettings(settingRows);
                setVaultStatus(vault);
            })
            .catch((error: unknown) => {
                if (mounted) setFatalError(friendlyError(error, 'Application data could not be loaded.'));
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, [captureWindow]);

    useEffect(() => {
        if (loading || captureWindow) return;
        const requestId = ++viewRequestRef.current;
        setViewLoading(true);
        void loadViewData(activeView)
            .catch((error: unknown) => {
                if (requestId === viewRequestRef.current)
                    toast.error(friendlyError(error, 'This workspace view could not be loaded.'));
            })
            .finally(() => {
                if (requestId === viewRequestRef.current) setViewLoading(false);
            });
        return () => {
            viewRequestRef.current += 1;
        };
    }, [activeView, captureWindow, loadViewData, loading]);

    useEffect(() => {
        if (captureWindow) return;
        return window.devLedger.vault.onAutoLock(() => {
            setVaultStatus({ configured: true, unlocked: false });
            toast.message('Protected content vault locked after inactivity.');
        });
    }, [captureWindow]);

    const theme = settings['theme'];
    const isDarkTheme = theme === 'dark' || (theme !== 'light' && systemPrefersDark);
    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDarkTheme);
    }, [isDarkTheme]);

    async function navigateToTarget(next: WorkspaceNavigationTarget, pushHistory = true) {
        if (
            activeView === 'notes' &&
            next.view !== 'notes' &&
            notesFlushRef.current &&
            !(await notesFlushRef.current())
        )
            return;
        if (pushHistory) setNavHistory((prev) => [...prev.slice(-19), navTarget]);
        setNavTarget(next);
    }

    async function handleGoBack() {
        const previous = navHistory.at(-1);
        if (!previous) return;
        if (
            activeView === 'notes' &&
            previous.view !== 'notes' &&
            notesFlushRef.current &&
            !(await notesFlushRef.current())
        )
            return;
        setNavHistory((prev) => prev.slice(0, -1));
        setNavTarget(previous);
    }

    async function openCapture() {
        if (activeView === 'notes' && notesFlushRef.current && !(await notesFlushRef.current())) return;
        await window.devLedger.capture.open();
    }

    async function importProject() {
        try {
            const result = await window.devLedger.projects.import();
            if (!result) return;
            await refreshAll();
            toast.success(
                `Imported ${result.projectName}. ${result.lockedNotesSkipped} protected note(s) skipped because their vault key is not transferred.`,
            );
        } catch (error) {
            toast.error(friendlyError(error, 'The project archive could not be imported.'));
        }
    }

    async function openSearchResult(result: SearchResult) {
        if (result.type === 'document') {
            try {
                await window.devLedger.documents.open(result.id);
            } catch (e) {
                toast.error(friendlyError(e, 'Document could not be opened.'));
            }
            return;
        }
        await navigateToTarget(targetFromRecord(result.type, result.id, result.projectId));
    }

    return {
        navTarget,
        setNavTarget,
        navHistory,
        activeView,
        metadata,
        projects,
        notes,
        setNotes,
        vaultStatus,
        setVaultStatus,
        summary,
        activeTimer,
        setActiveTimer,
        settings,
        setSettings,
        isDarkTheme,
        loading,
        viewLoading,
        fatalError,
        notesFlushRef,
        refreshAll,
        navigateToTarget,
        handleGoBack,
        openCapture,
        importProject,
        openSearchResult,
    };
}
