import { BookOpen, Check, Clock3, Link2, LockKeyhole, LockOpen, ShieldAlert, Trash2 } from 'lucide-react';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error';

interface NoteEditorHeaderProps {
    noteTitle: string;
    locked: boolean;
    vaultConfigured: boolean;
    projectId: string;
    projectLabel?: string | undefined;
    saveState: NoteSaveState;
    connectionCount: number;
    onProjectChange: (projectId: string) => void;
    onProjectChoice: (choice: { id: string; label: string } | null) => void;
    onOpenInspector: () => void;
    onLockSelected: () => void;
    onRemoveLock?: (() => void) | undefined;
    onDeleteSelected: () => void;
}

export function NoteEditorHeader({
    noteTitle,
    locked,
    vaultConfigured,
    projectId,
    projectLabel,
    saveState,
    connectionCount,
    onProjectChange,
    onProjectChoice,
    onOpenInspector,
    onLockSelected,
    onRemoveLock,
    onDeleteSelected,
}: NoteEditorHeaderProps) {
    return (
        <div className="notes-editor-header flex shrink-0 flex-wrap items-center justify-between gap-2 px-5 py-2.5 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <Breadcrumb className="min-w-0">
                    <BreadcrumbList className="flex-nowrap gap-1 text-xs">
                        <BreadcrumbItem className="shrink-0">
                            <BookOpen className="size-3.5 shrink-0" />
                            <BreadcrumbPage>Notes</BreadcrumbPage>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator className="shrink-0" />
                        <BreadcrumbItem className="min-w-0">
                            <BreadcrumbPage className="max-w-[160px] truncate sm:max-w-[240px]">
                                {noteTitle || 'Untitled note'}
                            </BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {saveState === 'saving' ? (
                        <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3" />
                            Saving…
                        </span>
                    ) : saveState === 'saved' ? (
                        <span className="inline-flex items-center gap-1 text-success">
                            <Check className="size-3" />
                            Saved
                        </span>
                    ) : saveState === 'error' ? (
                        <span className="inline-flex items-center gap-1 text-danger">
                            <ShieldAlert className="size-3" />
                            Save failed
                        </span>
                    ) : null}
                </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                <RemoteRecordPicker
                    entityType="project"
                    value={projectId}
                    onValueChange={onProjectChange}
                    onChoiceChange={onProjectChoice}
                    placeholder="No project"
                    selectedLabel={projectLabel}
                    className="h-8 w-44 text-xs sm:w-56"
                />
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    onClick={onOpenInspector}
                >
                    <Link2 className="size-3.5" />
                    <span>Connections</span>
                    {connectionCount > 0 && (
                        <span className="rounded bg-primary/12 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary tabular-nums">
                            {connectionCount}
                        </span>
                    )}
                </Button>
                {locked ? (
                    <>
                        <Button size="sm" variant="outline" className="h-8" onClick={onLockSelected}>
                            <LockKeyhole className="size-3.5" />
                            Lock
                        </Button>
                        {onRemoveLock && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-muted-foreground hover:text-foreground"
                                title="Remove vault lock from note"
                                onClick={onRemoveLock}
                            >
                                <LockOpen className="size-3.5" />
                                Remove lock
                            </Button>
                        )}
                    </>
                ) : (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-danger"
                        title="Move note to trash"
                        aria-label="Delete note"
                        onClick={onDeleteSelected}
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                )}
                {!locked && vaultConfigured && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        title="Lock note in vault"
                        aria-label="Lock note"
                        onClick={onLockSelected}
                    >
                        <LockKeyhole className="size-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
}
