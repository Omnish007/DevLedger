import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import type { TableDragIndicator } from './NoteTableDragPreview';
import { commitColumnWidthsPct, commitRowHeight, readDomColumnPcts } from './note-table-sizing';
import type { ColDivider, RowDivider } from './useNoteTableOverlayState';

interface ColumnDragParams {
    event: ReactMouseEvent<HTMLDivElement>;
    divider: ColDivider;
    editor: Editor;
    tableEl: HTMLTableElement;
    cellEl: HTMLTableCellElement;
    canvas: HTMLDivElement;
    isDraggingRef: RefObject<boolean>;
    clearHideTimer: () => void;
    setDragIndicator: (indicator: TableDragIndicator | null) => void;
    onSettled: () => void;
}

export function startTableColumnResizeDrag({
    event,
    divider,
    editor,
    tableEl,
    cellEl,
    canvas,
    isDraggingRef,
    clearHideTimer,
    setDragIndicator,
    onSettled,
}: ColumnDragParams): void {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const totalWidth = Math.max(120, tableEl.getBoundingClientRect().width);
    const startPcts = readDomColumnPcts(tableEl);
    if (divider.colIndex + 1 >= startPcts.length) return;
    const headerRow = tableEl.rows[0];
    const canvasRect = canvas.getBoundingClientRect();
    const leftHeaderRect = headerRow?.cells[divider.colIndex]?.getBoundingClientRect();
    const leftColLeft = leftHeaderRect
        ? leftHeaderRect.left - canvasRect.left
        : divider.left - (startPcts[divider.colIndex]! / 100) * totalWidth;
    const initialLeftCellWidth = Math.round(
        leftHeaderRect?.width ?? (startPcts[divider.colIndex]! / 100) * totalWidth,
    );

    isDraggingRef.current = true;
    clearHideTimer();
    document.body.style.cursor = 'col-resize';
    const pairSum = startPcts[divider.colIndex]! + startPcts[divider.colIndex + 1]!;
    const minPct = Math.max(10, Number(((56 / totalWidth) * 100).toFixed(1)));
    let latestPcts = [...startPcts];

    const publishColPreview = (leftPct: number, rightPct: number) => {
        const leftColWidth = Math.round((leftPct / 100) * totalWidth);
        const rightColWidth = Math.round((rightPct / 100) * totalWidth);
        const splitX = leftColLeft + leftColWidth;
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
            Math.min(pairSum - minPct, Math.max(minPct, startPcts[divider.colIndex]! + deltaPct)).toFixed(1),
        );
        const rightPct = Number((pairSum - leftPct).toFixed(1));
        latestPcts = [...startPcts];
        latestPcts[divider.colIndex] = leftPct;
        latestPcts[divider.colIndex + 1] = rightPct;
        // Do not mutate ProseMirror DOM styles mid-drag; ProseMirror's DOMObserver
        // replaces table/cell elements and tears down the active drag overlay.
        publishColPreview(leftPct, rightPct);
    };

    const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        setDragIndicator(null);
        commitColumnWidthsPct(editor, cellEl, latestPcts);
        window.requestAnimationFrame(onSettled);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

interface RowDragParams {
    event: ReactMouseEvent<HTMLDivElement>;
    divider: RowDivider;
    editor: Editor;
    canvas: HTMLDivElement;
    isDraggingRef: RefObject<boolean>;
    clearHideTimer: () => void;
    setDragIndicator: (indicator: TableDragIndicator | null) => void;
    onSettled: () => void;
}

export function startTableRowResizeDrag({
    event,
    divider,
    editor,
    canvas,
    isDraggingRef,
    clearHideTimer,
    setDragIndicator,
    onSettled,
}: RowDragParams): void {
    event.preventDefault();
    event.stopPropagation();
    const canvasRect = canvas.getBoundingClientRect();
    const startY = event.clientY;
    const startHeight = Math.round(divider.height);
    const rowRect = divider.rowEl.getBoundingClientRect();
    const rowTop = rowRect.top - canvasRect.top;
    const targetCell = divider.rowEl.cells[0];
    if (!targetCell) return;

    // Measure minimum intrinsic cell content height once so shrinking preview accurately shows content clamping.
    let minContentHeight = 36;
    for (let i = 0; i < divider.rowEl.cells.length; i += 1) {
        const cell = divider.rowEl.cells[i]!;
        const computed = window.getComputedStyle(cell);
        const padY = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
        let innerHeight = 0;
        for (let c = 0; c < cell.children.length; c += 1) {
            innerHeight += cell.children[c]!.getBoundingClientRect().height;
        }
        minContentHeight = Math.max(minContentHeight, Math.ceil(innerHeight + padY + 4));
    }

    isDraggingRef.current = true;
    clearHideTimer();
    document.body.style.cursor = 'row-resize';
    let latestHeight = startHeight;

    const publishRowPreview = (targetHeight: number) => {
        const actualHeight = Math.max(minContentHeight, targetHeight);
        const clampedToContent = targetHeight < minContentHeight;
        const deltaPx = actualHeight - startHeight;
        setDragIndicator({
            kind: 'row',
            rowIndex: divider.rowIndex,
            rowTop,
            top: rowTop + actualHeight,
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
        latestHeight = Math.min(420, Math.max(36, Math.round(startHeight + (moveEvent.clientY - startY))));
        publishRowPreview(latestHeight);
    };

    const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        setDragIndicator(null);
        commitRowHeight(editor, targetCell, Math.max(minContentHeight, latestHeight));
        window.requestAnimationFrame(onSettled);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}
