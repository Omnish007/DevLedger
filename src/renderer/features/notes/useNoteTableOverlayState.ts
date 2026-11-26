import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import type { TableDragIndicator } from './NoteTableDragPreview';

export interface ColDivider {
    colIndex: number;
    left: number;
}

export interface RowDivider {
    rowIndex: number;
    rowEl: HTMLTableRowElement;
    top: number;
    height: number;
}

export interface OverlayMetrics {
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

export interface ActiveTableTarget {
    tableEl: HTMLTableElement;
    cellEl: HTMLTableCellElement;
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

export function useNoteTableOverlayState(editor: Editor | null, canvasRef: RefObject<HTMLDivElement | null>) {
    const [activeTarget, setActiveTarget] = useState<ActiveTableTarget | null>(null);
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
            if (selCell && selTable) setActiveTarget({ tableEl: selTable, cellEl: selCell });
            else setActiveTarget(null);
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

    return {
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
    };
}
