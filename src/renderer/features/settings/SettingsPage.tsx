import { useEffect, useState } from 'react';
import {
    Activity,
    BellRing,
    Check,
    Clipboard,
    HardDriveDownload,
    Monitor,
    Moon,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
    AppMetadata,
    BackupCreationResult,
    OllamaStatus,
    SemanticIndexReport,
    VaultStatus,
} from '@shared/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { DevLedgerLogo } from '@/components/shared/BrandMark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import {
    dispatchRendererNotifications,
    getWebNotificationPermission,
    requestWebNotificationPermission,
} from '@/lib/notifications-client';
import { friendlyError } from '@/lib/utils';
import { SettingsBackupTab } from './SettingsBackupTab';
import { SettingsSystemTab } from './SettingsSystemTab';
import { SettingsVaultTab } from './SettingsVaultTab';

type SectionId = 'general' | 'vault' | 'backups' | 'ai' | 'system';

type Props = {
    metadata: AppMetadata | null;
    settings: Record<string, unknown>;
    vaultStatus: VaultStatus;
    onSettingChange: (key: string, value: unknown) => Promise<void>;
    onVaultSetup: (passphrase: string) => Promise<string>;
    onVaultUnlock: (secret: string, recovery?: boolean) => Promise<void>;
    onVaultLock: () => Promise<void>;
    onVaultChangePassphrase: (passphrase: string) => Promise<void>;
    onConfigureVaultDeviceUnlock: (enabled: boolean) => Promise<void>;
    onCreateBackup: (passphrase: string) => Promise<BackupCreationResult | null>;
    onRestoreBackup: (secret: string, recovery?: boolean) => Promise<string | null>;
    onActivateRestoreCopy: (path: string) => Promise<{ staged: boolean; restartRequired: boolean }>;
    onGetRestoreActivationStatus: () => Promise<boolean>;
    onRollbackRestoreActivation: () => Promise<void>;
    onCommitRestoreActivation: () => Promise<void>;
    onChooseExternalBackupDestination: () => Promise<{ directory: string; sameVolume: boolean } | null>;
    onClearExternalBackupDestination: () => Promise<void>;
    onChooseOfflineBackupDestination: () => Promise<{ directory: string; sameVolume: boolean } | null>;
    onClearOfflineBackupDestination: () => Promise<void>;
    onCheckOllama: () => Promise<OllamaStatus>;
    onIndexSemantic: () => Promise<SemanticIndexReport>;
};

