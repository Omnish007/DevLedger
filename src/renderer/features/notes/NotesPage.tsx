import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { BookOpen, Check, Clock3, Link2, LockKeyhole, Plus, Search, ShieldAlert, Trash2 } from 'lucide-react';
import type { ContactRecord, NoteInput, NoteRecord, ProtectedNoteRecord, VaultStatus, WorkspaceNavigationTarget } from '@shared/contracts';
import type { SmartDateReference } from '@domain/smart-date-markdown';
import { stripHtmlToPlainText } from '@domain/html-text';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { useConfirm } from '@/components/shared/ConfirmProvider';
import { VirtualList } from '@/components/shared/VirtualList';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Separator } from '@/components/ui/separator';
import { formatRelative, friendlyError } from '@/lib/utils';
import { createNoteExtensions } from './extensions';
import { NoteEditorToolbar } from './NoteEditorToolbar';
import { NoteContactDialog, NoteInspectorDrawer } from './NoteInspectorDrawer';
import { attachSyncedReminderId, computeReminderDueIso } from './smart-date-ui-helpers';

const noteItemKey = (note: NoteRecord): string => note.id;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  notes: NoteRecord[]; focusNoteId?: string | undefined; focusProjectId?: string | null | undefined; onConsumeFocus?: () => void; vaultStatus: VaultStatus;
  onCreate: (input: NoteInput) => Promise<NoteRecord>; onUpdate: (id: string, input: Partial<NoteInput>) => Promise<NoteRecord>;
  onSaveLocked: (id: string, input: { title: string; content: string; projectId: string | null }) => Promise<ProtectedNoteRecord>;
  onLock: (id: string) => Promise<void>; onUnlock: (id: string) => Promise<ProtectedNoteRecord>; onDelete: (id: string) => Promise<void>;
  onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void;
  onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}

