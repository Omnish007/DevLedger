import { useState } from 'react';
import { Clock3, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import type { ActiveTimerRecord, TimeEntryRecord } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageControls } from '@/components/shared/PageControls';
import { useConfirm } from '@/components/shared/ConfirmProvider';
import { formatDate, friendlyError } from '@/lib/utils';

interface TaskTimeSectionProps {
  taskId: string;
  entries: TimeEntryRecord[];
  total: number;
  offset: number;
  activeTimer: ActiveTimerRecord | null;
  onStartTimer: () => Promise<void>;
  onStopTimer: () => Promise<number>;
  onOffsetChange: (nextOffset: number) => void;
  onUpdated: () => Promise<void>;
  onError: (message: string) => void;
}

const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function TaskTimeSection({
  taskId, entries, total, offset, activeTimer, onStartTimer, onStopTimer, onOffsetChange, onUpdated, onError,
}: TaskTimeSectionProps) {
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const runningHere = activeTimer?.taskId === taskId;
  const totalMinutes = entries.reduce((sum, item) => sum + Math.round((item.durationSeconds ?? 0) / 60), 0);

  async function saveManual(event: React.FormEvent) {
    event.preventDefault();
    if (!startedAt || !endedAt) return;
    setBusy(true);
    try {
      const startIso = new Date(startedAt).toISOString();
      const endIso = new Date(endedAt).toISOString();
      if (editingId) await window.devLedger.operations.updateTimeEntry(editingId, startIso, endIso, note);
      else await window.devLedger.operations.addManualTimeEntry(taskId, startIso, endIso, note);
      setEditingId(null); setStartedAt(''); setEndedAt(''); setNote(''); setShowForm(false);
      await onUpdated();
    } catch (caught) {
      onError(friendlyError(caught, 'Time entry could not be saved.'));
    } finally { setBusy(false); }
  }

  return (
    <section className="space-y-2.5 border-t border-border pt-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-muted-foreground">Time log</h4>
          <span className="tabular-nums text-muted-foreground">· {totalMinutes}m logged</span>
        </div>
        <div className="flex items-center gap-1">
          {runningHere ? (
            <Button type="button" size="sm" variant="secondary" className="h-6 gap-1 px-2 text-xs" disabled={busy || Boolean(activeTimer?.recoveryRequired)} onClick={() => void onStopTimer().then(onUpdated).catch((e) => onError(friendlyError(e, 'Could not stop timer.')))}>
              <Square className="size-3" />Stop
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-xs" disabled={busy || Boolean(activeTimer)} onClick={() => void onStartTimer().then(onUpdated).catch((e) => onError(friendlyError(e, 'Could not start timer.')))}>
              <Play className="size-3" />Start
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={() => { setShowForm((v) => !v); setEditingId(null); }}>
            <Plus className="size-3" />Log time
          </Button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={(event) => void saveManual(event)} className="space-y-2 rounded-md border border-border bg-surface-subtle p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span>Start</span><Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className="h-8 text-xs" required /></label>
            <label className="space-y-1"><span>End</span><Input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} className="h-8 text-xs" required /></label>
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Summary of work…" className="h-8 text-xs" />
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={busy || !startedAt || !endedAt}>{editingId ? 'Save' : 'Add entry'}</Button>
          </div>
        </form>
      )}

      {entries.length ? (
        <div className="divide-y divide-border rounded-md border border-border">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 px-2.5 py-2">
              <Clock3 className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{formatDate(entry.startedAt)}</span>
                <span className="ml-2 tabular-nums text-muted-foreground">{entry.durationSeconds === null ? 'Running' : `${Math.round(entry.durationSeconds / 60)}m`}</span>
                {entry.note && <p className="truncate text-muted-foreground">{entry.note}</p>}
              </div>
              {!entry.active && (
                <>
                  <Button type="button" size="icon" variant="ghost" className="size-6" aria-label="Edit time entry" onClick={() => { setEditingId(entry.id); setStartedAt(toLocalInput(entry.startedAt)); setEndedAt(toLocalInput(entry.endedAt ?? '')); setNote(entry.note); setShowForm(true); }}>
                    <Pencil className="size-3" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="size-6 text-muted-foreground hover:text-danger" aria-label="Delete time entry" onClick={() => {
                    void (async () => {
                      const ok = await confirm({ title: 'Remove time entry?', description: 'The entry will be removed and logged in activity history.', confirmLabel: 'Remove', destructive: true });
                      if (ok) await window.devLedger.operations.deleteTimeEntry(entry.id).then(onUpdated);
                    })();
                  }}>
                    <Trash2 className="size-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : !showForm && <p className="text-muted-foreground">No time entries yet.</p>}
      <PageControls offset={offset} limit={25} total={total} onPageChange={onOffsetChange} />
    </section>
  );
}
