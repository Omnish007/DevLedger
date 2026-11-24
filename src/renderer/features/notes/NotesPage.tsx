import { useConfirm } from '@/components/shared/ConfirmProvider';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { createNoteExtensions } from './extensions';
import { Bold, BookOpen, Check, CheckSquare, Clock3, Download, FileUp, Heading2, Italic, List, ListOrdered, LockKeyhole, Plus, Quote, Search, ShieldAlert, Table2, Trash2 } from 'lucide-react';
import type { ContactRecord, EntityLinkRecord, EntityType, NoteInput, NoteRecord, PageResult, ProtectedNoteRecord, VaultStatus } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { formatRelative } from '@/lib/utils';
import { ButtonGroup } from '@/components/ui/button-group';
import { VirtualList } from '@/components/shared/VirtualList';
import { PageControls } from '@/components/shared/PageControls';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SmartDateInsert } from './SmartDateInsert';
import { parseSmartDate } from '@domain/smart-date';
import { validateMarkdownImport } from '@domain/markdown-import-safety';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const noteItemKey = (note: NoteRecord): string => note.id;
const RELATED_LINKS_PAGE_SIZE = 20;
const EMPTY_RELATED_LINKS_PAGE: PageResult<EntityLinkRecord> = { items: [], total: 0, limit: RELATED_LINKS_PAGE_SIZE, offset: 0, hasMore: false };
interface Props { notes: NoteRecord[]; vaultStatus: VaultStatus; onCreate: (input: NoteInput) => Promise<NoteRecord>; onUpdate: (id: string, input: Partial<NoteInput>) => Promise<NoteRecord>; onSaveLocked: (id: string, input: { title: string; content: string; projectId: string | null }) => Promise<ProtectedNoteRecord>; onLock: (id: string) => Promise<void>; onUnlock: (id: string) => Promise<ProtectedNoteRecord>; onDelete: (id: string) => Promise<void>; onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void; }

