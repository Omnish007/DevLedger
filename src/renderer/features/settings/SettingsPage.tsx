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
        <div className="workspace-page page-settings mx-auto space-y-6">
            <PageHeader
                title="Settings"
                description="Manage preferences, vault security, backups, and local AI."
            />
            <div className="grid gap-6 md:grid-cols-[224px_minmax(0,1fr)]">
                <nav
                    aria-label="Settings categories"
                    className="flex h-fit flex-wrap gap-1 rounded-xl border border-border/75 bg-card/65 p-1.5 shadow-[var(--shadow-xs)] md:flex-col md:flex-nowrap"
                >
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
                            className={`flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${section === id ? 'bg-accent font-semibold text-accent-foreground shadow-2xs' : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'}`}
                        >
                            <Icon className="size-4 shrink-0 opacity-85" aria-hidden="true" />
                            <span>{label}</span>
                        </button>
                    ))}
                </nav>

                <div className="min-w-0 space-y-5">
                    {error && (
                        <p
                            role="alert"
                            className="rounded-xl border border-danger/20 bg-danger-subtle px-4 py-3 text-xs text-danger-foreground"
                        >
                            {error}
                        </p>
                    )}
                    {message && (
                        <p
                            role="status"
                            className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-xs text-foreground"
                        >
                            {message}
                        </p>
                    )}

                    {section === 'general' && (
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
                                                onClick={() => void updateSetting('theme', item.value)}
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
                                                    {active && (
                                                        <Check className="ml-auto size-3.5 text-primary" />
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/75 pt-4">
                                    <div className="space-y-0.5">
                                        <p className="font-medium text-foreground">
                                            Global quick capture shortcut
                                        </p>
                                        <p className="text-muted-foreground">
                                            Opens the floating capture window from anywhere on your desktop.
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

                            <section className="workspace-surface space-y-4 p-6">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <h2 className="text-sm font-semibold">Reminders & notifications</h2>
                                        <p className="text-muted-foreground">
                                            Control in-app reminder banners and desktop alert permissions.
                                        </p>
                                    </div>
                                    <Badge
                                        variant={webPerm === 'granted' ? 'success' : 'secondary'}
                                        className="capitalize"
                                    >
                                        {webPerm}
                                    </Badge>
                                </div>
                                <div className="divide-y divide-border/70 rounded-xl border border-border/80 bg-surface-subtle/25">
                                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                                        <div className="space-y-0.5">
                                            <p className="font-medium text-foreground">In-app alert toasts</p>
                                            <p className="text-muted-foreground">
                                                Show interactive alert cards with Open & Snooze inside
                                                DevLedger.
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
                                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                                        <div className="space-y-0.5">
                                            <p className="font-medium text-foreground">
                                                Web & desktop notifications
                                            </p>
                                            <p className="text-muted-foreground">
                                                Allow Chromium Web Notification alerts when due reminders
                                                fire.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {webPerm !== 'granted' && webPerm !== 'unsupported' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() =>
                                                        void requestWebNotificationPermission().then(
                                                            setWebPerm,
                                                        )
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
                                </div>
                                <div className="flex justify-end">
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

                            <section className="workspace-surface space-y-4 p-6">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <DevLedgerLogo subtitle="Local-first workspace" />
                                    <Badge variant="outline">v{props.metadata?.version ?? '—'}</Badge>
                                </div>
                                <div className="space-y-2 border-t border-border/75 pt-4">
                                    <h2 className="text-sm font-semibold">Local workspace data</h2>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <code className="min-w-0 flex-1 break-all rounded-lg border border-border/70 bg-surface-subtle/60 px-3 py-2 font-mono text-foreground">
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
                                </div>
                                <div className="grid gap-3 pt-1 sm:grid-cols-2">
                                    <div className="rounded-lg border border-border/70 bg-surface-subtle/35 px-3.5 py-2.5">
                                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                            Platform
                                        </span>
                                        <p className="mt-0.5 font-medium capitalize text-foreground">
                                            {props.metadata?.platform ?? '—'}
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
                        <div className="space-y-5 text-xs">
                            <section className="workspace-surface flex flex-wrap items-center justify-between gap-3 p-5">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-sm font-semibold">Local AI (Ollama)</h2>
                                        <Badge variant="outline" className="font-mono text-[10px]">
                                            127.0.0.1
                                        </Badge>
                                        {ollamaStatus && (
                                            <Badge variant={ollamaStatus.available ? 'success' : 'warning'}>
                                                {ollamaStatus.available ? 'Connected' : 'Unavailable'}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-muted-foreground">
                                        {ollamaStatus && !ollamaStatus.available
                                            ? ollamaStatus.error ||
                                              'Start Ollama locally to enable AI summaries.'
                                            : 'Optional local inference for semantic ranking and workspace summaries.'}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
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
                            </section>

                            <div className="grid gap-5 lg:grid-cols-2">
                                <section className="workspace-surface flex flex-col justify-between space-y-4 p-5">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-semibold">Answer synthesis model</h3>
                                        <p className="text-muted-foreground">
                                            Generates concise cited summaries for workspace search queries.
                                        </p>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <Input
                                                aria-label="Text generation model"
                                                value={chatModel}
                                                onChange={(e) => setChatModel(e.target.value)}
                                                maxLength={128}
                                                className="font-mono"
                                            />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={saving || !chatModel.trim()}
                                                onClick={() =>
                                                    void updateSetting('ai.chatModel', chatModel.trim())
                                                }
                                            >
                                                Save chat model
                                            </Button>
                                        </div>
                                        {ollamaStatus?.available &&
                                            ollamaStatus.models.some(
                                                (m) =>
                                                    !/(embed|minilm|bge[-_:]|e5[-_:]|embeddinggemma|mxbai)/i.test(
                                                        m,
                                                    ),
                                            ) && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {ollamaStatus.models
                                                        .filter(
                                                            (m) =>
                                                                !/(embed|minilm|bge[-_:]|e5[-_:]|embeddinggemma|mxbai)/i.test(
                                                                    m,
                                                                ),
                                                        )
                                                        .map((modelName) => (
                                                            <button
                                                                key={modelName}
                                                                type="button"
                                                                onClick={() => setChatModel(modelName)}
                                                                className={`inline-flex min-h-7 items-center rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${chatModel === modelName ? 'border-primary/30 bg-primary/10 text-primary font-semibold' : 'border-border bg-surface-subtle/50 text-foreground hover:bg-surface-hover'}`}
                                                            >
                                                                {modelName}
                                                            </button>
                                                        ))}
                                                </div>
                                            )}
                                    </div>
                                </section>

                                <section className="workspace-surface flex flex-col justify-between space-y-4 p-5">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-semibold">Semantic embedding model</h3>
                                        <p className="text-muted-foreground">
                                            Indexes unlocked workspace notes, tasks, and documents locally.
                                        </p>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <Input
                                                aria-label="Embedding model"
                                                value={embeddingModel}
                                                onChange={(e) => setEmbeddingModel(e.target.value)}
                                                maxLength={128}
                                                className="font-mono"
                                            />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={saving || !embeddingModel.trim()}
                                                onClick={() =>
                                                    void updateSetting(
                                                        'ai.embeddingModel',
                                                        embeddingModel.trim(),
                                                    )
                                                }
                                            >
                                                Save embedding
                                            </Button>
                                        </div>
                                        {ollamaStatus?.available &&
                                            ollamaStatus.models.some((m) =>
                                                /(embed|minilm|bge[-_:]|e5[-_:]|embeddinggemma|mxbai)/i.test(
                                                    m,
                                                ),
                                            ) && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {ollamaStatus.models
                                                        .filter((m) =>
                                                            /(embed|minilm|bge[-_:]|e5[-_:]|embeddinggemma|mxbai)/i.test(
                                                                m,
                                                            ),
                                                        )
                                                        .map((modelName) => (
                                                            <button
                                                                key={modelName}
                                                                type="button"
                                                                onClick={() => setEmbeddingModel(modelName)}
                                                                className={`inline-flex min-h-7 items-center rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${embeddingModel === modelName ? 'border-primary/30 bg-primary/10 text-primary font-semibold' : 'border-border bg-surface-subtle/50 text-foreground hover:bg-surface-hover'}`}
                                                            >
                                                                {modelName}
                                                            </button>
                                                        ))}
                                                </div>
                                            )}
                                    </div>
                                </section>
                            </div>

                            <section className="workspace-surface flex flex-wrap items-center justify-between gap-3 p-5">
                                <div className="space-y-0.5">
                                    <h3 className="text-sm font-semibold">Semantic vector index</h3>
                                    <p className="text-muted-foreground">
                                        {semanticReport
                                            ? `Last built: ${semanticReport.sources} records · ${semanticReport.chunks} chunks · ${new Date(semanticReport.completedAt).toLocaleString()}`
                                            : ollamaStatus?.available && ollamaStatus.models.length === 0
                                              ? 'Pull an Ollama embedding model locally, then build the vector index.'
                                              : 'Rebuild semantic vectors across your unlocked workspace records.'}
                                    </p>
                                </div>
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
                            </section>
                        </div>
                    )}
                    {section === 'system' && <SettingsSystemTab />}
                </div>
            </div>
        </div>
    );
}
