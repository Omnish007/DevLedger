import { PageHeader } from '@/components/shared/PageHeader';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileText, FolderOpen, HardDrive, Plus, RefreshCw } from 'lucide-react';
import type { DocumentRecord } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBytes, formatDate } from '@/lib/utils';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';

interface Props { documents: DocumentRecord[]; vaultUnlocked: boolean; onImport: (projectId?: string | null, protectWithVault?: boolean) => Promise<string | null>; onOpen: (id: string) => Promise<void>; refresh: () => Promise<void>; }
const statusLabel: Record<DocumentRecord['status'], string> = { queued: 'Queued', extracting: 'Extracting', ocr_required: 'OCR required', indexed: 'Indexed', failed: 'Failed', needs_attention: 'Needs attention' };
const statusVariant: Record<DocumentRecord['status'], 'secondary' | 'success' | 'warning' | 'danger'> = { queued: 'secondary', extracting: 'secondary', ocr_required: 'warning', indexed: 'success', failed: 'danger', needs_attention: 'warning' };
export function DocumentsPage({ vaultUnlocked, onImport, onOpen, refresh }: Props) {
  const [projectId, setProjectId] = useState('all'); const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [noticeIsError, setNoticeIsError] = useState(false); const [pageError, setPageError] = useState(''); const [protectWithVault, setProtectWithVault] = useState(false);
  const deferredQuery = useDeferredValue(query.trim());
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<DocumentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const requestRef = useRef(0);
  const pageSize = 40;
  const loadPage = useCallback(async (requestedOffset = offset) => {
    const requestId = ++requestRef.current;
    setPageLoading(true);
    try {
      const page = await window.devLedger.documents.listPage({ limit: pageSize, offset: requestedOffset, query: deferredQuery, projectId: projectId === 'all' ? null : projectId });
      if (requestId === requestRef.current) {
        setVisible(page.items); setTotal(page.total); setPageError('');
        const ids = [...new Set(page.items.map((document) => document.projectId).filter((id): id is string => Boolean(id)))];
        void window.devLedger.projects.getNames(ids).then((names) => { if (requestId === requestRef.current) setProjectNames((current) => ({ ...current, ...names })); }).catch(() => undefined);
      }
    } finally { if (requestId === requestRef.current) setPageLoading(false); }
  }, [deferredQuery, offset, projectId]);
  useEffect(() => { void loadPage().catch((cause: unknown) => setPageError(cause instanceof Error ? cause.message : 'Documents could not be loaded.')); }, [loadPage]);
  async function importFile() { setBusy(true); setNotice(''); setNoticeIsError(false); try { const result = await onImport(projectId === 'all' ? null : projectId, protectWithVault); if (result) setNotice(result); setOffset(0); await refresh(); await loadPage(0); } catch (e) { setNotice(e instanceof Error ? e.message : 'Document import failed.'); setNoticeIsError(true); } finally { setBusy(false); } }
  return <div className="workspace-page page-documents mx-auto space-y-6">
    <PageHeader title="Documents" description="Keep project files and references close to the work. Originals stay on this device." actions={<><div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"><Checkbox id="protect-document" checked={protectWithVault} onCheckedChange={(checked) => setProtectWithVault(checked === true)} disabled={!vaultUnlocked || busy}/><Label htmlFor="protect-document" className="text-xs">Encrypt with vault</Label></div><Button onClick={() => void importFile()} disabled={busy || (protectWithVault && !vaultUnlocked)}><Plus className="size-4"/>{busy ? 'Importing…' : 'Import document'}</Button></>} />
    <div className="workspace-toolbar document-toolbar"><div className="relative min-w-[220px] max-w-md flex-1"><Input value={query} onChange={(e) => { setOffset(0); setQuery(e.target.value); }} placeholder="Filter documents by name…" aria-label="Filter documents by title or filename"/></div><p className="self-center text-[10px] text-muted-foreground">Use workspace search for document contents.</p><RemoteRecordPicker entityType="project" value={projectId === 'all' ? '' : projectId} onValueChange={(value) => { setOffset(0); setProjectId(value || 'all'); }} placeholder="All projects" selectedLabel={projectId === 'all' ? undefined : projectNames[projectId]} className="w-48" /><Button variant="outline" size="icon" onClick={() => { setNotice(''); setNoticeIsError(false); void refresh().then(() => loadPage()).catch((cause: unknown) => { setNotice(cause instanceof Error ? cause.message : 'Documents could not be refreshed.'); setNoticeIsError(true); }); }} aria-label="Refresh documents"><RefreshCw className="size-3.5"/></Button></div>
    {(pageError || notice) && <div role={pageError || noticeIsError ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm ${pageError || noticeIsError ? 'border-danger/30 bg-danger/5 text-danger' : 'border-border bg-surface-subtle text-foreground'}`}><AlertCircle className={`mt-0.5 size-4 shrink-0 ${pageError || noticeIsError ? 'text-danger' : 'text-muted-foreground'}`}/><span>{pageError || notice}</span></div>}
    <div className="workspace-surface"><div className="overflow-x-auto"><div className="min-w-[760px]"><div className="document-table-head grid grid-cols-[minmax(220px,1fr)_120px_100px_130px_120px] gap-3 border-b border-border bg-surface-subtle px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Document</span><span>Project</span><span>Size</span><span>Processing</span><span>Added</span></div>
      {pageLoading ? <p className="py-10 text-center text-xs text-muted-foreground">Loading documents…</p> : visible.map((doc) => <div key={doc.id} className="document-row grid grid-cols-[minmax(220px,1fr)_120px_100px_130px_120px] items-center gap-3 border-b border-border px-4 py-3 last:border-0"><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-subtle text-muted-foreground"><FileText className="size-4"/></div><div className="min-w-0"><button type="button" onClick={() => void onOpen(doc.id)} disabled={doc.encrypted && !vaultUnlocked} title={doc.encrypted && !vaultUnlocked ? 'Unlock the vault in Settings to open this document.' : `Open ${doc.title}`} className="document-title max-w-full truncate text-left text-[13px] font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-60">{doc.title}</button><p className="truncate text-[10px] text-muted-foreground">{doc.originalName} · {doc.extension.replace('.', '').toUpperCase()}</p>{doc.encrypted ? <p className="mt-1 text-[10px] text-warning">Encrypted at rest · excluded from search</p> : doc.extractionError && <p title={doc.extractionError} className="mt-1 line-clamp-2 text-[10px] text-warning">{doc.extractionError}</p>}</div></div><span className="truncate text-[11px] text-muted-foreground">{projectNames[doc.projectId ?? ''] ?? 'Unassigned'}</span><span className="text-[11px] tabular-nums text-muted-foreground">{formatBytes(doc.sizeBytes)}</span><Badge variant={doc.encrypted ? 'warning' : statusVariant[doc.status]}>{doc.encrypted ? 'Protected' : statusLabel[doc.status]}</Badge><span className="text-[11px] text-muted-foreground">{formatDate(doc.createdAt)}</span></div>)}
      {!pageLoading && !visible.length && !pageError && !noticeIsError && <div className="py-16 text-center"><FolderOpen className="mx-auto mb-3 size-6 text-muted-foreground"/><p className="text-sm font-medium">No documents yet</p><p className="mt-1 text-xs text-muted-foreground">Import PDFs, Word documents, spreadsheets, CSV, text or Markdown files. Enable vault encryption for confidential files.</p><Button className="mt-4" size="sm" onClick={() => void importFile()} disabled={busy}><Plus className="size-3.5"/>Import first document</Button></div>}
    </div></div></div>
    <PageControls offset={offset} limit={pageSize} total={total} disabled={pageLoading} onPageChange={setOffset} />
    <div className="flex items-start gap-2 text-[11px] text-muted-foreground"><HardDrive className="mt-0.5 size-3.5 shrink-0"/><span>Documents are processed on this device. Files protected with the vault stay encrypted at rest and are excluded from search and indexing. Scanned PDFs may require OCR.</span></div>
  </div>;
}
