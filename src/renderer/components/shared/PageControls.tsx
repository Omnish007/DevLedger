import { Button } from '@/components/ui/button';

interface Props {
  offset: number;
  limit: number;
  total: number;
  onPageChange: (offset: number) => void;
  disabled?: boolean;
}

export function PageControls({ offset, limit, total, onPageChange, disabled = false }: Props) {
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  const canGoBack = offset > 0;
  const canGoForward = offset + limit < total;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 py-3">
      <p className="text-[11px] tabular-nums text-muted-foreground">Showing {start}–{end} of {total}</p>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled || !canGoBack} onClick={() => onPageChange(Math.max(0, offset - limit))}>Previous</Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled || !canGoForward} onClick={() => onPageChange(offset + limit)}>Next</Button>
      </div>
    </nav>
  );
}
