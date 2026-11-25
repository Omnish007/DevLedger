import { lazy, Suspense, useCallback, useEffect, useState, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ActiveTimerRecord, AppMetadata, DashboardSummary, NoteInput, NoteRecord, ProtectedNoteRecord, ProjectInput, ProjectRecord, ProjectStatus, SearchResult, TaskInput, TaskStatus, VaultStatus } from '@shared/contracts';
import { AppShell, type ViewId } from '@/components/shared/AppShell';
import { ConfirmProvider } from '@/components/shared/ConfirmProvider';
import { RendererErrorBoundary } from '@/components/shared/RendererErrorBoundary';
import type { ContactInput } from '@shared/contracts';
import '@/styles/globals.css';

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage').then((module) => ({ default: module.ProjectsPage })));
const NotesPage = lazy(() => import('@/features/notes/NotesPage').then((module) => ({ default: module.NotesPage })));
const TasksPage = lazy(() => import('@/features/tasks/TasksPage').then((module) => ({ default: module.TasksPage })));
const DocumentsPage = lazy(() => import('@/features/documents/DocumentsPage').then((module) => ({ default: module.DocumentsPage })));
const SearchPage = lazy(() => import('@/features/search/SearchPage').then((module) => ({ default: module.SearchPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const QuickCapturePage = lazy(() => import('@/features/capture/QuickCapturePage').then((module) => ({ default: module.QuickCapturePage })));
const ContactsPage = lazy(() => import('@/features/contacts/ContactsPage').then((module) => ({ default: module.ContactsPage })));
const OperationsPage = lazy(() => import('@/features/operations/OperationsPage').then((module) => ({ default: module.OperationsPage })));

function App() {
  const captureWindow = new URLSearchParams(window.location.search).get('capture') === '1';
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
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
  const getRestoreActivationStatus = useCallback(() => window.devLedger.backups.getRestoreActivationStatus(), []);
  const rollbackRestoreActivation = useCallback(() => window.devLedger.backups.rollbackRestoreActivation(), []);
  const commitRestoreActivation = useCallback(() => window.devLedger.backups.commitRestoreActivation(), []);

  const loadViewData = useCallback(async (view: ViewId) => {
    switch (view) {
      case 'dashboard': {
        const [dashboard, projectPage] = await Promise.all([
          dashboardSummaryPrefetched.current ? Promise.resolve(null) : window.devLedger.dashboard.getSummary(),
          window.devLedger.projects.listPage({ limit: 5, offset: 0 }),
        ]);
        dashboardSummaryPrefetched.current = false;
        if (dashboard) setSummary(dashboard);
        setProjects(projectPage.items);
        break;
      }
      case 'projects':
        // ProjectsPage owns its server-paginated result set.
        setProjects([]);
        break;
      case 'notes': {
        setNotes([]);
        setProjects([]);
        break;
      }
      case 'tasks': {
        setProjects([]);
        setActiveTimer(await window.devLedger.tasks.getActiveTimer());
        break;
      }
      case 'documents':
        setProjects([]);
        setVaultStatus(await window.devLedger.vault.status());
        break;
      case 'search':
        setProjects([]);
        break;
      case 'settings': {
        const [meta, settingRows, vault] = await Promise.all([
          window.devLedger.app.getMetadata(), window.devLedger.settings.getAll(), window.devLedger.vault.status(),
        ]);
        setMetadata(meta); setSettings(settingRows); setVaultStatus(vault);
        break;
      }
      case 'contacts':
        setProjects([]);
        break;
      case 'operations':
        // Operations uses its own 30-row remote-search pickers. Do not load entire
        // workspace collections into React merely to populate cross-record selects.
        setProjects([]); setNotes([]);
        break;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const [dashboard, timer] = await Promise.all([
      window.devLedger.dashboard.getSummary(), window.devLedger.tasks.getActiveTimer(),
    ]);
    setSummary(dashboard); setActiveTimer(timer);
    // Refresh only view-level data that is not independently server-paginated.
    // List screens own their own page state and reload only the affected page.
    if (activeView === 'dashboard') {
      const projectsPage = await window.devLedger.projects.listPage({ limit: 5, offset: 0 });
      setProjects(projectsPage.items);
    } else if (activeView === 'settings' || activeView === 'operations') {
      await loadViewData(activeView);
    }
  }, [activeView, loadViewData]);

  useEffect(() => {
    let mounted = true;
    if (captureWindow) {
      // The compact capture window needs no dashboard, settings or vault bootstrap.
      setLoading(false);
      return () => { mounted = false; };
    }
    void Promise.all([
      window.devLedger.app.getMetadata(), window.devLedger.dashboard.getSummary(),
      window.devLedger.tasks.getActiveTimer(), window.devLedger.settings.getAll(), window.devLedger.vault.status(),
    ]).then(([meta, dashboard, timer, settingRows, vault]) => {
      if (!mounted) return;
      setMetadata(meta); setSummary(dashboard); dashboardSummaryPrefetched.current = true;
      setActiveTimer(timer); setSettings(settingRows); setVaultStatus(vault);
    }).catch((error: unknown) => {
      if (mounted) setFatalError(error instanceof Error ? error.message : 'Application data could not be loaded.');
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (loading || captureWindow) return;
    const requestId = ++viewRequestRef.current;
    setViewLoading(true);
    void loadViewData(activeView).catch((error: unknown) => {
      if (requestId === viewRequestRef.current) toast.error(error instanceof Error ? error.message : 'This workspace view could not be loaded.');
    }).finally(() => {
      if (requestId === viewRequestRef.current) setViewLoading(false);
    });
    return () => { viewRequestRef.current += 1; };
  }, [activeView, captureWindow, loadViewData, loading]);
  useEffect(() => {
    if (captureWindow) return;
    return window.devLedger.vault.onAutoLock(() => {
      setVaultStatus({ configured: true, unlocked: false });
      toast.message('Protected content vault locked after inactivity.');
    });
  }, [captureWindow]);
  useEffect(() => {
    const theme = settings.theme;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    document.documentElement.classList.toggle('dark', theme === 'dark' || (theme !== 'light' && prefersDark));
  }, [settings.theme]);
  async function handleNavigate(view: ViewId) {
    if (activeView === 'notes' && view !== 'notes' && notesFlushRef.current) {
      const saved = await notesFlushRef.current();
      if (!saved) return;
    }
    setActiveView(view);
  }
  async function openCapture() {
    if (activeView === 'notes' && notesFlushRef.current && !(await notesFlushRef.current())) return;
    await window.devLedger.capture.open();
  }
  async function createContact(input: ContactInput) { await window.devLedger.contacts.create(input); toast.success('Contact created'); }
  async function updateContact(id: string, input: Partial<ContactInput>) { await window.devLedger.contacts.update(id, input); toast.success('Contact updated'); }
  async function removeContact(id: string) { await window.devLedger.contacts.remove(id); toast.success('Contact moved to trash'); }
  async function createProject(input: ProjectInput) { await window.devLedger.projects.create(input); toast.success('Project created'); }
  async function updateProject(id: string, input: Partial<ProjectInput> & { status?: ProjectStatus }) { await window.devLedger.projects.update(id, input); toast.success('Project updated'); }
  async function archiveProject(id: string) { await window.devLedger.projects.archive(id); toast.success('Project archived'); }
  async function restoreProject(id: string) { await window.devLedger.projects.restore(id); toast.success('Project restored'); }
  async function exportProject(id: string) { const path = await window.devLedger.projects.export(id); if (path) toast.success(`Project exported to ${path}. Protected notes and vault-encrypted documents were excluded; see the archive README.`); return path; }
  async function importProject() { try { const result = await window.devLedger.projects.import(); if (!result) return; await refreshAll(); toast.success(`Imported ${result.projectName}. ${result.lockedNotesSkipped} protected note(s) skipped because their vault key is not transferred.`); } catch (error) { toast.error(error instanceof Error ? error.message : 'The project archive could not be imported.'); } }
  async function createNote(input: NoteInput) { const note = await window.devLedger.notes.create(input); setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)].slice(0, 50)); return note; }
  async function updateNote(id: string, input: Partial<NoteInput>) { const note = await window.devLedger.notes.update(id, input); setNotes((current) => current.map((item) => item.id === id ? note : item)); return note; }
  async function saveLockedNote(id: string, input: { title: string; content: string; projectId: string | null }): Promise<ProtectedNoteRecord> { return window.devLedger.notes.saveLocked(id, input); }
  async function lockNote(id: string) { await window.devLedger.notes.lock(id); setNotes((current) => current.filter((item) => item.id !== id)); toast.success('Note protected'); }
  async function unlockNote(id: string) { const note = await window.devLedger.notes.unlock(id); toast.success('Protected note unlocked'); return note; }
  async function setupVault(passphrase: string) { const result = await window.devLedger.vault.setup(passphrase); setVaultStatus(await window.devLedger.vault.status()); return result.recoveryKey; }
  async function unlockVault(secret: string, recovery = false) { await window.devLedger.vault.unlock(secret, recovery); setVaultStatus(await window.devLedger.vault.status()); toast.success('Vault unlocked'); }
  async function lockVault() { await window.devLedger.vault.lock(); setVaultStatus(await window.devLedger.vault.status()); toast.success('Vault locked'); }
  async function changeVaultPassphrase(passphrase: string) { await window.devLedger.vault.changePassphrase(passphrase); toast.success('Vault passphrase changed'); }
  async function removeNote(id: string) { await window.devLedger.notes.remove(id); setNotes((current) => current.filter((item) => item.id !== id)); toast.success('Note moved to trash'); }
  async function createTask(input: TaskInput) { const task = await window.devLedger.tasks.create(input); toast.success('Task created'); return task; }
  async function updateTask(id: string, input: Partial<TaskInput> & { status?: TaskStatus }) { return window.devLedger.tasks.update(id, input); }
  async function removeTask(id: string) { await window.devLedger.tasks.remove(id); toast.success('Task moved to trash'); }
  async function startTimer(id: string) { await window.devLedger.tasks.startTimer(id); setActiveTimer(await window.devLedger.tasks.getActiveTimer()); toast.success('Timer started'); }
  async function stopTimer(id: string) { const seconds = await window.devLedger.tasks.stopTimer(id); setActiveTimer(await window.devLedger.tasks.getActiveTimer()); toast.success(`Timer stopped · ${Math.round(seconds / 60)} minutes`); return seconds; }
  async function resolveTimerRecovery(id: string, action: 'resume' | 'stop' | 'discard', endedAt?: string) { await window.devLedger.tasks.resolveTimerRecovery(id, action, endedAt); setActiveTimer(await window.devLedger.tasks.getActiveTimer()); toast.success(action === 'resume' ? 'Timer resumed from now' : action === 'stop' ? 'Interrupted session saved' : 'Interrupted timer discarded'); }
  async function importDocument(projectId?: string | null, protectWithVault = false) { const result = await window.devLedger.documents.import(projectId, protectWithVault); return result?.warning ?? (result ? `Imported ${result.document.originalName}.` : null); }
  async function saveCapture(input: { title: string; content: string; projectId: string | null }) { await window.devLedger.capture.save(input); }
  async function changeSetting(key: string, value: unknown) { await window.devLedger.settings.set(key, value); setSettings((current) => ({ ...current, [key]: value })); }
  async function createBackup(passphrase: string) { return window.devLedger.backups.create(passphrase); }
  async function restoreBackup(secret: string, recovery = false) { return window.devLedger.backups.restoreAsCopy(secret, recovery); }
  async function search(query: string, projectId?: string | null): Promise<SearchResult[]> { return window.devLedger.search.query({ query, projectId: projectId ?? null, limit: 50 }); }
  async function summarizeSearch(query: string, projectId?: string | null) { return window.devLedger.ai.summarize(query, projectId ?? null); }
  async function hybridSearch(query: string, projectId?: string | null) { return window.devLedger.ai.hybridSearch(query, projectId ?? null); }
  async function indexSemanticKnowledge() { return window.devLedger.ai.indexSemanticKnowledge(); }
  async function openSearchResult(result: SearchResult) {
    if (result.type === 'document') { try { await window.devLedger.documents.open(result.id); } catch (e) { toast.error(e instanceof Error ? e.message : 'Document could not be opened.'); } return; }
    const view = result.type === 'project' ? 'projects' : result.type === 'note' ? 'notes' : result.type === 'contact' ? 'contacts' : 'tasks';
    await handleNavigate(view);
  }

  if (captureWindow) return <><QuickCapturePage onSave={saveCapture}/><Sonner position="bottom-right" richColors theme={settings.theme === 'dark' ? 'dark' : 'light'}/></>;
  if (fatalError) return <main className="grid h-full place-items-center bg-background p-8"><div className="max-w-lg rounded-lg border border-border bg-surface p-6"><h1 className="text-base font-semibold">Workspace could not start</h1><p className="mt-2 text-sm text-muted-foreground">{fatalError}</p><ButtonLike onClick={() => window.location.reload()}>Try again</ButtonLike></div></main>;

  return <AppShell activeView={activeView} onNavigate={(view) => void handleNavigate(view)} onQuickCapture={() => void openCapture()} onRefresh={() => void refreshAll().catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Refresh failed'))} sidebarOpen={settings.sidebarOpen !== false} onSidebarOpenChange={(open) => { void changeSetting('sidebarOpen', open).catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Sidebar preference could not be saved.')); }}>
    {loading ? <div className="grid h-full place-items-center text-sm text-muted-foreground">Opening your local workspace…</div> : (
      <Suspense fallback={<div className="grid min-h-64 place-items-center text-sm text-muted-foreground">Loading this workspace view…</div>}>
        {viewLoading && <div className="pointer-events-none absolute right-7 top-[72px] z-10 rounded-md border border-border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground">Refreshing…</div>}
        {activeView === 'dashboard' && <DashboardPage summary={summary} projects={projects} loading={loading} onNavigate={handleNavigate}/>}
        {activeView === 'projects' && <ProjectsPage onCreate={createProject} onUpdate={updateProject} onArchive={archiveProject} onRestore={restoreProject} onExport={exportProject} onImport={importProject} loading={loading}/>}
        {activeView === 'notes' && <NotesPage notes={notes} vaultStatus={vaultStatus} onCreate={createNote} onUpdate={updateNote} onSaveLocked={saveLockedNote} onLock={lockNote} onUnlock={unlockNote} onDelete={removeNote} onRegisterFlush={(flush) => { notesFlushRef.current = flush; }}/>}
        {activeView === 'tasks' && <TasksPage onCreate={createTask} onUpdate={updateTask} onRemove={removeTask} onStartTimer={startTimer} onStopTimer={stopTimer} onResolveTimerRecovery={resolveTimerRecovery} refresh={refreshAll} activeTimer={activeTimer}/>}
        {activeView === 'documents' && <DocumentsPage vaultUnlocked={vaultStatus.unlocked} onImport={importDocument} onOpen={(id) => window.devLedger.documents.open(id)} refresh={refreshAll}/>}
        {activeView === 'search' && <SearchPage onSearch={search} onHybridSearch={hybridSearch} onOpenResult={(result) => void openSearchResult(result)} onAiStatus={() => window.devLedger.ai.status()} onSummarize={summarizeSearch}/>}
        {activeView === 'settings' && <SettingsPage metadata={metadata} settings={settings} vaultStatus={vaultStatus} onSettingChange={changeSetting} onVaultSetup={setupVault} onVaultUnlock={unlockVault} onVaultLock={lockVault} onVaultChangePassphrase={changeVaultPassphrase} onConfigureVaultDeviceUnlock={(enabled) => window.devLedger.vault.configureDeviceUnlock(enabled)} onCreateBackup={createBackup} onRestoreBackup={restoreBackup} onActivateRestoreCopy={(path) => window.devLedger.backups.activateRestoreCopy(path)} onGetRestoreActivationStatus={getRestoreActivationStatus} onRollbackRestoreActivation={rollbackRestoreActivation} onCommitRestoreActivation={commitRestoreActivation} onChooseExternalBackupDestination={() => window.devLedger.backups.chooseExternalDestination()} onClearExternalBackupDestination={() => window.devLedger.backups.clearExternalDestination()} onChooseOfflineBackupDestination={() => window.devLedger.backups.chooseOfflineDestination()} onClearOfflineBackupDestination={() => window.devLedger.backups.clearOfflineDestination()} onCheckOllama={() => window.devLedger.ai.status()} onIndexSemantic={indexSemanticKnowledge}/>}
        {activeView === 'contacts' && <ContactsPage onCreate={createContact} onUpdate={updateContact} onRemove={removeContact}/>}
        {activeView === 'operations' && <OperationsPage/>}
      </Suspense>
    )}
    <Sonner position="bottom-right" richColors theme={settings.theme === 'dark' ? 'dark' : 'light'}/>
  </AppShell>;
}

function ButtonLike({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="mt-4 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">{children}</button>;
}

createRoot(document.getElementById('root')!).render(<RendererErrorBoundary><TooltipProvider><ConfirmProvider><App /></ConfirmProvider></TooltipProvider></RendererErrorBoundary>);
