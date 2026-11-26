import { lazy, Suspense, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import type {
    ActiveTimerRecord,
    AppMetadata,
    ContactInput,
    DashboardSummary,
    NoteInput,
    NoteRecord,
    ProjectInput,
    ProjectRecord,
    ProjectStatus,
    ProtectedNoteRecord,
    SearchResult,
    TaskInput,
    TaskStatus,
    VaultStatus,
    WorkspaceNavigationTarget,
    WorkspaceViewId,
} from '@shared/contracts';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { RouteFallback } from './RouteFallback';

const ProjectsPage = lazy(() =>
    import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
);
const NotesPage = lazy(() => import('@/features/notes/NotesPage').then((m) => ({ default: m.NotesPage })));
const TasksPage = lazy(() => import('@/features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const DocumentsPage = lazy(() =>
    import('@/features/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
);
const SearchPage = lazy(() =>
    import('@/features/search/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const SettingsPage = lazy(() =>
    import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const ContactsPage = lazy(() =>
    import('@/features/contacts/ContactsPage').then((m) => ({ default: m.ContactsPage })),
);

interface WorkspaceRoutesProps {
    activeView: WorkspaceViewId;
    navTarget: WorkspaceNavigationTarget;
    loading: boolean;
    viewLoading: boolean;
    metadata: AppMetadata | null;
    summary: DashboardSummary | null;
    projects: ProjectRecord[];
    notes: NoteRecord[];
    vaultStatus: VaultStatus;
    activeTimer: ActiveTimerRecord | null;
    settings: Record<string, unknown>;
    setNavTarget: (target: WorkspaceNavigationTarget) => void;
    setNotes: Dispatch<SetStateAction<NoteRecord[]>>;
    setVaultStatus: Dispatch<SetStateAction<VaultStatus>>;
    setActiveTimer: Dispatch<SetStateAction<ActiveTimerRecord | null>>;
    setSettings: Dispatch<SetStateAction<Record<string, unknown>>>;
    onRegisterNotesFlush: (flush: (() => Promise<boolean>) | null) => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => Promise<void>;
    onRefreshAll: () => Promise<void>;
    onImportProject: () => Promise<void>;
    onOpenSearchResult: (result: SearchResult) => Promise<void>;
}

export function WorkspaceRoutes({
    activeView,
    navTarget,
    loading,
    viewLoading,
    metadata,
    summary,
    projects,
    notes,
    vaultStatus,
    activeTimer,
    settings,
    setNavTarget,
    setNotes,
    setVaultStatus,
    setActiveTimer,
    setSettings,
    onRegisterNotesFlush,
    onNavigateTarget,
    onRefreshAll,
    onImportProject,
    onOpenSearchResult,
}: WorkspaceRoutesProps) {
    return (
        <Suspense fallback={<RouteFallback />}>
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
                    onNavigate={(view) => void onNavigateTarget({ view })}
                    onNavigateTarget={(target) => void onNavigateTarget(target)}
                    onCompleteTask={async (id) => {
                        await window.devLedger.tasks.update(id, { status: 'completed' });
                        toast.success('Task completed');
                        await onRefreshAll();
                    }}
                    onResolveBlocker={async (blockerId) => {
                        await window.devLedger.operations.resolveBlocker(
                            blockerId,
                            'Resolved from overview.',
                        );
                        toast.success('Blocker resolved');
                        await onRefreshAll();
                    }}
                    onStartTimer={async (id) => {
                        await window.devLedger.tasks.startTimer(id);
                        toast.success('Timer started');
                        await onRefreshAll();
                    }}
                    onStopTimer={async (id) => {
                        const secs = await window.devLedger.tasks.stopTimer(id);
                        toast.success(`Timer stopped · ${Math.round(secs / 60)} minutes`);
                        await onRefreshAll();
                    }}
                    onReminderAction={async (id, action) => {
                        await window.devLedger.operations.updateReminder(
                            id,
                            action === 'snooze' ? 'snooze' : 'dismiss',
                            undefined,
                            action === 'snooze' ? 60 : undefined,
                        );
                        await onRefreshAll();
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
                    onUpdate={async (id: string, i: Partial<ProjectInput> & { status?: ProjectStatus }) => {
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
                    onImport={onImportProject}
                    onNavigateTarget={(target) => void onNavigateTarget(target)}
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
                    onUnprotect={async (id: string) => {
                        const n = await window.devLedger.notes.unprotect(id);
                        setNotes((c) => c.map((x) => (x.id === id ? n : x)));
                        toast.success('Lock removed from note');
                        return n;
                    }}
                    onDelete={async (id: string) => {
                        await window.devLedger.notes.remove(id);
                        setNotes((c) => c.filter((x) => x.id !== id));
                        toast.success('Note moved to trash');
                    }}
                    onRegisterFlush={onRegisterNotesFlush}
                    onNavigateTarget={(target) => void onNavigateTarget(target)}
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
                    refresh={onRefreshAll}
                    activeTimer={activeTimer}
                    onNavigateTarget={(target) => void onNavigateTarget(target)}
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
                    onNavigateTarget={(target) => void onNavigateTarget(target)}
                    refresh={onRefreshAll}
                />
            )}
            {activeView === 'search' && (
                <SearchPage
                    onSearch={(q, p) =>
                        window.devLedger.search.query({ query: q, projectId: p ?? null, limit: 50 })
                    }
                    onHybridSearch={(q, p) => window.devLedger.ai.hybridSearch(q, p ?? null)}
                    onOpenResult={(r) => void onOpenSearchResult(r)}
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
                    onConfigureVaultDeviceUnlock={(e) => window.devLedger.vault.configureDeviceUnlock(e)}
                    onCreateBackup={(p) => window.devLedger.backups.create(p)}
                    onRestoreBackup={(s, r) => window.devLedger.backups.restoreAsCopy(s, r)}
                    onActivateRestoreCopy={(p) => window.devLedger.backups.activateRestoreCopy(p)}
                    onGetRestoreActivationStatus={() => window.devLedger.backups.getRestoreActivationStatus()}
                    onRollbackRestoreActivation={() => window.devLedger.backups.rollbackRestoreActivation()}
                    onCommitRestoreActivation={() => window.devLedger.backups.commitRestoreActivation()}
                    onChooseExternalBackupDestination={() =>
                        window.devLedger.backups.chooseExternalDestination()
                    }
                    onClearExternalBackupDestination={() =>
                        window.devLedger.backups.clearExternalDestination()
                    }
                    onChooseOfflineBackupDestination={() =>
                        window.devLedger.backups.chooseOfflineDestination()
                    }
                    onClearOfflineBackupDestination={() => window.devLedger.backups.clearOfflineDestination()}
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
                    onNavigateTarget={(target) => void onNavigateTarget(target)}
                />
            )}
        </Suspense>
    );
}
