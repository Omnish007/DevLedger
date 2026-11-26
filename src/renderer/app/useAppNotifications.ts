import { useEffect, useRef } from 'react';
import type { WorkspaceNavigationTarget } from '@shared/contracts';
import { dispatchRendererNotifications } from '@/lib/notifications-client';

interface UseAppNotificationsOptions {
    captureWindow: boolean;
    loading: boolean;
    settings: Record<string, unknown>;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => Promise<void>;
}

export function useAppNotifications({
    captureWindow,
    loading,
    settings,
    onNavigateTarget,
}: UseAppNotificationsOptions): void {
    const navigateRef = useRef(onNavigateTarget);
    navigateRef.current = onNavigateTarget;

    const webPushSetting = settings['notifications.webPush'];
    const allowWebPushRef = useRef(true);
    allowWebPushRef.current = webPushSetting !== false;
    const allowInAppRef = useRef(true);
    allowInAppRef.current = settings['notifications.inApp'] !== false;

    useEffect(() => {
        if (captureWindow || loading) return;
        const notifApi = window.devLedger?.notifications;
        if (!notifApi) return;
        const handleDelivery = (payload: Parameters<typeof dispatchRendererNotifications>[0]) => {
            if (!allowInAppRef.current && !allowWebPushRef.current) return;
            dispatchRendererNotifications(payload, (target) => void navigateRef.current(target), {
                allowInApp: allowInAppRef.current,
                allowWebPush: allowWebPushRef.current,
                alwaysWebPush: allowWebPushRef.current,
            });
        };
        const offDelivered =
            typeof notifApi.onDelivered === 'function'
                ? notifApi.onDelivered(handleDelivery)
                : () => undefined;
        const offOpenTarget =
            typeof notifApi.onOpenTarget === 'function'
                ? notifApi.onOpenTarget((target) => void navigateRef.current(target))
                : () => undefined;
        if (typeof notifApi.deliverDue === 'function') {
            void notifApi
                .deliverDue()
                .then(handleDelivery)
                .catch(() => undefined);
        }
        const timer = window.setInterval(() => {
            if (typeof notifApi.deliverDue !== 'function') return;
            void notifApi
                .deliverDue()
                .then(handleDelivery)
                .catch(() => undefined);
        }, 20_000);
        return () => {
            offDelivered();
            offOpenTarget();
            window.clearInterval(timer);
        };
    }, [captureWindow, loading, webPushSetting]);
}
