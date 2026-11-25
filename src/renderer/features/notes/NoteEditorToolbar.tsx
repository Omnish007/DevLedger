import { useRef, type ChangeEvent } from 'react';
import type { Editor } from '@tiptap/react';
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
    Table2,
} from 'lucide-react';
import type { SmartDateReference } from '@domain/smart-date-markdown';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
    const actions = [
        {
            label: 'Bold',
            icon: Bold,
            run: () => editor?.chain().focus().toggleBold().run(),
            active: editor?.isActive('bold'),
        },
        {
            label: 'Italic',
            icon: Italic,
            run: () => editor?.chain().focus().toggleItalic().run(),
            active: editor?.isActive('italic'),
        },
        {
            label: 'Heading',
            icon: Heading2,
            run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
            active: editor?.isActive('heading'),
        },
        {
            label: 'Bulleted list',
            icon: List,
            run: () => editor?.chain().focus().toggleBulletList().run(),
            active: editor?.isActive('bulletList'),
        },
        {
            label: 'Numbered list',
            icon: ListOrdered,
            run: () => editor?.chain().focus().toggleOrderedList().run(),
            active: editor?.isActive('orderedList'),
        },
        {
            label: 'Checklist',
            icon: CheckSquare,
            run: () => editor?.chain().focus().toggleTaskList().run(),
            active: editor?.isActive('taskList'),
        },
        {
            label: 'Table',
            icon: Table2,
            run: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
            active: editor?.isActive('table'),
        },
        {
            label: 'Quote',
            icon: Quote,
            run: () => editor?.chain().focus().toggleBlockquote().run(),
            active: editor?.isActive('blockquote'),
        },
    ];

    return (
        <div className="notes-editor-toolbar shrink-0 px-5 py-1.5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
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
                <div className="flex items-center gap-1">
                    <SmartDateInsert onInsert={onInsertDate} />
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 text-muted-foreground"
                                title="Inline @ shortcuts"
                                aria-label="Inline @ shortcuts"
                            >
                                <HelpCircle className="size-3.5" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 space-y-2 p-3 text-xs">
                            <p className="font-semibold">Inline @ shortcuts</p>
                            <p className="text-muted-foreground">
                                Type <code className="rounded bg-surface-subtle px-1 py-0.5">@</code> anywhere
                                in a note to insert project contacts or dates:
                            </p>
                            <div className="space-y-1 text-muted-foreground">
                                <div>
                                    <code className="text-foreground">@today</code>,{' '}
                                    <code className="text-foreground">@friday</code>,{' '}
                                    <code className="text-foreground">@next week</code>
                                </div>
                                <div>
                                    <code className="text-foreground">@May 15</code>,{' '}
                                    <code className="text-foreground">@in 3 days</code>
                                </div>
                                <div>
                                    <code className="text-foreground">@remind tomorrow 9am</code>
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
