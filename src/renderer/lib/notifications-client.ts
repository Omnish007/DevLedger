import { toast } from 'sonner';
import type {
    EntityType,
    NotificationDeliveryPayload,
    NotificationRecord,
    WorkspaceNavigationTarget,
} from '@shared/contracts';
import { targetFromRecord } from './navigation';

export const NOTIFICATION_UPDATED_EVENT = 'devledger:notifications-updated';
const NAVIGABLE_ENTITIES = new Set<string>(['project', 'note', 'task', 'document', 'contact']);
const shownToastIds = new Set<string>();
const shownPushIds = new Set<string>();

function rememberBounded(set: Set<string>, id: string): boolean {
    if (set.has(id)) return false;
    set.add(id);
    if (set.size > 300) {
        const oldest = set.values().next().value;
        if (oldest) set.delete(oldest);
    }
    return true;
}

export function emitNotificationsUpdated(): void {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATION_UPDATED_EVENT));
}

export type WebPushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function getWebNotificationPermission(): WebPushPermission {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
}

export async function requestWebNotificationPermission(): Promise<WebPushPermission> {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
    try {
        const permission = await Notification.requestPermission();
        return permission;
    } catch {
        return Notification.permission;
    }
}

function resolveNotificationAssetUrl(asset: string): string | undefined {
    if (typeof window === 'undefined' || !window.location?.href) return undefined;
    try {
        return new URL(asset, window.location.href).href;
    } catch {
        return undefined;
    }
}

function showBrowserPush(
    item: NotificationRecord,
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void,
): void {
    if (
        typeof window === 'undefined' ||
        typeof Notification === 'undefined' ||
        Notification.permission !== 'granted'
    )
        return;
    try {
        const icon = resolveNotificationAssetUrl('./android-chrome-192x192.png');
        const badge = resolveNotificationAssetUrl('./favicon-32x32.png');
        const push = new Notification(item.title, {
            body: item.body,
            ...(icon ? { icon } : {}),
            ...(badge ? { badge } : {}),
            tag: `devledger:${item.id}`,
        });
        push.onclick = () => {
            window.focus();
            if (item.entityId && NAVIGABLE_ENTITIES.has(item.entityType)) {
                onNavigateTarget(targetFromRecord(item.entityType as EntityType, item.entityId));
            }
            push.close();
        };
    } catch {
        /* Chromium environment without Notification constructor support. */
    }
}

export function dispatchRendererNotifications(
    payload: NotificationDeliveryPayload,
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void,
    options: { allowInApp?: boolean; allowWebPush?: boolean; alwaysWebPush?: boolean } = {},
): void {
    const { allowInApp = true, allowWebPush = true, alwaysWebPush = false } = options;
    if (!payload.notifications.length) return;
    emitNotificationsUpdated();

    for (const item of payload.notifications) {
        if (allowInApp && rememberBounded(shownToastIds, item.id)) {
            const canJump = Boolean(item.entityId && NAVIGABLE_ENTITIES.has(item.entityType));
            toast.info(item.title, {
                id: `notif-${item.id}`,
                description: item.body,
                duration: 12_000,
                action: canJump
                    ? {
                          label: `Open ${item.entityType}`,
                          onClick: () => {
                              if (typeof window.devLedger?.notifications?.markRead === 'function') {
                                  void window.devLedger.notifications
                                      .markRead(item.id)
                                      .then(emitNotificationsUpdated)
                                      .catch(() => undefined);
                              }
                              onNavigateTarget(
                                  targetFromRecord(item.entityType as EntityType, item.entityId!),
                              );
                          },
                      }
                    : undefined,
                cancel:
                    item.kind === 'reminder' && item.reminderId
                        ? {
                              label: 'Snooze 15m',
                              onClick: () => {
                                  if (typeof window.devLedger?.notifications?.snooze === 'function') {
                                      void window.devLedger.notifications
                                          .snooze(item.id, 15)
                                          .then(emitNotificationsUpdated)
                                          .catch(() => undefined);
                                  }
                              },
                          }
                        : undefined,
            });
        }

        if (
            allowWebPush &&
            (!payload.nativeShown || alwaysWebPush) &&
            rememberBounded(shownPushIds, item.id)
        ) {
            showBrowserPush(item, onNavigateTarget);
        }
    }
}
