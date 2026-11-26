import { useCallback, useEffect, useState } from 'react';
import {
    AlarmClock,
    ArrowUpRight,
    Bell,
    CheckCheck,
    FileText,
    FolderKanban,
    HardDrive,
    Info,
    ListChecks,
    Users,
} from 'lucide-react';
import type { EntityType, NotificationRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { targetFromRecord } from '@/lib/navigation';
import {
    getWebNotificationPermission,
    NOTIFICATION_UPDATED_EVENT,
    requestWebNotificationPermission,
    type WebPushPermission,
} from '@/lib/notifications-client';
import { cn, formatRelative, friendlyError } from '@/lib/utils';

interface NotificationsPopoverProps {
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}

const navigableEntities = new Set<string>(['project', 'note', 'task', 'document', 'contact']);

const ENTITY_LABELS: Record<NotificationRecord['entityType'], string> = {
    note: 'Note',
    task: 'Task',
    project: 'Project',
    contact: 'Contact',
    system: 'System',
};

function formatNotificationTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const ageMs = Date.now() - date.getTime();
    if (ageMs >= -5_000 && ageMs < 60_000) return 'Just now';
    if (ageMs >= 60_000 && ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
    const now = new Date();
    if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    ) {
        return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
    }
    return formatRelative(value);
}

function getNotificationRowDetails(item: NotificationRecord) {
    let subject = item.title;
    if (item.kind === 'reminder' && subject.startsWith('Reminder · ')) {
        subject = subject.slice('Reminder · '.length);
    } else if (subject.endsWith(' · DevLedger')) {
        subject = subject.slice(0, -' · DevLedger'.length);
    }

    const sourceLabel =
        item.kind === 'reminder'
            ? item.entityType === 'system'
                ? 'Reminder'
                : `${ENTITY_LABELS[item.entityType]} reminder`
            : item.kind === 'backup'
              ? 'Backup'
              : 'System';

    const subtitle = item.body ? `${sourceLabel} · ${item.body}` : sourceLabel;

    if (item.kind === 'backup') {
        return { Icon: HardDrive, iconClass: 'text-info', subject, subtitle };
    }
    if (item.kind === 'system') {
        return { Icon: Info, iconClass: 'text-muted-foreground', subject, subtitle };
    }

    const iconByEntity = {
        note: FileText,
        task: ListChecks,
        project: FolderKanban,
        contact: Users,
        system: AlarmClock,
    } as const;
    return {
        Icon: iconByEntity[item.entityType] ?? AlarmClock,
        iconClass: 'text-primary',
        subject,
        subtitle,
    };
}

