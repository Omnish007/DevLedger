import { useEffect, useState } from 'react';
import { Activity, HardDriveDownload, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type {
    AppMetadata,
    BackupCreationResult,
    OllamaStatus,
    SemanticIndexReport,
    VaultStatus,
} from '@shared/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { friendlyError } from '@/lib/utils';
import { SettingsAiTab } from './SettingsAiTab';
import { SettingsBackupTab } from './SettingsBackupTab';
import { SettingsGeneralTab } from './SettingsGeneralTab';
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

const SETTINGS_CATEGORIES: Array<[SectionId, string, typeof SlidersHorizontal]> = [
    ['general', 'General', SlidersHorizontal],
    ['vault', 'Vault & Privacy', ShieldCheck],
    ['backups', 'Backups & Restore', HardDriveDownload],
    ['ai', 'Local AI', Sparkles],
    ['system', 'Health & Activity', Activity],
];

export function SettingsPage(props: Props) {
    const { onCheckOllama, onSettingChange } = props;
    const [section, setSection] = useState<SectionId>('general');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);

    useEffect(() => {
        if (section !== 'ai' || ollamaStatus) return;
        let active = true;
        void onCheckOllama()
            .then((status) => {
                if (active) setOllamaStatus(status);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [section, ollamaStatus, onCheckOllama]);

    async function updateSetting(key: string, value: unknown) {
        setSaving(true);
        setError('');
        try {
            await onSettingChange(key, value);
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
                    {SETTINGS_CATEGORIES.map(([id, label, Icon]) => (
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
                        <SettingsGeneralTab
                            metadata={props.metadata}
                            settings={props.settings}
                            saving={saving}
                            onUpdateSetting={updateSetting}
                            onSavingChange={setSaving}
                            onMessage={setMessage}
                            onError={setError}
                        />
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
                        <SettingsAiTab
                            settings={props.settings}
                            ollamaStatus={ollamaStatus}
                            saving={saving}
                            onOllamaStatusChange={setOllamaStatus}
                            onCheckOllama={props.onCheckOllama}
                            onIndexSemantic={props.onIndexSemantic}
                            onUpdateSetting={updateSetting}
                            onSavingChange={setSaving}
                            onMessage={setMessage}
                            onError={setError}
                        />
                    )}
                    {section === 'system' && <SettingsSystemTab />}
                </div>
            </div>
        </div>
    );
}
