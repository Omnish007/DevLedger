export type TableDragIndicator =
    | {
          kind: 'col';
          colIndex: number;
          left: number;
          startLeft: number;
          leftColLeft: number;
          leftColWidth: number;
          rightColWidth: number;
          leftPct: number;
          rightPct: number;
          deltaPx: number;
          clamped: boolean;
          label: string;
      }
    | {
          kind: 'row';
          rowIndex: number;
          rowTop: number;
          top: number;
          startTop: number;
          actualHeight: number;
          targetHeight: number;
          deltaPx: number;
          clampedToContent: boolean;
          label: string;
      };

interface NoteTableDragPreviewProps {
    indicator: TableDragIndicator | null;
    tableLeft: number;
    tableTop: number;
    tableWidth: number;
    tableHeight: number;
}

/** Full-table ghost guide, post-release boundary highlight, and crisp pixel/percent pill during table resize drags. */
export function NoteTableDragPreview({
    indicator,
    tableLeft,
    tableTop,
    tableWidth,
    tableHeight,
}: NoteTableDragPreviewProps) {
    if (!indicator) return null;

    if (indicator.kind === 'col') {
        return (
            <>
                <div
                    data-testid="table-col-preview-bounds"
                    style={{
                        left: indicator.leftColLeft,
                        top: tableTop,
                        width: Math.max(24, indicator.leftColWidth + indicator.rightColWidth),
                        height: tableHeight,
                    }}
                    className="pointer-events-none absolute z-[9] flex overflow-hidden rounded-[0.625rem] border border-primary/35 bg-primary/[0.04]"
                >
                    <div
                        style={{ width: indicator.leftColWidth }}
                        className="flex items-start justify-center border-r border-primary/50 bg-primary/[0.06] pt-1.5"
                    >
                        <span className="rounded bg-popover/95 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary shadow-xs">
                            {indicator.leftColWidth}px ({indicator.leftPct}%)
                        </span>
                    </div>
                    <div
                        style={{ width: indicator.rightColWidth }}
                        className="flex items-start justify-center bg-primary/[0.025] pt-1.5"
                    >
                        <span className="rounded bg-popover/95 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/85 shadow-xs">
                            {indicator.rightColWidth}px ({indicator.rightPct}%)
                        </span>
                    </div>
                </div>
                {Math.abs(indicator.left - indicator.startLeft) > 2 && (
                    <div
                        style={{ left: indicator.startLeft, top: tableTop, height: tableHeight }}
                        className="pointer-events-none absolute z-[10] w-0 border-l border-dashed border-muted-foreground/55"
                    />
                )}
                <div
                    style={{ left: indicator.left, top: tableTop, height: tableHeight }}
                    className="pointer-events-none absolute z-[12] w-0.5 -translate-x-1/2 bg-primary shadow-[0_0_10px_var(--primary)]"
                />
                <div
                    data-testid="table-resize-preview"
                    style={{ left: indicator.left, top: Math.max(4, tableTop - 30) }}
                    className="pointer-events-none absolute z-30 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/45 bg-popover px-2 py-1 font-mono text-[11px] font-semibold text-foreground shadow-[var(--shadow-popover)]"
                >
                    <span className="text-primary">{indicator.label}</span>
                    {indicator.deltaPx !== 0 && (
                        <span className="text-[10px] text-muted-foreground">
                            {indicator.deltaPx > 0 ? `+${indicator.deltaPx}px` : `${indicator.deltaPx}px`}
                        </span>
                    )}
                    {indicator.clamped && (
                        <span className="rounded bg-warning-subtle px-1 text-[10px] text-warning-foreground">
                            min
                        </span>
                    )}
                </div>
            </>
        );
    }

    return (
        <>
            <div
                data-testid="table-row-preview-bounds"
                style={{
                    left: tableLeft,
                    top: indicator.rowTop,
                    width: tableWidth,
                    height: Math.max(24, indicator.actualHeight),
                }}
                className="pointer-events-none absolute z-[9] border-y border-primary/40 bg-primary/[0.06]"
            />
            {Math.abs(indicator.top - indicator.startTop) > 2 && (
                <div
                    style={{ left: tableLeft, top: indicator.startTop, width: tableWidth }}
                    className="pointer-events-none absolute z-[10] h-0 border-t border-dashed border-muted-foreground/55"
                />
            )}
            <div
                style={{ left: tableLeft, top: indicator.top, width: tableWidth }}
                className="pointer-events-none absolute z-[12] h-0.5 -translate-y-1/2 bg-primary shadow-[0_0_10px_var(--primary)]"
            />
            <div
                data-testid="table-resize-preview"
                style={{ left: tableLeft + tableWidth - 6, top: indicator.top - 14 }}
                className="pointer-events-none absolute z-30 -translate-x-full whitespace-nowrap rounded-lg border border-primary/45 bg-popover px-2 py-1 font-mono text-[11px] font-semibold text-primary shadow-[var(--shadow-popover)]"
            >
                {indicator.label}
            </div>
        </>
    );
}
