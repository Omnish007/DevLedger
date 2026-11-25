import { useRef, type ChangeEvent } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
    Bold,
    CheckSquare,
    Download,
    FileUp,
    Heading2,
    HelpCircle,
    Italic,
    List,
    ListOrdered,
    Quote,
} from 'lucide-react';
import type { SmartDateReference } from '@domain/smart-date-markdown';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NoteTableToolbarMenu } from './NoteTableControls';
import { SmartDateInsert } from './SmartDateInsert';

interface NoteEditorToolbarProps {
    editor: Editor | null;
    onInsertDate: (reference: SmartDateReference) => void;
    onImportMarkdown: (event: ChangeEvent<HTMLInputElement>) => void;
    onExportMarkdown: () => void;
}

export function NoteEditorToolbar({
    editor,
    onInsertDate,
    onImportMarkdown,
    onExportMarkdown,
}: NoteEditorToolbarProps) {
    const markdownInputRef = useRef<HTMLInputElement | null>(null);
    const activeEditor = editor && !editor.isDestroyed ? editor : null;
    const editorFlags = useEditorState({
        editor: activeEditor,
        selector: ({ editor: instance }) => ({
            bold: Boolean(instance?.isActive('bold')),
            italic: Boolean(instance?.isActive('italic')),
            heading: Boolean(instance?.isActive('heading')),
            bulletList: Boolean(instance?.isActive('bulletList')),
            orderedList: Boolean(instance?.isActive('orderedList')),
            taskList: Boolean(instance?.isActive('taskList')),
            blockquote: Boolean(instance?.isActive('blockquote')),
            inTable: Boolean(instance?.isActive('table')),
        }),
    });
    const actions = [
        {
            label: 'Bold',
            icon: Bold,
            run: () => activeEditor?.chain().focus().toggleBold().run(),
            active: Boolean(editorFlags?.bold),
        },
        {
            label: 'Italic',
            icon: Italic,
            run: () => activeEditor?.chain().focus().toggleItalic().run(),
            active: Boolean(editorFlags?.italic),
        },
        {
            label: 'Heading',
            icon: Heading2,
            run: () => activeEditor?.chain().focus().toggleHeading({ level: 2 }).run(),
            active: Boolean(editorFlags?.heading),
        },
        {
            label: 'Bulleted list',
            icon: List,
            run: () => activeEditor?.chain().focus().toggleBulletList().run(),
            active: Boolean(editorFlags?.bulletList),
        },
        {
            label: 'Numbered list',
            icon: ListOrdered,
            run: () => activeEditor?.chain().focus().toggleOrderedList().run(),
            active: Boolean(editorFlags?.orderedList),
        },
        {
            label: 'Checklist',
            icon: CheckSquare,
            run: () => activeEditor?.chain().focus().toggleTaskList().run(),
            active: Boolean(editorFlags?.taskList),
        },
        {
            label: 'Quote',
            icon: Quote,
            run: () => activeEditor?.chain().focus().toggleBlockquote().run(),
            active: Boolean(editorFlags?.blockquote),
        },
    ];

    return (
        <div className="notes-editor-toolbar shrink-0 px-5 py-1.5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-0.5">
                    <ButtonGroup className="flex-wrap">
                        {actions.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Button
                                    key={item.label}
                                    type="button"
                                    variant={item.active ? 'secondary' : 'ghost'}
                                    size="icon"
                                    className="size-7"
                                    title={item.label}
                                    aria-label={item.label}
                                    onClick={item.run}
                                >
                                    <Icon className="size-3.5" />
                                </Button>
                            );
                        })}
                    </ButtonGroup>
                    <NoteTableToolbarMenu editor={activeEditor} inTable={Boolean(editorFlags?.inTable)} />
                </div>
                <div className="flex items-center gap-1">
                    <SmartDateInsert onInsert={onInsertDate} />
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 text-muted-foreground"
                                title="Inline @ shortcuts & tables"
                                aria-label="Inline @ shortcuts"
                            >
                                <HelpCircle className="size-3.5" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-80 space-y-2.5 p-3 text-xs">
                            <p className="font-semibold">Inline @ shortcuts</p>
                            <p className="text-muted-foreground">
                                Type <code className="rounded bg-surface-subtle px-1 py-0.5">@</code> anywhere
                                for project contacts, dates, or reminders:
                            </p>
                            <div className="space-y-1.5 text-muted-foreground">
                                <div>
                                    <code className="text-foreground">@t</code> Today ·{' '}
                                    <code className="text-foreground">@tom</code> Tomorrow ·{' '}
                                    <code className="text-foreground">@f</code> Friday
                                </div>
                                <div>
                                    <code className="text-foreground">@May 15 3pm</code> ·{' '}
                                    <code className="text-foreground">@in 3d</code> ·{' '}
                                    <code className="text-foreground">@nw</code>
                                </div>
                                <div>
                                    <code className="text-foreground">@r tomorrow 9am</code> sets a reminder
                                </div>
                                <div className="border-t border-border/60 pt-1.5 text-[11px]">
                                    Hover any table edge to add or resize rows and columns; use row/column
                                    handles or press <code className="text-foreground">Tab</code> to move
                                    cells.
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                    <input
                        ref={markdownInputRef}
                        type="file"
                        accept=".md,.markdown,text/markdown"
                        className="hidden"
                        onChange={onImportMarkdown}
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => markdownInputRef.current?.click()}
                    >
                        <FileUp className="mr-1 size-3.5" />
                        Import MD
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={onExportMarkdown}
                    >
                        <Download className="mr-1 size-3.5" />
                        Export MD
                    </Button>
                </div>
            </div>
        </div>
    );
}
