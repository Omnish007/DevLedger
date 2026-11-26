import { MoreHorizontal, Pencil, Trash2, UserRound } from 'lucide-react';
import type { ContactRecord } from '@shared/contracts';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { contactInitials } from '@/lib/utils';

interface ContactListSidebarProps {
    contacts: ContactRecord[];
    activeContactId: string;
    onSelect: (id: string) => void;
    onEdit: (contact: ContactRecord) => void;
    onRequestDelete: (contact: ContactRecord) => void;
}

export function ContactListSidebar({
    contacts,
    activeContactId,
    onSelect,
    onEdit,
    onRequestDelete,
}: ContactListSidebarProps) {
    return (
        <aside className="flex flex-col border-b border-border bg-sidebar/35 lg:border-b-0 lg:border-r">
            <div className="divide-y divide-border/75 overflow-y-auto">
                {contacts.map((contact) => {
                    const initials = contactInitials(contact.name);
                    const isSelected = activeContactId === contact.id;
                    const row = (
                        <div
                            className={`contact-list-item group flex items-center gap-2.5 border-l-2 px-3.5 py-2.5 transition-colors ${isSelected ? 'border-l-primary/75 bg-accent/70' : 'border-l-transparent hover:bg-surface-subtle'}`}
                        >
                            <button
                                type="button"
                                onClick={() => onSelect(contact.id)}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                                <Avatar className="size-8 shrink-0 rounded-lg border border-border/70">
                                    <AvatarFallback className="rounded-lg text-xs font-medium">
                                        {initials || <UserRound className="size-3.5" />}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {contact.name}
                                    </p>
                                    <p className="truncate text-xs capitalize text-muted-foreground">
                                        {contact.role.replaceAll('_', ' ')}
                                        {contact.company ? ` · ${contact.company}` : ''}
                                    </p>
                                </div>
                            </button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0 text-muted-foreground opacity-75 hover:text-foreground hover:opacity-100"
                                        aria-label={`Actions for ${contact.name}`}
                                    >
                                        <MoreHorizontal className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => onEdit(contact)}>
                                        <Pencil className="size-4" />
                                        Edit contact
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onSelect={() => onRequestDelete(contact)}
                                    >
                                        <Trash2 className="size-4" />
                                        Move to trash
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                    return (
                        <ContextMenu key={contact.id}>
                            <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                            <ContextMenuContent>
                                <ContextMenuItem onSelect={() => onEdit(contact)}>
                                    <Pencil className="size-4" />
                                    Edit contact
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                    variant="destructive"
                                    onSelect={() => onRequestDelete(contact)}
                                >
                                    <Trash2 className="size-4" />
                                    Move to trash
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    );
                })}
            </div>
        </aside>
    );
}
