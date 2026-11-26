import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import type { VaultStatus } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { friendlyError } from '@/lib/utils';

interface SettingsVaultTabProps {
    settings: Record<string, unknown>;
    vaultStatus: VaultStatus;
    onSettingChange: (key: string, value: unknown) => Promise<void>;
    onVaultSetup: (passphrase: string) => Promise<string>;
    onVaultUnlock: (secret: string, recovery?: boolean) => Promise<void>;
    onVaultLock: () => Promise<void>;
    onVaultChangePassphrase: (passphrase: string) => Promise<void>;
    onConfigureVaultDeviceUnlock: (enabled: boolean) => Promise<void>;
}

export function SettingsVaultTab({
    settings,
    vaultStatus,
    onSettingChange,
    onVaultSetup,
    onVaultUnlock,
    onVaultLock,
    onVaultChangePassphrase,
    onConfigureVaultDeviceUnlock,
}: SettingsVaultTabProps) {
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [recoveryKey, setRecoveryKey] = useState('');
    const [recoveryVisible, setRecoveryVisible] = useState(false);
    const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
    const [useRecovery, setUseRecovery] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const deviceUnlockEnabled = settings['vault.deviceUnlockEnabled'] === true;
    const timeoutMinutes =
        typeof settings['vault.autoLockMinutes'] === 'number' ? settings['vault.autoLockMinutes'] : 15;

    async function runVault(action: () => Promise<void>, fallback: string) {
        setSaving(true);
        setError('');
        setMessage('');
        try {
            await action();
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
                    className="rounded-xl border border-danger/25 bg-danger-subtle px-4 py-3 text-danger-foreground"
                >
                    {error}
                </p>
            )}
            {message && (
                <p
                    role="status"
                    className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-foreground"
                >
                    {message}
                </p>
            )}

            <section className="workspace-surface space-y-5 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/75 pb-4">
                    <div className="space-y-0.5">
                        <h2 className="text-sm font-semibold">Protected notes vault</h2>
                        <p className="text-muted-foreground">
                            AES-256-GCM encryption for confidential notes and documents.
                        </p>
                    </div>
                    <Badge
                        variant={
                            vaultStatus.configured
                                ? vaultStatus.unlocked
                                    ? 'success'
                                    : 'warning'
                                : 'secondary'
                        }
                    >
                        {vaultStatus.configured
                            ? vaultStatus.unlocked
                                ? 'Unlocked'
                                : 'Locked'
                            : 'Not configured'}
                    </Badge>
                </div>

                {!vaultStatus.configured ? (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (passphrase !== confirmPassphrase) {
                                setError('The passphrases do not match.');
                                return;
                            }
                            void runVault(async () => {
                                const key = await onVaultSetup(passphrase);
                                setRecoveryKey(key);
                                setRecoveryVisible(true);
                                setPassphrase('');
                                setConfirmPassphrase('');
                            }, 'Vault setup failed.');
                        }}
                        className="space-y-4"
                    >
                        <div className="grid gap-3.5 sm:grid-cols-2">
                            <label className="block space-y-1.5 font-medium">
                                <span>Master passphrase</span>
                                <Input
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    value={passphrase}
                                    onChange={(e) => setPassphrase(e.target.value)}
                                    placeholder="At least 12 characters"
                                    required
                                />
                            </label>
                            <label className="block space-y-1.5 font-medium">
                                <span>Confirm passphrase</span>
                                <Input
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    value={confirmPassphrase}
                                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                                    placeholder="Re-enter passphrase"
                                    required
                                />
                            </label>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-muted-foreground">
                                Passphrases are derived with Argon2id and never written to disk.
                            </p>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={
                                    saving || passphrase.length < 12 || passphrase !== confirmPassphrase
                                }
                            >
                                Create vault
                            </Button>
                        </div>
                    </form>
                ) : !vaultStatus.unlocked ? (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void runVault(async () => {
                                await onVaultUnlock(passphrase, useRecovery);
                                setPassphrase('');
                                setUseRecovery(false);
                            }, 'Vault unlock failed.');
                        }}
                        className="space-y-3.5"
                    >
                        <label className="block space-y-1.5 font-medium">
                            <span>{useRecovery ? 'Offline recovery key' : 'Master passphrase'}</span>
                            <Input
                                type="password"
                                autoComplete="current-password"
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                required
                            />
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="submit" size="sm" disabled={saving || !passphrase}>
                                Unlock vault
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    setUseRecovery((v) => !v);
                                    setPassphrase('');
                                }}
                            >
                                {useRecovery ? 'Use passphrase' : 'Use recovery key'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/25 bg-success-subtle/60 px-4 py-3">
                            <span className="font-medium text-success-foreground">
                                Session key active in memory; lock manually when stepping away.
                            </span>
                            <Button
                                size="sm"
                                variant="outline"
                                className="bg-card"
                                onClick={() => void runVault(onVaultLock, 'Lock failed.')}
                            >
                                <LockKeyhole className="size-3.5" />
                                Lock vault
                            </Button>
                        </div>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (passphrase !== confirmPassphrase) {
                                    setError('The passphrases do not match.');
                                    return;
                                }
                                void runVault(async () => {
                                    await onVaultChangePassphrase(passphrase);
                                    setPassphrase('');
                                    setConfirmPassphrase('');
                                    setMessage('Vault passphrase changed.');
                                }, 'Passphrase change failed.');
                            }}
                            className="space-y-2.5 rounded-xl border border-border/80 bg-surface-subtle/30 p-4"
                        >
                            <p className="font-medium text-foreground">Rotate master passphrase</p>
                            <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
                                <Input
                                    aria-label="New passphrase"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    placeholder="New passphrase"
                                    value={passphrase}
                                    onChange={(e) => setPassphrase(e.target.value)}
                                    required
                                />
                                <Input
                                    aria-label="Confirm passphrase"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    placeholder="Confirm passphrase"
                                    value={confirmPassphrase}
                                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                                    required
                                />
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={
                                        saving || passphrase.length < 12 || passphrase !== confirmPassphrase
                                    }
                                >
                                    Update passphrase
                                </Button>
                            </div>
                        </form>
                    </div>
                )}

                {vaultStatus.configured && (
                    <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-surface-subtle/35 p-4">
                        <Checkbox
                            id="vault-device-unlock"
                            checked={deviceUnlockEnabled}
                            disabled={saving || (!vaultStatus.unlocked && !deviceUnlockEnabled)}
                            onCheckedChange={(c) =>
                                void runVault(async () => {
                                    const en = c === true;
                                    await onConfigureVaultDeviceUnlock(en);
                                    await onSettingChange('vault.deviceUnlockEnabled', en);
                                    setMessage(
                                        en ? 'OS keychain unlock enabled.' : 'OS keychain unlock disabled.',
                                    );
                                }, 'Device unlock could not be updated.')
                            }
                        />
                        <div className="space-y-1">
                            <Label htmlFor="vault-device-unlock" className="font-medium">
                                Unlock automatically with this device
                            </Label>
                            <p className="text-muted-foreground">
                                Stores the random vault key in the OS secure credential store (not your
                                passphrase).
                            </p>
                        </div>
                    </div>
                )}

                {recoveryVisible && (
                    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning-subtle p-4 text-warning-foreground">
                        <p className="font-semibold">Save offline recovery key (shown once)</p>
                        <code className="block break-all rounded-lg border border-warning/25 bg-card p-3 font-mono text-foreground">
                            {recoveryKey}
                        </code>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="recovery-key-saved"
                                    checked={recoveryConfirmed}
                                    onCheckedChange={(c) => setRecoveryConfirmed(c === true)}
                                />
                                <Label htmlFor="recovery-key-saved">
                                    I have saved this recovery key safely.
                                </Label>
                            </div>
                            <Button
                                size="sm"
                                disabled={!recoveryConfirmed}
                                onClick={() => {
                                    setRecoveryVisible(false);
                                    setRecoveryConfirmed(false);
                                    setRecoveryKey('');
                                }}
                            >
                                Done
                            </Button>
                        </div>
                    </div>
                )}
            </section>

            <section className="workspace-surface flex flex-wrap items-center justify-between gap-4 p-6">
                <div className="space-y-0.5">
                    <h2 className="text-sm font-semibold">Auto-lock timeout</h2>
                    <p className="text-muted-foreground">
                        Automatically lock the vault after inactivity or OS screen lock.
                    </p>
                </div>
                <NativeSelect
                    id="vault-inactivity-timeout"
                    aria-label="Vault inactivity timeout"
                    value={String(timeoutMinutes)}
                    onChange={(e) => void onSettingChange('vault.autoLockMinutes', Number(e.target.value))}
                    className="w-44"
                >
                    <NativeSelectOption value="0">Disabled</NativeSelectOption>
                    <NativeSelectOption value="5">5 minutes</NativeSelectOption>
                    <NativeSelectOption value="15">15 minutes</NativeSelectOption>
                    <NativeSelectOption value="30">30 minutes</NativeSelectOption>
                    <NativeSelectOption value="60">1 hour</NativeSelectOption>
                    <NativeSelectOption value="120">2 hours</NativeSelectOption>
                </NativeSelect>
            </section>
        </div>
    );
}