export function SettingsPage(props: Props) {
    const [section, setSection] = useState<SectionId>('general');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [chatModel, setChatModel] = useState(
        typeof props.settings['ai.chatModel'] === 'string'
            ? props.settings['ai.chatModel']
            : 'qwen3.5:2b-q4_K_M',
    );
    const [embeddingModel, setEmbeddingModel] = useState(
        typeof props.settings['ai.embeddingModel'] === 'string'
            ? props.settings['ai.embeddingModel']
            : 'nomic-embed-text:latest',
    );
    const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
    const [semanticReport, setSemanticReport] = useState<SemanticIndexReport | null>(null);
    const [webPerm, setWebPerm] = useState(() => getWebNotificationPermission());

    useEffect(() => {
        if (section !== 'ai' || ollamaStatus) return;
        let active = true;
        void props
            .onCheckOllama()
            .then((status) => {
                if (active) setOllamaStatus(status);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [section, ollamaStatus, props]);
    const theme = typeof props.settings['theme'] === 'string' ? props.settings['theme'] : 'system';
    const captureShortcut =
        typeof props.settings['shortcuts.quickCapture'] === 'string'
            ? props.settings['shortcuts.quickCapture']
            : 'CommandOrControl+Shift+Space';
    const inAppEnabled = props.settings['notifications.inApp'] !== false;
    const webPushEnabled = props.settings['notifications.webPush'] !== false;

    async function updateSetting(key: string, value: unknown) {
        setSaving(true);
        setError('');
        try {
            await props.onSettingChange(key, value);
            toast.success('Setting saved.');
        } catch (e) {
            setError(friendlyError(e, 'Setting could not be saved.'));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="workspace-page page-settings mx-auto space-y-5">
            <PageHeader
                title="Settings"
                description="Manage preferences, vault security, backups, and local AI."
            />
            <div className="grid gap-6 md:grid-cols-[216px_minmax(0,1fr)]">
                <nav aria-label="Settings categories" className="flex gap-1 overflow-x-auto md:flex-col">
                    {(
                        [
                            ['general', 'General', SlidersHorizontal],
                            ['vault', 'Vault & Privacy', ShieldCheck],
                            ['backups', 'Backups & Restore', HardDriveDownload],
                            ['ai', 'Local AI', Sparkles],
                            ['system', 'Health & Activity', Activity],
                        ] as Array<[SectionId, string, typeof SlidersHorizontal]>
                    ).map(([id, label, Icon]) => (
                        <button
                            key={id}
                            type="button"
                            aria-current={section === id ? 'page' : undefined}
                            onClick={() => setSection(id)}
                            className={`flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${section === id ? 'bg-accent font-semibold text-accent-foreground' : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'}`}
                        >
                            <Icon className="size-4 shrink-0" aria-hidden="true" />
                            <span>{label}</span>
                        </button>
                    ))}
                </nav>

                <div className="min-w-0 space-y-5">
                    {error && (
                        <p
                            role="alert"
                            className="rounded-lg border border-danger/25 bg-danger-subtle px-3.5 py-2.5 text-xs text-danger-foreground"
                        >
                            {error}
                        </p>
                    )}
                    {message && (
                        <p
                            role="status"
                            className="rounded-lg border border-border bg-surface-subtle px-3.5 py-2.5 text-xs text-foreground"
                        >
                            {message}
                        </p>
                    )}

                    {section === 'general' && (
                        <div className="space-y-5 text-xs">
                            <section className="workspace-surface space-y-4 p-5">
                                <h2 className="text-sm font-semibold">Appearance & shortcuts</h2>
                                <div className="grid gap-2 sm:grid-cols-3">
                                    {(
                                        [
                                            { value: 'light', label: 'Light', icon: Sun },
                                            { value: 'dark', label: 'Dark', icon: Moon },
                                            { value: 'system', label: 'System', icon: Monitor },
                                        ] as const
                                    ).map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <button
                                                key={item.value}
                                                type="button"
                                                aria-pressed={theme === item.value}
                                                onClick={() => void updateSetting('theme', item.value)}
                                                className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2.5 text-left font-medium transition-colors ${theme === item.value ? 'border-ring bg-accent text-accent-foreground' : 'border-input bg-card hover:bg-surface-hover'}`}
                                            >
                                                <Icon className="size-4" />
                                                {item.label}
                                                {theme === item.value && (
                                                    <Check className="ml-auto size-3.5" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                                    <div>
                                        <p className="font-medium text-foreground">
                                            Global quick capture shortcut
                                        </p>
                                        <p className="text-muted-foreground">
                                            Opens capture window from anywhere on your desktop.
                                        </p>
                                    </div>
                                    <NativeSelect
                                        aria-label="Quick capture keyboard shortcut"
                                        value={captureShortcut}
                                        onChange={(e) =>
                                            void updateSetting('shortcuts.quickCapture', e.target.value)
                                        }
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
                                        <NativeSelectOption value="Alt+Shift+N">
                                            Alt + Shift + N
                                        </NativeSelectOption>
                                    </NativeSelect>
                                </div>
                            </section>

                            <section className="workspace-surface space-y-4 p-5">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <h2 className="text-sm font-semibold">Reminders & notifications</h2>
                                        <p className="mt-0.5 text-muted-foreground">
                                            Deliver due reminders both in-app and via desktop/web
                                            notifications.
                                        </p>
                                    </div>
                                    <Badge
                                        variant={webPerm === 'granted' ? 'success' : 'secondary'}
                                        className="capitalize"
                                    >
                                        {webPerm}
                                    </Badge>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5">
                                    <div>
                                        <p className="font-medium text-foreground">In-app alert toasts</p>
                                        <p className="text-muted-foreground">
                                            Show interactive alert cards with Open & Snooze inside DevLedger.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={inAppEnabled}
                                        onCheckedChange={(checked) =>
                                            void updateSetting('notifications.inApp', checked)
                                        }
                                        aria-label="In-app reminder alerts"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5">
                                    <div>
                                        <p className="font-medium text-foreground">
                                            Web & desktop notifications
                                        </p>
                                        <p className="text-muted-foreground">
                                            Allow Chromium Web Notification alerts when due reminders fire.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {webPerm !== 'granted' && webPerm !== 'unsupported' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    void requestWebNotificationPermission().then(setWebPerm)
                                                }
                                            >
                                                Allow web alerts
                                            </Button>
                                        )}
                                        <Switch
                                            checked={webPushEnabled}
                                            onCheckedChange={(checked) =>
                                                void updateSetting('notifications.webPush', checked)
                                            }
                                            aria-label="Web and desktop reminder notifications"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end border-t border-border pt-3">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={saving}
                                        onClick={() => {
                                            setSaving(true);
                                            void (async () => {
                                                if (
                                                    typeof window.devLedger?.notifications?.sendTest !==
                                                    'function'
                                                ) {
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
                                                setMessage('Test reminder notification sent.');
                                            })()
                                                .catch((e) =>
                                                    setError(
                                                        friendlyError(e, 'Could not send test notification.'),
                                                    ),
                                                )
                                                .finally(() => setSaving(false));
                                        }}
                                    >
                                        <BellRing className="size-3.5" />
                                        Send test notification
                                    </Button>
                                </div>
                            </section>

                            <section className="workspace-surface space-y-3 p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                                    <DevLedgerLogo subtitle="Local-first workspace" />
                                    <Badge variant="outline">v{props.metadata?.version ?? '—'}</Badge>
                                </div>
                                <h2 className="text-sm font-semibold">Local workspace data</h2>
                                <div className="flex flex-wrap items-center gap-2">
                                    <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-subtle px-3 py-2 font-mono text-foreground">
                                        {props.metadata?.dataDirectory ?? 'Loading…'}
                                    </code>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!props.metadata}
                                        onClick={() => {
                                            if (props.metadata)
                                                void navigator.clipboard
                                                    .writeText(props.metadata.dataDirectory)
                                                    .then(() => {
                                                        setCopied(true);
                                                        window.setTimeout(() => setCopied(false), 1500);
                                                    });
                                        }}
                                    >
                                        {copied ? (
                                            <Check className="size-3.5" />
                                        ) : (
                                            <Clipboard className="size-3.5" />
                                        )}
                                        {copied ? 'Copied' : 'Copy path'}
                                    </Button>
                                </div>
                                <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                                    <div>
                                        <span className="text-muted-foreground">Platform</span>
                                        <p className="mt-0.5 font-medium capitalize text-foreground">
                                            {props.metadata?.platform ?? '—'}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Search & storage engine</span>
                                        <p className="mt-0.5 font-medium text-foreground">SQLite + FTS5</p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {section === 'vault' && (
                        <SettingsVaultTab
                            settings={props.settings}
                            vaultStatus={props.vaultStatus}
                            onSettingChange={props.onSettingChange}
                            onVaultSetup={props.onVaultSetup}
                            onVaultUnlock={props.onVaultUnlock}
                            onVaultLock={props.onVaultLock}
                            onVaultChangePassphrase={props.onVaultChangePassphrase}
                            onConfigureVaultDeviceUnlock={props.onConfigureVaultDeviceUnlock}
                        />
                    )}
                    {section === 'backups' && (
                        <SettingsBackupTab
                            settings={props.settings}
                            onSettingChange={props.onSettingChange}
                            onCreateBackup={props.onCreateBackup}
                            onRestoreBackup={props.onRestoreBackup}
                            onActivateRestoreCopy={props.onActivateRestoreCopy}
                            onGetRestoreActivationStatus={props.onGetRestoreActivationStatus}
                            onRollbackRestoreActivation={props.onRollbackRestoreActivation}
                            onCommitRestoreActivation={props.onCommitRestoreActivation}
                            onChooseExternalBackupDestination={props.onChooseExternalBackupDestination}
                            onClearExternalBackupDestination={props.onClearExternalBackupDestination}
                            onChooseOfflineBackupDestination={props.onChooseOfflineBackupDestination}
                            onClearOfflineBackupDestination={props.onClearOfflineBackupDestination}
                        />
                    )}
                    {section === 'ai' && (
                        <section className="workspace-surface space-y-4 p-5 text-xs">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-semibold">Local AI (Ollama)</h2>
                                <Badge variant="outline">127.0.0.1</Badge>
                            </div>
                            <p className="text-muted-foreground">
                                Optional local inference for semantic ranking and search summaries.
                            </p>
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                                <Input
                                    aria-label="Text generation model"
                                    value={chatModel}
                                    onChange={(e) => setChatModel(e.target.value)}
                                    maxLength={128}
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={saving || !chatModel.trim()}
                                    onClick={() => void updateSetting('ai.chatModel', chatModel.trim())}
                                >
                                    Save chat model
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={saving}
                                    onClick={() =>
                                        void props
                                            .onCheckOllama()
                                            .then(setOllamaStatus)
                                            .catch((e) =>
                                                setOllamaStatus({
                                                    available: false,
                                                    baseUrl: 'http://127.0.0.1:11434',
                                                    models: [],
                                                    error: friendlyError(e, 'Ollama unavailable.'),
                                                }),
                                            )
                                    }
                                >
                                    Check Ollama
                                </Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                                <Input
                                    aria-label="Embedding model"
                                    value={embeddingModel}
                                    onChange={(e) => setEmbeddingModel(e.target.value)}
                                    maxLength={128}
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={saving || !embeddingModel.trim()}
                                    onClick={() =>
                                        void updateSetting('ai.embeddingModel', embeddingModel.trim())
                                    }
                                >
                                    Save embedding
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={saving || !ollamaStatus?.available}
                                    onClick={() => {
                                        setSaving(true);
                                        void props
                                            .onIndexSemantic()
                                            .then((r) => {
                                                setSemanticReport(r);
                                                setMessage(
                                                    `Indexed ${r.sources} records (${r.chunks} chunks).`,
                                                );
                                            })
                                            .catch((e) => setError(friendlyError(e, 'Indexing failed.')))
                                            .finally(() => setSaving(false));
                                    }}
                                >
                                    Build index
                                </Button>
                            </div>
                            {semanticReport && (
                                <p className="text-muted-foreground">
                                    Last index: {semanticReport.sources} records · {semanticReport.chunks}{' '}
                                    chunks · {new Date(semanticReport.completedAt).toLocaleString()}
                                </p>
                            )}
                            {ollamaStatus && (
                                <div className="space-y-2 rounded-lg border border-border bg-surface-subtle p-3.5">
                                    <Badge variant={ollamaStatus.available ? 'success' : 'warning'}>
                                        {ollamaStatus.available ? 'Connected' : 'Unavailable'}
                                    </Badge>
                                    {ollamaStatus.available ? (
                                        ollamaStatus.models.length ? (
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {ollamaStatus.models.map((modelName) => {
                                                    const isEmbed =
                                                        /(embed|minilm|bge[-_:]|e5[-_:]|embeddinggemma|mxbai)/i.test(
                                                            modelName,
                                                        );
                                                    return (
                                                        <button
                                                            key={modelName}
                                                            type="button"
                                                            onClick={() =>
                                                                isEmbed
                                                                    ? setEmbeddingModel(modelName)
                                                                    : setChatModel(modelName)
                                                            }
                                                            className="inline-flex min-h-7 items-center rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-surface-hover"
                                                            title={`Use ${modelName} as ${isEmbed ? 'embedding' : 'chat'} model`}
                                                        >
                                                            {modelName}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-muted-foreground">No models installed</p>
                                        )
                                    ) : (
                                        <p className="text-muted-foreground">{ollamaStatus.error}</p>
                                    )}
                                </div>
                            )}
                        </section>
                    )}
                    {section === 'system' && <SettingsSystemTab />}
                </div>
            </div>
        </div>
    );
}
