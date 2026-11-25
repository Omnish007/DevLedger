import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { EntityType, TagRecord } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TAG_DOT_CLASS } from '@/lib/navigation';
import { friendlyError } from '@/lib/utils';

interface TagSelectorProps {
  entityType: EntityType;
  entityId: string;
  assigned: TagRecord[];
  onChanged: () => void;
  onError?: (message: string) => void;
}

const COLORS = ['neutral', 'blue', 'green', 'amber', 'red', 'violet'] as const;

export function TagSelector({ entityType, entityId, assigned, onChanged, onError }: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [color, setColor] = useState<(typeof COLORS)[number]>('neutral');
  const [available, setAvailable] = useState<TagRecord[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void window.devLedger.operations.listTagsPage({ limit: 50, offset: 0, query: query.trim() })
      .then((page) => { if (active) setAvailable(page.items); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [open, query]);

  const assignedIds = new Set(assigned.map((tag) => tag.id));
  const exactMatch = available.some((tag) => tag.name.toLowerCase() === query.trim().toLowerCase());

  async function toggleTag(tag: TagRecord) {
    setBusy(true);
    try {
      if (assignedIds.has(tag.id)) await window.devLedger.operations.unassignTag(entityType, entityId, tag.id);
      else await window.devLedger.operations.assignTag(entityType, entityId, tag.id);
      onChanged();
    } catch (caught) {
      onError?.(friendlyError(caught, 'Tag update failed.'));
    } finally { setBusy(false); }
  }

  async function createAndAttach() {
    const clean = query.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const created = await window.devLedger.operations.createTag(clean, color);
      await window.devLedger.operations.assignTag(entityType, entityId, created.id);
      setQuery('');
      onChanged();
    } catch (caught) {
      onError?.(friendlyError(caught, 'Tag could not be created.'));
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assigned.map((tag) => (
        <span key={tag.id} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-xs">
          <span className={`size-1.5 rounded-full ${TAG_DOT_CLASS[tag.color] ?? TAG_DOT_CLASS['neutral']}`} />
          <span>{tag.name}</span>
          <button type="button" disabled={busy} aria-label={`Remove tag ${tag.name}`} className="text-muted-foreground hover:text-foreground" onClick={() => void toggleTag(tag)}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs text-muted-foreground">
            <Plus className="size-3" />Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2.5">
          <div className="space-y-2">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find or create tag…" className="h-8 text-xs" />
            <div className="max-h-44 space-y-0.5 overflow-y-auto">
              {available.map((tag) => (
                <button key={tag.id} type="button" disabled={busy} onClick={() => void toggleTag(tag)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent">
                  <span className={`size-2 rounded-full ${TAG_DOT_CLASS[tag.color] ?? TAG_DOT_CLASS['neutral']}`} />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  {assignedIds.has(tag.id) && <Check className="size-3.5 text-primary" />}
                </button>
              ))}
              {!available.length && !query.trim() && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Type a name to create your first tag.</p>}
            </div>
            {query.trim() && !exactMatch && (
              <div className="space-y-2 border-t border-border pt-2">
                <div className="flex items-center gap-1.5">
                  {COLORS.map((swatch) => (
                    <button key={swatch} type="button" aria-label={`Select ${swatch} tag color`} onClick={() => setColor(swatch)} className={`grid size-5 place-items-center rounded-full border ${color === swatch ? 'border-foreground' : 'border-transparent'}`}>
                      <span className={`size-3 rounded-full ${TAG_DOT_CLASS[swatch]}`} />
                    </button>
                  ))}
                </div>
                <Button type="button" size="sm" className="h-7 w-full text-xs" disabled={busy} onClick={() => void createAndAttach()}>
                  Create #{query.trim()}
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
