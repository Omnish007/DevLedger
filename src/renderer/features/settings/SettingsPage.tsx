import { useEffect, useState } from 'react';
import { Check, Clipboard, Database, Download, HardDrive, LockKeyhole, Monitor, Moon, ShieldCheck, Sun, Upload } from 'lucide-react';
import type { AppMetadata, BackupCreationResult, OllamaStatus, SemanticIndexReport, VaultStatus } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useConfirm } from '@/components/shared/ConfirmProvider';

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

export function SettingsPage({ metadata, settings, vaultStatus, onSettingChange, onVaultSetup, onVaultUnlock, onVaultLock, onVaultChangePassphrase, onConfigureVaultDeviceUnlock, onCreateBackup, onRestoreBackup, onActivateRestoreCopy, onGetRestoreActivationStatus, onRollbackRestoreActivation, onCommitRestoreActivation, onChooseExternalBackupDestination, onClearExternalBackupDestination, onChooseOfflineBackupDestination, onClearOfflineBackupDestination, onCheckOllama, onIndexSemantic }: Props) {
  const confirm = useConfirm();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupRecoveryKey, setBackupRecoveryKey] = useState('');
  const [useBackupRecovery, setUseBackupRecovery] = useState(false);
  const [backupRestoreSecret, setBackupRestoreSecret] = useState('');
  const [restoreRollbackAvailable, setRestoreRollbackAvailable] = useState(false);
  const [restoreCopyPath, setRestoreCopyPath] = useState<string | null>(null);
  const [embeddingModel, setEmbeddingModel] = useState(typeof settings['ai.embeddingModel'] === 'string' ? settings['ai.embeddingModel'] : 'embeddinggemma');
  const [indexingSemantic, setIndexingSemantic] = useState(false);
  const [semanticReport, setSemanticReport] = useState<SemanticIndexReport | null>(null);
  const [chatModel, setChatModel] = useState(typeof settings['ai.chatModel'] === 'string' ? settings['ai.chatModel'] : 'llama3.2:3b');
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const theme = typeof settings.theme === 'string' ? settings.theme : 'system';
  const captureShortcut = typeof settings['shortcuts.quickCapture'] === 'string' ? settings['shortcuts.quickCapture'] : 'CommandOrControl+Shift+Space';
  const automaticBackupEnabled = settings['backup.autoEnabled'] === true;
  const automaticBackupLastRun = typeof settings['backup.autoLastRun'] === 'string' ? settings['backup.autoLastRun'] : null;
  const automaticBackupError = typeof settings['backup.autoLastError'] === 'string' ? settings['backup.autoLastError'] : null;
  const deviceUnlockEnabled = settings['vault.deviceUnlockEnabled'] === true;
  const externalBackupDirectory = typeof settings['backup.externalDirectory'] === 'string' ? settings['backup.externalDirectory'] : null;
  const externalBackupError = typeof settings['backup.externalLastError'] === 'string' ? settings['backup.externalLastError'] : null;
  const externalBackupLastRun = typeof settings['backup.externalLastRun'] === 'string' ? settings['backup.externalLastRun'] : null;
  const externalBackupSameVolume = settings['backup.externalSameVolume'] === true;
  const offlineBackupDirectory = typeof settings['backup.offlineDirectory'] === 'string' ? settings['backup.offlineDirectory'] : null;
  const offlineBackupError = typeof settings['backup.offlineLastError'] === 'string' ? settings['backup.offlineLastError'] : null;
  const offlineBackupLastRun = typeof settings['backup.offlineLastRun'] === 'string' ? settings['backup.offlineLastRun'] : null;

  useEffect(() => {
    let active = true;
    void onGetRestoreActivationStatus().then((available) => { if (active) setRestoreRollbackAvailable(available); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Restore status could not be checked.'); });
    return () => { active = false; };
  }, [onGetRestoreActivationStatus]);

  async function update(key: string, value: unknown) {
    setSaving(true); setError(''); setMessage('');
    try { await onSettingChange(key, value); } catch (e) { setError(e instanceof Error ? e.message : 'Setting could not be saved.'); }
    finally { setSaving(false); }
  }
  async function copyText(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('The text could not be copied.'); }
  }
  async function createVault(event: React.FormEvent) {
    event.preventDefault();
    if (passphrase !== confirmPassphrase) { setError('The passphrases do not match.'); return; }
    setSaving(true); setError('');
    try { const key = await onVaultSetup(passphrase); setRecoveryKey(key); setRecoveryVisible(true); setPassphrase(''); setConfirmPassphrase(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Vault setup failed.'); }
    finally { setSaving(false); }
  }
  async function unlockVault(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { await onVaultUnlock(passphrase, useRecovery); setPassphrase(''); setUseRecovery(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Vault unlock failed.'); }
    finally { setSaving(false); }
  }
  async function changePassphrase(event: React.FormEvent) {
    event.preventDefault();
    if (passphrase !== confirmPassphrase) { setError('The passphrases do not match.'); return; }
    setSaving(true); setError('');
    try { await onVaultChangePassphrase(passphrase); setPassphrase(''); setConfirmPassphrase(''); setMessage('Vault passphrase changed.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Passphrase change failed.'); }
    finally { setSaving(false); }
  }
  async function configureVaultDeviceUnlock(enabled: boolean) {
    setSaving(true); setError(''); setMessage('');
    try {
      await onConfigureVaultDeviceUnlock(enabled);
      await onSettingChange('vault.deviceUnlockEnabled', enabled);
      setMessage(enabled ? 'This device can now unlock the vault using its secure OS credential store.' : 'Device unlock was disabled and its protected key was removed.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Device unlock could not be changed.'); }
    finally { setSaving(false); }
  }
  async function createBackup(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { const result = await onCreateBackup(backupPassphrase); if (result) { setBackupRecoveryKey(result.recoveryKey); setMessage(`Encrypted backup created: ${result.path}. Copy and store the recovery key below before leaving Settings.`); setBackupPassphrase(''); } else setMessage('Backup cancelled.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Backup creation failed.'); }
    finally { setSaving(false); }
  }
  async function restoreBackup(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { const secret = useBackupRecovery ? backupRestoreSecret : backupPassphrase; const path = await onRestoreBackup(secret, useBackupRecovery); setRestoreCopyPath(path); setMessage(path ? `Validated restore copy created at: ${path}. Your current workspace is unchanged.` : 'Restore cancelled.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Backup could not be restored.'); }
    finally { setSaving(false); }
  }
  async function activateRestoreCopy() {
    if (!restoreCopyPath) return;
    const confirmed = await confirm({ title: 'Activate this verified backup?', description: 'DevLedger will close, preserve the previous workspace for rollback, then validate the restored database and files on next launch.', confirmLabel: 'Restart and activate', destructive: false });
    if (!confirmed) return;
    setSaving(true); setError('');
    try {
      const result = await onActivateRestoreCopy(restoreCopyPath);
      if (result.staged) setMessage('Restore activation is staged. Close and reopen DevLedger to switch workspaces. The current workspace is retained until the restored database and files pass startup validation.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Restore activation could not be staged.'); }
    finally { setSaving(false); }
  }

  async function indexSemantic() {
    setIndexingSemantic(true); setError(''); setMessage('');
    try { const report = await onIndexSemantic(); setSemanticReport(report); setMessage(`Semantic index ready · ${report.sources.toLocaleString()} records · ${report.chunks.toLocaleString()} chunks · ${report.model}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Semantic indexing failed.'); }
    finally { setIndexingSemantic(false); }
  }
  async function checkOllama() {
    setCheckingOllama(true);
    try { const result = await onCheckOllama(); setOllamaStatus(result); }
    catch (e) { setOllamaStatus({ available: false, baseUrl: 'http://127.0.0.1:11434', models: [], error: e instanceof Error ? e.message : 'Ollama is unavailable.' }); }
    finally { setCheckingOllama(false); }
  }

  return <div className="mx-auto max-w-[900px] space-y-7">
    <div><p className="mb-1 text-xs text-muted-foreground">Workspace preferences and local diagnostics</p><h2 className="text-2xl font-semibold tracking-tight">Settings</h2><p className="mt-1 text-sm text-muted-foreground">Keep the workspace comfortable and understand where its data lives.</p></div>
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2"><Monitor className="size-4 text-muted-foreground"/><h3 className="text-sm font-semibold">Appearance</h3></div>
      <p className="mb-3 text-xs text-muted-foreground">Choose how DevLedger should look on this device.</p>
      <div className="grid gap-2 sm:grid-cols-3">{([{value:'light',label:'Light',icon:Sun},{value:'dark',label:'Dark',icon:Moon},{value:'system',label:'System',icon:Monitor}] as const).map((item) => { const Icon = item.icon; return <button key={item.value} type="button" onClick={() => void update('theme', item.value)} className={`flex items-center gap-2 rounded-md border px-3 py-3 text-left text-xs ${theme === item.value ? 'border-ring bg-accent' : 'border-border hover:bg-surface-hover'}`}><Icon className="size-4"/>{item.label}{theme === item.value && <Check className="ml-auto size-3.5"/>}</button>; })}</div>
    </section>
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2"><h3 className="text-sm font-semibold">Keyboard shortcuts</h3><Badge variant="outline" className="ml-auto">Global</Badge></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium">Quick capture</p><p className="mt-1 text-[11px] text-muted-foreground">Opens the capture window even when DevLedger is not focused.</p></div><NativeSelect aria-label="Quick capture keyboard shortcut" value={captureShortcut} onChange={(event) => void update('shortcuts.quickCapture', event.target.value)} className="w-64"><NativeSelectOption value="CommandOrControl+Shift+Space">Ctrl/Cmd + Shift + Space</NativeSelectOption><NativeSelectOption value="CommandOrControl+Alt+Space">Ctrl/Cmd + Alt + Space</NativeSelectOption><NativeSelectOption value="CommandOrControl+Shift+K">Ctrl/Cmd + Shift + K</NativeSelectOption><NativeSelectOption value="Alt+Shift+N">Alt + Shift + N</NativeSelectOption></NativeSelect></div>
    </section>
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2"><Database className="size-4 text-muted-foreground"/><h3 className="text-sm font-semibold">Local data</h3><Badge variant="success" className="ml-auto">On device</Badge></div>
      <div className="space-y-3 text-xs"><div><p className="mb-1 text-muted-foreground">Application data directory</p><div className="flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-md bg-surface-subtle px-3 py-2 font-mono text-[11px]">{metadata?.dataDirectory ?? 'Loading…'}</code><Button size="sm" variant="outline" onClick={() => metadata && void copyText(metadata.dataDirectory)} disabled={!metadata}>{copied ? <Check className="size-3.5"/> : <Clipboard className="size-3.5"/>}{copied ? 'Copied' : 'Copy path'}</Button></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><div><p className="text-muted-foreground">Version</p><p className="mt-1 font-medium">{metadata?.version ?? '—'}</p></div><div><p className="text-muted-foreground">Platform</p><p className="mt-1 font-medium">{metadata?.platform ?? '—'}</p></div><div><p className="text-muted-foreground">Database</p><p className="mt-1 font-medium">SQLite + FTS5</p></div></div>
      </div>
    </section>
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2"><h3 className="text-sm font-semibold">Optional local AI · Ollama</h3><Badge variant="outline" className="ml-auto">Not required</Badge></div>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">DevLedger only connects to the Ollama service on this computer. Search works independently with SQLite FTS5. AI search summaries stay off until you explicitly enable them on the Search screen.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input aria-label="Text generation model" value={chatModel} onChange={(e) => setChatModel(e.target.value)} placeholder="llama3.2:3b" maxLength={128}/><Button size="sm" variant="outline" disabled={saving || !chatModel.trim()} onClick={() => void update('ai.chatModel', chatModel.trim())}>Save chat model</Button><Button size="sm" disabled={checkingOllama} onClick={() => void checkOllama()}>{checkingOllama ? 'Checking…' : 'Check Ollama'}</Button></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input aria-label="Embedding model" value={embeddingModel} onChange={(e) => setEmbeddingModel(e.target.value)} placeholder="embeddinggemma" maxLength={128}/><Button size="sm" variant="outline" disabled={saving || !embeddingModel.trim()} onClick={() => void update('ai.embeddingModel', embeddingModel.trim())}>Save embedding model</Button><Button size="sm" disabled={indexingSemantic || !ollamaStatus?.available} onClick={() => void indexSemantic()}>{indexingSemantic ? 'Indexing local text…' : 'Build semantic index'}</Button></div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Embedding generation uses Ollama’s local `/api/embed` endpoint. It indexes unlocked notes, projects, contacts, tasks and successfully extracted documents. Rebuilding creates a new generation first and switches over only after all batches succeed.</p>
      {semanticReport && <p className="mt-2 text-[11px] text-muted-foreground">Last completed index: {semanticReport.sources.toLocaleString()} records · {semanticReport.chunks.toLocaleString()} chunks · {new Date(semanticReport.completedAt).toLocaleString()}</p>}
      {ollamaStatus && <div className="mt-3 rounded-md border border-border bg-surface-subtle p-3 text-xs"><div className="flex items-center gap-2"><Badge variant={ollamaStatus.available ? 'success' : 'warning'}>{ollamaStatus.available ? 'Connected' : 'Unavailable'}</Badge><span className="font-mono text-[10px] text-muted-foreground">{ollamaStatus.baseUrl}</span></div>{ollamaStatus.available ? <p className="mt-2 text-muted-foreground">Installed models: {ollamaStatus.models.length ? ollamaStatus.models.join(', ') : 'No models found'}</p> : <p className="mt-2 text-muted-foreground">{ollamaStatus.error}</p>}</div>}
    </section>
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground"/><h3 className="text-sm font-semibold">Vault auto-lock</h3></div>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Lock the vault after this much system inactivity or immediately when the operating system locks the session. The renderer is notified and clears the open protected note view.</p>
      <div className="flex max-w-sm items-center justify-between gap-3 text-xs"><Label htmlFor="vault-inactivity-timeout">Inactivity timeout</Label><NativeSelect id="vault-inactivity-timeout" aria-label="Vault inactivity timeout" value={String(typeof settings['vault.autoLockMinutes'] === 'number' ? settings['vault.autoLockMinutes'] : 15)} onChange={(event) => void update('vault.autoLockMinutes', Number(event.target.value))} className="w-44"><NativeSelectOption value="0">Disabled</NativeSelectOption><NativeSelectOption value="5">5 minutes</NativeSelectOption><NativeSelectOption value="10">10 minutes</NativeSelectOption><NativeSelectOption value="15">15 minutes</NativeSelectOption><NativeSelectOption value="30">30 minutes</NativeSelectOption><NativeSelectOption value="60">1 hour</NativeSelectOption><NativeSelectOption value="120">2 hours</NativeSelectOption></NativeSelect></div>
    </section>
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground"/><h3 className="text-sm font-semibold">Protected notes vault</h3><Badge variant={vaultStatus.configured ? 'success' : 'secondary'} className="ml-auto">{vaultStatus.configured ? (vaultStatus.unlocked ? 'Unlocked' : 'Locked') : 'Not configured'}</Badge></div>
      {!vaultStatus.configured ? <form onSubmit={(e) => void createVault(e)} className="space-y-3"><p className="text-xs leading-relaxed text-muted-foreground">A random vault key encrypts protected notes with AES-256-GCM. Argon2id derives independent wrapping keys for your master passphrase and one-time offline recovery key. Keep the recovery key in a separate safe place. Losing both credentials means the protected notes cannot be recovered.</p><label className="block space-y-1 text-xs font-medium">Master passphrase<Input type="password" autoComplete="new-password" minLength={12} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="At least 12 characters" required/></label><label className="block space-y-1 text-xs font-medium">Confirm passphrase<Input type="password" autoComplete="new-password" minLength={12} value={confirmPassphrase} onChange={(e) => setConfirmPassphrase(e.target.value)} required/></label><Button type="submit" disabled={saving || passphrase.length < 12 || passphrase !== confirmPassphrase}>{saving ? 'Creating vault…' : 'Create vault'}</Button></form> : !vaultStatus.unlocked ? <form onSubmit={(e) => void unlockVault(e)} className="space-y-3"><p className="text-xs leading-relaxed text-muted-foreground">The vault locks when the application restarts. Unlock it with your master passphrase or offline recovery key.</p><label className="block space-y-1 text-xs font-medium">{useRecovery ? 'Offline recovery key' : 'Master passphrase'}<Input type="password" autoComplete="current-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} required/></label><div className="flex flex-wrap items-center gap-2"><Button type="submit" disabled={saving || !passphrase}>{saving ? 'Unlocking…' : 'Unlock vault'}</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setUseRecovery((v) => !v); setPassphrase(''); }}>{useRecovery ? 'Use passphrase' : 'Use recovery key'}</Button></div></form> : <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">The vault key is available to this application session. Protected note content stays encrypted in SQLite.</p><Button size="sm" variant="outline" onClick={() => void onVaultLock()}><LockKeyhole className="size-3.5"/>Lock vault</Button></div><form onSubmit={(e) => void changePassphrase(e)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input type="password" autoComplete="new-password" minLength={12} placeholder="New passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} required/><Input type="password" autoComplete="new-password" minLength={12} placeholder="Confirm new passphrase" value={confirmPassphrase} onChange={(e) => setConfirmPassphrase(e.target.value)} required/><Button type="submit" size="sm" disabled={saving || passphrase.length < 12 || passphrase !== confirmPassphrase}>Change passphrase</Button></form></div>}
      {vaultStatus.configured && <div className="mt-4 rounded-md border border-border p-3"><div className="flex items-start gap-3"><Checkbox id="vault-device-unlock" checked={deviceUnlockEnabled} disabled={saving || (!vaultStatus.unlocked && !deviceUnlockEnabled)} onCheckedChange={(checked) => void configureVaultDeviceUnlock(checked === true)}/><div className="min-w-0"><Label htmlFor="vault-device-unlock" className="text-xs font-medium">Unlock automatically with this device</Label><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Stores only the random vault key inside the operating system's secure credential store—not your passphrase. Anyone who can access this same OS user account may be able to unlock the vault. A secure OS keyring is required; insecure Linux basic-text storage is rejected. Your master passphrase and offline recovery key remain available.</p>{!vaultStatus.unlocked && !deviceUnlockEnabled && <p className="mt-1 text-[10px] text-muted-foreground">Unlock the vault first to enable this option.</p>}</div></div></div>}
      {recoveryVisible && <div className="mt-4 rounded-md border border-warning/40 bg-warning/5 p-3"><p className="text-xs font-semibold">Save this offline recovery key now</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">It is shown only during setup and cannot be retrieved later. Store it in a separate, safe place.</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-surface px-2 py-2 font-mono text-xs">{recoveryKey}</code><Button size="sm" variant="outline" onClick={() => void copyText(recoveryKey)}><Clipboard className="size-3.5"/>Copy</Button></div><div className="mt-3 flex items-center gap-2 text-xs"><Checkbox id="recovery-key-saved" checked={recoveryConfirmed} onCheckedChange={(checked) => setRecoveryConfirmed(checked === true)} /><Label htmlFor="recovery-key-saved">I have saved this recovery key offline.</Label></div><Button size="sm" className="mt-3" disabled={!recoveryConfirmed} onClick={() => { setRecoveryVisible(false); setRecoveryConfirmed(false); setRecoveryKey(''); }}>Finish vault setup</Button></div>}
    </section>
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2"><HardDrive className="size-4 text-muted-foreground"/><h3 className="text-sm font-semibold">Encrypted backup and recovery copy</h3></div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><Badge variant={automaticBackupEnabled ? 'success' : 'warning'}>{automaticBackupEnabled ? 'Automatic local snapshots enabled' : 'Automatic local snapshots unavailable'}</Badge>{automaticBackupLastRun && <span className="text-muted-foreground">Last verified: {new Date(automaticBackupLastRun).toLocaleString()}</span>}</div>
      {automaticBackupError && <p className="mb-3 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-[11px] text-muted-foreground">{automaticBackupError}</p>}
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">Create a passphrase-encrypted archive containing a consistent SQLite backup, stored document objects and a SHA-256 manifest. Restore validates the encrypted archive, database and document objects, then creates an isolated recovery copy. The live workspace is unchanged until you explicitly activate the copy.</p>
      <div className="mb-4 rounded-md border border-border bg-surface-subtle p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-xs font-medium">Independent backup destination</p><p className="mt-1 break-all text-[11px] text-muted-foreground">{externalBackupDirectory ?? 'Not configured · automatic snapshots stay on this computer'}</p></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { setSaving(true); setError(''); void onChooseExternalBackupDestination().then(async (destination) => { if (!destination) return; await onSettingChange('backup.externalDirectory', destination.directory); await onSettingChange('backup.externalSameVolume', destination.sameVolume); setMessage(destination.sameVolume ? 'Destination saved. It is on the same storage volume; use another device for an independent copy.' : 'External destination saved. The next verified local snapshot will be mirrored there.'); }).catch((caught) => setError(caught instanceof Error ? caught.message : 'External destination could not be configured.')).finally(() => setSaving(false)); }}>Choose drive</Button>{externalBackupDirectory && <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setSaving(true); void onClearExternalBackupDestination().then(async () => { await onSettingChange('backup.externalDirectory', null); await onSettingChange('backup.externalSameVolume', null); setMessage('External backup destination removed. Existing external snapshots were left untouched.'); }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Destination could not be cleared.')).finally(() => setSaving(false)); }}>Remove</Button>}</div></div>
        {externalBackupDirectory && <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]"><Badge variant={externalBackupError ? 'warning' : externalBackupLastRun ? 'success' : 'secondary'}>{externalBackupError ? 'Mirror issue' : externalBackupLastRun ? 'Mirrored' : 'Waiting for next snapshot'}</Badge>{externalBackupLastRun && <span className="text-muted-foreground">Last mirror {new Date(externalBackupLastRun).toLocaleString()}</span>}{externalBackupSameVolume && <span className="text-warning">Same storage volume</span>}</div>}
        {externalBackupError && <p className="mt-2 text-[11px] text-warning">{externalBackupError}</p>}
        <p className="mt-2 text-[10px] text-muted-foreground">DevLedger copies already-encrypted, verified snapshots to this folder using atomic writes and SHA-256 verification. The device must be mounted when snapshots run. A destination on the same storage volume is rejected for independent copies.</p>
      </div>
      <div className="mb-4 rounded-md border border-border bg-surface-subtle p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-xs font-medium">Second removable / offline copy</p><p className="mt-1 break-all text-[11px] text-muted-foreground">{offlineBackupDirectory ?? 'Not configured · optional second physical drive'}</p></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { setSaving(true); setError(''); void onChooseOfflineBackupDestination().then(async (destination) => { if (!destination) return; await onSettingChange('backup.offlineDirectory', destination.directory); await onSettingChange('backup.offlineSameVolume', destination.sameVolume); setMessage('Second backup drive saved. DevLedger will copy the next verified snapshot when this drive is mounted.'); }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Second backup drive could not be configured.')).finally(() => setSaving(false)); }}>Choose second drive</Button>{offlineBackupDirectory && <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setSaving(true); void onClearOfflineBackupDestination().then(async () => { await onSettingChange('backup.offlineDirectory', null); await onSettingChange('backup.offlineSameVolume', null); setMessage('Second backup drive removed. Existing copies were left untouched.'); }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Second destination could not be cleared.')).finally(() => setSaving(false)); }}>Remove</Button>}</div></div>
        {offlineBackupDirectory && <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]"><Badge variant={offlineBackupError ? 'warning' : offlineBackupLastRun ? 'success' : 'secondary'}>{offlineBackupError ? 'Copy issue' : offlineBackupLastRun ? 'Copied' : 'Waiting for mounted drive'}</Badge>{offlineBackupLastRun && <span className="text-muted-foreground">Last copy {new Date(offlineBackupLastRun).toLocaleString()}</span>}</div>}
        {offlineBackupError && <p className="mt-2 text-[11px] text-warning">{offlineBackupError}</p>}
        <p className="mt-2 text-[10px] text-muted-foreground">Choose a different physical volume from both your computer and the first backup drive. This destination is attempted at each automatic snapshot; keep the drive disconnected between copies to provide an offline recovery point. DevLedger cannot copy while it is physically disconnected.</p>
      </div>
      <form onSubmit={(e) => void createBackup(e)} className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input type="password" minLength={12} autoComplete="new-password" value={backupPassphrase} onChange={(e) => setBackupPassphrase(e.target.value)} placeholder="Backup passphrase (12+ characters)" required/><Button type="submit" disabled={saving || backupPassphrase.length < 12}><Download className="size-3.5"/>{saving ? 'Working…' : 'Create backup'}</Button></form>
      {backupRecoveryKey && <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3"><p className="text-xs font-semibold">Save this portable backup recovery key</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">This key is generated independently of your passphrase and is shown only once. Store it separately from the backup file. Anyone who has both the backup and this key can restore the workspace.</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-surface px-2 py-2 font-mono text-xs">{backupRecoveryKey}</code><Button size="sm" type="button" variant="outline" onClick={() => void copyText(backupRecoveryKey)}><Clipboard className="size-3.5"/>Copy key</Button></div><Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setBackupRecoveryKey('')}>I have stored this key</Button></div>}
      <div className="mt-4 rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">Restore an encrypted backup</p><Button type="button" size="sm" variant="ghost" onClick={() => { setUseBackupRecovery((current) => !current); setBackupPassphrase(''); setBackupRestoreSecret(''); }}>{useBackupRecovery ? 'Use backup passphrase' : 'Use offline recovery key'}</Button></div><form onSubmit={(e) => void restoreBackup(e)} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><Input type="password" autoComplete="off" value={useBackupRecovery ? backupRestoreSecret : backupPassphrase} onChange={(e) => useBackupRecovery ? setBackupRestoreSecret(e.target.value) : setBackupPassphrase(e.target.value)} placeholder={useBackupRecovery ? 'Offline backup recovery key' : 'Backup passphrase'} required/><Button type="submit" variant="outline" disabled={saving || (useBackupRecovery ? backupRestoreSecret.length < 40 : backupPassphrase.length < 12)}><Upload className="size-3.5"/>Restore as copy</Button></form><p className="mt-2 text-[11px] text-muted-foreground">Restore verifies the archive, database and stored files before creating an isolated recovery copy. It does not replace your current workspace until you explicitly activate it.</p>{restoreCopyPath && <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3"><p className="text-xs font-semibold">Verified restore copy is ready</p><p className="mt-1 break-all text-[11px] text-muted-foreground">{restoreCopyPath}</p><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">DevLedger will restart, preserve the previous workspace, promote this restore, then validate the database and files. A failed validation automatically rolls back.</p><Button type="button" size="sm" className="mt-3" disabled={saving} onClick={() => void activateRestoreCopy()}>Activate and restart</Button></div>}</div>
      {restoreRollbackAvailable && <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3"><p className="text-xs font-semibold">Previous workspace retained</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">The restored workspace passed its startup checks. Your previous database and object store are still available as a rollback point. Confirm the restore only after checking your projects and attachments.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" disabled={saving} onClick={() => { void (async () => { const accepted = await confirm({ title: 'Keep the restored workspace?', description: 'This permanently deletes the previous workspace rollback copy. Check your projects and protected files first.', confirmLabel: 'Keep restored workspace', destructive: true }); if (!accepted) return; setSaving(true); await onCommitRestoreActivation().then(() => { setRestoreRollbackAvailable(false); setMessage('Restore confirmed. The previous workspace rollback snapshot has been removed.'); }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Restore could not be confirmed.')).finally(() => setSaving(false)); })(); }}>Keep restored workspace</Button><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { void (async () => { const accepted = await confirm({ title: 'Roll back to the previous workspace?', description: 'DevLedger will restart and restore the previous database and file store.', confirmLabel: 'Roll back and restart', destructive: true }); if (!accepted) return; setSaving(true); await onRollbackRestoreActivation().catch((caught) => { setSaving(false); setError(caught instanceof Error ? caught.message : 'Rollback could not be started.'); }); })(); }}>Roll back and restart</Button></div></div>}
      <Accordion type="single" collapsible className="mt-3 border-t border-border">
        <AccordionItem value="recovery-details">
          <AccordionTrigger className="py-3 text-xs">Backup safety and recovery details</AccordionTrigger>
          <AccordionContent>
            <p className="text-[11px] leading-relaxed text-muted-foreground">When Electron reports a secure OS credential backend, DevLedger creates encrypted local snapshots approximately every 30 minutes and verifies each by restoring it to an isolated copy before retention cleanup. Linux basic_text and unknown backends fail closed and disable unattended snapshots. When configured, DevLedger also mirrors each verified snapshot to two distinct external storage volumes; mount the second removable drive during a backup run, then disconnect it to keep an offline recovery point. Restore first creates a separate validated copy. Activation is an explicit action: the live database and object store are moved aside, the restored pair is promoted on shutdown, and the next startup either commits the restored workspace after integrity checks or rolls back to the previous one.</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}{message && <p role="status" className="break-all rounded-md border border-border bg-surface-subtle p-3 text-xs">{message}</p>}{saving && <p className="text-[11px] text-muted-foreground">Working…</p>}
  </div>;
}
