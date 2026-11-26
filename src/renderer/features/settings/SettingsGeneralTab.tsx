import { useState } from 'react';
import { BellRing, Check, Clipboard, Monitor, Moon, Sun } from 'lucide-react';
import type { AppMetadata } from '@shared/contracts';
import { DevLedgerLogo } from '@/components/shared/BrandMark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import {
    dispatchRendererNotifications,
    getWebNotificationPermission,
    requestWebNotificationPermission,
} from '@/lib/notifications-client';
import { friendlyError } from '@/lib/utils';

interface SettingsGeneralTabProps {
    metadata: AppMetadata | null;
    settings: Record<string, unknown>;
    saving: boolean;
    onUpdateSetting: (key: string, value: unknown) => Promise<void>;
    onSavingChange: (saving: boolean) => void;
    onMessage: (message: string) => void;
    onError: (message: string) => void;
}

export function SettingsGeneralTab({
    metadata,
    settings,
    saving,
    onUpdateSetting,
    onSavingChange,
    onMessage,
    onError,
}: SettingsGeneralTabProps) {
    const [copied, setCopied] = useState(false);
    const [webPerm, setWebPerm] = useState(() => getWebNotificationPermission());

    const theme = typeof settings['theme'] === 'string' ? settings['theme'] : 'system';
    const captureShortcut =
        typeof settings['shortcuts.quickCapture'] === 'string'
            ? settings['shortcuts.quickCapture']
            : 'CommandOrControl+Shift+Space';
    const inAppEnabled = settings['notifications.inApp'] !== false;
    const webPushEnabled = settings['notifications.webPush'] !== false;

    return (
        <div className="space-y-5 text-xs">
            <section className="workspace-surface space-y-5 p-6">
                <div className="space-y-1">
                    <h2 className="text-sm font-semibold">Appearance & shortcuts</h2>
                    <p className="text-muted-foreground">
                        Customize workspace theme and global capture binding.
                    </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    {(
                        [
                            {
                                value: 'light',
                                label: 'Light',
                                icon: Sun,
                                swatch: 'bg-[#f8f9fb] border-[#e2e5ec]',
                                bar: 'bg-[#1e2433]/15',
                            },
                            {
                                value: 'dark',
                                label: 'Dark',
                                icon: Moon,
                                swatch: 'bg-[#161922] border-[#2b3040]',
                                bar: 'bg-white/20',
                            },
                            {
                                value: 'system',
                                label: 'System',
                                icon: Monitor,
                                swatch: 'bg-gradient-to-r from-[#f8f9fb] 50% to-[#161922] 50% border-border',
                                bar: 'bg-primary/40',
                            },
                        ] as const
                    ).map((item) => {
                        const Icon = item.icon;
                        const active = theme === item.value;
                        return (
                            <button
                                key={item.value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => void onUpdateSetting('theme', item.value)}
                                className={`flex flex-col gap-2.5 rounded-xl border p-3 text-left font-medium transition-all ${active ? 'border-ring/65 bg-accent/70 text-accent-foreground ring-2 ring-ring/15' : 'border-border/80 bg-card hover:border-border hover:bg-surface-hover/60'}`}
                            >
                                <div
                                    aria-hidden="true"
                                    className={`flex h-9 w-full items-center gap-1.5 rounded-lg border px-2.5 ${item.swatch}`}
                                >
                                    <span className={`h-2 w-8 rounded-full ${item.bar}`} />
                                    <span className={`h-2 w-4 rounded-full ${item.bar}`} />
                                </div>
                                <div className="flex w-full items-center gap-2">
                                    <Icon className="size-3.5 shrink-0 opacity-80" />
                                    <span>{item.label}</span>
                                    {active && <Check className="ml-auto size-3.5 text-primary" />}
                                </div>
                            </button>
                        );
                    })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/75 pt-4">
                    <div className="space-y-0.5">
                        <p className="font-medium text-foreground">Global quick capture shortcut</p>
                        <p className="text-muted-foreground">
                            Opens the floating capture window from anywhere on your desktop.
                        </p>
                    </div>
                    <NativeSelect
                        aria-label="Quick capture keyboard shortcut"
                        value={captureShortcut}
                        onChange={(e) => void onUpdateSetting('shortcuts.quickCapture', e.target.value)}
                        className="w-60"
                    >
                        <NativeSelectOption value="CommandOrControl+Shift+Space">
                            Ctrl/Cmd + Shift + Space
                        </NativeSelectOption>
                        <NativeSelectOption value="CommandOrControl+Alt+Space">
                            Ctrl/Cmd + Alt + Space
                        </NativeSelectOption>
                        <NativeSelectOption value="CommandOrControl+Shift+K">
                            Ctrl/Cmd + Shift + K
                        </NativeSelectOption>
                        <NativeSelectOption value="Alt+Shift+N">Alt + Shift + N</NativeSelectOption>
                    </NativeSelect>
                </div>
            </section>

            <section className="workspace-surface space-y-4 p-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                        <h2 className="text-sm font-semibold">Reminders & notifications</h2>
                        <p className="text-muted-foreground">
                            Control in-app reminder banners and desktop alert permissions.
                        </p>
                    </div>
                    <Badge variant={webPerm === 'granted' ? 'success' : 'secondary'} className="capitalize">
                        {webPerm}
                    </Badge>
                </div>
                <div className="divide-y divide-border/70 rounded-xl border border-border/80 bg-surface-subtle/25">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                        <div className="space-y-0.5">
                            <p className="font-medium text-foreground">In-app alert toasts</p>
                            <p className="text-muted-foreground">
                                Show interactive alert cards with Open & Snooze inside DevLedger.
                            </p>
                        </div>
                        <Switch
                            checked={inAppEnabled}
                            onCheckedChange={(checked) =>
                                void onUpdateSetting('notifications.inApp', checked)
                            }
                            aria-label="In-app reminder alerts"
                        />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                        <div className="space-y-0.5">
                            <p className="font-medium text-foreground">Web & desktop notifications</p>
                            <p className="text-muted-foreground">
                                Allow Chromium Web Notification alerts when due reminders fire.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {webPerm !== 'granted' && webPerm !== 'unsupported' && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void requestWebNotificationPermission().then(setWebPerm)}
                                >
                                    Allow web alerts
                                </Button>
                            )}
                            <Switch
                                checked={webPushEnabled}
                                onCheckedChange={(checked) =>
                                    void onUpdateSetting('notifications.webPush', checked)
                                }
                                aria-label="Web and desktop reminder notifications"
                            />
                        </div>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => {
                            onSavingChange(true);
                            void (async () => {
                                if (typeof window.devLedger?.notifications?.sendTest !== 'function') {
                                    throw new Error(
                                        'Notification bridge is unavailable. Restart DevLedger to reload the desktop preload.',
                                    );
                                }
                                const perm = webPushEnabled
                                    ? await requestWebNotificationPermission()
                                    : webPerm;
                                setWebPerm(perm);
                                const item = await window.devLedger.notifications.sendTest();
                                dispatchRendererNotifications(
                                    { notifications: [item], nativeShown: false },
                                    () => undefined,
                                    { allowWebPush: webPushEnabled, alwaysWebPush: true },
                                );
                                onMessage('Test reminder notification sent.');
                            })()
                                .catch((e) => onError(friendlyError(e, 'Could not send test notification.')))
                                .finally(() => onSavingChange(false));
                        }}
                    >
                        <BellRing className="size-3.5" />
                        Send test notification
                    </Button>
                </div>
            </section>

            <section className="workspace-surface space-y-4 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <DevLedgerLogo subtitle="Local-first workspace" />
                    <Badge variant="outline">v{metadata?.version ?? '—'}</Badge>
                </div>
                <div className="space-y-2 border-t border-border/75 pt-4">
                    <h2 className="text-sm font-semibold">Local workspace data</h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 break-all rounded-lg border border-border/70 bg-surface-subtle/60 px-3 py-2 font-mono text-foreground">
                            {metadata?.dataDirectory ?? 'Loading…'}
                        </code>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!metadata}
                            onClick={() => {
                                if (metadata)
                                    void navigator.clipboard.writeText(metadata.dataDirectory).then(() => {
                                        setCopied(true);
                                        window.setTimeout(() => setCopied(false), 1500);
                                    });
                            }}
                        >
                            {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                            {copied ? 'Copied' : 'Copy path'}
                        </Button>
                    </div>
                </div>
                <div className="grid gap-3 pt-1 sm:grid-cols-2">
                    <div className="rounded-lg border border-border/70 bg-surface-subtle/35 px-3.5 py-2.5">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            Platform
                        </span>
                        <p className="mt-0.5 font-medium capitalize text-foreground">
                            {metadata?.platform ?? '—'}
                        </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-surface-subtle/35 px-3.5 py-2.5">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            Search & storage engine
                        </span>
                        <p className="mt-0.5 font-medium text-foreground">SQLite + FTS5</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