export function NotesPage({ notes, vaultStatus, onCreate, onUpdate, onSaveLocked, onLock, onUnlock, onDelete, onRegisterFlush }: Props) {
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter.trim().toLocaleLowerCase());
  const [pageNotes, setPageNotes] = useState<NoteRecord[]>(notes);
  const [notesTotal, setNotesTotal] = useState(notes.length);
  const [notesOffset, setNotesOffset] = useState(0);
  const [notesLoading, setNotesLoading] = useState(true);
  const [loadedNotesOffset, setLoadedNotesOffset] = useState(-1);
  const notesRequest = useRef(0);
  const notesPageSize = 50;
  const loadNotesPage = useCallback(async (offset = notesOffset) => {
    const requestId = ++notesRequest.current;
    setNotesLoading(true);
    try {
      const page = await window.devLedger.notes.listPage({ limit: notesPageSize, offset, query: deferredFilter, includeLocked: true });
      if (requestId === notesRequest.current) { setPageNotes(page.items); setNotesTotal(page.total); setLoadedNotesOffset(offset); }
    } finally { if (requestId === notesRequest.current) setNotesLoading(false); }
  }, [deferredFilter, notesOffset]);
  useEffect(() => { void loadNotesPage().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Notes could not be loaded.')); return () => { notesRequest.current += 1; }; }, [loadNotesPage]); const [title, setTitle] = useState(''); const [content, setContent] = useState(''); const [projectId, setProjectId] = useState('');
  const [contactPreview, setContactPreview] = useState<ContactRecord | null>(null);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [relatedTargetLabel, setRelatedTargetLabel] = useState('');
  const [relatedLinksPage, setRelatedLinksPage] = useState<PageResult<EntityLinkRecord>>(EMPTY_RELATED_LINKS_PAGE);
  const [relatedLinksOffset, setRelatedLinksOffset] = useState(0);
  const relatedLinksOwner = useRef<string | null>(null);
  const relatedLinks = relatedLinksPage.items;
  const [relatedType, setRelatedType] = useState<EntityType>('task');
  const [relatedTargetId, setRelatedTargetId] = useState('');
  const [relatedLabel, setRelatedLabel] = useState('related');
  const markdownInputRef = useRef<HTMLInputElement | null>(null);
  const projectIdRef = useRef(projectId); projectIdRef.current = projectId;
  const [saveState, setSaveState] = useState<SaveState>('idle'); const [error, setError] = useState('');
  const [unlockedNote, setUnlockedNote] = useState<ProtectedNoteRecord | null>(null);
  const revision = useRef(0); const isDirty = useRef(false);
  const normalSelected = pageNotes.find((note) => note.id === selectedId) ?? null;
  const selected = (unlockedNote?.id === selectedId ? unlockedNote : normalSelected) as (NoteRecord | ProtectedNoteRecord | null);
  const visible = pageNotes;
  const relatedLabelByKey = useMemo(() => new Map(
    pageNotes.map((item) => [`note:${item.id}`, item.locked ? 'Protected note' : item.title || 'Untitled note'] as const),
  ), [pageNotes]);

  useEffect(() => {
    const ids = [...new Set(pageNotes.map((note) => note.projectId).filter((id): id is string => Boolean(id)))].slice(0, 200);
    let active = true;
    void window.devLedger.projects.getNames(ids).then((names) => { if (active) setProjectNames((current) => ({ ...current, ...names })); }).catch(() => undefined);
    return () => { active = false; };
  }, [pageNotes]);
  const editorExtensions = useMemo(() => [StarterKit, Markdown, ...createNoteExtensions(async (query, selectedProjectId) => {
    const page = await window.devLedger.contacts.listPage({ limit: 8, offset: 0, query, projectId: selectedProjectId || undefined });
    return page.items;
  }, () => projectIdRef.current)], []);
  const editor = useEditor({ extensions: editorExtensions, content: '', editorProps: { attributes: { class: 'min-h-[400px] max-w-none px-0 py-2 text-[14px] leading-[1.85] outline-none focus:outline-none prose-editor' } }, onUpdate: ({ editor: current }) => { isDirty.current = true; setContent(current.getHTML()); setSaveState('idle'); } });

  useEffect(() => { if (!selectedId && pageNotes.length && !notesLoading && loadedNotesOffset === notesOffset) void selectNote(pageNotes[0]!.id); }, [pageNotes, selectedId, notesLoading, loadedNotesOffset, notesOffset]);
  useEffect(() => { if (!vaultStatus.unlocked) { setUnlockedNote(null); if (selectedId && pageNotes.some((item) => item.id === selectedId && item.locked)) setSelectedId(null); } }, [vaultStatus.unlocked, pageNotes, selectedId]);
  useEffect(() => {
    if (selected) { setTitle(selected.title); setContent(selected.content); setProjectId(selected.projectId ?? ''); setSaveState('idle'); setError(''); isDirty.current = false; editor?.commands.setContent(selected.content || '', { emitUpdate: false }); }
    else if (selectedId === null) { setTitle(''); setContent(''); setProjectId(''); editor?.commands.clearContent(); }
  }, [selectedId, selected?.id, editor]);
  const loadRelatedLinks = useCallback(async (noteId: string, requestedOffset = relatedLinksOffset) => {
    let page = await window.devLedger.operations.listLinksPage('note', noteId, { limit: RELATED_LINKS_PAGE_SIZE, offset: requestedOffset });
    const lastOffset = page.total > 0 ? Math.floor((page.total - 1) / page.limit) * page.limit : 0;
    if (requestedOffset > lastOffset) page = await window.devLedger.operations.listLinksPage('note', noteId, { limit: RELATED_LINKS_PAGE_SIZE, offset: lastOffset });
    if (page.offset !== relatedLinksOffset) setRelatedLinksOffset(page.offset);
    setRelatedLinksPage(page);
  }, [relatedLinksOffset]);
  useEffect(() => {
    let cancelled = false;
    if (relatedLinksOwner.current !== selectedId) {
      relatedLinksOwner.current = selectedId;
      setRelatedLinksOffset(0);
      setRelatedLinksPage(EMPTY_RELATED_LINKS_PAGE);
      if (relatedLinksOffset !== 0) return () => { cancelled = true; };
    }
    if (!selectedId || (selected?.locked && unlockedNote?.id !== selectedId)) { setRelatedLinksPage(EMPTY_RELATED_LINKS_PAGE); return () => { cancelled = true; }; }
    void loadRelatedLinks(selectedId, relatedLinksOffset).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Related records could not be loaded.'); });
    return () => { cancelled = true; };
  }, [selectedId, selected?.locked, unlockedNote?.id, relatedLinksOffset, loadRelatedLinks]);
  async function addRelatedRecord() {
    if (!selectedId || !relatedTargetId) return;
    try {
      await window.devLedger.operations.createLink('note', selectedId, relatedType, relatedTargetId, relatedLabel.trim() || 'related');
      await loadRelatedLinks(selectedId);
      setRelatedTargetId(''); setRelatedTargetLabel(''); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Record could not be linked.'); }
  }
  async function removeRelatedRecord(linkId: string) {
    try { await window.devLedger.operations.removeLink(linkId); if (selectedId) await loadRelatedLinks(selectedId); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Relationship could not be removed.'); }
  }
  function markTitle(value: string) { isDirty.current = true; setTitle(value); setSaveState('idle'); }
  async function importMarkdownFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor) return;
    if (editor.getText().trim()) {
      const accepted = await confirm({ title: 'Replace note contents?', description: 'Importing Markdown replaces the current note body. Existing text will be replaced after the import succeeds.', confirmLabel: 'Replace contents', destructive: true });
      if (!accepted) return;
    }
    if (file.size > 2 * 1024 * 1024) { setError('Markdown files must be 2 MB or smaller.'); return; }
    try {
      const markdown = await file.text();
      editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
      const html = editor.getHTML();
      setContent(html); isDirty.current = true; setSaveState('idle'); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Markdown import failed.'); }
  }
  function insertSmartDateReference(value: string) {
    if (!editor) return;
    try {
      const parsed = parseSmartDate(value);
      const reference = { date: parsed.date, time: parsed.kind === 'datetime' ? parsed.time : null, isoUtc: parsed.kind === 'datetime' ? parsed.isoUtc : null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, source: value };
      editor.chain().focus().insertContent({ type: 'smartDate', attrs: reference }).run();
      setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Date reference could not be inserted.'); }
  }
  function exportMarkdownFile() {
    if (!editor) return;
    try {
      const markdown = editor.getMarkdown();
      const blobUrl = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
      const anchor = document.createElement('a');
      const safeName = (title || 'note').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'note';
      anchor.href = blobUrl; anchor.download = `${safeName}.md`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Markdown export failed.'); }
  }
  async function handleEditorClick(event: MouseEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-contact-id]');
    const contactId = target?.dataset.contactId;
    if (!contactId) return;
    event.preventDefault();
    try {
      const contact = await window.devLedger.contacts.get(contactId);
      if (contact) setContactPreview(contact); else setError('This contact is no longer available.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Contact details could not be loaded.'); }
  }
  async function persistSelected(): Promise<void> {
    if (!selectedId) return;
    const input = { title, content, projectId: projectId || null };
    if (selected?.locked) { const updated = await onSaveLocked(selectedId, input); setUnlockedNote(updated); setPageNotes((current) => current.map((item) => item.id === updated.id ? { ...item, projectId: updated.projectId, updatedAt: updated.updatedAt } : item)); }
    else { const updated = await onUpdate(selectedId, input); setPageNotes((current) => current.map((item) => item.id === updated.id ? updated : item)); }
  }
  const persistSelectedRef = useRef(persistSelected);
  persistSelectedRef.current = persistSelected;
  useEffect(() => {
    if (!selectedId || !isDirty.current) return;
    const currentRevision = ++revision.current;
    const timeout = window.setTimeout(async () => {
      setSaveState('saving');
      try { await persistSelectedRef.current(); if (revision.current === currentRevision) { setSaveState('saved'); setError(''); isDirty.current = false; } }
      catch (caught) { if (revision.current === currentRevision) { setSaveState('error'); setError(caught instanceof Error ? caught.message : 'Save failed.'); } }
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [selectedId, title, content, projectId]);
  async function flushBeforeNavigation(): Promise<boolean> {
    if (!selectedId || !isDirty.current) return true;
    setSaveState('saving');
    try { await persistSelected(); isDirty.current = false; setSaveState('saved'); setError(''); return true; }
    catch (caught) { setSaveState('error'); setError(caught instanceof Error ? caught.message : 'Save failed.'); return false; }
  }
  useEffect(() => { onRegisterFlush(() => flushBeforeNavigation()); return () => onRegisterFlush(null); }, [selectedId, title, content, projectId, selected?.locked, onRegisterFlush]);
  async function selectNote(id: string) {
    if (id === selectedId || !(await flushBeforeNavigation())) return;
    revision.current += 1; setUnlockedNote(null);
    try {
      const detail = await window.devLedger.notes.get(id);
      setPageNotes((current) => current.map((item) => item.id === id ? detail : item));
      setSelectedId(id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The note could not be opened.'); }
  }
  async function unlockSelected(id: string) { try { const note = await onUnlock(id); setUnlockedNote(note); setTitle(note.title); setContent(note.content); setProjectId(note.projectId ?? ''); editor?.commands.setContent(note.content || '', { emitUpdate: false }); setError(''); setSaveState('idle'); isDirty.current = false; setSelectedId(id); } catch (caught) { setError(caught instanceof Error ? caught.message : 'The note could not be unlocked.'); } }
  async function createNote() { if (!(await flushBeforeNavigation())) return; if (filter) setFilter(''); const note = await onCreate({ title: 'Untitled note', content: '', projectId: null }); setPageNotes((current) => [note, ...current.filter((item) => item.id !== note.id)].slice(0, notesPageSize)); setNotesTotal((total) => total + 1); setNotesOffset(0); setSelectedId(note.id); }
  async function lockSelected() {
    if (!selectedId || !selected || !(await flushBeforeNavigation())) return;
    if (selected.locked && unlockedNote?.id === selectedId) { setUnlockedNote(null); setTitle(''); setContent(''); setSelectedId(null); isDirty.current = false; return; }
    if (selected.locked) return;
    try { await onLock(selectedId); setUnlockedNote(null); setSelectedId(null); void loadNotesPage().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Notes could not be refreshed.')); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The note could not be locked.'); }
  }
  async function removeSelected() { if (!selectedId || selected?.locked || !(await flushBeforeNavigation())) return; const accepted = await confirm({ title: 'Move note to trash?', description: 'This note will be moved to trash. Protected notes must be unlocked before they can be removed.', confirmLabel: 'Move to trash', destructive: true }); if (!accepted) return; const removed = selectedId; await onDelete(removed); revision.current += 1; const remaining = pageNotes.filter((note) => note.id !== removed); setPageNotes(remaining); setNotesTotal((total) => Math.max(0, total - 1)); setSelectedId(null); if (!remaining.length && notesOffset > 0) { const nextOffset = Math.max(0, notesOffset - notesPageSize); setNotesOffset(nextOffset); await loadNotesPage(nextOffset); } }

  return <ResizablePanelGroup orientation="horizontal" className="mx-auto flex h-full min-h-[620px] max-w-[1240px] overflow-hidden rounded-lg border border-border bg-surface">
    <ResizablePanel defaultSize={25} minSize={18} maxSize={42} className="min-w-0">
    <aside className="flex h-full w-full flex-col"><div className="flex items-center justify-between px-3 py-3"><div><h2 className="text-sm font-semibold">Notes</h2><p className="text-[10px] text-muted-foreground">{notesTotal} notes in your workspace</p></div><Button size="icon" variant="ghost" className="size-8" onClick={() => void createNote()} aria-label="Create note"><Plus className="size-4"/></Button></div>
      <div className="px-3 pb-3"><div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><Input aria-label="Filter notes by title or contents" value={filter} onChange={(event) => { void (async () => { if (!(await flushBeforeNavigation())) return; revision.current += 1; setSelectedId(null); setUnlockedNote(null); setNotesOffset(0); setFilter(event.target.value); })(); }} placeholder="Filter notes…" className="h-8 pl-8 text-xs"/></div></div><Separator/>
      {notesLoading ? <p className="py-8 text-center text-xs text-muted-foreground">Loading notes…</p> : <VirtualList
        items={visible}
        itemKey={noteItemKey}
        itemHeight={108}
        label="Workspace notes"
        className="min-h-0 flex-1 p-2"
        empty={<div className="px-3 py-10 text-center"><BookOpen className="mx-auto mb-2 size-4 text-muted-foreground"/><p className="text-xs text-muted-foreground">No matching notes</p></div>}
        renderItem={(note) => <button type="button" onClick={() => void (note.locked ? (vaultStatus.unlocked ? unlockSelected(note.id) : setSelectedId(note.id)) : selectNote(note.id))} className={`h-full w-full rounded-md px-2.5 py-2.5 text-left transition-colors ${selectedId === note.id ? 'bg-accent' : 'hover:bg-surface-hover'}`}><div className="flex items-center gap-2"><BookOpen className="size-3.5 shrink-0 text-muted-foreground"/><span className="truncate text-xs font-medium">{note.locked ? 'Locked note' : note.title || 'Untitled note'}</span></div><p className="mt-1.5 line-clamp-2 pl-[22px] text-[10px] leading-relaxed text-muted-foreground">{note.locked ? 'Protected content · unlock to view' : note.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || 'No content yet'}</p><div className="mt-2 flex items-center justify-between pl-[22px]"><span className="text-[10px] text-muted-foreground">{formatRelative(note.updatedAt)}</span>{note.projectId && <Badge variant="outline" className="max-w-[110px] truncate">{projectNames[note.projectId] ?? 'Project'}</Badge>}</div></button>}
      />}
      <PageControls offset={notesOffset} limit={notesPageSize} total={notesTotal} disabled={notesLoading} onPageChange={(nextOffset) => { setSelectedId(null); setUnlockedNote(null); setNotesOffset(nextOffset); }} />
    </aside>
    </ResizablePanel>
    <ResizableHandle withHandle/>
    <ResizablePanel defaultSize={75} minSize={45} className="min-w-0">
    <section className="flex h-full min-w-0 flex-col">{selected ? selected.locked && !unlockedNote ? <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><LockKeyhole className="mb-3 size-7 text-muted-foreground"/><h3 className="text-sm font-semibold">Protected note</h3><p className="mt-1 max-w-sm text-xs text-muted-foreground">This note is encrypted at rest. {vaultStatus.unlocked ? 'Unlock it to view its contents.' : 'Unlock the vault in Settings, then return here.'}</p><Button className="mt-4" size="sm" disabled={!vaultStatus.unlocked} onClick={() => void unlockSelected(selected.id)}>Unlock note</Button>{error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}</div> : <>
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3"><div className="flex min-w-0 items-center gap-3"><Breadcrumb><BreadcrumbList className="gap-1 text-[11px]"><BreadcrumbItem><BookOpen className="size-3.5"/><BreadcrumbPage>Notes</BreadcrumbPage></BreadcrumbItem><BreadcrumbSeparator/><BreadcrumbItem><BreadcrumbPage className="max-w-[180px] truncate">{selected.title || 'Untitled note'}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb><span className="shrink-0 text-[11px] text-muted-foreground">{saveState === 'saving' ? <span className="inline-flex items-center gap-1"><Clock3 className="size-3"/>Saving…</span> : saveState === 'saved' ? <span className="inline-flex items-center gap-1 text-success"><Check className="size-3"/>Saved</span> : saveState === 'error' ? <span className="inline-flex items-center gap-1 text-danger"><ShieldAlert className="size-3"/>Save failed</span> : <span>Local note</span>}</span></div><div className="flex items-center gap-2"><label className="sr-only" htmlFor="note-project">Project</label><RemoteRecordPicker entityType="project" value={projectId} onValueChange={(value) => { isDirty.current = true; setProjectId(value); }} onChoiceChange={(choice) => { if (choice) setProjectNames((current) => ({ ...current, [choice.id]: choice.label })); }} placeholder="No project" selectedLabel={projectNames[projectId]} className="max-w-[190px]" />{selected.locked ? <Button size="sm" variant="outline" onClick={() => void lockSelected()}><LockKeyhole className="size-3.5"/>Lock now</Button> : <Button size="sm" variant="ghost" onClick={() => void removeSelected()}><Trash2 className="size-3.5"/>Trash</Button>}{!selected.locked && vaultStatus.configured && <Button size="sm" variant="ghost" onClick={() => void lockSelected()}><LockKeyhole className="size-3.5"/>Protect</Button>}</div></div>
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-8 py-7"><Input value={title} onChange={(event) => markTitle(event.target.value)} placeholder="Untitled note" className="h-auto border-0 bg-transparent px-0 py-2 text-[25px] font-semibold tracking-tight shadow-none focus-visible:ring-0" maxLength={240}/><div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><span>Last edited {formatRelative(selected.updatedAt)}</span><span>·</span><span>Autosaves after a short pause</span><span>·</span><span>Type @ to mention a project contact</span></div><Separator className="my-4"/>
        <div className="border-b border-border pb-2"><div className="flex flex-wrap items-center justify-between gap-2"><ButtonGroup className="flex-wrap">{[{label:'Bold',icon:Bold,run:()=>editor?.chain().focus().toggleBold().run(),active:editor?.isActive('bold')},{label:'Italic',icon:Italic,run:()=>editor?.chain().focus().toggleItalic().run(),active:editor?.isActive('italic')},{label:'Heading',icon:Heading2,run:()=>editor?.chain().focus().toggleHeading({level:2}).run(),active:editor?.isActive('heading')},{label:'Bulleted list',icon:List,run:()=>editor?.chain().focus().toggleBulletList().run(),active:editor?.isActive('bulletList')},{label:'Numbered list',icon:ListOrdered,run:()=>editor?.chain().focus().toggleOrderedList().run(),active:editor?.isActive('orderedList')},{label:'Checklist',icon:CheckSquare,run:()=>editor?.chain().focus().toggleTaskList().run(),active:editor?.isActive('taskList')},{label:'Table',icon:Table2,run:()=>editor?.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run(),active:editor?.isActive('table')},{label:'Quote',icon:Quote,run:()=>editor?.chain().focus().toggleBlockquote().run(),active:editor?.isActive('blockquote')}] .map((item) => { const Icon = item.icon; return <Button key={item.label} type="button" variant={item.active ? 'secondary' : 'ghost'} size="icon" className="size-8" title={item.label} aria-label={item.label} onClick={item.run}><Icon className="size-4"/></Button>; })}</ButtonGroup><div className="flex items-center gap-1"><SmartDateInsert onInsert={insertSmartDateReference}/><input ref={markdownInputRef} type="file" accept=".md,.markdown,text/markdown" className="hidden" onChange={(event) => void importMarkdownFile(event)}/><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => markdownInputRef.current?.click()}><FileUp className="mr-1 size-3.5"/>Import MD</Button><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px]" onClick={exportMarkdownFile}><Download className="mr-1 size-3.5"/>Export MD</Button></div></div></div>
        <EditorContent editor={editor} onClick={handleEditorClick} className="min-h-0 flex-1 overflow-auto py-2"/>
        <Dialog open={!!contactPreview} onOpenChange={(open) => { if (!open) setContactPreview(null); }}><DialogContent><DialogHeader><DialogTitle>{contactPreview?.name ?? 'Contact'}</DialogTitle><DialogDescription>{[contactPreview?.role, contactPreview?.company].filter(Boolean).join(' · ') || 'Project contact'}</DialogDescription></DialogHeader><div className="space-y-2 text-sm">{contactPreview?.email && <p><span className="text-muted-foreground">Email:</span> {contactPreview.email}</p>}{contactPreview?.phone && <p><span className="text-muted-foreground">Phone:</span> {contactPreview.phone}</p>}{contactPreview?.notes && <p className="whitespace-pre-wrap text-muted-foreground">{contactPreview.notes}</p>}</div></DialogContent></Dialog><div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[10px] text-muted-foreground"><LockKeyhole className="size-3.5"/>{selected.locked ? 'Protected note · encrypted at rest' : 'Local note · autosaved to SQLite'}</div>{error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
        <section className="mt-5 border-t border-border pt-4" aria-label="Related records">
          <div className="mb-3 flex items-center justify-between"><div><h3 className="text-xs font-semibold">Related records</h3><p className="mt-0.5 text-[10px] text-muted-foreground">Links and backlinks to other workspace items</p></div><Badge variant="secondary">{relatedLinksPage.total}</Badge></div>
          <div className="flex flex-wrap items-end gap-2"><label className="space-y-1 text-[10px] font-medium">Type<NativeSelect value={relatedType} onChange={(event) => { const next = event.target.value as EntityType; setRelatedType(next); setRelatedTargetId(''); setRelatedTargetLabel(''); }} className="h-8 min-w-28 rounded-md border border-border bg-background px-2 text-xs">{(['project','note','task','document','contact'] as EntityType[]).map((type) => <NativeSelectOption key={type} value={type}>{type}</NativeSelectOption>)}</NativeSelect></label><div className="min-w-[190px] flex-1 space-y-1 text-[10px] font-medium">Record<RemoteRecordPicker entityType={relatedType} value={relatedTargetId} onValueChange={setRelatedTargetId} onChoiceChange={(choice) => setRelatedTargetLabel(choice?.label ?? '')} selectedLabel={relatedTargetLabel} excludeId={relatedType === 'note' ? selectedId : null} placeholder="Choose a record" searchPlaceholder="Search workspace records…" /></div><label className="space-y-1 text-[10px] font-medium">Relationship<Input value={relatedLabel} onChange={(event) => setRelatedLabel(event.target.value)} className="h-8 w-32" maxLength={64}/></label><Button type="button" size="sm" className="h-8" onClick={() => void addRelatedRecord()} disabled={!relatedTargetId}>Link</Button></div>
          <div className="mt-3 flex flex-wrap gap-2">{relatedLinks.map((link) => { const otherType = link.direction === 'outgoing' ? link.targetType : link.sourceType; const otherId = link.direction === 'outgoing' ? link.targetId : link.sourceId; const label = relatedLabelByKey.get(`${otherType}:${otherId}`) ?? `${otherType} ${otherId.slice(0, 8)}`; return <div key={link.id} className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-surface-subtle px-2 py-1.5 text-[10px]"><Badge variant="outline">{link.direction}</Badge><span className="truncate">{label}</span><span className="text-muted-foreground">{link.relationship}</span><button type="button" aria-label={`Remove link to ${label}`} className="text-muted-foreground hover:text-destructive" onClick={() => void removeRelatedRecord(link.id)}><Trash2 className="size-3"/></button></div>; })}{!relatedLinks.length && <p className="text-[10px] text-muted-foreground">No related records linked yet.</p>}</div><PageControls offset={relatedLinksPage.offset} limit={relatedLinksPage.limit} total={relatedLinksPage.total} onPageChange={setRelatedLinksOffset} disabled={notesLoading}/>
        </section>
      </div>
    </> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><BookOpen className="mb-3 size-7 text-muted-foreground"/><h3 className="text-sm font-semibold">Choose a note to open</h3><p className="mt-1 max-w-xs text-xs text-muted-foreground">Keep technical decisions, meeting notes and project context close at hand.</p><Button className="mt-4" size="sm" onClick={() => void createNote()}><Plus className="size-3.5"/>New note</Button></div>}</section>
    </ResizablePanel>
  </ResizablePanelGroup>;
}
