import {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type MouseEvent,
} from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { BookOpen, Plus } from 'lucide-react';
import type {
    ContactRecord,
    NoteInput,
    NoteRecord,
    ProtectedNoteRecord,
    VaultStatus,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import type { SmartDateReference } from '@domain/smart-date-markdown';
import { useConfirm } from '@/components/shared/confirm-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useProjectNames } from '@/hooks/useProjectNames';
import { formatRelative, friendlyError } from '@/lib/utils';
import { createNoteExtensions } from './extensions';
import { exportMarkdownFromEditor, importMarkdownIntoEditor } from './note-markdown-io';
import { NoteEditorHeader, type NoteSaveState } from './NoteEditorHeader';
import { NoteEditorToolbar } from './NoteEditorToolbar';
import { NoteContactDialog, NoteInspectorDrawer } from './NoteInspectorDrawer';
import { NoteLockedPlaceholder } from './NoteLockedPlaceholder';
import { NotesSidebar } from './NotesSidebar';
import { NoteTableOverlay } from './NoteTableOverlay';
import {
    attachSyncedReminderId,
    computeReminderDueIso,
    extractReminderContextText,
} from './smart-date-ui-helpers';

interface Props {
    notes: NoteRecord[];
    focusNoteId?: string | undefined;
    focusProjectId?: string | null | undefined;
    onConsumeFocus?: () => void;
    vaultStatus: VaultStatus;
    onCreate: (input: NoteInput) => Promise<NoteRecord>;
    onUpdate: (id: string, input: Partial<NoteInput>) => Promise<NoteRecord>;
    onSaveLocked: (
        id: string,
        input: { title: string; content: string; projectId: string | null },
    ) => Promise<ProtectedNoteRecord>;
    onLock: (id: string) => Promise<void>;
    onUnlock: (id: string) => Promise<ProtectedNoteRecord>;
    onUnprotect?: (id: string) => Promise<NoteRecord>;
    onDelete: (id: string) => Promise<void>;
    onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}

const NOTES_PAGE_SIZE = 50;

export function NotesPage({
    focusNoteId,
    focusProjectId,
    onConsumeFocus,
    vaultStatus,
    onCreate,
    onUpdate,
    onSaveLocked,
    onLock,
    onUnlock,
    onUnprotect,
    onDelete,
    onRegisterFlush,
    onNavigateTarget,
}: Props) {
    const confirm = useConfirm();
    const [compactLayout, setCompactLayout] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1040px)').matches,
    );
    const [pageNotes, setPageNotes] = useState<NoteRecord[]>([]);
    const [notesTotal, setNotesTotal] = useState(0);
    const [notesOffset, setNotesOffset] = useState(0);
    const [loadedNotesOffset, setLoadedNotesOffset] = useState(0);
    const [notesLoading, setNotesLoading] = useState(true);
    const notesRequest = useRef(0);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    const [filterProjectId, setFilterProjectId] = useState(focusProjectId || '');
    const deferredFilter = useDeferredValue(filter);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [projectId, setProjectId] = useState('');
    const [contactPreview, setContactPreview] = useState<ContactRecord | null>(null);
    const [pickedProjectNames, setPickedProjectNames] = useState<Record<string, string>>({});
    const [connectionCount, setConnectionCount] = useState(0);

    const projectIdRef = useRef(projectId);
    const selectedIdRef = useRef(selectedId);
    const titleRef = useRef(title);
    const lockedRef = useRef(false);
    projectIdRef.current = projectId;
    selectedIdRef.current = selectedId;
    titleRef.current = title;

    const [saveState, setSaveState] = useState<NoteSaveState>('idle');
    const [error, setError] = useState('');
    const [unlockedNote, setUnlockedNote] = useState<ProtectedNoteRecord | null>(null);
    const revision = useRef(0);
    const isDirty = useRef(false);
    const isMountedRef = useRef(true);
    const writingCanvasRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const selected = (
        unlockedNote?.id === selectedId ? unlockedNote : (pageNotes.find((n) => n.id === selectedId) ?? null)
    ) as NoteRecord | ProtectedNoteRecord | null;
    lockedRef.current = Boolean(selected?.locked);

    const selectedSyncRef = useRef({ selected, unlockedNote });
    selectedSyncRef.current = { selected, unlockedNote };
    const pageNotesRef = useRef(pageNotes);
    pageNotesRef.current = pageNotes;

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1040px)');
        const onChange = () => setCompactLayout(mq.matches);
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    const loadNotesPage = useCallback(
        async (requestedOffset = notesOffset) => {
            const requestId = ++notesRequest.current;
            setNotesLoading(true);
            try {
                const page = await window.devLedger.notes.listPage({
                    limit: NOTES_PAGE_SIZE,
                    offset: requestedOffset,
                    query: deferredFilter,
                    projectId: filterProjectId || null,
                    includeLocked: true,
                });
                if (requestId === notesRequest.current) {
                    setPageNotes(page.items);
                    setNotesTotal(page.total);
                    setLoadedNotesOffset(page.offset);
                    setError('');
                }
            } finally {
                if (requestId === notesRequest.current) setNotesLoading(false);
            }
        },
        [deferredFilter, filterProjectId, notesOffset],
    );

    useEffect(() => {
        void loadNotesPage().catch((c: unknown) => setError(friendlyError(c, 'Notes could not be loaded.')));
    }, [loadNotesPage]);

    const { projectNames: resolvedProjectNames } = useProjectNames(pageNotes.map((n) => n.projectId));
    const projectNames = { ...resolvedProjectNames, ...pickedProjectNames };

    const currentSelectedId = selected?.id ?? null;
    const currentSelectedLocked = Boolean(selected?.locked);
    const unlockedRecordId = unlockedNote?.id ?? null;

    useEffect(() => {
        if (!currentSelectedId || currentSelectedLocked) {
            setConnectionCount(0);
            return;
        }
        let active = true;
        void Promise.all([
            window.devLedger.operations.listEntityTags('note', currentSelectedId),
            window.devLedger.operations.listLinksPage('note', currentSelectedId, { limit: 1, offset: 0 }),
        ])
            .then(([tags, linksPage]) => {
                if (active) setConnectionCount(tags.length + linksPage.total);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [currentSelectedId, currentSelectedLocked, inspectorOpen]);

    const syncNoteReminder = useCallback(
        async (
            attrs: SmartDateReference,
            dueAtIso: string | null,
            noteText?: string,
        ): Promise<string | null> => {
            const noteId = selectedIdRef.current;
            if (!noteId) return attrs.reminderId ?? null;
            if (lockedRef.current) {
                throw new Error('Remove the vault lock from this note to schedule reminders.');
            }
            if (!dueAtIso) {
                if (attrs.reminderId)
                    await window.devLedger.operations
                        .updateReminder(attrs.reminderId, 'dismiss')
                        .catch(() => undefined);
                return null;
            }
            if (attrs.reminderId) {
                const updated = await window.devLedger.operations.updateReminder(
                    attrs.reminderId,
                    'reschedule',
                    dueAtIso,
                );
                return updated.id;
            }
            const contextMessage = noteText?.trim() || attrs.source || titleRef.current || 'Note reminder';
            const created = await window.devLedger.operations.createReminder(
                'note',
                noteId,
                dueAtIso,
                contextMessage,
            );
            return created.id;
        },
        [],
    );

    const editorExtensions = useMemo(
        () => [
            StarterKit,
            Markdown,
            ...createNoteExtensions(
                async (q, pid) =>
                    (
                        await window.devLedger.contacts.listPage({
                            limit: 8,
                            offset: 0,
                            query: q,
                            projectId: pid || null,
                        })
                    ).items,
                () => projectIdRef.current,
                {
                    onReminderSync: syncNoteReminder,
                    onReminderError: (caught) =>
                        setError(friendlyError(caught, 'Reminder could not be scheduled.')),
                },
            ),
        ],
        [syncNoteReminder],
    );

    const editor = useEditor({
        extensions: editorExtensions,
        content: '',
        editorProps: {
            attributes: {
                class: 'min-h-[420px] max-w-none px-0 py-2 text-[14px] leading-[1.75] outline-none focus:outline-none prose-editor',
            },
        },
        onUpdate: ({ editor: c }) => {
            isDirty.current = true;
            setContent(c.getHTML());
            setSaveState('idle');
        },
    });

    const persistSelectedRef = useRef<() => Promise<void>>(async () => undefined);
    persistSelectedRef.current = async () => {
        if (!selectedId) return;
        const input = { title, content, projectId: projectId || null };
        if (selected?.locked) {
            const u = await onSaveLocked(selectedId, input);
            setUnlockedNote(u);
            setPageNotes((c) =>
                c.map((i) => (i.id === u.id ? { ...i, projectId: u.projectId, updatedAt: u.updatedAt } : i)),
            );
        } else {
            const u = await onUpdate(selectedId, input);
            setPageNotes((c) => c.map((i) => (i.id === u.id ? u : i)));
        }
    };

    const flushBeforeNavigation = useCallback(async (): Promise<boolean> => {
        if (!selectedIdRef.current || !isDirty.current) return true;
        setSaveState('saving');
        try {
            await persistSelectedRef.current();
            isDirty.current = false;
            setSaveState('saved');
            setError('');
            return true;
        } catch (caught) {
            setSaveState('error');
            setError(friendlyError(caught, 'Save failed.'));
            return false;
        }
    }, []);

    const unlockSelected = useCallback(
        async (id: string) => {
            try {
                const n = await onUnlock(id);
                setUnlockedNote(n);
                setTitle(n.title);
                setContent(n.content);
                setProjectId(n.projectId ?? '');
                if (editor && !editor.isDestroyed) {
                    editor.commands.setContent(n.content || '', { emitUpdate: false });
                }
                setError('');
                setSaveState('idle');
                isDirty.current = false;
                setSelectedId(id);
            } catch (caught) {
                setError(friendlyError(caught, 'Unlock failed.'));
            }
        },
        [editor, onUnlock],
    );

    const selectNote = useCallback(
        async (id: string) => {
            if (id === selectedIdRef.current || !(await flushBeforeNavigation())) return;
            revision.current += 1;
            setUnlockedNote(null);
            const listMatch = pageNotesRef.current.find((i) => i.id === id);
            if (listMatch?.locked) {
                if (vaultStatus.unlocked) {
                    await unlockSelected(id);
                    return;
                }
                setSelectedId(id);
                return;
            }
            try {
                const detail = await window.devLedger.notes.get(id);
                if (!isMountedRef.current) return;
                setPageNotes((c) =>
                    c.some((i) => i.id === id) ? c.map((i) => (i.id === id ? detail : i)) : [detail, ...c],
                );
                if (detail.locked && vaultStatus.unlocked) {
                    await unlockSelected(id);
                    return;
                }
                setSelectedId(id);
            } catch (caught) {
                if (isMountedRef.current) setError(friendlyError(caught, 'Note could not be opened.'));
            }
        },
        [flushBeforeNavigation, unlockSelected, vaultStatus.unlocked],
    );

    useEffect(() => {
        if (
            !selectedId &&
            !deferredFilter &&
            !focusNoteId &&
            pageNotes.length &&
            !notesLoading &&
            loadedNotesOffset === notesOffset
        ) {
            void selectNote(pageNotes[0]!.id);
        }
    }, [
        pageNotes,
        selectedId,
        deferredFilter,
        focusNoteId,
        notesLoading,
        loadedNotesOffset,
        notesOffset,
        selectNote,
    ]);

    useEffect(() => {
        if (vaultStatus.unlocked) return;
        setUnlockedNote((prev) => {
            if (prev) {
                setTitle('');
                setContent('');
                setProjectId('');
                setSaveState('idle');
                isDirty.current = false;
                if (editor && !editor.isDestroyed) editor.commands.clearContent(false);
            }
            return null;
        });
    }, [vaultStatus.unlocked, editor]);

    useEffect(() => {
        const { selected: activeNote, unlockedNote: activeUnlocked } = selectedSyncRef.current;
        if (activeNote) {
            if (activeNote.locked && !activeUnlocked) {
                setTitle('');
                setContent('');
                setProjectId(activeNote.projectId ?? '');
                setSaveState('idle');
                setError('');
                isDirty.current = false;
                if (editor && !editor.isDestroyed) editor.commands.clearContent(false);
                return;
            }
            setTitle(activeNote.title);
            setContent(activeNote.content);
            setProjectId(activeNote.projectId ?? '');
            setSaveState('idle');
            setError('');
            isDirty.current = false;
            if (!activeNote.locked && editor && !editor.isDestroyed) {
                editor.commands.setContent(activeNote.content || '', { emitUpdate: false });
            }
        } else if (selectedId === null) {
            setTitle('');
            setContent('');
            setProjectId('');
            if (editor && !editor.isDestroyed) editor.commands.clearContent(false);
        }
    }, [selectedId, currentSelectedId, currentSelectedLocked, unlockedRecordId, editor]);

    useEffect(() => {
        if (focusProjectId && !focusNoteId) {
            setFilterProjectId(focusProjectId);
            setNotesOffset(0);
            onConsumeFocus?.();
            return;
        }
        if (!focusNoteId) return;
        void selectNote(focusNoteId).finally(() => onConsumeFocus?.());
    }, [focusNoteId, focusProjectId, onConsumeFocus, selectNote]);

    useEffect(() => {
        if (!selectedId || !isDirty.current) return;
        const currentRevision = ++revision.current;
        const timer = window.setTimeout(async () => {
            setSaveState('saving');
            try {
                await persistSelectedRef.current();
                if (revision.current === currentRevision) {
                    setSaveState('saved');
                    setError('');
                    isDirty.current = false;
                }
            } catch (caught) {
                if (revision.current === currentRevision) {
                    setSaveState('error');
                    setError(friendlyError(caught, 'Save failed.'));
                }
            }
        }, 700);
        return () => window.clearTimeout(timer);
    }, [selectedId, title, content, projectId]);

    useEffect(() => {
        onRegisterFlush(() => flushBeforeNavigation());
        return () => onRegisterFlush(null);
    }, [flushBeforeNavigation, onRegisterFlush]);

    function importMarkdownFile(event: ChangeEvent<HTMLInputElement>) {
        void importMarkdownIntoEditor(
            event,
            editor,
            () =>
                confirm({
                    title: 'Replace note contents?',
                    description: 'Importing Markdown replaces the current note body.',
                    confirmLabel: 'Replace',
                    destructive: true,
                }),
            (html) => {
                setContent(html);
                isDirty.current = true;
                setSaveState('idle');
            },
            setError,
        );
    }

    function exportMarkdownFile() {
        exportMarkdownFromEditor(editor, title, setError);
    }

    function insertSmartDateReference(reference: SmartDateReference) {
        if (!editor || editor.isDestroyed) return;
        editor
            .chain()
            .focus()
            .insertContent([
                { type: 'smartDate', attrs: reference },
                { type: 'text', text: ' ' },
            ])
            .run();
        if (reference.isReminder) {
            const contextText = extractReminderContextText(editor);
            void syncNoteReminder(
                reference,
                reference.isoUtc ?? computeReminderDueIso(reference.date, reference.time),
                contextText,
            )
                .then((id) => attachSyncedReminderId(editor, reference.date, id, reference.time))
                .catch((caught) => setError(friendlyError(caught, 'Reminder could not be scheduled.')));
        }
        setError('');
    }

    async function handleEditorClick(event: MouseEvent<HTMLDivElement>) {
        const contactId = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-contact-id]')
            ?.dataset['contactId'];
        if (!contactId) return;
        event.preventDefault();
        try {
            const c = await window.devLedger.contacts.get(contactId);
            if (c) setContactPreview(c);
            else setError('Contact not found.');
        } catch (caught) {
            setError(friendlyError(caught, 'Contact details unavailable.'));
        }
    }

    async function createNote() {
        if (!(await flushBeforeNavigation())) return;
        if (filter) setFilter('');
        const note = await onCreate({
            title: 'Untitled note',
            content: '',
            projectId: filterProjectId || null,
        });
        setPageNotes((c) => [note, ...c.filter((i) => i.id !== note.id)].slice(0, NOTES_PAGE_SIZE));
        setNotesTotal((t) => t + 1);
        setNotesOffset(0);
        setSelectedId(note.id);
    }

    async function createLinkedTaskFromNote() {
        if (!selectedId || !projectId) return;
        try {
            const task = await window.devLedger.tasks.create({
                projectId,
                title: `${title || 'Follow-up'}`.slice(0, 200),
                description: `Created from note: ${title || 'Untitled note'}`,
            });
            await window.devLedger.operations.createLink('note', selectedId, 'task', task.id, 'action-item');
            onNavigateTarget({ view: 'tasks', recordId: task.id, projectId });
        } catch (caught) {
            setError(friendlyError(caught, 'Task could not be created from note.'));
        }
    }

    async function lockSelected() {
        if (!selectedId || !selected || !(await flushBeforeNavigation())) return;
        if (selected.locked && unlockedNote?.id === selectedId) {
            setUnlockedNote(null);
            setTitle('');
            setContent('');
            setProjectId('');
            isDirty.current = false;
            if (editor && !editor.isDestroyed) editor.commands.clearContent(false);
            return;
        }
        if (selected.locked) return;
        try {
            await onLock(selectedId);
            setUnlockedNote(null);
            setTitle('');
            setContent('');
            setProjectId('');
            isDirty.current = false;
            if (editor && !editor.isDestroyed) editor.commands.clearContent(false);
            setPageNotes((c) =>
                c.map((i) => (i.id === selectedId ? { ...i, locked: true, title: '', content: '' } : i)),
            );
            void loadNotesPage();
        } catch (caught) {
            setError(friendlyError(caught, 'Note lock failed.'));
        }
    }

    async function removeLockSelected() {
        if (!selectedId || !selected?.locked || !onUnprotect || !(await flushBeforeNavigation())) return;
        if (
            !(await confirm({
                title: 'Remove lock from note?',
                description: 'This note will be stored unencrypted again and included in workspace search.',
                confirmLabel: 'Remove lock',
            }))
        )
            return;
        try {
            const unprotected = await onUnprotect(selectedId);
            setUnlockedNote(null);
            setTitle(unprotected.title);
            setContent(unprotected.content);
            setProjectId(unprotected.projectId ?? '');
            isDirty.current = false;
            setPageNotes((c) => c.map((i) => (i.id === unprotected.id ? unprotected : i)));
            void loadNotesPage();
        } catch (caught) {
            setError(friendlyError(caught, 'Vault lock could not be removed.'));
        }
    }

    async function removeSelected() {
        if (!selectedId || selected?.locked || !(await flushBeforeNavigation())) return;
        if (
            !(await confirm({
                title: 'Move note to trash?',
                description: 'Note will be moved to trash.',
                confirmLabel: 'Move to trash',
                destructive: true,
            }))
        )
            return;
        const removed = selectedId;
        await onDelete(removed);
        revision.current += 1;
        const remaining = pageNotes.filter((n) => n.id !== removed);
        setPageNotes(remaining);
        setNotesTotal((t) => Math.max(0, t - 1));
        setSelectedId(null);
        if (!remaining.length && notesOffset > 0) {
            const nextOffset = Math.max(0, notesOffset - NOTES_PAGE_SIZE);
            setNotesOffset(nextOffset);
            await loadNotesPage(nextOffset);
        }
    }

    return (
        <ResizablePanelGroup
            orientation={compactLayout ? 'vertical' : 'horizontal'}
            className="notes-workspace"
        >
            <ResizablePanel
                defaultSize={compactLayout ? '42%' : '30%'}
                minSize={compactLayout ? 180 : 260}
                maxSize={compactLayout ? '48%' : 460}
                className="min-h-0 min-w-0"
            >
                <NotesSidebar
                    notes={pageNotes}
                    total={notesTotal}
                    offset={notesOffset}
                    pageSize={NOTES_PAGE_SIZE}
                    loading={notesLoading}
                    selectedId={selectedId}
                    filter={filter}
                    filterProjectId={filterProjectId}
                    projectNames={projectNames}
                    onCreateNote={() => void createNote()}
                    onFilterChange={(next) => {
                        setNotesOffset(0);
                        setFilter(next);
                    }}
                    onClearProjectFilter={() => setFilterProjectId('')}
                    onSelectNote={(id) => void selectNote(id)}
                    onPageChange={(nextOffset) => {
                        setSelectedId(null);
                        setUnlockedNote(null);
                        setNotesOffset(nextOffset);
                    }}
                />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
                defaultSize={compactLayout ? '66%' : '71%'}
                minSize={compactLayout ? 380 : 420}
                className="min-h-0 min-w-0"
            >
                <section className="notes-editor-pane flex h-full min-h-0 min-w-0 flex-col">
                    {selected ? (
                        selected.locked && !unlockedNote ? (
                            <NoteLockedPlaceholder
                                vaultUnlocked={vaultStatus.unlocked}
                                error={error}
                                onUnlock={() => void unlockSelected(selected.id)}
                            />
                        ) : (
                            <>
                                <NoteEditorHeader
                                    noteTitle={selected.title}
                                    locked={selected.locked}
                                    vaultConfigured={vaultStatus.configured}
                                    projectId={projectId}
                                    projectLabel={projectNames[projectId]}
                                    saveState={saveState}
                                    connectionCount={connectionCount}
                                    onProjectChange={(v) => {
                                        isDirty.current = true;
                                        setProjectId(v);
                                    }}
                                    onProjectChoice={(c) => {
                                        if (c) setPickedProjectNames((cur) => ({ ...cur, [c.id]: c.label }));
                                    }}
                                    onOpenInspector={() => setInspectorOpen(true)}
                                    onLockSelected={() => void lockSelected()}
                                    onRemoveLock={() => void removeLockSelected()}
                                    onDeleteSelected={() => void removeSelected()}
                                />
                                <NoteEditorToolbar
                                    editor={editor}
                                    onInsertDate={insertSmartDateReference}
                                    onImportMarkdown={(e) => void importMarkdownFile(e)}
                                    onExportMarkdown={exportMarkdownFile}
                                />
                                <div className="notes-editor-scroll min-h-0 flex-1">
                                    <div
                                        ref={writingCanvasRef}
                                        className="notes-writing-canvas relative flex w-full max-w-[840px] flex-col px-4 py-4 sm:py-5 sm:pl-11 sm:pr-9"
                                    >
                                        <Input
                                            aria-label="Note title"
                                            value={title}
                                            onChange={(e) => {
                                                isDirty.current = true;
                                                setTitle(e.target.value);
                                                setSaveState('idle');
                                            }}
                                            placeholder="Untitled note"
                                            className="note-title h-auto border-0 bg-transparent px-0 py-1 text-[1.75rem] font-semibold shadow-none focus-visible:ring-0"
                                            maxLength={240}
                                        />
                                        <p className="mt-1 mb-3 text-xs text-muted-foreground">
                                            Edited {formatRelative(selected.updatedAt)}
                                        </p>
                                        <EditorContent
                                            editor={editor}
                                            onClick={handleEditorClick}
                                            className="notes-editor-content min-h-80 flex-1 py-1"
                                        />
                                        <NoteTableOverlay editor={editor} canvasRef={writingCanvasRef} />
                                        {error && (
                                            <p role="alert" className="mt-2 text-xs text-danger">
                                                {error}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <NoteInspectorDrawer
                                    open={inspectorOpen}
                                    noteId={selectedId}
                                    noteTitle={title}
                                    locked={selected.locked}
                                    canCreateTask={Boolean(projectId)}
                                    onOpenChange={setInspectorOpen}
                                    onNavigate={onNavigateTarget}
                                    onCreateTaskFromNote={() => void createLinkedTaskFromNote()}
                                />
                                <NoteContactDialog
                                    contact={contactPreview}
                                    onClose={() => setContactPreview(null)}
                                    onNavigate={onNavigateTarget}
                                />
                            </>
                        )
                    ) : notesLoading ? (
                        <div className="flex flex-1 items-center justify-center px-8 text-xs text-muted-foreground">
                            Loading notes…
                        </div>
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                            <BookOpen className="mb-2.5 size-6 text-muted-foreground" />
                            <h2 className="text-sm font-semibold">Select a note or create one</h2>
                            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                                Decisions, meeting notes and linked follow-ups live here.
                            </p>
                            <Button className="mt-4" size="sm" onClick={() => void createNote()}>
                                <Plus className="size-3.5" />
                                New note
                            </Button>
                        </div>
                    )}
                </section>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