export function NotesPage({ focusNoteId, focusProjectId, onConsumeFocus, vaultStatus, onCreate, onUpdate, onSaveLocked, onLock, onUnlock, onDelete, onRegisterFlush, onNavigateTarget }: Props) {
  const confirm = useConfirm();
  const [compactLayout, setCompactLayout] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1040px)').matches);
  const [pageNotes, setPageNotes] = useState<NoteRecord[]>([]);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesOffset, setNotesOffset] = useState(0);
  const [loadedNotesOffset, setLoadedNotesOffset] = useState(0);
  const [notesLoading, setNotesLoading] = useState(true);
  const notesRequest = useRef(0);
  const notesPageSize = 50;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [filterProjectId, setFilterProjectId] = useState(focusProjectId || '');
  const deferredFilter = useDeferredValue(filter);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [projectId, setProjectId] = useState('');
  const [contactPreview, setContactPreview] = useState<ContactRecord | null>(null);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [projectIdRef, selectedIdRef] = [useRef(projectId), useRef(selectedId)];
  projectIdRef.current = projectId; selectedIdRef.current = selectedId;
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [unlockedNote, setUnlockedNote] = useState<ProtectedNoteRecord | null>(null);
  const [revision, isDirty] = [useRef(0), useRef(false)];
  const selected = (unlockedNote?.id === selectedId ? unlockedNote : pageNotes.find((n) => n.id === selectedId) ?? null) as (NoteRecord | ProtectedNoteRecord | null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1040px)');
    const onChange = () => setCompactLayout(mq.matches);
    onChange(); mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const loadNotesPage = useCallback(async (requestedOffset = notesOffset) => {
    const requestId = ++notesRequest.current;
    setNotesLoading(true);
    try {
      const page = await window.devLedger.notes.listPage({ limit: notesPageSize, offset: requestedOffset, query: deferredFilter, projectId: filterProjectId || null, includeLocked: true });
      if (requestId === notesRequest.current) { setPageNotes(page.items); setNotesTotal(page.total); setLoadedNotesOffset(page.offset); setError(''); }
    } finally { if (requestId === notesRequest.current) setNotesLoading(false); }
  }, [deferredFilter, filterProjectId, notesOffset]);

  useEffect(() => { void loadNotesPage().catch((c: unknown) => setError(friendlyError(c, 'Notes could not be loaded.'))); }, [loadNotesPage]);
  useEffect(() => {
    const ids = [...new Set(pageNotes.map((n) => n.projectId).filter((id): id is string => Boolean(id)))].slice(0, 200);
    let active = true;
    void window.devLedger.projects.getNames(ids).then((names) => { if (active) setProjectNames((c) => ({ ...c, ...names })); }).catch(() => undefined);
    return () => { active = false; };
  }, [pageNotes]);

  const syncNoteReminder = useCallback(async (attrs: SmartDateReference, dueAtIso: string | null): Promise<string | null> => {
    const noteId = selectedIdRef.current;
    if (!noteId || selected?.locked) return attrs.reminderId ?? null;
    if (!dueAtIso) {
      if (attrs.reminderId) await window.devLedger.operations.updateReminder(attrs.reminderId, 'dismiss').catch(() => undefined);
      return null;
    }
    if (attrs.reminderId) {
      const updated = await window.devLedger.operations.updateReminder(attrs.reminderId, 'reschedule', dueAtIso);
      return updated.id;
    }
    const created = await window.devLedger.operations.createReminder('note', noteId, dueAtIso, attrs.source || title || 'Note reminder');
    return created.id;
  }, [selected?.locked, title]);

  const editorExtensions = useMemo(() => [StarterKit, Markdown, ...createNoteExtensions(async (q, pid) => (await window.devLedger.contacts.listPage({ limit: 8, offset: 0, query: q, projectId: pid || null })).items, () => projectIdRef.current, { onReminderSync: syncNoteReminder })], [syncNoteReminder]);

  const editor = useEditor({ extensions: editorExtensions, content: '', editorProps: { attributes: { class: 'min-h-[420px] max-w-none px-0 py-2 text-[14px] leading-[1.75] outline-none focus:outline-none prose-editor' } }, onUpdate: ({ editor: c }) => { isDirty.current = true; setContent(c.getHTML()); setSaveState('idle'); } });

  useEffect(() => { if (!selectedId && !deferredFilter && !focusNoteId && pageNotes.length && !notesLoading && loadedNotesOffset === notesOffset) void selectNote(pageNotes[0]!.id); }, [pageNotes, selectedId, deferredFilter, focusNoteId, notesLoading, loadedNotesOffset, notesOffset]);
  useEffect(() => { if (!vaultStatus.unlocked) { setUnlockedNote(null); if (selectedId && pageNotes.some((i) => i.id === selectedId && i.locked)) setSelectedId(null); } }, [vaultStatus.unlocked, pageNotes, selectedId]);
  useEffect(() => {
    if (selected) { setTitle(selected.title); setContent(selected.content); setProjectId(selected.projectId ?? ''); setSaveState('idle'); setError(''); isDirty.current = false; editor?.commands.setContent(selected.content || '', { emitUpdate: false }); }
    else if (selectedId === null) { setTitle(''); setContent(''); setProjectId(''); editor?.commands.clearContent(); }
  }, [selectedId, selected?.id, editor]);

  useEffect(() => {
    if (focusProjectId && !focusNoteId) { setFilterProjectId(focusProjectId); setNotesOffset(0); onConsumeFocus?.(); return; }
    if (!focusNoteId) return;
    void selectNote(focusNoteId).finally(() => onConsumeFocus?.());
  }, [focusNoteId, focusProjectId, onConsumeFocus]);

  async function importMarkdownFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !editor) return;
    if (editor.getText().trim() && !(await confirm({ title: 'Replace note contents?', description: 'Importing Markdown replaces the current note body.', confirmLabel: 'Replace', destructive: true }))) return;
    if (file.size > 2 * 1024 * 1024) { setError('Markdown files must be 2 MB or smaller.'); return; }
    try { editor.commands.setContent(await file.text(), { contentType: 'markdown', emitUpdate: false }); setContent(editor.getHTML()); isDirty.current = true; setSaveState('idle'); setError(''); }
    catch (caught) { setError(friendlyError(caught, 'Markdown import failed.')); }
  }
  function exportMarkdownFile() {
    if (!editor) return;
    try {
      const url = URL.createObjectURL(new Blob([editor.getMarkdown()], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `${(title || 'note').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'note'}.md`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { setError(friendlyError(caught, 'Markdown export failed.')); }
  }
  function insertSmartDateReference(reference: SmartDateReference) {
    if (!editor) return;
    editor.chain().focus().insertContent([{ type: 'smartDate', attrs: reference }, { type: 'text', text: ' ' }]).run();
    if (reference.isReminder) void syncNoteReminder(reference, reference.isoUtc ?? computeReminderDueIso(reference.date, reference.time)).then((id) => attachSyncedReminderId(editor, reference.date, id));
    setError('');
  }
  async function handleEditorClick(event: MouseEvent<HTMLDivElement>) {
    const contactId = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-contact-id]')?.dataset['contactId'];
    if (!contactId) return;
    event.preventDefault();
    try { const c = await window.devLedger.contacts.get(contactId); if (c) setContactPreview(c); else setError('Contact not found.'); }
    catch (caught) { setError(friendlyError(caught, 'Contact details unavailable.')); }
  }
  async function persistSelected(): Promise<void> {
    if (!selectedId) return;
    const input = { title, content, projectId: projectId || null };
    if (selected?.locked) { const u = await onSaveLocked(selectedId, input); setUnlockedNote(u); setPageNotes((c) => c.map((i) => i.id === u.id ? { ...i, projectId: u.projectId, updatedAt: u.updatedAt } : i)); }
    else { const u = await onUpdate(selectedId, input); setPageNotes((c) => c.map((i) => i.id === u.id ? u : i)); }
  }
  const persistSelectedRef = useRef(persistSelected); persistSelectedRef.current = persistSelected;
  useEffect(() => {
    if (!selectedId || !isDirty.current) return;
    const currentRevision = ++revision.current;
    const timer = window.setTimeout(async () => {
      setSaveState('saving');
      try { await persistSelectedRef.current(); if (revision.current === currentRevision) { setSaveState('saved'); setError(''); isDirty.current = false; } }
      catch (caught) { if (revision.current === currentRevision) { setSaveState('error'); setError(friendlyError(caught, 'Save failed.')); } }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [selectedId, title, content, projectId]);
  async function flushBeforeNavigation(): Promise<boolean> {
    if (!selectedId || !isDirty.current) return true;
    setSaveState('saving');
    try { await persistSelected(); isDirty.current = false; setSaveState('saved'); setError(''); return true; }
    catch (caught) { setSaveState('error'); setError(friendlyError(caught, 'Save failed.')); return false; }
  }
  useEffect(() => { onRegisterFlush(() => flushBeforeNavigation()); return () => onRegisterFlush(null); }, [selectedId, title, content, projectId, selected?.locked, onRegisterFlush]);
  async function selectNote(id: string) {
    if (id === selectedId || !(await flushBeforeNavigation())) return;
    revision.current += 1; setUnlockedNote(null);
    try { const detail = await window.devLedger.notes.get(id); setPageNotes((c) => c.some((i) => i.id === id) ? c.map((i) => i.id === id ? detail : i) : [detail, ...c]); setSelectedId(id); }
    catch (caught) { setError(friendlyError(caught, 'Note could not be opened.')); }
  }
  async function unlockSelected(id: string) { try { const n = await onUnlock(id); setUnlockedNote(n); setTitle(n.title); setContent(n.content); setProjectId(n.projectId ?? ''); editor?.commands.setContent(n.content || '', { emitUpdate: false }); setError(''); setSaveState('idle'); isDirty.current = false; setSelectedId(id); } catch (caught) { setError(friendlyError(caught, 'Unlock failed.')); } }
  async function createNote() { if (!(await flushBeforeNavigation())) return; if (filter) setFilter(''); const note = await onCreate({ title: 'Untitled note', content: '', projectId: filterProjectId || null }); setPageNotes((c) => [note, ...c.filter((i) => i.id !== note.id)].slice(0, notesPageSize)); setNotesTotal((t) => t + 1); setNotesOffset(0); setSelectedId(note.id); }
  async function createLinkedTaskFromNote() {
    if (!selectedId || !projectId) return;
    try {
      const task = await window.devLedger.tasks.create({ projectId, title: `${title || 'Follow-up'}`.slice(0, 200), description: `Created from note: ${title || 'Untitled note'}` });
      await window.devLedger.operations.createLink('note', selectedId, 'task', task.id, 'action-item');
      onNavigateTarget({ view: 'tasks', recordId: task.id, projectId });
    } catch (caught) { setError(friendlyError(caught, 'Task could not be created from note.')); }
  }
  async function lockSelected() {
    if (!selectedId || !selected || !(await flushBeforeNavigation())) return;
    if (selected.locked && unlockedNote?.id === selectedId) { setUnlockedNote(null); setTitle(''); setContent(''); setSelectedId(null); isDirty.current = false; return; }
    if (selected.locked) return;
    try { await onLock(selectedId); setUnlockedNote(null); setSelectedId(null); void loadNotesPage(); }
    catch (caught) { setError(friendlyError(caught, 'Note lock failed.')); }
  }
  async function removeSelected() {
    if (!selectedId || selected?.locked || !(await flushBeforeNavigation())) return;
    if (!(await confirm({ title: 'Move note to trash?', description: 'Note will be moved to trash.', confirmLabel: 'Move to trash', destructive: true }))) return;
    const removed = selectedId; await onDelete(removed); revision.current += 1;
    const remaining = pageNotes.filter((n) => n.id !== removed); setPageNotes(remaining); setNotesTotal((t) => Math.max(0, t - 1)); setSelectedId(null);
    if (!remaining.length && notesOffset > 0) { const nextOffset = Math.max(0, notesOffset - notesPageSize); setNotesOffset(nextOffset); await loadNotesPage(nextOffset); }
  }

  return (
    <ResizablePanelGroup orientation={compactLayout ? "vertical" : "horizontal"} className="notes-workspace">
      <ResizablePanel defaultSize={compactLayout ? "34%" : "29%"} minSize={compactLayout ? 180 : 260} maxSize={compactLayout ? "44%" : 460} className="min-h-0 min-w-0">
        <aside className="notes-sidebar flex h-full w-full min-h-0 flex-col border-r border-border">
          <div className="flex items-center justify-between px-4 py-3"><div><h1 className="text-sm font-semibold">Notes</h1><p className="text-xs text-muted-foreground">{notesTotal} note{notesTotal === 1 ? '' : 's'}</p></div><Button size="icon" variant="ghost" className="size-8" onClick={() => void createNote()} aria-label="Create note"><Plus className="size-4" /></Button></div>
          <div className="space-y-2 px-3.5 pb-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Filter notes by title or contents" value={filter} onChange={(e) => { setNotesOffset(0); setFilter(e.target.value); }} placeholder="Filter notes…" className="h-8 pl-8 pr-7 text-xs" />{filter && <button type="button" aria-label="Clear note filter" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground" onClick={() => { setNotesOffset(0); setFilter(''); }}>×</button>}</div>{filterProjectId && <div className="flex items-center justify-between rounded border border-border bg-card px-2 py-1 text-xs"><span className="truncate">{projectNames[filterProjectId] ?? 'Project filter'}</span><button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setFilterProjectId('')}>×</button></div>}</div><Separator />
          {notesLoading ? <p className="py-8 text-center text-xs text-muted-foreground">Loading notes…</p> : <VirtualList items={pageNotes} itemKey={noteItemKey} itemHeight={96} label="Workspace notes" className="min-h-0 flex-1 p-2" empty={<div className="px-3 py-10 text-center text-xs text-muted-foreground"><BookOpen className="mx-auto mb-2 size-4 opacity-70" /><p>No matching notes</p></div>} renderItem={(note) => <button type="button" onClick={() => void (note.locked ? (vaultStatus.unlocked ? unlockSelected(note.id) : setSelectedId(note.id)) : selectNote(note.id))} className={`notes-record h-full w-full rounded-md px-2.5 py-2 text-left transition-colors`} aria-current={selectedId === note.id ? 'true' : undefined}><div className="flex items-center gap-2"><BookOpen className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate text-xs font-medium">{note.locked ? 'Locked note' : note.title || 'Untitled note'}</span></div><p className="mt-1 line-clamp-2 pl-[22px] text-xs text-muted-foreground">{note.locked ? 'Protected content' : stripHtmlToPlainText(note.content) || 'Empty note'}</p><div className="mt-1.5 flex items-center justify-between pl-[22px] text-xs text-muted-foreground"><span>{formatRelative(note.updatedAt)}</span>{note.projectId && <span className="max-w-[100px] truncate">{projectNames[note.projectId] ?? 'Project'}</span>}</div></button>} />}
          <PageControls offset={notesOffset} limit={notesPageSize} total={notesTotal} disabled={notesLoading} className="border-t border-border px-3 py-2" onPageChange={(nextOffset) => { setSelectedId(null); setUnlockedNote(null); setNotesOffset(nextOffset); }} />
        </aside>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={compactLayout ? "66%" : "71%"} minSize={compactLayout ? 380 : 420} className="min-h-0 min-w-0">
        <section className="notes-editor-pane flex h-full min-h-0 min-w-0 flex-col">
          {selected ? selected.locked && !unlockedNote ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><LockKeyhole className="mb-3 size-6 text-muted-foreground" /><h3 className="text-sm font-semibold">Protected note</h3><p className="mt-1 max-w-sm text-xs text-muted-foreground">Encrypted at rest. {vaultStatus.unlocked ? 'Unlock to view contents.' : 'Unlock the vault in Settings first.'}</p><Button className="mt-4" size="sm" disabled={!vaultStatus.unlocked} onClick={() => void unlockSelected(selected.id)}>Unlock note</Button>{error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 sm:px-6">
                <div className="flex min-w-0 flex-1 items-center gap-3"><Breadcrumb><BreadcrumbList className="gap-1 text-xs"><BreadcrumbItem><BookOpen className="size-3.5" /><BreadcrumbPage>Notes</BreadcrumbPage></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage className="max-w-[200px] truncate">{selected.title || 'Untitled note'}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb><span className="shrink-0 text-xs text-muted-foreground">{saveState === 'saving' ? <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />Saving…</span> : saveState === 'saved' ? <span className="inline-flex items-center gap-1 text-success"><Check className="size-3" />Saved</span> : saveState === 'error' ? <span className="inline-flex items-center gap-1 text-danger"><ShieldAlert className="size-3" />Save failed</span> : null}</span></div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <RemoteRecordPicker entityType="project" value={projectId} onValueChange={(v) => { isDirty.current = true; setProjectId(v); }} onChoiceChange={(c) => { if (c) setProjectNames((cur) => ({ ...cur, [c.id]: c.label })); }} placeholder="No project" selectedLabel={projectNames[projectId]} className="h-8 w-36 text-xs sm:w-44" />
                  <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => setInspectorOpen(true)}><Link2 className="size-3.5" />Connections</Button>
                  {selected.locked ? <Button size="sm" variant="outline" className="h-8" onClick={() => void lockSelected()}><LockKeyhole className="size-3.5" />Lock</Button> : <Button size="sm" variant="ghost" className="h-8" onClick={() => void removeSelected()}><Trash2 className="size-3.5" /></Button>}
                  {!selected.locked && vaultStatus.configured && <Button size="sm" variant="ghost" className="h-8" onClick={() => void lockSelected()}><LockKeyhole className="size-3.5" /></Button>}
                </div>
              </div>
              <div className="notes-writing-canvas mx-auto flex w-full max-w-[820px] flex-1 flex-col px-6 py-6 sm:px-10">
                <Input value={title} onChange={(e) => { isDirty.current = true; setTitle(e.target.value); setSaveState('idle'); }} placeholder="Untitled note" className="note-title h-auto border-0 bg-transparent px-0 py-1 text-2xl font-semibold shadow-none focus-visible:ring-0" maxLength={240} />
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Edited {formatRelative(selected.updatedAt)}</span><span>·</span><span>Type @ for Notion dates (@today, @May 15, @remind tomorrow 9am) or contacts</span></div>
                <NoteEditorToolbar editor={editor} onInsertDate={insertSmartDateReference} onImportMarkdown={(e) => void importMarkdownFile(e)} onExportMarkdown={exportMarkdownFile} />
                <EditorContent editor={editor} onClick={handleEditorClick} className="min-h-72 flex-1 py-1" />
                {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
              </div>
              <NoteInspectorDrawer open={inspectorOpen} noteId={selectedId} noteTitle={title} locked={selected.locked} canCreateTask={Boolean(projectId)} onOpenChange={setInspectorOpen} onNavigate={onNavigateTarget} onCreateTaskFromNote={() => void createLinkedTaskFromNote()} />
              <NoteContactDialog contact={contactPreview} onClose={() => setContactPreview(null)} onNavigate={onNavigateTarget} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><BookOpen className="mb-2.5 size-6 text-muted-foreground" /><h3 className="text-sm font-semibold">Select a note or create one</h3><p className="mt-1 max-w-xs text-xs text-muted-foreground">Decisions, meeting notes and linked follow-ups live here.</p><Button className="mt-4" size="sm" onClick={() => void createNote()}><Plus className="size-3.5" />New note</Button></div>
          )}
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
