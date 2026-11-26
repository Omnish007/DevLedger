import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type RefObject,
} from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
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
import { NoteTableDragPreview, type TableDragIndicator } from './NoteTableDragPreview';
import {
    applyLiveDomColumnPcts,
    commitColumnWidthsPct,
    commitRowHeight,
    readDomColumnPcts,
    resolveCellDocPos,
    setColumnWidthPreset,
} from './note-table-sizing';

interface ColDivider {
    colIndex: number;
    left: number;
}

interface RowDivider {
    rowIndex: number;
    rowEl: HTMLTableRowElement;
    top: number;
    height: number;
}

interface OverlayMetrics {
    tableLeft: number;
    tableTop: number;
    tableWidth: number;
    tableHeight: number;
    rowTop: number;
    rowHeight: number;
    colLeft: number;
    colWidth: number;
    colIndex: number;
    rowCount: number;
    colCount: number;
    colDividers: ColDivider[];
    rowDividers: RowDivider[];
}

function findSelectionCell(editor: Editor | null): HTMLTableCellElement | null {
    if (!editor || editor.isDestroyed || !editor.isActive('table')) return null;
    try {
        const { node } = editor.view.domAtPos(editor.state.selection.from);
        const element = node instanceof HTMLElement ? node : node.parentElement;
        return element?.closest<HTMLTableCellElement>('td, th') ?? null;
    } catch {
        return null;
    }
}

