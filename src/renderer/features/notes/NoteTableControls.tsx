import { useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
    ChevronDown,
    Columns3,
    PanelLeft,
    PanelTop,
    RotateCcw,
    Rows3,
    Table2,
    TableCellsMerge,
    TableCellsSplit,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { resetAllTableSizes } from './note-table-sizing';

interface NoteTableToolbarMenuProps {
    editor: Editor | null;
    inTable: boolean;
}

const MAX_GRID_ROWS = 6;
const MAX_GRID_COLS = 6;

export function NoteTableToolbarMenu({ editor, inTable }: NoteTableToolbarMenuProps) {
    const [open, setOpen] = useState(false);
    const [hoverRows, setHoverRows] = useState(3);
    const [hoverCols, setHoverCols] = useState(3);
    const [withHeaderRow, setWithHeaderRow] = useState(true);

    const tableCaps = useEditorState({
        editor,
        selector: ({ editor: instance }) => {
            if (!instance || instance.isDestroyed || !instance.isActive('table')) {
                return null;
            }
            return {
                canAddRow: instance.can().addRowAfter(),
                canAddCol: instance.can().addColumnAfter(),
                canToggleHeaderRow: instance.can().toggleHeaderRow(),
                canToggleHeaderCol: instance.can().toggleHeaderColumn(),
                canMerge: instance.can().mergeCells(),
                canSplit: instance.can().splitCell(),
                canDeleteTable: instance.can().deleteTable(),
            };
        },
    });

    function insertTableSize(rows: number, cols: number) {
        if (!editor || editor.isDestroyed) return;
        editor.chain().focus().insertTable({ rows, cols, withHeaderRow }).run();
        setOpen(false);
    }

    function runAndClose(action: () => boolean | undefined) {
        action();
        setOpen(false);
    }

    const menuItemCls =
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40';

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setHoverRows(3);
                    setHoverCols(3);
                }
            }}
        >
            <PopoverTrigger asChild>
                {inTable ? (
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs font-medium"
                        title="Table options"
                        aria-label="Table"
                        disabled={!editor}
                    >
                        <Table2 className="size-3.5 text-primary" />
                        <span>Table</span>
                        <ChevronDown className="size-3 text-muted-foreground" />
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Insert table"
                        aria-label="Table"
                        disabled={!editor}
                    >
                        <Table2 className="size-3.5" />
                    </Button>
                )}
            </PopoverTrigger>
            <PopoverContent align="start" className={inTable ? 'w-56 p-1.5' : 'w-56 space-y-2.5 p-3'}>
                {inTable && tableCaps ? (
                    <div role="menu" aria-label="Table options" className="space-y-0.5">
                        <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Table layout
                        </p>
                        <button
                            type="button"
                            role="menuitem"
                            className={menuItemCls}
                            disabled={!tableCaps.canAddRow}
                            onClick={() => runAndClose(() => editor?.chain().focus().addRowAfter().run())}
                        >
                            <Rows3 className="size-3.5 text-muted-foreground" />
                            <span>Insert row below</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={menuItemCls}
                            disabled={!tableCaps.canAddCol}
                            onClick={() => runAndClose(() => editor?.chain().focus().addColumnAfter().run())}
                        >
                            <Columns3 className="size-3.5 text-muted-foreground" />
                            <span>Insert column right</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={menuItemCls}
                            disabled={!tableCaps.canToggleHeaderRow}
                            onClick={() => runAndClose(() => editor?.chain().focus().toggleHeaderRow().run())}
                        >
                            <PanelTop className="size-3.5 text-muted-foreground" />
                            <span>Toggle header row</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={menuItemCls}
                            disabled={!tableCaps.canToggleHeaderCol}
                            onClick={() =>
                                runAndClose(() => editor?.chain().focus().toggleHeaderColumn().run())
                            }
                        >
                            <PanelLeft className="size-3.5 text-muted-foreground" />
                            <span>Toggle header column</span>
                        </button>

                        <div className="my-1 border-t border-border/60" />

                        <button
                            type="button"
                            role="menuitem"
                            className={menuItemCls}
                            disabled={!tableCaps.canMerge}
                            onClick={() => runAndClose(() => editor?.chain().focus().mergeCells().run())}
                        >
                            <TableCellsMerge className="size-3.5 text-muted-foreground" />
                            <span>Merge selected cells</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={menuItemCls}
                            disabled={!tableCaps.canSplit}
                            onClick={() => runAndClose(() => editor?.chain().focus().splitCell().run())}
                        >
                            <TableCellsSplit className="size-3.5 text-muted-foreground" />
                            <span>Split merged cell</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={menuItemCls}
                            onClick={() => {
                                if (editor) resetAllTableSizes(editor);
                                setOpen(false);
                            }}
                        >
                            <RotateCcw className="size-3.5 text-muted-foreground" />
                            <span>Reset column &amp; row sizes</span>
                        </button>

                        <div className="my-1 border-t border-border/60" />

                        <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
                            disabled={!tableCaps.canDeleteTable}
                            onClick={() => runAndClose(() => editor?.chain().focus().deleteTable().run())}
                        >
                            <Trash2 className="size-3.5" />
                            <span>Delete table</span>
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-foreground">
                                Insert {hoverRows} × {hoverCols} table
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-7 px-2 text-xs"
                                onClick={() => insertTableSize(3, 3)}
                            >
                                Quick 3×3
                            </Button>
                        </div>

                        <div
                            role="grid"
                            aria-label="Choose table dimensions"
                            className="grid grid-cols-6 gap-1 rounded-lg border border-border/80 bg-surface-subtle/40 p-2"
                            onMouseLeave={() => {
                                setHoverRows(3);
                                setHoverCols(3);
                            }}
                        >
                            {Array.from({ length: MAX_GRID_ROWS * MAX_GRID_COLS }, (_, index) => {
                                const r = Math.floor(index / MAX_GRID_COLS) + 1;
                                const c = (index % MAX_GRID_COLS) + 1;
                                const highlighted = r <= hoverRows && c <= hoverCols;
                                return (
                                    <button
                                        key={`${r}x${c}`}
                                        type="button"
                                        aria-label={`Insert ${r} by ${c} table`}
                                        onMouseEnter={() => {
                                            setHoverRows(r);
                                            setHoverCols(c);
                                        }}
                                        onFocus={() => {
                                            setHoverRows(r);
                                            setHoverCols(c);
                                        }}
                                        onClick={() => insertTableSize(r, c)}
                                        className={`aspect-square rounded-[3px] border transition-colors ${
                                            highlighted
                                                ? 'border-primary/70 bg-primary/25'
                                                : 'border-border/70 bg-card hover:border-primary/40'
                                        }`}
                                    />
                                );
                            })}
                        </div>

                        <label className="flex cursor-pointer items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                            <span>Include header row</span>
                            <Switch
                                size="sm"
                                checked={withHeaderRow}
                                onCheckedChange={setWithHeaderRow}
                                aria-label="Include header row"
                            />
                        </label>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