export function NotificationsPopover({ onNavigateTarget }: NotificationsPopoverProps) {
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const [unreadCount, setUnreadCount] = useState(0);
    const [items, setItems] = useState<NotificationRecord[]>([]);
    const [permission, setPermission] = useState<WebPushPermission>(() => getWebNotificationPermission());
    const [error, setError] = useState('');

    const loadInbox = useCallback(async () => {
        const api = window.devLedger?.notifications;
        if (!api) return;
        try {
            const [unread, list] = await Promise.all([
                typeof api.unreadCount === 'function' ? api.unreadCount() : Promise.resolve(0),
                open && typeof api.list === 'function' ? api.list(filter, 30) : Promise.resolve(null),
            ]);
            setUnreadCount(unread);
            if (list) setItems(list);
            setError('');
        } catch (caught) {
            if (open) setError(friendlyError(caught, 'Notifications could not be loaded.'));
        }
    }, [open, filter]);

    useEffect(() => {
        void loadInbox();
        const timer = window.setInterval(() => {
            void loadInbox();
        }, 15_000);
        const onUpdated = () => {
            void loadInbox();
        };
        window.addEventListener(NOTIFICATION_UPDATED_EVENT, onUpdated);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener(NOTIFICATION_UPDATED_EVENT, onUpdated);
        };
    }, [loadInbox]);

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) setPermission(getWebNotificationPermission());
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative size-8"
                    aria-label={`Inbox notifications (${unreadCount} unread)`}
                >
                    <Bell className="size-4" />
                    {unreadCount > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[404px] max-w-[calc(100vw-1rem)] overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-border/55 px-4 py-2.5 dark:border-background/70">
                    <div className="flex items-center gap-2.5">
                        <span className="text-sm font-semibold">Inbox</span>
                        <div className="workspace-segmented" role="group" aria-label="Filter inbox">
                            {(['all', 'unread'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    data-active={filter === tab}
                                    onClick={() => setFilter(tab)}
                                    className="workspace-segmented-item capitalize"
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                        disabled={!unreadCount}
                        onClick={() => void window.devLedger.notifications.markAllRead().then(loadInbox)}
                    >
                        <CheckCheck className="size-3.5" />
                        Read all
                    </Button>
                </div>

                {permission === 'default' && (
                    <div className="flex items-center justify-between gap-2 border-b border-border/55 bg-surface-subtle/40 px-4 py-2 text-xs dark:border-background/70">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <AlarmClock className="size-3.5 text-primary" />
                            Enable web push alerts
                        </span>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => void requestWebNotificationPermission().then(setPermission)}
                        >
                            Allow
                        </Button>
                    </div>
                )}

                <div className="max-h-96 divide-y divide-border/55 overflow-y-auto dark:divide-background/70">
                    {error && (
                        <p role="alert" className="p-4 text-xs text-danger">
                            {error}
                        </p>
                    )}
                    {items.map((item) => {
                        const canJump = Boolean(item.entityId && navigableEntities.has(item.entityType));
                        const isUnread = item.status === 'unread';
                        const { Icon, iconClass, subject, subtitle } = getNotificationRowDetails(item);
                        const deliveredLabel = formatNotificationTime(item.deliveredAt);

                        const openTarget = () => {
                            if (!canJump) return;
                            setOpen(false);
                            if (isUnread) {
                                void window.devLedger.notifications
                                    .markRead(item.id)
                                    .then(loadInbox)
                                    .catch(() => undefined);
                            }
                            onNavigateTarget(targetFromRecord(item.entityType as EntityType, item.entityId!));
                        };

                        return (
                            <article
                                key={item.id}
                                className={cn(
                                    'relative flex items-start gap-3 px-4 py-3 text-xs transition-colors hover:bg-surface-hover/35',
                                    !isUnread && 'opacity-75 hover:opacity-100',
                                )}
                            >
                                {isUnread && (
                                    <span
                                        aria-hidden="true"
                                        className="absolute inset-y-3 left-0 w-[2.5px] rounded-r-full bg-primary"
                                    />
                                )}
                                <Icon
                                    className={cn(
                                        'mt-0.5 size-4 shrink-0',
                                        isUnread ? iconClass : 'text-muted-foreground',
                                    )}
                                    aria-hidden="true"
                                />

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        {canJump ? (
                                            <button
                                                type="button"
                                                title={item.title}
                                                onClick={openTarget}
                                                className={cn(
                                                    'min-w-0 truncate text-left text-sm transition-colors hover:text-primary',
                                                    isUnread
                                                        ? 'font-semibold text-foreground'
                                                        : 'font-medium text-foreground',
                                                )}
                                            >
                                                {subject}
                                            </button>
                                        ) : (
                                            <p
                                                title={item.title}
                                                className={cn(
                                                    'min-w-0 truncate text-sm',
                                                    isUnread
                                                        ? 'font-semibold text-foreground'
                                                        : 'font-medium text-foreground',
                                                )}
                                            >
                                                {subject}
                                            </p>
                                        )}
                                        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                                            {deliveredLabel}
                                        </span>
                                    </div>

                                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                        {subtitle}
                                    </p>

                                    {(canJump ||
                                        (item.kind === 'reminder' &&
                                            item.reminderId &&
                                            item.status !== 'dismissed') ||
                                        isUnread ||
                                        item.status !== 'dismissed') && (
                                        <div
                                            className={cn(
                                                'mt-2 flex flex-wrap items-center gap-1.5',
                                                !canJump && '-ml-2',
                                            )}
                                        >
                                            {canJump && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 gap-1 px-2.5 text-xs"
                                                    onClick={openTarget}
                                                >
                                                    Open {item.entityType}
                                                    <ArrowUpRight className="size-3" />
                                                </Button>
                                            )}
                                            {item.kind === 'reminder' &&
                                                item.reminderId &&
                                                item.status !== 'dismissed' && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                                        onClick={() =>
                                                            void window.devLedger.notifications
                                                                .snooze(item.id, 60)
                                                                .then(loadInbox)
                                                        }
                                                    >
                                                        Snooze 1h
                                                    </Button>
                                                )}
                                            {isUnread && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                                    onClick={() =>
                                                        void window.devLedger.notifications
                                                            .markRead(item.id)
                                                            .then(loadInbox)
                                                    }
                                                >
                                                    Mark read
                                                </Button>
                                            )}
                                            {item.status !== 'dismissed' && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                                    onClick={() => {
                                                        setItems((current) =>
                                                            current.filter((entry) => entry.id !== item.id),
                                                        );
                                                        void window.devLedger.notifications
                                                            .dismiss(item.id)
                                                            .then(loadInbox)
                                                            .catch((caught) => {
                                                                setError(
                                                                    friendlyError(
                                                                        caught,
                                                                        'Notification could not be dismissed.',
                                                                    ),
                                                                );
                                                                void loadInbox();
                                                            });
                                                    }}
                                                >
                                                    Dismiss
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                    {!items.length && !error && (
                        <div className="py-12 text-center text-sm text-muted-foreground">
                            <AlarmClock className="mx-auto mb-2 size-4 opacity-70" />
                            <p>You’re all caught up.</p>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
