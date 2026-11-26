import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
    offset: number;
    limit: number;
    total: number;
    onPageChange: (offset: number) => void;
    disabled?: boolean;
    className?: string;
}

export function PageControls({ offset, limit, total, onPageChange, disabled = false, className }: Props) {
    if (total <= limit && offset === 0) return null;
    const start = total === 0 ? 0 : offset + 1;
    const end = Math.min(offset + limit, total);
    const canGoBack = offset > 0;
    const canGoForward = offset + limit < total;

    return (
        <nav
            aria-label="Pagination"
            className={cn('flex flex-wrap items-center justify-between gap-2 py-3', className)}
        >
            <p className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                Showing {start}–{end} of {total}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled || !canGoBack}
                    onClick={() => onPageChange(Math.max(0, offset - limit))}
                >
                    Previous
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled || !canGoForward}
                    onClick={() => onPageChange(offset + limit)}
                >
                    Next
                </Button>
            </div>
        </nav>
    );
}