export function NoteTableOverlay({
    editor,
    canvasRef,
}: {
    editor: Editor | null;
    canvasRef: RefObject<HTMLDivElement | null>;
}) {
    const [activeTarget, setActiveTarget] = useState<{
        tableEl: HTMLTableElement;
        cellEl: HTMLTableCellElement;
    } | null>(null);
    const [metrics, setMetrics] = useState<OverlayMetrics | null>(null);
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const [rowMenuOpen, setRowMenuOpen] = useState(false);
    const [dragIndicator, setDragIndicator] = useState<TableDragIndicator | null>(null);

    const hideTimerRef = useRef<number | null>(null);
    const openMenuRef = useRef(false);
    const isDraggingRef = useRef(false);
    openMenuRef.current = colMenuOpen || rowMenuOpen;

    const selectionState = useEditorState({
        editor,
        selector: ({ editor: instance }) => ({
            inTable: Boolean(instance && !instance.isDestroyed && instance.isActive('table')),
            canMerge: Boolean(instance && !instance.isDestroyed && instance.can().mergeCells()),
            canSplit: Boolean(instance && !instance.isDestroyed && instance.can().splitCell()),
        }),
    });

    const clearHideTimer = useCallback(() => {
        if (hideTimerRef.current !== null) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    const scheduleHide = useCallback(() => {
        clearHideTimer();
        hideTimerRef.current = window.setTimeout(() => {
            if (openMenuRef.current || isDraggingRef.current) return;
            const selCell = findSelectionCell(editor);
            const selTable = selCell?.closest('table') ?? null;
            if (selCell && selTable) {
                setActiveTarget({ tableEl: selTable, cellEl: selCell });
            } else {
                setActiveTarget(null);
            }
        }, 180);
    }, [clearHideTimer, editor]);

    const measure = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !activeTarget) {
            setMetrics(null);
            return;
        }
        const { tableEl, cellEl } = activeTarget;
        if (!canvas.contains(tableEl) || !tableEl.contains(cellEl)) {
            setMetrics(null);
            return;
        }
        const rowEl = cellEl.closest('tr');
        if (!rowEl) {
            setMetrics(null);
            return;
        }
        const canvasRect = canvas.getBoundingClientRect();
        const tableRect = tableEl.getBoundingClientRect();
        const rowRect = rowEl.getBoundingClientRect();
        const cellRect = cellEl.getBoundingClientRect();
        const firstRow = tableEl.rows[0];

        const colDividers: ColDivider[] = [];
        if (firstRow && firstRow.cells.length > 1) {
            for (let i = 0; i < firstRow.cells.length - 1; i++) {
                const colCellRect = firstRow.cells[i]!.getBoundingClientRect();
                colDividers.push({ colIndex: i, left: colCellRect.right - canvasRect.left });
            }
        }

        const rowDividers: RowDivider[] = [];
        for (let r = 0; r < tableEl.rows.length; r++) {
            const tr = tableEl.rows[r]!;
            const rRect = tr.getBoundingClientRect();
            rowDividers.push({
                rowIndex: r,
                rowEl: tr,
                top: rRect.bottom - canvasRect.top,
                height: rRect.height,
            });
        }

        let colIndex = 0;
        const siblings = rowEl.cells;
        for (let i = 0; i < siblings.length; i++) {
            if (siblings[i] === cellEl) break;
            colIndex += Math.max(1, siblings[i]!.colSpan || 1);
        }

        setMetrics({
            tableLeft: tableRect.left - canvasRect.left,
            tableTop: tableRect.top - canvasRect.top,
            tableWidth: tableRect.width,
            tableHeight: tableRect.height,
            rowTop: rowRect.top - canvasRect.top,
            rowHeight: rowRect.height,
            colLeft: cellRect.left - canvasRect.left,
            colWidth: cellRect.width,
            colIndex,
            rowCount: tableEl.rows.length,
            colCount: firstRow?.cells.length ?? 0,
            colDividers,
            rowDividers,
        });
    }, [activeTarget, canvasRef]);

    useEffect(() => {
        measure();
        if (!activeTarget) return;
        const onScrollOrResize = () => window.requestAnimationFrame(measure);
        window.addEventListener('resize', onScrollOrResize);
        const scrollParent = canvasRef.current?.closest('.notes-editor-scroll');
        scrollParent?.addEventListener('scroll', onScrollOrResize, { passive: true });
        const observer = new ResizeObserver(onScrollOrResize);
        observer.observe(activeTarget.tableEl);
        return () => {
            window.removeEventListener('resize', onScrollOrResize);
            scrollParent?.removeEventListener('scroll', onScrollOrResize);
            observer.disconnect();
        };
    }, [activeTarget, canvasRef, measure]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const syncFromEditor = () => {
            if (openMenuRef.current || isDraggingRef.current) return;
            const selCell = findSelectionCell(editor);
            const selTable = selCell?.closest('table') ?? null;
            if (selCell && selTable) {
                setActiveTarget({ tableEl: selTable, cellEl: selCell });
            } else if (!hideTimerRef.current) {
                setActiveTarget((prev) => (prev && canvasRef.current?.contains(prev.tableEl) ? prev : null));
            }
            window.requestAnimationFrame(measure);
        };
        editor.on('selectionUpdate', syncFromEditor);
        editor.on('transaction', syncFromEditor);
        return () => {
            editor.off('selectionUpdate', syncFromEditor);
            editor.off('transaction', syncFromEditor);
        };
    }, [canvasRef, editor, measure]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onMouseMove = (event: MouseEvent) => {
            if (isDraggingRef.current) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-table-overlay="true"]')) {
                clearHideTimer();
                return;
            }
            const cell = target?.closest<HTMLTableCellElement>('.prose-editor td, .prose-editor th');
            const table = cell?.closest('table');
            if (cell && table) {
                clearHideTimer();
                if (!openMenuRef.current) {
                    setActiveTarget((prev) =>
                        prev?.tableEl === table && prev.cellEl === cell
                            ? prev
                            : { tableEl: table, cellEl: cell },
                    );
                }
            } else {
                scheduleHide();
            }
        };
        const onMouseLeave = () => scheduleHide();
        canvas.addEventListener('mousemove', onMouseMove, { passive: true });
        canvas.addEventListener('mouseleave', onMouseLeave);
        return () => {
            clearHideTimer();
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseleave', onMouseLeave);
        };
    }, [canvasRef, clearHideTimer, scheduleHide]);

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

    function startColumnResize(event: ReactMouseEvent<HTMLDivElement>, divider: ColDivider) {
        if (!editor || !activeTarget || !metrics || !canvasRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        const { tableEl, cellEl } = activeTarget;
        const canvas = canvasRef.current;
        const startX = event.clientX;
        const totalWidth = Math.max(120, tableEl.getBoundingClientRect().width);
        const startPcts = readDomColumnPcts(tableEl);
        if (divider.colIndex + 1 >= startPcts.length) return;
        const headerRow = tableEl.rows[0];
        const initialLeftCellWidth = Math.round(
            headerRow?.cells[divider.colIndex]?.getBoundingClientRect().width ?? 0,
        );

        isDraggingRef.current = true;
        clearHideTimer();
        document.body.style.cursor = 'col-resize';
        const pairSum = startPcts[divider.colIndex]! + startPcts[divider.colIndex + 1]!;
        const minPct = Math.max(10, Number(((56 / totalWidth) * 100).toFixed(1)));
        let latestPcts = [...startPcts];

        const publishColPreview = (leftPct: number, rightPct: number) => {
            const canvasRect = canvas.getBoundingClientRect();
            const leftCellRect = headerRow?.cells[divider.colIndex]?.getBoundingClientRect();
            const rightCellRect = headerRow?.cells[divider.colIndex + 1]?.getBoundingClientRect();
            const deltaX = ((leftPct - startPcts[divider.colIndex]!) / 100) * totalWidth;
            const splitX = leftCellRect ? leftCellRect.right - canvasRect.left : divider.left + deltaX;
            const leftColLeft = leftCellRect
                ? leftCellRect.left - canvasRect.left
                : splitX - Math.round((leftPct / 100) * totalWidth);
            const leftColWidth = Math.round(leftCellRect?.width ?? (leftPct / 100) * totalWidth);
            const rightColWidth = Math.round(rightCellRect?.width ?? (rightPct / 100) * totalWidth);
            const deltaPx = leftColWidth - initialLeftCellWidth;
            const clamped = leftPct <= minPct + 0.05 || rightPct <= minPct + 0.05;
            setDragIndicator({
                kind: 'col',
                colIndex: divider.colIndex,
                left: splitX,
                startLeft: divider.left,
                leftColLeft,
                leftColWidth,
                rightColWidth,
                leftPct: Math.round(leftPct),
                rightPct: Math.round(rightPct),
                deltaPx,
                clamped,
                label: `${leftColWidth}px (${Math.round(leftPct)}%) ↔ ${rightColWidth}px (${Math.round(rightPct)}%)`,
            });
        };

        publishColPreview(startPcts[divider.colIndex]!, startPcts[divider.colIndex + 1]!);

        const onMove = (moveEvent: MouseEvent) => {
            const deltaPct = ((moveEvent.clientX - startX) / totalWidth) * 100;
            const leftPct = Number(
                Math.min(pairSum - minPct, Math.max(minPct, startPcts[divider.colIndex]! + deltaPct)).toFixed(
                    1,
                ),
            );
            const rightPct = Number((pairSum - leftPct).toFixed(1));
            latestPcts = [...startPcts];
            latestPcts[divider.colIndex] = leftPct;
            latestPcts[divider.colIndex + 1] = rightPct;
            applyLiveDomColumnPcts(tableEl, latestPcts);
            publishColPreview(leftPct, rightPct);
            window.requestAnimationFrame(measure);
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            isDraggingRef.current = false;
            document.body.style.cursor = '';
            setDragIndicator(null);
            commitColumnWidthsPct(editor, cellEl, latestPcts);
            window.requestAnimationFrame(measure);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    function startRowResize(event: ReactMouseEvent<HTMLDivElement>, divider: RowDivider) {
        if (!editor || !activeTarget || !canvasRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        const canvas = canvasRef.current;
        const startY = event.clientY;
        const startHeight = Math.round(divider.height);
        const targetCell = divider.rowEl.cells[0];
        if (!targetCell) return;

        isDraggingRef.current = true;
        clearHideTimer();
        document.body.style.cursor = 'row-resize';
        let latestHeight = startHeight;

        const publishRowPreview = (targetHeight: number) => {
            const canvasRect = canvas.getBoundingClientRect();
            const rowRect = divider.rowEl.getBoundingClientRect();
            const actualHeight = Math.round(rowRect.height);
            const clampedToContent = targetHeight < actualHeight - 1;
            const deltaPx = actualHeight - startHeight;
            setDragIndicator({
                kind: 'row',
                rowIndex: divider.rowIndex,
                rowTop: rowRect.top - canvasRect.top,
                top: rowRect.bottom - canvasRect.top,
                startTop: divider.top,
                actualHeight,
                targetHeight,
                deltaPx,
                clampedToContent,
                label: clampedToContent
                    ? `Row ${divider.rowIndex + 1} · ${actualHeight}px (min content)`
                    : `Row ${divider.rowIndex + 1} · ${actualHeight}px${deltaPx === 0 ? '' : ` (${deltaPx > 0 ? `+${deltaPx}` : deltaPx}px)`}`,
            });
        };

        publishRowPreview(startHeight);

        const onMove = (moveEvent: MouseEvent) => {
            latestHeight = Math.min(
                420,
                Math.max(36, Math.round(startHeight + (moveEvent.clientY - startY))),
            );
            divider.rowEl.style.height = `${latestHeight}px`;
            publishRowPreview(latestHeight);
            window.requestAnimationFrame(measure);
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            isDraggingRef.current = false;
            document.body.style.cursor = '';
            setDragIndicator(null);
            commitRowHeight(editor, targetCell, latestHeight);
            window.requestAnimationFrame(measure);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
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
                        onMouseDown={(e) => startColumnResize(e, divider)}
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
                        onMouseDown={(e) => startRowResize(e, divider)}
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
                        className="pointer-events-auto absolute z-20 grid h-4.5 w-7 -translate-x-1/2 place-items-center rounded-full border border-border/90 bg-popover text-muted-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-foreground"
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
                                                className="rounded border border-border/80 bg-surface-subtle/60 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-primary/10"
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
                        className="pointer-events-auto absolute z-20 grid h-6 w-4.5 -translate-y-1/2 place-items-center rounded-full border border-border/90 bg-popover text-muted-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-foreground"
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
                                        className="rounded border border-border/80 bg-surface-subtle/60 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-primary/10"
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
                className="pointer-events-auto absolute flex w-5 items-center justify-center rounded-md border border-dashed border-border/80 bg-surface-subtle/50 text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-primary"
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
                className="pointer-events-auto absolute flex h-6 items-center justify-center gap-1 rounded-md border border-dashed border-border/80 bg-surface-subtle/50 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-primary"
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
                    className="pointer-events-auto absolute z-30 flex -translate-x-full items-center gap-1 rounded-lg border border-border/90 bg-popover p-1 shadow-md"
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
