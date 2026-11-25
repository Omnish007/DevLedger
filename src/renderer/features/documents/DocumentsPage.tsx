import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { AlertCircle, FileText, FolderOpen, HardDrive, Plus, RefreshCw } from 'lucide-react';
import type { DocumentRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatBytes, formatDate, friendlyError } from '@/lib/utils';

interface Props {
  initialProjectId?: string | null | undefined;
  onConsumeFocus?: () => void;
  vaultUnlocked: boolean;
  onImport: (projectId?: string | null, protectWithVault?: boolean) => Promise<string | null>;
  onOpen: (id: string) => Promise<void>;
  onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
  refresh: () => Promise<void>;
}

const statusLabel: Record<DocumentRecord['status'], string> = { queued: 'Queued', extracting: 'Extracting', ocr_required: 'OCR required', indexed: 'Indexed', failed: 'Failed', needs_attention: 'Needs attention' };
const statusVariant: Record<DocumentRecord['status'], 'secondary' | 'success' | 'warning' | 'destructive'> = { queued: 'secondary', extracting: 'secondary', ocr_required: 'warning', indexed: 'success', failed: 'destructive', needs_attention: 'warning' };

export function DocumentsPage({ initialProjectId, onConsumeFocus, vaultUnlocked, onImport, onOpen, onNavigateTarget, refresh }: Props) {
  const [projectId, setProjectId] = useState(initialProjectId || 'all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [pageError, setPageError] = useState('');
  const [protectWithVault, setProtectWithVault] = useState(false);
  const deferredQuery = useDeferredValue(query.trim());
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<DocumentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const requestRef = useRef(0);
  const pageSize = 40;

  useEffect(() => {
    if (initialProjectId) { setProjectId(initialProjectId); setOffset(0); onConsumeFocus?.(); }
  }, [initialProjectId, onConsumeFocus]);

  const loadPage = useCallback(async (requestedOffset = offset) => {
    const requestId = ++requestRef.current;
    setPageLoading(true);
    try {
      const page = await window.devLedger.documents.listPage({ limit: pageSize, offset: requestedOffset, query: deferredQuery, projectId: projectId === 'all' ? null : projectId });
      if (requestId === requestRef.current) {
        setVisible(page.items); setTotal(page.total); setPageError('');
        const ids = [...new Set(page.items.map((d) => d.projectId).filter((id): id is string => Boolean(id)))];
        void window.devLedger.projects.getNames(ids).then((names) => { if (requestId === requestRef.current) setProjectNames((c) => ({ ...c, ...names })); }).catch(() => undefined);
      }
    } finally { if (requestId === requestRef.current) setPageLoading(false); }
  }, [deferredQuery, offset, projectId]);

  useEffect(() => { void loadPage().catch((cause: unknown) => setPageError(friendlyError(cause, 'Documents could not be loaded.'))); }, [loadPage]);

  async function importFile() {
    setBusy(true); setNotice(''); setNoticeIsError(false);
    try { const res = await onImport(projectId === 'all' ? null : projectId, protectWithVault); if (res) setNotice(res); setOffset(0); await refresh(); await loadPage(0); }
    catch (e) { setNotice(friendlyError(e, 'Document import failed.')); setNoticeIsError(true); }
    finally { setBusy(false); }
  }

  return (
    <div className="workspace-page page-documents mx-auto space-y-5">
      <PageHeader title="Documents" description="Project files stay encrypted and indexed locally." actions={<><div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"><Checkbox id="protect-document" checked={protectWithVault} onCheckedChange={(c) => setProtectWithVault(c === true)} disabled={!vaultUnlocked || busy} /><Label htmlFor="protect-document" className="text-xs">Encrypt with vault</Label></div><Button size="sm" onClick={() => void importFile()} disabled={busy || (protectWithVault && !vaultUnlocked)}><Plus className="size-3.5" />{busy ? 'Importing…' : 'Import document'}</Button></>} />
      <div className="workspace-toolbar">
        <Input className="min-w-[220px] max-w-md flex-1" value={query} onChange={(e) => { setOffset(0); setQuery(e.target.value); }} placeholder="Filter documents by name…" aria-label="Filter documents by title or filename" />
        <RemoteRecordPicker entityType="project" value={projectId === 'all' ? '' : projectId} onValueChange={(v) => { setOffset(0); setProjectId(v || 'all'); }} placeholder="All projects" selectedLabel={projectId === 'all' ? undefined : projectNames[projectId]} className="w-48" />
        <Button variant="outline" size="icon" onClick={() => { setNotice(''); setNoticeIsError(false); void refresh().then(() => loadPage()).catch((c: unknown) => { setNotice(friendlyError(c, 'Documents could not be refreshed.')); setNoticeIsError(true); }); }} aria-label="Refresh documents"><RefreshCw className="size-3.5" /></Button>
      </div>
      {(pageError || notice) && <div role={pageError || noticeIsError ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${pageError || noticeIsError ? 'border-danger/30 bg-danger/5 text-danger' : 'border-border bg-surface-subtle'}`}><AlertCircle className="mt-0.5 size-3.5 shrink-0" /><span>{pageError || notice}</span></div>}

      <div className="workspace-surface overflow-x-auto"><div className="min-w-[740px]">
        <div className="grid grid-cols-[minmax(220px,1fr)_140px_90px_120px_110px] gap-3 border-b border-border bg-surface-subtle px-4 py-2 text-xs font-semibold text-muted-foreground"><span>Document</span><span>Project</span><span>Size</span><span>Status</span><span>Added</span></div>
        {pageLoading ? <p className="py-10 text-center text-xs text-muted-foreground">Loading documents…</p> : visible.map((doc) => (
          <div key={doc.id} className="document-row grid grid-cols-[minmax(220px,1fr)_140px_90px_120px_110px] items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
            <div className="flex min-w-0 items-center gap-2.5"><FileText className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><button type="button" onClick={() => void onOpen(doc.id)} disabled={doc.encrypted && !vaultUnlocked} className="max-w-full truncate text-left text-sm font-medium hover:underline disabled:opacity-60">{doc.title}</button><p className="truncate text-xs text-muted-foreground">{doc.originalName} · {doc.extension.replace('.', '').toUpperCase()}</p></div></div>
            {doc.projectId ? <button type="button" onClick={() => onNavigateTarget({ view: 'projects', recordId: doc.projectId! })} className="truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline">{projectNames[doc.projectId] ?? 'Project'}</button> : <span className="text-xs text-muted-foreground">Unassigned</span>}
            <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(doc.sizeBytes)}</span>
            <Badge variant={doc.encrypted ? 'warning' : statusVariant[doc.status]}>{doc.encrypted ? 'Protected' : statusLabel[doc.status]}</Badge>
            <span className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</span>
          </div>
        ))}
        {!pageLoading && !visible.length && !pageError && !noticeIsError && <div className="py-14 text-center"><FolderOpen className="mx-auto mb-2.5 size-5 text-muted-foreground" /><p className="text-sm font-medium">No documents yet</p><p className="mt-1 text-xs text-muted-foreground">Import PDFs, Word docs, spreadsheets, CSV or Markdown files.</p><Button className="mt-4" size="sm" onClick={() => void importFile()} disabled={busy}><Plus className="size-3.5" />Import document</Button></div>}
      </div></div>

      <PageControls offset={offset} limit={pageSize} total={total} disabled={pageLoading} onPageChange={setOffset} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><HardDrive className="size-3.5 shrink-0" />Stored on device. Vault-protected documents stay excluded from search.</p>
    </div>
  );
}
