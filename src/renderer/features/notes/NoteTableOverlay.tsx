import type { RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    GripVertical,
    MoreHorizontal,
    PanelLeft,
    PanelTop,
    Plus,
    TableCellsMerge,
    TableCellsSplit,
    Trash2,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NoteTableDragPreview } from './NoteTableDragPreview';
import { startTableColumnResizeDrag, startTableRowResizeDrag } from './note-table-resize-drag';
import { commitRowHeight, resolveCellDocPos, setColumnWidthPreset } from './note-table-sizing';
import { useNoteTableOverlayState } from './useNoteTableOverlayState';

export function NoteTableOverlay({
    editor,
    canvasRef,
}: {
    editor: Editor | null;
    canvasRef: RefObject<HTMLDivElement | null>;
}) {
    const {
        activeTarget,
        metrics,
        colMenuOpen,
        setColMenuOpen,
        rowMenuOpen,
        setRowMenuOpen,
        dragIndicator,
        setDragIndicator,
        isDraggingRef,
        selectionState,
        clearHideTimer,
        scheduleHide,
        measure,
    } = useNoteTableOverlayState(editor, canvasRef);

    function runOnTargetCell(cellEl: HTMLTableCellElement | undefined, action: () => boolean | undefined) {
        if (!editor || editor.isDestroyed) return;
        if (cellEl) {
            const pos = resolveCellDocPos(editor, cellEl);
            if (pos !== null) editor.chain().focus().setTextSelection(pos).run();
        }
        action();
        setColMenuOpen(false);
        setRowMenuOpen(false);
    }

    function appendBottomRow() {
        if (!editor || editor.isDestroyed || !activeTarget) return;
        const rows = activeTarget.tableEl.rows;
        const lastRow = rows[rows.length - 1];
        const lastCell = lastRow?.cells[lastRow.cells.length - 1];
        if (!lastCell) return;
        const pos = resolveCellDocPos(editor, lastCell);
        if (pos === null) return;
        editor.chain().focus().setTextSelection(pos).addRowAfter().goToNextCell().run();
    }

    function appendRightColumn() {
        if (!editor || editor.isDestroyed || !activeTarget) return;
        const firstRow = activeTarget.tableEl.rows[0];
        const lastColCell = firstRow?.cells[firstRow.cells.length - 1];
        if (!lastColCell) return;
        const pos = resolveCellDocPos(editor, lastColCell);
        if (pos === null) return;
        editor.chain().focus().setTextSelection(pos).addColumnAfter().run();
    }

    if (!editor || editor.isDestroyed || !activeTarget || !metrics) return null;

    const itemCls =
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40';

    return (
        <div
            data-table-overlay="true"
            onMouseEnter={clearHideTimer}
            onMouseLeave={scheduleHide}
            className="pointer-events-none absolute inset-0 z-20"
        >
            {/* Interactive internal column divider resize strips */}
            {metrics.colDividers.map((divider) => {
                const isActive = dragIndicator?.kind === 'col' && dragIndicator.colIndex === divider.colIndex;
                return (
                    <div
                        key={`col-split-${divider.colIndex}`}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize column ${divider.colIndex + 1}`}
                        title="Drag to resize column width · Double-click to equalize"
                        onMouseDown={(e) => {
                            if (!canvasRef.current) return;
                            startTableColumnResizeDrag({
                                event: e,
                                divider,
                                editor,
                                tableEl: activeTarget.tableEl,
                                cellEl: activeTarget.cellEl,
                                canvas: canvasRef.current,
                                isDraggingRef,
                                clearHideTimer,
                                setDragIndicator,
                                onSettled: measure,
                            });
                        }}
                        onDoubleClick={(e) => {
                            e.preventDefault();
                            setColumnWidthPreset(
                                editor,
                                activeTarget.tableEl,
                                activeTarget.cellEl,
                                divider.colIndex,
                                null,
                            );
                        }}
                        style={{
                            left: divider.left - 4,
                            top: metrics.tableTop + 8,
                            height: Math.max(20, metrics.tableHeight - 14),
                        }}
                        className="group pointer-events-auto absolute z-[12] flex w-2 cursor-col-resize justify-center"
                    >
                        <div
                            className={`h-full w-0.5 rounded-full transition-colors ${
                                isActive
                                    ? 'bg-primary shadow-[0_0_8px_var(--primary)]'
                                    : 'bg-transparent group-hover:bg-primary/75'
                            }`}
                        />
                    </div>
                );
            })}

            {/* Interactive row bottom border resize strips */}
            {metrics.rowDividers.map((divider) => {
                const isActive = dragIndicator?.kind === 'row' && dragIndicator.rowIndex === divider.rowIndex;
                return (
                    <div
                        key={`row-split-${divider.rowIndex}`}
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={`Resize row ${divider.rowIndex + 1}`}
                        title="Drag to resize row height · Double-click to reset"
                        onMouseDown={(e) => {
                            if (!canvasRef.current) return;
                            startTableRowResizeDrag({
                                event: e,
                                divider,
                                editor,
                                canvas: canvasRef.current,
                                isDraggingRef,
                                clearHideTimer,
                                setDragIndicator,
                                onSettled: measure,
                            });
                        }}
                        onDoubleClick={(e) => {
                            e.preventDefault();
                            const firstCell = divider.rowEl.cells[0];
                            if (firstCell) commitRowHeight(editor, firstCell, null);
                        }}
                        style={{
                            left: metrics.tableLeft + 6,
                            top: divider.top - 4,
                            width: Math.max(32, metrics.tableWidth - 12),
                        }}
                        className="group pointer-events-auto absolute z-[11] flex h-2 cursor-row-resize flex-col justify-center"
                    >
                        <div
                            className={`h-0.5 w-full rounded-full transition-colors ${
                                isActive
                                    ? 'bg-primary shadow-[0_0_8px_var(--primary)]'
                                    : 'bg-transparent group-hover:bg-primary/75'
                            }`}
                        />
                    </div>
                );
            })}

            <NoteTableDragPreview
                indicator={dragIndicator}
                tableLeft={metrics.tableLeft}
                tableTop={metrics.tableTop}
                tableWidth={metrics.tableWidth}
                tableHeight={metrics.tableHeight}
            />

            {/* Top column grip handle */}
            <Popover open={colMenuOpen} onOpenChange={setColMenuOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label="Column actions"
                        title="Column actions & width"
                        onMouseDown={(e) => e.preventDefault()}
                        style={{
                            left: metrics.colLeft + metrics.colWidth / 2,
                            top: metrics.tableTop - 10,
                        }}
                        className="pointer-events-auto absolute z-20 grid h-4.5 w-7 -translate-x-1/2 place-items-center rounded-full border border-border/80 bg-popover text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                        <MoreHorizontal className="size-3.5" />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="center" side="top" className="w-52 p-1.5">
                    <div role="menu" aria-label="Column options" className="space-y-0.5">
                        <button
                            type="button"
                            role="menuitem"
                            className={itemCls}
                            onClick={() =>
                                runOnTargetCell(activeTarget.cellEl, () =>
                                    editor.chain().focus().addColumnBefore().run(),
                                )
                            }
                        >
                            <ArrowLeft className="size-3.5 text-muted-foreground" />
                            <span>Insert column left</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={itemCls}
                            onClick={() =>
                                runOnTargetCell(activeTarget.cellEl, () =>
                                    editor.chain().focus().addColumnAfter().run(),
                                )
                            }
                        >
                            <ArrowRight className="size-3.5 text-muted-foreground" />
                            <span>Insert column right</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={itemCls}
                            onClick={() =>
                                runOnTargetCell(activeTarget.cellEl, () =>
                                    editor.chain().focus().toggleHeaderColumn().run(),
                                )
                            }
                        >
                            <PanelLeft className="size-3.5 text-muted-foreground" />
                            <span>Toggle header column</span>
                        </button>
                        {metrics.colCount > 1 && (
                            <>
                                <div className="my-1 border-t border-border/60" />
                                <div className="px-2 py-1">
                                    <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                                        <span>Column width</span>
                                        <span>Drag border</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1">
                                        {[
                                            { label: '25%', pct: 25 },
                                            { label: '50%', pct: 50 },
                                            { label: 'Equal', pct: null },
                                        ].map((preset) => (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => {
                                                    setColumnWidthPreset(
                                                        editor,
                                                        activeTarget.tableEl,
                                                        activeTarget.cellEl,
                                                        metrics.colIndex,
                                                        preset.pct,
                                                    );
                                                    setColMenuOpen(false);
                                                }}
                                                className="rounded border border-border/80 bg-surface-subtle/60 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                        <div className="my-1 border-t border-border/60" />
                        <button
                            type="button"
                            role="menuitem"
                            disabled={metrics.colCount <= 1}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
                            onClick={() =>
                                runOnTargetCell(activeTarget.cellEl, () =>
                                    editor.chain().focus().deleteColumn().run(),
                                )
                            }
                        >
                            <Trash2 className="size-3.5" />
                            <span>Delete column</span>
                        </button>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Left row grip handle */}
            <Popover open={rowMenuOpen} onOpenChange={setRowMenuOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label="Row actions"
                        title="Row actions & height"
                        onMouseDown={(e) => e.preventDefault()}
                        style={{
                            left: Math.max(4, metrics.tableLeft - 22),
                            top: metrics.rowTop + metrics.rowHeight / 2,
                        }}
                        className="pointer-events-auto absolute z-20 grid h-6 w-4.5 -translate-y-1/2 place-items-center rounded-full border border-border/80 bg-popover text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                        <GripVertical className="size-3.5" />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="start" side="left" className="w-52 p-1.5">
                    <div role="menu" aria-label="Row options" className="space-y-0.5">
                        <button
                            type="button"
                            role="menuitem"
                            className={itemCls}
                            onClick={() =>
                                runOnTargetCell(activeTarget.cellEl, () =>
                                    editor.chain().focus().addRowBefore().run(),
                                )
                            }
                        >
                            <ArrowUp className="size-3.5 text-muted-foreground" />
                            <span>Insert row above</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={itemCls}
                            onClick={() =>
                                runOnTargetCell(activeTarget.cellEl, () =>
                                    editor.chain().focus().addRowAfter().run(),
                                )
                            }
                        >
                            <ArrowDown className="size-3.5 text-muted-foreground" />
                            <span>Insert row below</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={itemCls}
                            onClick={() =>
                                runOnTargetCell(activeTarget.cellEl, () =>
                                    editor.chain().focus().toggleHeaderRow().run(),
                                )
                            }
                        >
                            <PanelTop className="size-3.5 text-muted-foreground" />
                            <span>Toggle header row</span>
                        </button>
                        <div className="my-1 border-t border-border/60" />
                        <div className="px-2 py-1">
                            <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                                <span>Row height</span>
                                <span>Drag edge</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                                {[
                                    { label: 'Auto', px: null },
                                    { label: '64px', px: 64 },
                                    { label: '112px', px: 112 },
                                ].map((preset) => (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => {
                                            commitRowHeight(editor, activeTarget.cellEl, preset.px);
                                            setRowMenuOpen(false);
                                        }}
                                        className="rounded border border-border/80 bg-surface-subtle/60 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="my-1 border-t border-border/60" />
                        <button
                            type="button"
                            role="menuitem"
                            disabled={metrics.rowCount <= 1}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
                            onClick={() =>
                                runOnTargetCell(activeTarget.cellEl, () =>
                                    editor.chain().focus().deleteRow().run(),
                                )
                            }
                        >
                            <Trash2 className="size-3.5" />
                            <span>Delete row</span>
                        </button>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Right edge + Add column bar */}
            <button
                type="button"
                aria-label="Add column"
                title="Add column to right"
                onMouseDown={(e) => e.preventDefault()}
                onClick={appendRightColumn}
                style={{
                    left: metrics.tableLeft + metrics.tableWidth + 5,
                    top: metrics.tableTop,
                    height: metrics.tableHeight,
                }}
                className="pointer-events-auto absolute flex w-5 items-center justify-center rounded-md border border-dashed border-border/80 bg-surface-subtle/50 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            >
                <Plus className="size-3.5" />
            </button>

            {/* Bottom + Add row bar */}
            <button
                type="button"
                aria-label="Add row"
                title="Add row below"
                onMouseDown={(e) => e.preventDefault()}
                onClick={appendBottomRow}
                style={{
                    left: metrics.tableLeft,
                    top: metrics.tableTop + metrics.tableHeight + 6,
                    width: metrics.tableWidth,
                }}
                className="pointer-events-auto absolute flex h-6 items-center justify-center gap-1 rounded-md border border-dashed border-border/80 bg-surface-subtle/50 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            >
                <Plus className="size-3" />
                <span>Add row</span>
            </button>

            {/* Selection Merge/Split quick pill when cells are multi-selected or merged */}
            {(selectionState?.canMerge || selectionState?.canSplit) && (
                <div
                    style={{
                        left: metrics.tableLeft + metrics.tableWidth,
                        top: Math.max(4, metrics.tableTop - 32),
                    }}
                    className="pointer-events-auto absolute z-30 flex -translate-x-full items-center gap-1 rounded-lg border border-border/80 bg-popover p-1 shadow-md"
                >
                    {selectionState.canMerge && (
                        <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => editor.chain().focus().mergeCells().run()}
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent"
                        >
                            <TableCellsMerge className="size-3 text-primary" />
                            <span>Merge cells</span>
                        </button>
                    )}
                    {selectionState.canSplit && (
                        <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => editor.chain().focus().splitCell().run()}
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent"
                        >
                            <TableCellsSplit className="size-3 text-primary" />
                            <span>Split cell</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
