import { findParentNodeClosestToPos, type Editor } from '@tiptap/core';

export function resolveCellDocPos(editor: Editor, cellEl: HTMLTableCellElement): number | null {
    try {
        const rawPos = editor.view.posAtDOM(cellEl, 0);
        return Math.max(1, Math.min(editor.state.doc.content.size, rawPos + 1));
    } catch {
        return null;
    }
}

export function readDomColumnPcts(tableEl: HTMLTableElement): number[] {
    const firstRow = tableEl.rows[0];
    const total = tableEl.getBoundingClientRect().width;
    if (!firstRow || total <= 0) return [];
    const widths: number[] = [];
    for (let i = 0; i < firstRow.cells.length; i++) {
        const cell = firstRow.cells[i]!;
        const span = Math.max(1, cell.colSpan || 1);
        const w = cell.getBoundingClientRect().width;
        const pct = Number((((w / total) * 100) / span).toFixed(1));
        for (let s = 0; s < span; s++) widths.push(pct);
    }
    return widths;
}

export function applyLiveDomColumnPcts(tableEl: HTMLTableElement, pcts: (number | null)[]): void {
    for (let r = 0; r < tableEl.rows.length; r++) {
        const row = tableEl.rows[r]!;
        let colIdx = 0;
        for (let c = 0; c < row.cells.length; c++) {
            const cell = row.cells[c]!;
            const span = Math.max(1, cell.colSpan || 1);
            if (span === 1 && colIdx < pcts.length) {
                const pct = pcts[colIdx];
                cell.style.width = pct !== null && pct !== undefined ? `${pct}%` : '';
            } else {
                cell.style.width = '';
            }
            colIdx += span;
        }
    }
}

export function commitColumnWidthsPct(
    editor: Editor,
    cellEl: HTMLTableCellElement,
    pcts: (number | null)[],
): void {
    if (editor.isDestroyed) return;
    const pos = resolveCellDocPos(editor, cellEl);
    if (pos === null) return;
    const $pos = editor.state.doc.resolve(pos);
    const tableMatch = findParentNodeClosestToPos($pos, (node) => node.type.name === 'table');
    if (!tableMatch) return;

    const start = tableMatch.start;
    const tr = editor.state.tr;
    const rowspans = new Map<number, number>();

    tableMatch.node.forEach((rowNode, rowOffset) => {
        let col = 0;
        rowNode.forEach((cellNode, cellOffset) => {
            while ((rowspans.get(col) ?? 0) > 0) {
                rowspans.set(col, (rowspans.get(col) ?? 1) - 1);
                col += 1;
            }
            const colspan = Math.max(1, Number(cellNode.attrs['colspan'] ?? 1));
            const rowspan = Math.max(1, Number(cellNode.attrs['rowspan'] ?? 1));
            if (rowspan > 1) {
                for (let s = 0; s < colspan; s++) {
                    rowspans.set(col + s, rowspan - 1);
                }
            }
            const nextWidth = colspan === 1 ? (pcts[col] ?? null) : null;
            if ((cellNode.attrs['colWidthPct'] ?? null) !== nextWidth) {
                tr.setNodeMarkup(start + rowOffset + 1 + cellOffset, undefined, {
                    ...cellNode.attrs,
                    colWidthPct: nextWidth,
                });
            }
            col += colspan;
        });
        for (const [slot, rem] of rowspans.entries()) {
            if (rem > 0 && slot >= col) {
                rowspans.set(slot, rem - 1);
            }
        }
    });
    if (tr.docChanged) editor.view.dispatch(tr);
}

export function setColumnWidthPreset(
    editor: Editor,
    tableEl: HTMLTableElement,
    cellEl: HTMLTableCellElement,
    colIndex: number,
    targetPct: number | null,
): void {
    const colCount = tableEl.rows[0]?.cells.length ?? 0;
    if (colCount <= 1) return;
    if (targetPct === null) {
        applyLiveDomColumnPcts(tableEl, Array<null>(colCount).fill(null));
        commitColumnWidthsPct(editor, cellEl, Array<null>(colCount).fill(null));
        return;
    }
    const clampedTarget = Math.min(80, Math.max(12, targetPct));
    const current = readDomColumnPcts(tableEl);
    const othersSum = current.reduce((acc, val, idx) => (idx === colIndex ? acc : acc + val), 0);
    const remaining = 100 - clampedTarget;
    const next = current.map((val, idx) => {
        if (idx === colIndex) return Number(clampedTarget.toFixed(1));
        if (othersSum <= 0) return Number((remaining / (colCount - 1)).toFixed(1));
        return Number(Math.max(10, (val / othersSum) * remaining).toFixed(1));
    });
    applyLiveDomColumnPcts(tableEl, next);
    commitColumnWidthsPct(editor, cellEl, next);
}

export function commitRowHeight(editor: Editor, cellEl: HTMLTableCellElement, heightPx: number | null): void {
    if (editor.isDestroyed) return;
    const pos = resolveCellDocPos(editor, cellEl);
    if (pos === null) return;
    const $pos = editor.state.doc.resolve(pos);
    const rowMatch = findParentNodeClosestToPos($pos, (node) => node.type.name === 'tableRow');
    if (!rowMatch) return;

    const normalized = heightPx !== null ? Math.min(480, Math.max(32, Math.round(heightPx))) : null;
    if ((rowMatch.node.attrs['rowHeight'] ?? null) === normalized) return;
    const tr = editor.state.tr.setNodeMarkup(rowMatch.pos, undefined, {
        ...rowMatch.node.attrs,
        rowHeight: normalized,
    });
    editor.view.dispatch(tr);
}

export function resetAllTableSizes(editor: Editor): void {
    if (editor.isDestroyed || !editor.isActive('table')) return;
    const $pos = editor.state.selection.$from;
    const tableMatch = findParentNodeClosestToPos($pos, (node) => node.type.name === 'table');
    if (!tableMatch) return;

    const tr = editor.state.tr;
    const start = tableMatch.start;
    tableMatch.node.descendants((node, pos) => {
        if (node.type.name === 'tableRow' && node.attrs['rowHeight'] != null) {
            tr.setNodeMarkup(start + pos, undefined, { ...node.attrs, rowHeight: null });
        } else if (
            (node.type.name === 'tableCell' || node.type.name === 'tableHeader') &&
            node.attrs['colWidthPct'] != null
        ) {
            tr.setNodeMarkup(start + pos, undefined, { ...node.attrs, colWidthPct: null });
        }
        return true;
    });
    if (tr.docChanged) editor.view.dispatch(tr);
}
