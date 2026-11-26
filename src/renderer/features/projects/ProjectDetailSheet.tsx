import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, FileText, FolderKanban, ListTodo, NotebookPen, Users } from 'lucide-react';
import type {
    ContactRecord,
    DocumentRecord,
    NoteRecord,
    ProjectRecord,
    ProjectStatus,
    TaskRecord,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RecordConnectionsPanel } from '@/components/shared/RecordConnectionsPanel';
import { formatDate, friendlyError } from '@/lib/utils';

interface ProjectDetailSheetProps {
    project: ProjectRecord | null;
    onClose: () => void;
    onStatusChange: (id: string, status: ProjectStatus) => Promise<void>;
    onNavigate: (target: WorkspaceNavigationTarget) => void;
}

const TASK_STATUS_VARIANT: Record<
    TaskRecord['status'],
    'outline' | 'info' | 'secondary' | 'warning' | 'success'
> = {
    not_started: 'outline',
    in_progress: 'info',
    waiting: 'secondary',
    blocked: 'warning',
    completed: 'success',
    cancelled: 'secondary',
};

const TASK_STATUS_LABEL: Record<TaskRecord['status'], string> = {
    not_started: 'Not started',
    in_progress: 'In progress',
    waiting: 'Waiting',
    blocked: 'Blocked',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

export function ProjectDetailSheet({
    project,
    onClose,
    onStatusChange,
    onNavigate,
}: ProjectDetailSheetProps) {
    const [tab, setTab] = useState<'tasks' | 'notes' | 'documents' | 'contacts' | 'links'>('tasks');
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [notes, setNotes] = useState<NoteRecord[]>([]);
    const [documents, setDocuments] = useState<DocumentRecord[]>([]);
    const [contacts, setContacts] = useState<ContactRecord[]>([]);
    const [error, setError] = useState('');

    const projectId = project?.id ?? null;
    const loadScope = useCallback(async () => {
        if (!projectId) return;
        try {
            const [taskPage, notePage, docPage, contactPage] = await Promise.all([
                window.devLedger.tasks.listPage({ projectId, limit: 30, offset: 0, includeCompleted: false }),
                window.devLedger.notes.listPage({ projectId, limit: 30, offset: 0, includeLocked: true }),
                window.devLedger.documents.listPage({ projectId, limit: 30, offset: 0 }),
                window.devLedger.contacts.listPage({ projectId, limit: 30, offset: 0 }),
            ]);
            setTasks(taskPage.items);
            setNotes(notePage.items);
            setDocuments(docPage.items);
            setContacts(contactPage.items);
            setError('');
        } catch (caught) {
            setError(friendlyError(caught, 'Project records could not be loaded.'));
        }
    }, [projectId]);

    useEffect(() => {
        void loadScope();
    }, [loadScope]);

    const jump = (target: WorkspaceNavigationTarget) => {
        onClose();
        onNavigate(target);
    };

    return (
        <Sheet
            open={Boolean(project)}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                {project && (
                    <div className="space-y-5 pb-6">
                        <SheetHeader className="pr-6">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <FolderKanban className="size-3.5" />
                                <span>
                                    {project.type === 'greenfield' ? 'Greenfield project' : 'Ongoing project'}
                                </span>
                            </div>
                            <SheetTitle className="text-lg">{project.name}</SheetTitle>
                            <SheetDescription className={project.description ? undefined : 'sr-only'}>
                                {project.description || 'Project workspace hub'}
                            </SheetDescription>
                        </SheetHeader>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3 text-xs">
                            <div className="flex gap-3 text-muted-foreground">
                                <span>
                                    <strong className="text-foreground">{project.openTaskCount}</strong> open
                                    tasks
                                </span>
                                <span>
                                    <strong className="text-foreground">{project.noteCount}</strong> notes
                                </span>
                            </div>
                            <NativeSelect
                                value={project.status}
                                aria-label="Project status"
                                onChange={(e) =>
                                    void onStatusChange(project.id, e.target.value as ProjectStatus)
                                }
                                className="h-8 w-36 text-xs"
                            >
                                <NativeSelectOption value="active">Active</NativeSelectOption>
                                <NativeSelectOption value="on_hold">On hold</NativeSelectOption>
                                <NativeSelectOption value="completed">Completed</NativeSelectOption>
                                <NativeSelectOption value="archived">Archived</NativeSelectOption>
                            </NativeSelect>
                        </div>

                        {error && (
                            <p role="alert" className="text-xs text-danger">
                                {error}
                            </p>
                        )}

                        <Tabs
                            value={tab}
                            onValueChange={(v) => setTab(v as typeof tab)}
                            className="space-y-3"
                        >
                            <TabsList className="w-full justify-start overflow-x-auto">
                                <TabsTrigger value="tasks" className="text-xs">
                                    Tasks ({tasks.length})
                                </TabsTrigger>
                                <TabsTrigger value="notes" className="text-xs">
                                    Notes ({notes.length})
                                </TabsTrigger>
                                <TabsTrigger value="documents" className="text-xs">
                                    Docs ({documents.length})
                                </TabsTrigger>
                                <TabsTrigger value="contacts" className="text-xs">
                                    Contacts ({contacts.length})
                                </TabsTrigger>
                                <TabsTrigger value="links" className="text-xs">
                                    Connections
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="tasks" className="space-y-2.5">
                                <div className="flex justify-end">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1 text-xs"
                                        onClick={() => jump({ view: 'tasks', projectId: project.id })}
                                    >
                                        Open in Tasks <ArrowUpRight className="size-3.5" />
                                    </Button>
                                </div>
                                {tasks.length ? (
                                    <div className="divide-y divide-border rounded-lg border border-border bg-card">
                                        {tasks.map((task) => (
                                            <button
                                                key={task.id}
                                                type="button"
                                                onClick={() =>
                                                    jump({
                                                        view: 'tasks',
                                                        recordId: task.id,
                                                        projectId: project.id,
                                                    })
                                                }
                                                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-hover"
                                            >
                                                <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
                                                <span className="min-w-0 flex-1 truncate font-medium">
                                                    {task.title}
                                                </span>
                                                <Badge variant={TASK_STATUS_VARIANT[task.status]}>
                                                    {TASK_STATUS_LABEL[task.status]}
                                                </Badge>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="py-6 text-center text-xs text-muted-foreground">
                                        No open tasks in this project.
                                    </p>
                                )}
                            </TabsContent>

                            <TabsContent value="notes" className="space-y-2.5">
                                <div className="flex justify-end">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1 text-xs"
                                        onClick={() => jump({ view: 'notes', projectId: project.id })}
                                    >
                                        Open in Notes <ArrowUpRight className="size-3.5" />
                                    </Button>
                                </div>
                                {notes.length ? (
                                    <div className="divide-y divide-border rounded-lg border border-border bg-card">
                                        {notes.map((note) => (
                                            <button
                                                key={note.id}
                                                type="button"
                                                onClick={() =>
                                                    jump({
                                                        view: 'notes',
                                                        recordId: note.id,
                                                        projectId: project.id,
                                                    })
                                                }
                                                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-hover"
                                            >
                                                <NotebookPen className="size-3.5 shrink-0 text-muted-foreground" />
                                                <span className="min-w-0 flex-1 truncate font-medium">
                                                    {note.locked
                                                        ? 'Locked note'
                                                        : note.title || 'Untitled note'}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDate(note.updatedAt)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="py-6 text-center text-xs text-muted-foreground">
                                        No notes linked to this project.
                                    </p>
                                )}
                            </TabsContent>

                            <TabsContent value="documents" className="space-y-2.5">
                                <div className="flex justify-end">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1 text-xs"
                                        onClick={() => jump({ view: 'documents', projectId: project.id })}
                                    >
                                        Open in Documents <ArrowUpRight className="size-3.5" />
                                    </Button>
                                </div>
                                {documents.length ? (
                                    <div className="divide-y divide-border rounded-lg border border-border bg-card">
                                        {documents.map((doc) => (
                                            <button
                                                key={doc.id}
                                                type="button"
                                                onClick={() =>
                                                    void window.devLedger.documents
                                                        .open(doc.id)
                                                        .catch((e) =>
                                                            setError(
                                                                friendlyError(
                                                                    e,
                                                                    'Document could not be opened.',
                                                                ),
                                                            ),
                                                        )
                                                }
                                                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-hover"
                                            >
                                                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                                                <span className="min-w-0 flex-1 truncate font-medium">
                                                    {doc.title}
                                                </span>
                                                <Badge variant="outline">
                                                    {doc.extension.replace('.', '').toUpperCase()}
                                                </Badge>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="py-6 text-center text-xs text-muted-foreground">
                                        No documents attached to this project.
                                    </p>
                                )}
                            </TabsContent>

                            <TabsContent value="contacts" className="space-y-2.5">
                                <div className="flex justify-end">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1 text-xs"
                                        onClick={() => jump({ view: 'contacts', projectId: project.id })}
                                    >
                                        Open in Contacts <ArrowUpRight className="size-3.5" />
                                    </Button>
                                </div>
                                {contacts.length ? (
                                    <div className="divide-y divide-border rounded-lg border border-border bg-card">
                                        {contacts.map((contact) => (
                                            <button
                                                key={contact.id}
                                                type="button"
                                                onClick={() =>
                                                    jump({
                                                        view: 'contacts',
                                                        recordId: contact.id,
                                                        projectId: project.id,
                                                    })
                                                }
                                                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-hover"
                                            >
                                                <Users className="size-3.5 shrink-0 text-muted-foreground" />
                                                <span className="min-w-0 flex-1 truncate font-medium">
                                                    {contact.name}
                                                </span>
                                                <span className="text-xs capitalize text-muted-foreground">
                                                    {contact.role.replaceAll('_', ' ')}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="py-6 text-center text-xs text-muted-foreground">
                                        No contacts assigned to this project.
                                    </p>
                                )}
                            </TabsContent>

                            <TabsContent value="links">
                                <RecordConnectionsPanel
                                    entityType="project"
                                    entityId={project.id}
                                    onNavigate={jump}
                                />
                            </TabsContent>
                        </Tabs>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
