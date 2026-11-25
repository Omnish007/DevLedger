import { ArrowRight, Link2, Plus, Search, Tag, Tags, Trash2 } from 'lucide-react';
import type { EntityLinkRecord, EntityType, PageResult, TagRecord } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { useConfirm } from '@/components/shared/ConfirmProvider';

const tagDotColor: Record<string, string> = {
  neutral: 'bg-muted-foreground',
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  violet: 'bg-violet-500',
};

interface TagsTabProps {
  tagsPage: PageResult<TagRecord>;
  tagName: string;
  tagColor: string;
  tagSearch: string;
  tagType: EntityType;
  tagRecordId: string;
  tagId: string;
  selectedTagName: string;
  busy: boolean;
  onTagNameChange: (value: string) => void;
  onTagColorChange: (value: string) => void;
  onTagSearchChange: (value: string) => void;
  onTagTypeChange: (value: EntityType) => void;
  onTagRecordChange: (value: string) => void;
  onTagSelect: (id: string, name: string) => void;
  onTagOffsetChange: (offset: number) => void;
  onCreateTag: () => void;
  onDeleteTag: (tag: TagRecord) => void;
  onAssignTag: () => void;
}

export function OperationsTagsTab({
  tagsPage, tagName, tagColor, tagSearch, tagType, tagRecordId, tagId, selectedTagName, busy,
  onTagNameChange, onTagColorChange, onTagSearchChange, onTagTypeChange, onTagRecordChange,
  onTagSelect, onTagOffsetChange, onCreateTag, onDeleteTag, onAssignTag,
}: TagsTabProps) {
  const confirm = useConfirm();
  const tags = tagsPage.items;

  return (
    <section className="grid gap-5 lg:grid-cols-[1.2fr_0.9fr]">
      <div className="workspace-surface p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground"><Tags className="size-4" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Tag library</h3>
            <p className="text-xs text-muted-foreground">Create reusable labels to slice projects, notes, tasks, and contacts.</p>
          </div>
          <Badge variant="secondary">{tagsPage.total}</Badge>
        </div>

        <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); onCreateTag(); }}>
          <Input value={tagName} onChange={(event) => onTagNameChange(event.target.value)} placeholder="e.g. technical-spec" maxLength={64} className="min-w-[180px] flex-1" />
          <NativeSelect aria-label="Tag color" value={tagColor} onChange={(event) => onTagColorChange(event.target.value)} className="h-9 w-28 text-xs">
            <NativeSelectOption value="neutral">Neutral</NativeSelectOption>
            <NativeSelectOption value="blue">Blue</NativeSelectOption>
            <NativeSelectOption value="green">Green</NativeSelectOption>
            <NativeSelectOption value="amber">Amber</NativeSelectOption>
            <NativeSelectOption value="red">Red</NativeSelectOption>
            <NativeSelectOption value="violet">Violet</NativeSelectOption>
          </NativeSelect>
          <Button size="sm" type="submit" className="h-9 px-3.5" disabled={busy || !tagName.trim()}><Plus className="size-3.5" />Add</Button>
        </form>

        <div className="relative mt-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search tags" placeholder="Search tags…" value={tagSearch} onChange={(event) => onTagSearchChange(event.target.value)} className="pl-8" />
        </div>

        {tags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag.id} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${tagId === tag.id ? 'border-ring bg-accent/50' : 'border-border bg-surface-subtle/40 hover:bg-surface-hover'}`}>
                <button type="button" onClick={() => onTagSelect(tag.id, tag.name)} className="inline-flex items-center gap-1.5 font-medium">
                  <span className={`size-2 rounded-full ${tagDotColor[tag.color] ?? 'bg-muted-foreground'}`} aria-hidden="true" />
                  <span>#{tag.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${tag.name}`}
                  className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-danger"
                  onClick={() => {
                    void (async () => {
                      const accepted = await confirm({
                        title: 'Delete tag?',
                        description: `Delete #${tag.name} from all records? This removes only the tag associations, not the records.`,
                        confirmLabel: 'Delete tag',
                        destructive: true,
                      });
                      if (accepted) onDeleteTag(tag);
                    })();
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-border py-10 text-center">
            <Tag className="mx-auto mb-2 size-5 text-muted-foreground" />
            <p className="text-xs font-medium">No tags found</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Create labels such as scope-doc, estimation, and decision.</p>
          </div>
        )}
        <PageControls offset={tagsPage.offset} limit={tagsPage.limit} total={tagsPage.total} onPageChange={onTagOffsetChange} disabled={busy} className="mt-4 border-t border-border pt-3" />
      </div>

      <div className="workspace-surface h-fit p-5 sm:p-6">
        <div className="mb-5">
          <h3 className="text-sm font-semibold">Apply a tag</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Attach a tag to any workspace record for fast search filtering.</p>
        </div>
        <div className="space-y-3.5">
          <label className="block space-y-1.5 text-xs font-medium">
            <span>Record type</span>
            <NativeSelect value={tagType} onChange={(event) => onTagTypeChange(event.target.value as EntityType)} className="h-9 w-full text-xs">
              {(['project', 'note', 'task', 'document', 'contact'] as EntityType[]).map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            <span>Record</span>
            <RemoteRecordPicker entityType={tagType} value={tagRecordId} onValueChange={onTagRecordChange} placeholder="Choose a record" />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            <span>Tag</span>
            <NativeSelect value={tagId} onChange={(event) => onTagSelect(event.target.value, tags.find((item) => item.id === event.target.value)?.name ?? selectedTagName)} className="h-9 w-full text-xs">
              {tagId && !tags.some((item) => item.id === tagId) && <NativeSelectOption value={tagId}>#{selectedTagName || 'Selected tag'}</NativeSelectOption>}
              {tags.map((item) => <NativeSelectOption key={item.id} value={item.id}>#{item.name}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <Button className="w-full" disabled={busy || !tagRecordId || !tagId} onClick={onAssignTag}>Apply tag</Button>
        </div>
      </div>
    </section>
  );
}

interface LinksTabProps {
  sourceType: EntityType;
  sourceId: string;
  targetType: EntityType;
  targetId: string;
  relation: string;
  linksPage: PageResult<EntityLinkRecord>;
  busy: boolean;
  onSourceTypeChange: (value: EntityType) => void;
  onSourceIdChange: (value: string) => void;
  onTargetTypeChange: (value: EntityType) => void;
  onTargetIdChange: (value: string) => void;
  onRelationChange: (value: string) => void;
  onCreateLink: () => void;
  onLoadLinks: (offset?: number) => void;
  onRemoveLink: (id: string) => void;
}

export function OperationsLinksTab({
  sourceType, sourceId, targetType, targetId, relation, linksPage, busy,
  onSourceTypeChange, onSourceIdChange, onTargetTypeChange, onTargetIdChange,
  onRelationChange, onCreateLink, onLoadLinks, onRemoveLink,
}: LinksTabProps) {
  const links = linksPage.items;
  return (
    <section className="grid gap-5 lg:grid-cols-[0.95fr_1.15fr]">
      <div className="workspace-surface h-fit p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground"><Link2 className="size-4" /></div>
          <div>
            <h3 className="text-sm font-semibold">Connect records</h3>
            <p className="text-xs text-muted-foreground">Link notes, tasks, projects, documents, and contacts bidirectionally.</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'From type', type: sourceType, setType: onSourceTypeChange, id: sourceId, setId: onSourceIdChange },
              { label: 'To type', type: targetType, setType: onTargetTypeChange, id: targetId, setId: onTargetIdChange },
            ].map((part) => (
              <div key={part.label} className="space-y-2.5 rounded-lg border border-border/80 bg-surface-subtle/30 p-3">
                <label className="block space-y-1 text-xs font-medium">
                  <span>{part.label}</span>
                  <NativeSelect value={part.type} onChange={(event) => part.setType(event.target.value as EntityType)} className="h-9 w-full text-xs">
                    {(['project', 'note', 'task', 'document', 'contact'] as EntityType[]).map((type) => <NativeSelectOption key={type} value={type}>{type}</NativeSelectOption>)}
                  </NativeSelect>
                </label>
                <label className="block space-y-1 text-xs font-medium">
                  <span>Record</span>
                  <RemoteRecordPicker entityType={part.type} value={part.id} onValueChange={part.setId} placeholder="Choose a record" />
                </label>
              </div>
            ))}
          </div>
          <label className="block space-y-1.5 text-xs font-medium">
            <span>Relationship</span>
            <Input value={relation} onChange={(event) => onRelationChange(event.target.value)} maxLength={64} placeholder="e.g. related, documents, blocks" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !sourceId || !targetId} onClick={onCreateLink}>Create link</Button>
            <Button variant="outline" disabled={!sourceId} onClick={() => onLoadLinks()}>Show links / backlinks</Button>
          </div>
        </div>
      </div>

      <div className="workspace-surface p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Links & backlinks</h3>
            <p className="text-xs text-muted-foreground">Connections attached to the selected source record.</p>
          </div>
          <Badge variant="secondary">{linksPage.total}</Badge>
        </div>
        {links.length ? (
          <div className="space-y-2">
            {links.map((link) => (
              <div key={link.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-subtle/30 px-3 py-2.5 text-xs">
                <Badge variant="outline">{link.direction}</Badge>
                <span className="truncate font-medium">{link.sourceType} · {link.sourceId.slice(0, 8)}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{link.targetType} · {link.targetId.slice(0, 8)}</span>
                <Badge variant="secondary" className="ml-auto">{link.relationship}</Badge>
                <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-danger" aria-label="Remove record link" onClick={() => onRemoveLink(link.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <Link2 className="mx-auto mb-2 size-5 text-muted-foreground" />
            <p className="text-xs font-medium">No links shown</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Select a source record and click “Show links / backlinks” or create a new link.</p>
          </div>
        )}
        <PageControls offset={linksPage.offset} limit={linksPage.limit} total={linksPage.total} onPageChange={(offset) => onLoadLinks(offset)} disabled={busy} className="mt-4 border-t border-border pt-3" />
      </div>
    </section>
  );
}
