import { useEffect, useState } from 'react';
import { Clipboard, Download, Upload } from 'lucide-react';
import type { BackupCreationResult } from '@shared/contracts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    void onGetRestoreActivationStatus().then((ok) => { if (active) setRestoreRollbackAvailable(ok); }).catch(() => undefined);
    return () => { active = false; };
  }, [onGetRestoreActivationStatus]);

  const autoEnabled = props.settings['backup.autoEnabled'] === true;
  const autoLastRun = typeof props.settings['backup.autoLastRun'] === 'string' ? props.settings['backup.autoLastRun'] : null;
  const autoError = typeof props.settings['backup.autoLastError'] === 'string' ? props.settings['backup.autoLastError'] : null;
  const extDir = typeof props.settings['backup.externalDirectory'] === 'string' ? props.settings['backup.externalDirectory'] : null;
  const offDir = typeof props.settings['backup.offlineDirectory'] === 'string' ? props.settings['backup.offlineDirectory'] : null;

  async function runAction(fn: () => Promise<void>, fallback: string) {
    setSaving(true); setError(''); setMessage('');
    try { await fn(); } catch (e) { setError(friendlyError(e, fallback)); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5 text-xs">
      {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{error}</p>}
      {message && <p role="status" className="break-all rounded-md border border-border bg-surface-subtle px-3 py-2">{message}</p>}

      <section className="workspace-surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div><h3 className="text-sm font-semibold">Encrypted backups & destinations</h3><p className="mt-0.5 text-muted-foreground">Consistent SQLite + object archives verified with SHA-256.</p></div>
          <Badge variant={autoEnabled ? 'success' : 'warning'}>{autoEnabled ? 'Auto-snapshots active' : 'Auto-snapshots unavailable'}</Badge>
        </div>
        {autoLastRun && <p className="text-muted-foreground">Last verified local snapshot: {new Date(autoLastRun).toLocaleString()}</p>}
        {autoError && <p className="rounded border border-warning/40 bg-warning/5 p-2.5 text-muted-foreground">{autoError}</p>}

        {[
          { label: 'Independent backup destination', dir: extDir, keyDir: 'backup.externalDirectory', keySame: 'backup.externalSameVolume', choose: props.onChooseExternalBackupDestination, clear: props.onClearExternalBackupDestination, btn: 'Choose drive' },
          { label: 'Second removable / offline drive', dir: offDir, keyDir: 'backup.offlineDirectory', keySame: 'backup.offlineSameVolume', choose: props.onChooseOfflineBackupDestination, clear: props.onClearOfflineBackupDestination, btn: 'Choose second drive' },
        ].map((dest) => (
          <div key={dest.keyDir} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-subtle p-3">
            <div className="min-w-0 flex-1"><p className="font-medium">{dest.label}</p><p className="mt-0.5 break-all text-muted-foreground">{dest.dir ?? 'Not configured'}</p></div>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void runAction(async () => { const picked = await dest.choose(); if (!picked) return; await props.onSettingChange(dest.keyDir, picked.directory); await props.onSettingChange(dest.keySame, picked.sameVolume); setMessage('Backup destination updated.'); }, 'Could not save destination.')}>{dest.btn}</Button>
              {dest.dir && <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => void runAction(async () => { await dest.clear(); await props.onSettingChange(dest.keyDir, null); await props.onSettingChange(dest.keySame, null); setMessage('Destination cleared.'); }, 'Could not clear destination.')}>Remove</Button>}
            </div>
          </div>
        ))}

        <form onSubmit={(e) => { e.preventDefault(); void runAction(async () => { const r = await props.onCreateBackup(backupPassphrase); if (r) { setBackupRecoveryKey(r.recoveryKey); setBackupPassphrase(''); setMessage(`Encrypted backup saved: ${r.path}`); } }, 'Backup creation failed.'); }} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input type="password" minLength={12} autoComplete="new-password" value={backupPassphrase} onChange={(e) => setBackupPassphrase(e.target.value)} placeholder="Backup passphrase (12+ chars)" required />
          <Button type="submit" size="sm" disabled={saving || backupPassphrase.length < 12}><Download className="size-3.5" />Create backup</Button>
        </form>

        {backupRecoveryKey && (
          <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="font-semibold">Save portable recovery key (shown once)</p>
            <div className="flex items-center gap-2"><code className="flex-1 break-all rounded bg-surface p-2 font-mono">{backupRecoveryKey}</code><Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(backupRecoveryKey)}><Clipboard className="size-3.5" /></Button></div>
          </div>
        )}

        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between"><span className="font-medium">Restore from archive</span><Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setUseBackupRecovery((v) => !v); setBackupPassphrase(''); setBackupRestoreSecret(''); }}>{useBackupRecovery ? 'Use passphrase' : 'Use recovery key'}</Button></div>
          <form onSubmit={(e) => { e.preventDefault(); void runAction(async () => { const secret = useBackupRecovery ? backupRestoreSecret : backupPassphrase; const path = await props.onRestoreBackup(secret, useBackupRecovery); setRestoreCopyPath(path); if (path) setMessage(`Validated recovery copy ready: ${path}`); }, 'Backup restore failed.'); }} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input type="password" value={useBackupRecovery ? backupRestoreSecret : backupPassphrase} onChange={(e) => useBackupRecovery ? setBackupRestoreSecret(e.target.value) : setBackupPassphrase(e.target.value)} placeholder={useBackupRecovery ? 'Recovery key' : 'Backup passphrase'} required />
            <Button type="submit" size="sm" variant="outline" disabled={saving}><Upload className="size-3.5" />Restore as copy</Button>
          </form>
          {restoreCopyPath && <Button type="button" size="sm" onClick={() => { void (async () => { if (await confirm({ title: 'Activate verified restore?', description: 'DevLedger will stage promotion and verify integrity on restart.', confirmLabel: 'Stage restore' })) await runAction(async () => { await props.onActivateRestoreCopy(restoreCopyPath); setMessage('Staged restore activation. Restart DevLedger to switch.'); }, 'Activation failed.'); })(); }}>Activate staged restore</Button>}
          {restoreRollbackAvailable && (
            <div className="flex gap-2 pt-2">
              <Button type="button" size="sm" onClick={() => void runAction(async () => { await props.onCommitRestoreActivation(); setRestoreRollbackAvailable(false); setMessage('Restored workspace confirmed.'); }, 'Commit failed.')}>Confirm restored workspace</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void runAction(props.onRollbackRestoreActivation, 'Rollback failed.')}>Roll back</Button>
            </div>
          )}
        </div>

        <Accordion type="single" collapsible className="border-t border-border">
          <AccordionItem value="details">
            <AccordionTrigger className="py-2.5 text-xs">How snapshot verification works</AccordionTrigger>
            <AccordionContent className="text-xs leading-relaxed text-muted-foreground">Snapshots run automatically every 30 minutes when a secure OS keychain is present, restore-verify into an isolated copy before retention cleanup, and mirror atomically to mounted external volumes.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </div>
  );
}
