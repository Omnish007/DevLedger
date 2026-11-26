import { formatNotionDateLabel } from '@domain/smart-date';

export function SmartDateRangeSummary({
    startDate,
    endDate,
    emptyStartLabel,
    emptyEndLabel,
}: {
    startDate: string | null | undefined;
    endDate: string | null | undefined;
    emptyStartLabel: string;
    emptyEndLabel: string;
}) {
    return (
        <div className="flex items-center justify-between rounded-md bg-surface-subtle/70 px-2.5 py-1 text-[11px] text-muted-foreground">
            <span>
                Start:{' '}
                <strong className="font-medium text-foreground">
                    {startDate ? formatNotionDateLabel({ date: startDate, format: 'full' }) : emptyStartLabel}
                </strong>
            </span>
            <span>→</span>
            <span>
                End:{' '}
                <strong className="font-medium text-foreground">
                    {endDate ? formatNotionDateLabel({ date: endDate, format: 'full' }) : emptyEndLabel}
                </strong>
            </span>
        </div>
    );
}
