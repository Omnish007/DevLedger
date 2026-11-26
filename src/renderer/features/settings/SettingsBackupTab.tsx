import { useEffect, useState } from 'react';
import { Clipboard, Download, Upload } from 'lucide-react';
import type { BackupCreationResult } from '@shared/contracts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/shared/ConfirmProvider';
import { friendlyError } from '@/lib/utils';

interface SettingsBackupTabProps {
    settings: Record<string, unknown>;
    onSettingChange: (key: string, value: unknown) => Promise<void>;
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
}

export function SettingsBackupTab(props: SettingsBackupTabProps) {
    const confirm = useConfirm();
    const [backupPassphrase, setBackupPassphrase] = useState('');
    const [backupRecoveryKey, setBackupRecoveryKey] = useState('');
    const [useBackupRecovery, setUseBackupRecovery] = useState(false);
    const [backupRestoreSecret, setBackupRestoreSecret] = useState('');
    const [restoreCopyPath, setRestoreCopyPath] = useState<string | null>(null);
    const [restoreRollbackAvailable, setRestoreRollbackAvailable] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const { onGetRestoreActivationStatus } = props;
    useEffect(() => {
        let active = true;
        void onGetRestoreActivationStatus()
            .then((ok) => {
                if (active) setRestoreRollbackAvailable(ok);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [onGetRestoreActivationStatus]);

    const autoEnabled = props.settings['backup.autoEnabled'] === true;
    const autoLastRun =
        typeof props.settings['backup.autoLastRun'] === 'string'
            ? props.settings['backup.autoLastRun']
            : null;
    const autoError =
        typeof props.settings['backup.autoLastError'] === 'string'
            ? props.settings['backup.autoLastError']
            : null;
    const extDir =
        typeof props.settings['backup.externalDirectory'] === 'string'
            ? props.settings['backup.externalDirectory']
            : null;
    const offDir =
        typeof props.settings['backup.offlineDirectory'] === 'string'
            ? props.settings['backup.offlineDirectory']
            : null;

    async function runAction(fn: () => Promise<void>, fallback: string) {
        setSaving(true);
        setError('');
        setMessage('');
        try {
            await fn();
        } catch (e) {
            setError(friendlyError(e, fallback));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-5 text-xs">
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
                    className="break-all rounded-xl border border-border bg-surface-subtle px-4 py-3 text-xs text-foreground"
                >
                    {message}
                </p>
            )}

            <section className="workspace-surface space-y-4 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/75 pb-3.5">
                    <div className="space-y-0.5">
                        <h2 className="text-sm font-semibold">Encrypted backups & destinations</h2>
                        <p className="text-muted-foreground">
                            Consistent SQLite + object archives verified with SHA-256.
                        </p>
                    </div>
                    <Badge variant={autoEnabled ? 'success' : 'warning'}>
                        {autoEnabled ? 'Auto-snapshots active' : 'Auto-snapshots unavailable'}
                    </Badge>
                </div>
                {autoLastRun && (
                    <p className="text-muted-foreground">
                        Last verified local snapshot: {new Date(autoLastRun).toLocaleString()}
                    </p>
                )}
                {autoError && (
                    <p className="rounded-xl border border-warning/20 bg-warning-subtle px-3.5 py-2.5 text-warning-foreground">
                        {autoError}
                    </p>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                    {[
                        {
                            label: 'Independent backup destination',
                            dir: extDir,
                            keyDir: 'backup.externalDirectory',
                            keySame: 'backup.externalSameVolume',
                            choose: props.onChooseExternalBackupDestination,
                            clear: props.onClearExternalBackupDestination,
                            btn: 'Choose drive',
                        },
                        {
                            label: 'Second removable / offline drive',
                            dir: offDir,
                            keyDir: 'backup.offlineDirectory',
                            keySame: 'backup.offlineSameVolume',
                            choose: props.onChooseOfflineBackupDestination,
                            clear: props.onClearOfflineBackupDestination,
                            btn: 'Choose second drive',
                        },
                    ].map((dest) => (
                        <div
                            key={dest.keyDir}
                            className="flex flex-col justify-between gap-3 rounded-xl border border-border/80 bg-surface-subtle/35 p-4"
                        >
                            <div className="min-w-0 space-y-1">
                                <p className="font-semibold text-foreground">{dest.label}</p>
                                <p className="break-all font-mono text-[11px] text-muted-foreground">
                                    {dest.dir ?? 'Not configured'}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={saving}
                                    onClick={() =>
                                        void runAction(async () => {
                                            const picked = await dest.choose();
                                            if (!picked) return;
                                            await props.onSettingChange(dest.keyDir, picked.directory);
                                            await props.onSettingChange(dest.keySame, picked.sameVolume);
                                            setMessage('Backup destination updated.');
                                        }, 'Could not save destination.')
                                    }
                                >
                                    {dest.btn}
                                </Button>
                                {dest.dir && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        disabled={saving}
                                        onClick={() =>
                                            void runAction(async () => {
                                                await dest.clear();
                                                await props.onSettingChange(dest.keyDir, null);
                                                await props.onSettingChange(dest.keySame, null);
                                                setMessage('Destination cleared.');
                                            }, 'Could not clear destination.')
                                        }
                                    >
                                        Remove
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <Accordion type="single" collapsible className="border-t border-border/75">
                    <AccordionItem value="details" className="border-b-0">
                        <AccordionTrigger className="py-2.5 text-xs">
                            How snapshot verification works
                        </AccordionTrigger>
                        <AccordionContent className="text-xs leading-relaxed text-muted-foreground">
                            Snapshots run automatically every 30 minutes when a secure OS keychain is present,
                            restore-verify into an isolated copy before retention cleanup, and mirror
                            atomically to mounted external volumes.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </section>

            <section className="workspace-surface space-y-4 p-6">
                <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold">Manual encrypted archive</h3>
                    <p className="text-muted-foreground">
                        Export a portable AES-256-GCM encrypted workspace archive and single-use recovery key.
                    </p>
                </div>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void runAction(async () => {
                            const r = await props.onCreateBackup(backupPassphrase);
                            if (r) {
                                setBackupRecoveryKey(r.recoveryKey);
                                setBackupPassphrase('');
                                setMessage(`Encrypted backup saved: ${r.path}`);
                            }
                        }, 'Backup creation failed.');
                    }}
                    className="space-y-2"
                >
                    <Label htmlFor="backup-create-passphrase" className="text-xs font-medium">
                        Backup passphrase
                    </Label>
                    <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
                        <Input
                            id="backup-create-passphrase"
                            type="password"
                            minLength={12}
                            autoComplete="new-password"
                            value={backupPassphrase}
                            onChange={(e) => setBackupPassphrase(e.target.value)}
                            placeholder="At least 12 characters"
                            required
                        />
                        <Button type="submit" size="sm" disabled={saving || backupPassphrase.length < 12}>
                            <Download className="size-3.5" />
                            Create backup
                        </Button>
                    </div>
                </form>

                {backupRecoveryKey && (
                    <div className="space-y-2 rounded-xl border border-warning/22 bg-warning-subtle p-4 text-warning-foreground">
                        <p className="font-semibold">Save portable recovery key (shown once)</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 break-all rounded-lg border border-warning/18 bg-card p-2.5 font-mono text-foreground">
                                {backupRecoveryKey}
                            </code>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label="Copy recovery key"
                                className="bg-card"
                                onClick={() => void navigator.clipboard.writeText(backupRecoveryKey)}
                            >
                                <Clipboard className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                )}
            </section>

            <section className="workspace-surface space-y-4 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                        <h3 className="text-sm font-semibold">Restore & recovery</h3>
                        <p className="text-muted-foreground">
                            Decrypt and validate an `.nsbackup` archive into an isolated staging copy before
                            activating.
                        </p>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                            setUseBackupRecovery((v) => !v);
                            setBackupPassphrase('');
                            setBackupRestoreSecret('');
                        }}
                    >
                        {useBackupRecovery ? 'Use passphrase' : 'Use recovery key'}
                    </Button>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void runAction(async () => {
                            const secret = useBackupRecovery ? backupRestoreSecret : backupPassphrase;
                            const path = await props.onRestoreBackup(secret, useBackupRecovery);
                            setRestoreCopyPath(path);
                            if (path) setMessage(`Validated recovery copy ready: ${path}`);
                        }, 'Backup restore failed.');
                    }}
                    className="space-y-2"
                >
                    <Label htmlFor="backup-restore-secret" className="text-xs font-medium">
                        Restore from archive ({useBackupRecovery ? 'Recovery key' : 'Passphrase'})
                    </Label>
                    <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
                        <Input
                            id="backup-restore-secret"
                            type="password"
                            value={useBackupRecovery ? backupRestoreSecret : backupPassphrase}
                            onChange={(e) =>
                                useBackupRecovery
                                    ? setBackupRestoreSecret(e.target.value)
                                    : setBackupPassphrase(e.target.value)
                            }
                            placeholder={useBackupRecovery ? 'Enter recovery key' : 'Enter backup passphrase'}
                            required
                        />
                        <Button type="submit" size="sm" variant="outline" disabled={saving}>
                            <Upload className="size-3.5" />
                            Restore as copy
                        </Button>
                    </div>
                </form>

                {restoreCopyPath && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3">
                        <span className="font-medium text-foreground">
                            Verified copy validated and ready for activation.
                        </span>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                                void (async () => {
                                    if (
                                        await confirm({
                                            title: 'Activate verified restore?',
                                            description:
                                                'DevLedger will stage promotion and verify integrity on restart.',
                                            confirmLabel: 'Stage restore',
                                            tone: 'warning',
                                        })
                                    )
                                        await runAction(async () => {
                                            await props.onActivateRestoreCopy(restoreCopyPath);
                                            setMessage(
                                                'Staged restore activation. Restart DevLedger to switch.',
                                            );
                                        }, 'Activation failed.');
                                })();
                            }}
                        >
                            Activate staged restore
                        </Button>
                    </div>
                )}

                {restoreRollbackAvailable && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border/75 pt-3">
                        <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                                void runAction(async () => {
                                    await props.onCommitRestoreActivation();
                                    setRestoreRollbackAvailable(false);
                                    setMessage('Restored workspace confirmed.');
                                }, 'Commit failed.')
                            }
                        >
                            Confirm restored workspace
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                void runAction(props.onRollbackRestoreActivation, 'Rollback failed.')
                            }
                        >
                            Roll back
                        </Button>
                    </div>
                )}
            </section>
        </div>
    );
}
