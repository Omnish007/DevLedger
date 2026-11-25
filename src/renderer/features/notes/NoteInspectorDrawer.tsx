import { ListPlus } from 'lucide-react';
import type { ContactRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RecordConnectionsPanel } from '@/components/shared/RecordConnectionsPanel';

interface NoteInspectorDrawerProps {
    open: boolean;
    noteId: string | null;
    noteTitle: string;
    locked: boolean;
    canCreateTask: boolean;
    onOpenChange: (open: boolean) => void;
    onNavigate: (target: WorkspaceNavigationTarget) => void;
    onCreateTaskFromNote: () => void;
}

export function NoteInspectorDrawer({
    open,
    noteId,
    noteTitle,
    locked,
    canCreateTask,
    onOpenChange,
    onNavigate,
    onCreateTaskFromNote,
}: NoteInspectorDrawerProps) {
    return (
        <Sheet open={open && Boolean(noteId)} onOpenChange={onOpenChange}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader className="pr-6">
                    <SheetTitle className="truncate">{noteTitle || 'Untitled note'}</SheetTitle>
                    <SheetDescription>Tags, reminders, and links connected to this note.</SheetDescription>
                </SheetHeader>
                {canCreateTask && (
                    <div className="mt-4">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full justify-start gap-2"
                            onClick={() => {
                                onOpenChange(false);
                                onCreateTaskFromNote();
                            }}
                        >
                            <ListPlus className="size-4" />
                            Create linked task in this project
                        </Button>
                    </div>
                )}
                {noteId && !locked && (
                    <div className="mt-4">
                        <RecordConnectionsPanel
                            entityType="note"
                            entityId={noteId}
                            onNavigate={(target) => {
                                onOpenChange(false);
                                onNavigate(target);
                            }}
                        />
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

export function NoteContactDialog({
    contact,
    onClose,
    onNavigate,
}: {
    contact: ContactRecord | null;
    onClose: () => void;
    onNavigate: (target: WorkspaceNavigationTarget) => void;
}) {
    return (
        <Dialog
            open={Boolean(contact)}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{contact?.name ?? 'Contact'}</DialogTitle>
                    <DialogDescription>
                        {[contact?.role, contact?.company].filter(Boolean).join(' · ') || 'Project contact'}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-xs">
                    {contact?.email && (
                        <p>
                            <span className="text-muted-foreground">Email:</span> {contact.email}
                        </p>
                    )}
                    {contact?.phone && (
                        <p>
                            <span className="text-muted-foreground">Phone:</span> {contact.phone}
                        </p>
                    )}
                    {contact?.notes && (
                        <p className="whitespace-pre-wrap text-muted-foreground">{contact.notes}</p>
                    )}
                    {contact && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() => {
                                onClose();
                                onNavigate({
                                    view: 'contacts',
                                    recordId: contact.id,
                                    projectId: contact.projectIds[0] ?? null,
                                });
                            }}
                        >
                            Open in Contacts
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
