import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, ArrowUpRight, Bell, BellRing, CheckCheck } from 'lucide-react';
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
import { formatRelative, friendlyError } from '@/lib/utils';

interface NotificationsPopoverProps {
  onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
}

const navigableEntities = new Set<string>(['project', 'note', 'task', 'document', 'contact']);

export function NotificationsPopover({ onNavigateTarget }: NotificationsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [permission, setPermission] = useState<WebPushPermission>(() => getWebNotificationPermission());
  const [error, setError] = useState('');

  const loadInbox = useCallback(async () => {
    try {
      const [unread, list] = await Promise.all([
        window.devLedger.notifications.unreadCount(),
        open ? window.devLedger.notifications.list(filter, 30) : Promise.resolve(null),
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
    const timer = window.setInterval(() => { void loadInbox(); }, 15_000);
    const onUpdated = () => { void loadInbox(); };
    window.addEventListener(NOTIFICATION_UPDATED_EVENT, onUpdated);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATION_UPDATED_EVENT, onUpdated);
    };
  }, [loadInbox]);

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setPermission(getWebNotificationPermission()); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" aria-label={`Inbox notifications (${unreadCount} unread)`}>
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[388px] p-0">
        <div className="flex items-center justify-between border-b border-border/70 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">Inbox</span>
            <div className="flex rounded-lg border border-border/80 bg-surface-subtle/60 p-0.5 text-xs">
              {(['all', 'unread'] as const).map((tab) => (
                <button key={tab} type="button" onClick={() => setFilter(tab)} className={`rounded-md px-2 py-0.5 capitalize transition-colors ${filter === tab ? 'bg-accent font-medium text-accent-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}>
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" disabled={!unreadCount} onClick={() => void window.devLedger.notifications.markAllRead().then(loadInbox)}>
            <CheckCheck className="size-3.5" />Read all
          </Button>
        </div>

        {permission === 'default' && (
          <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-surface-subtle/50 px-3.5 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><BellRing className="size-3.5 text-primary" />Enable web push alerts</span>
            <Button type="button" size="sm" variant="secondary" className="h-6 px-2 text-[11px]" onClick={() => void requestWebNotificationPermission().then(setPermission)}>
              Allow
            </Button>
          </div>
        )}

        <div className="max-h-96 divide-y divide-border/70 overflow-y-auto">
          {error && <p role="alert" className="p-3 text-xs text-danger">{error}</p>}
          {items.map((item) => {
            const canJump = item.entityId && navigableEntities.has(item.entityType);
            return (
              <div key={item.id} className="space-y-1.5 px-3.5 py-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`size-2 shrink-0 rounded-full ${item.status === 'unread' ? 'bg-primary' : 'bg-transparent'}`} />
                    <p className="truncate font-medium">{item.title}</p>
                  </div>
                  <span className="shrink-0 text-muted-foreground">{formatRelative(item.deliveredAt)}</span>
                </div>
                {item.body && <p className="pl-4 text-muted-foreground">{item.body}</p>}
                <div className="flex flex-wrap items-center gap-1.5 pl-4 pt-0.5">
                  {canJump && (
                    <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-xs" onClick={() => { setOpen(false); onNavigateTarget(targetFromRecord(item.entityType as EntityType, item.entityId!)); }}>
                      Open {item.entityType}<ArrowUpRight className="size-3" />
                    </Button>
                  )}
                  {item.kind === 'reminder' && item.reminderId && item.status !== 'dismissed' && (
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => void window.devLedger.notifications.snooze(item.id, 60).then(loadInbox)}>Snooze 1h</Button>
                  )}
                  {item.status === 'unread' && (
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => void window.devLedger.notifications.markRead(item.id).then(loadInbox)}>Mark read</Button>
                  )}
                  {item.status !== 'dismissed' && (
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => void window.devLedger.notifications.dismiss(item.id).then(loadInbox)}>Dismiss</Button>
                  )}
                </div>
              </div>
            );
          })}
          {!items.length && !error && (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <AlarmClock className="mx-auto mb-2 size-4 opacity-70" />
              <p>You’re all caught up.</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
