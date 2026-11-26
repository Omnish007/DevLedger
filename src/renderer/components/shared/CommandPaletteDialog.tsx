import { useEffect, useState } from 'react';
import { Plus, type LucideIcon } from 'lucide-react';
import type { SearchResult, WorkspaceNavigationTarget, WorkspaceViewId } from '@shared/contracts';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { targetFromRecord } from '@/lib/navigation';
import { formatRelative } from '@/lib/utils';

export interface CommandPaletteNavItem {
    id: WorkspaceViewId;
    label: string;
    icon: LucideIcon;
    shortcut?: string;
}

interface CommandPaletteDialogProps {
    open: boolean;
    navigation: CommandPaletteNavItem[];
    onOpenChange: (open: boolean) => void;
    onNavigate: (view: WorkspaceViewId) => void;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
    onQuickCapture: () => void;
}

export function CommandPaletteDialog({
    open,
    navigation,
    onOpenChange,
    onNavigate,
    onNavigateTarget,
    onQuickCapture,
}: CommandPaletteDialogProps) {
    const [query, setQuery] = useState('');
    const [quickResults, setQuickResults] = useState<SearchResult[]>([]);

    useEffect(() => {
        if (!open || !query.trim()) {
            setQuickResults([]);
            return;
        }
        let active = true;
        const timer = window.setTimeout(() => {
            void window.devLedger.search
                .query({ query: query.trim(), limit: 8 })
                .then((rows) => {
                    if (active) setQuickResults(rows);
                })
                .catch(() => undefined);
        }, 150);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [open, query]);

    return (
        <CommandDialog
            open={open}
            onOpenChange={(nextOpen) => {
                onOpenChange(nextOpen);
                if (!nextOpen) setQuery('');
            }}
            title="DevLedger command palette"
            description="Jump to a record, switch views or capture a quick note."
        >
            <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Jump to a note, task, project, contact or view…"
            />
            <CommandList>
                <CommandEmpty>No matching command or record.</CommandEmpty>
                {quickResults.length > 0 && (
                    <CommandGroup heading="Records">
                        {quickResults.map((result) => (
                            <CommandItem
                                key={`${result.type}:${result.id}`}
                                value={`record-${result.type}-${result.title}-${result.id}`}
                                onSelect={() => {
                                    onOpenChange(false);
                                    onNavigateTarget(
                                        targetFromRecord(result.type, result.id, result.projectId),
                                    );
                                }}
                            >
                                <span className="rounded border border-border/70 bg-surface-subtle px-1.5 py-0.5 text-[11px] font-medium uppercase text-foreground/85">
                                    {result.type}
                                </span>
                                <span className="min-w-0 flex-1 truncate font-medium">{result.title}</span>
                                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                                    {formatRelative(result.updatedAt)}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}
                <CommandGroup heading="Navigate">
                    {navigation.map((item) => {
                        const Icon = item.icon;
                        return (
                            <CommandItem
                                key={item.id}
                                value={`${item.label} ${item.id}`}
                                onSelect={() => {
                                    onOpenChange(false);
                                    onNavigate(item.id);
                                }}
                            >
                                <Icon className="size-4 text-muted-foreground" />
                                <span>{item.label}</span>
                                {item.shortcut && <Kbd className="ml-auto">{item.shortcut}</Kbd>}
                            </CommandItem>
                        );
                    })}
                </CommandGroup>
                <CommandGroup heading="Create">
                    <CommandItem
                        value="quick capture new note"
                        onSelect={() => {
                            onOpenChange(false);
                            onQuickCapture();
                        }}
                    >
                        <Plus className="size-4 text-muted-foreground" />
                        <span>Quick capture</span>
                        <Kbd className="ml-auto">Ctrl ⇧ Space</Kbd>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
