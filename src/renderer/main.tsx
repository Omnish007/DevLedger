import { useCallback, useEffect, useState, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import type {
    ActiveTimerRecord,
    AppMetadata,
    ContactInput,
    DashboardSummary,
    NoteInput,
    NoteRecord,
    ProtectedNoteRecord,
    ProjectInput,
    ProjectRecord,
    ProjectStatus,
    SearchResult,
    TaskInput,
    TaskStatus,
    VaultStatus,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { AppShell, type ViewId } from '@/components/shared/AppShell';
import { ConfirmProvider } from '@/components/shared/ConfirmProvider';
import { RendererErrorBoundary } from '@/components/shared/RendererErrorBoundary';
import { targetFromRecord } from '@/lib/navigation';
import { dispatchRendererNotifications } from '@/lib/notifications-client';
import { friendlyError } from '@/lib/utils';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { NotesPage } from '@/features/notes/NotesPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { DocumentsPage } from '@/features/documents/DocumentsPage';
import { SearchPage } from '@/features/search/SearchPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { QuickCapturePage } from '@/features/capture/QuickCapturePage';
import { ContactsPage } from '@/features/contacts/ContactsPage';
import '@/styles/globals.css';

function App() {
    const captureWindow = new URLSearchParams(window.location.search).get('capture') === '1';
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
            setLoading(false);
            return () => {
                mounted = false;
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

    const navigateRef = useRef<(next: WorkspaceNavigationTarget) => Promise<void>>(async () => {});
    const webPushSetting = settings['notifications.webPush'];
    const allowWebPushRef = useRef(true);
    allowWebPushRef.current = webPushSetting !== false;
    const allowInAppRef = useRef(true);
    allowInAppRef.current = settings['notifications.inApp'] !== false;

    useEffect(() => {
        if (captureWindow || loading) return;
        const notifApi = window.devLedger?.notifications;
        if (!notifApi) return;
        const handleDelivery = (payload: Parameters<typeof dispatchRendererNotifications>[0]) => {
            if (!allowInAppRef.current && !allowWebPushRef.current) return;
            dispatchRendererNotifications(payload, (target) => void navigateRef.current(target), {
                allowWebPush: allowWebPushRef.current,
                alwaysWebPush: webPushSetting === true,
            });
        };
        const offDelivered =
            typeof notifApi.onDelivered === 'function'
                ? notifApi.onDelivered(handleDelivery)
                : () => undefined;
        const offOpenTarget =
            typeof notifApi.onOpenTarget === 'function'
                ? notifApi.onOpenTarget((target) => void navigateRef.current(target))
                : () => undefined;
        if (typeof notifApi.deliverDue === 'function') {
            void notifApi
                .deliverDue()
                .then(handleDelivery)
                .catch(() => undefined);
        }
        const timer = window.setInterval(() => {
            if (typeof notifApi.deliverDue !== 'function') return;
            void notifApi
                .deliverDue()
                .then(handleDelivery)
                .catch(() => undefined);
        }, 20_000);
        return () => {
            offDelivered();
            offOpenTarget();
            window.clearInterval(timer);
        };
    }, [captureWindow, loading, webPushSetting]);

    const theme = settings['theme'];
    useEffect(() => {
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
        document.documentElement.classList.toggle(
            'dark',
            theme === 'dark' || (theme !== 'light' && prefersDark),
        );
    }, [theme]);

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
    navigateRef.current = (next) => navigateToTarget(next);
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

    if (captureWindow)
        return (
            <>
                <QuickCapturePage
                    onSave={async (input) => {
                        await window.devLedger.capture.save(input);
                    }}
                />
                <Sonner
                    position="bottom-right"
                    richColors
                    theme={settings['theme'] === 'dark' ? 'dark' : 'light'}
                />
            </>
        );
    if (fatalError)
        return (
            <main className="grid h-full place-items-center bg-background p-8">
                <div className="max-w-lg rounded-lg border border-border bg-surface p-6">
                    <h1 className="text-base font-semibold">Workspace could not start</h1>
                    <p className="mt-2 text-sm text-muted-foreground">{fatalError}</p>
                    <ButtonLike onClick={() => window.location.reload()}>Try again</ButtonLike>
                </div>
            </main>
        );

    return (
        <AppShell
            activeView={activeView}
            canGoBack={navHistory.length > 0}
            onGoBack={() => void handleGoBack()}
            onNavigate={(view) => void navigateToTarget({ view })}
            onNavigateTarget={(target) => void navigateToTarget(target)}
            onQuickCapture={() => void openCapture()}
            onRefresh={() =>
                void refreshAll().catch((e: unknown) => toast.error(friendlyError(e, 'Refresh failed')))
            }
            sidebarOpen={settings['sidebarOpen'] !== false}
            onSidebarOpenChange={(open) => {
                void window.devLedger.settings
                    .set('sidebarOpen', open)
                    .then(() => setSettings((c) => ({ ...c, sidebarOpen: open })))
                    .catch((e: unknown) =>
                        toast.error(friendlyError(e, 'Sidebar preference could not be saved.')),
                    );
            }}
        >
            {loading ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                    Opening your local workspace…
                </div>
            ) : (
                <>
                    {viewLoading && (
                        <div className="pointer-events-none fixed bottom-4 right-5 z-20 rounded border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
                            Refreshing…
                        </div>
                    )}
                    {activeView === 'dashboard' && (
                        <DashboardPage
                            summary={summary}
                            projects={projects}
                            loading={loading}
                            onNavigate={(view) => void navigateToTarget({ view })}
                            onNavigateTarget={(target) => void navigateToTarget(target)}
                            onCompleteTask={async (id) => {
                                await window.devLedger.tasks.update(id, { status: 'completed' });
                                toast.success('Task completed');
                                await refreshAll();
                            }}
                            onResolveBlocker={async (blockerId) => {
                                await window.devLedger.operations.resolveBlocker(
                                    blockerId,
                                    'Resolved from overview.',
                                );
                                toast.success('Blocker resolved');
                                await refreshAll();
                            }}
                            onStartTimer={async (id) => {
                                await window.devLedger.tasks.startTimer(id);
                                toast.success('Timer started');
                                await refreshAll();
                            }}
                            onStopTimer={async (id) => {
                                const secs = await window.devLedger.tasks.stopTimer(id);
                                toast.success(`Timer stopped · ${Math.round(secs / 60)} minutes`);
                                await refreshAll();
                            }}
                            onReminderAction={async (id, action) => {
                                await window.devLedger.operations.updateReminder(
                                    id,
                                    action === 'snooze' ? 'snooze' : 'dismiss',
                                    undefined,
                                    action === 'snooze' ? 60 : undefined,
                                );
                                await refreshAll();
                            }}
                        />
                    )}
                    {activeView === 'projects' && (
                        <ProjectsPage
                            focusId={navTarget.recordId}
                            onConsumeFocus={() => setNavTarget({ view: 'projects' })}
                            onCreate={async (i: ProjectInput) => {
                                await window.devLedger.projects.create(i);
                                toast.success('Project created');
                            }}
                            onUpdate={async (
                                id: string,
                                i: Partial<ProjectInput> & { status?: ProjectStatus },
                            ) => {
                                await window.devLedger.projects.update(id, i);
                                toast.success('Project updated');
                            }}
                            onArchive={async (id: string) => {
                                await window.devLedger.projects.archive(id);
                                toast.success('Project archived');
                            }}
                            onRestore={async (id: string) => {
                                await window.devLedger.projects.restore(id);
                                toast.success('Project restored');
                            }}
                            onExport={async (id: string) => {
                                const p = await window.devLedger.projects.export(id);
                                if (p) toast.success(`Project exported to ${p}.`);
                                return p;
                            }}
                            onImport={importProject}
                            onNavigateTarget={(target) => void navigateToTarget(target)}
                            loading={loading}
                        />
                    )}
                    {activeView === 'notes' && (
                        <NotesPage
                            notes={notes}
                            focusNoteId={navTarget.recordId}
                            focusProjectId={navTarget.projectId}
                            onConsumeFocus={() => setNavTarget({ view: 'notes' })}
                            vaultStatus={vaultStatus}
                            onCreate={async (i: NoteInput) => {
                                const n = await window.devLedger.notes.create(i);
                                setNotes((c) => [n, ...c.filter((x) => x.id !== n.id)].slice(0, 50));
                                return n;
                            }}
                            onUpdate={async (id: string, i: Partial<NoteInput>) => {
                                const n = await window.devLedger.notes.update(id, i);
                                setNotes((c) => c.map((x) => (x.id === id ? n : x)));
                                return n;
                            }}
                            onSaveLocked={(
                                id: string,
                                i: { title: string; content: string; projectId: string | null },
                            ): Promise<ProtectedNoteRecord> => window.devLedger.notes.saveLocked(id, i)}
                            onLock={async (id: string) => {
                                await window.devLedger.notes.lock(id);
                                setNotes((c) => c.filter((x) => x.id !== id));
                                toast.success('Note protected');
                            }}
                            onUnlock={async (id: string) => {
                                const n = await window.devLedger.notes.unlock(id);
                                toast.success('Protected note unlocked');
                                return n;
                            }}
                            onDelete={async (id: string) => {
                                await window.devLedger.notes.remove(id);
                                setNotes((c) => c.filter((x) => x.id !== id));
                                toast.success('Note moved to trash');
                            }}
                            onRegisterFlush={(flush) => {
                                notesFlushRef.current = flush;
                            }}
                            onNavigateTarget={(target) => void navigateToTarget(target)}
                        />
                    )}
                    {activeView === 'tasks' && (
                        <TasksPage
                            focusTaskId={navTarget.recordId}
                            initialProjectId={navTarget.projectId}
                            onConsumeFocus={() => setNavTarget({ view: 'tasks' })}
                            onCreate={async (i: TaskInput) => {
                                const t = await window.devLedger.tasks.create(i);
                                toast.success('Task created');
                                return t;
                            }}
                            onUpdate={(id: string, i: Partial<TaskInput> & { status?: TaskStatus }) =>
                                window.devLedger.tasks.update(id, i)
                            }
                            onRemove={async (id: string) => {
                                await window.devLedger.tasks.remove(id);
                                toast.success('Task moved to trash');
                            }}
                            onStartTimer={async (id: string) => {
                                await window.devLedger.tasks.startTimer(id);
                                setActiveTimer(await window.devLedger.tasks.getActiveTimer());
                                toast.success('Timer started');
                            }}
                            onStopTimer={async (id: string) => {
                                const s = await window.devLedger.tasks.stopTimer(id);
                                setActiveTimer(await window.devLedger.tasks.getActiveTimer());
                                toast.success(`Timer stopped · ${Math.round(s / 60)} minutes`);
                                return s;
                            }}
                            onResolveTimerRecovery={async (
                                id: string,
                                a: 'resume' | 'stop' | 'discard',
                                e?: string,
                            ) => {
                                await window.devLedger.tasks.resolveTimerRecovery(id, a, e);
                                setActiveTimer(await window.devLedger.tasks.getActiveTimer());
                            }}
                            refresh={refreshAll}
                            activeTimer={activeTimer}
                            onNavigateTarget={(target) => void navigateToTarget(target)}
                        />
                    )}
                    {activeView === 'documents' && (
                        <DocumentsPage
                            initialProjectId={navTarget.projectId}
                            onConsumeFocus={() => setNavTarget({ view: 'documents' })}
                            vaultUnlocked={vaultStatus.unlocked}
                            onImport={async (projectId?: string | null, protect = false) => {
                                const r = await window.devLedger.documents.import(projectId, protect);
                                return r?.warning ?? (r ? `Imported ${r.document.originalName}.` : null);
                            }}
                            onOpen={(id) => window.devLedger.documents.open(id)}
                            onNavigateTarget={(target) => void navigateToTarget(target)}
                            refresh={refreshAll}
                        />
                    )}
                    {activeView === 'search' && (
                        <SearchPage
                            onSearch={(q, p) =>
                                window.devLedger.search.query({ query: q, projectId: p ?? null, limit: 50 })
                            }
                            onHybridSearch={(q, p) => window.devLedger.ai.hybridSearch(q, p ?? null)}
                            onOpenResult={(r) => void openSearchResult(r)}
                            onAiStatus={() => window.devLedger.ai.status()}
                            onSummarize={(q, p) => window.devLedger.ai.summarize(q, p ?? null)}
                        />
                    )}
                    {activeView === 'settings' && (
                        <SettingsPage
                            metadata={metadata}
                            settings={settings}
                            vaultStatus={vaultStatus}
                            onSettingChange={async (k, v) => {
                                await window.devLedger.settings.set(k, v);
                                setSettings((c) => ({ ...c, [k]: v }));
                            }}
                            onVaultSetup={async (p) => {
                                const r = await window.devLedger.vault.setup(p);
                                setVaultStatus(await window.devLedger.vault.status());
                                return r.recoveryKey;
                            }}
                            onVaultUnlock={async (s, rec) => {
                                await window.devLedger.vault.unlock(s, rec);
                                setVaultStatus(await window.devLedger.vault.status());
                                toast.success('Vault unlocked');
                            }}
                            onVaultLock={async () => {
                                await window.devLedger.vault.lock();
                                setVaultStatus(await window.devLedger.vault.status());
                                toast.success('Vault locked');
                            }}
                            onVaultChangePassphrase={async (p) => {
                                await window.devLedger.vault.changePassphrase(p);
                                toast.success('Vault passphrase changed');
                            }}
                            onConfigureVaultDeviceUnlock={(e) =>
                                window.devLedger.vault.configureDeviceUnlock(e)
                            }
                            onCreateBackup={(p) => window.devLedger.backups.create(p)}
                            onRestoreBackup={(s, r) => window.devLedger.backups.restoreAsCopy(s, r)}
                            onActivateRestoreCopy={(p) => window.devLedger.backups.activateRestoreCopy(p)}
                            onGetRestoreActivationStatus={() =>
                                window.devLedger.backups.getRestoreActivationStatus()
                            }
                            onRollbackRestoreActivation={() =>
                                window.devLedger.backups.rollbackRestoreActivation()
                            }
                            onCommitRestoreActivation={() =>
                                window.devLedger.backups.commitRestoreActivation()
                            }
                            onChooseExternalBackupDestination={() =>
                                window.devLedger.backups.chooseExternalDestination()
                            }
                            onClearExternalBackupDestination={() =>
                                window.devLedger.backups.clearExternalDestination()
                            }
                            onChooseOfflineBackupDestination={() =>
                                window.devLedger.backups.chooseOfflineDestination()
                            }
                            onClearOfflineBackupDestination={() =>
                                window.devLedger.backups.clearOfflineDestination()
                            }
                            onCheckOllama={() => window.devLedger.ai.status()}
                            onIndexSemantic={() => window.devLedger.ai.indexSemanticKnowledge()}
                        />
                    )}
                    {activeView === 'contacts' && (
                        <ContactsPage
                            initialProjectId={navTarget.projectId}
                            onConsumeFocus={() => setNavTarget({ view: 'contacts' })}
                            onCreate={async (i: ContactInput) => {
                                await window.devLedger.contacts.create(i);
                                toast.success('Contact created');
                            }}
                            onUpdate={async (id: string, i: Partial<ContactInput>) => {
                                await window.devLedger.contacts.update(id, i);
                                toast.success('Contact updated');
                            }}
                            onRemove={async (id: string) => {
                                await window.devLedger.contacts.remove(id);
                                toast.success('Contact moved to trash');
                            }}
                            onNavigateTarget={(target) => void navigateToTarget(target)}
                        />
                    )}
                </>
            )}
            <Sonner
                position="bottom-right"
                richColors
                theme={settings['theme'] === 'dark' ? 'dark' : 'light'}
            />
        </AppShell>
    );
}

function ButtonLike({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="mt-4 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
        >
            {children}
        </button>
    );
}

createRoot(document.getElementById('root')!).render(
    <RendererErrorBoundary>
        <TooltipProvider>
            <ConfirmProvider>
                <App />
            </ConfirmProvider>
        </TooltipProvider>
    </RendererErrorBoundary>,
);
