import { useCallback, useDeferredValue, useState } from 'react';
import { AlertCircle, ArrowUpRight, FileText, FolderOpen, Plus, RefreshCw } from 'lucide-react';
import type { DocumentRecord, WorkspaceNavigationTarget } from '@shared/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageControls } from '@/components/shared/PageControls';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SearchFilterInput } from '@/components/shared/SearchFilterInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useInitialProjectFilter } from '@/hooks/useInitialProjectFilter';
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch';
import { useProjectNames } from '@/hooks/useProjectNames';
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

const statusLabel: Record<DocumentRecord['status'], string> = {
    queued: 'Queued',
    extracting: 'Extracting',
    ocr_required: 'OCR required',
    indexed: 'Indexed',
    failed: 'Failed',
    needs_attention: 'Needs attention',
};
const statusVariant: Record<DocumentRecord['status'], 'secondary' | 'success' | 'warning' | 'destructive'> = {
    queued: 'secondary',
    extracting: 'secondary',
    ocr_required: 'warning',
    indexed: 'success',
    failed: 'destructive',
    needs_attention: 'warning',
};

const PAGE_SIZE = 40;

export function DocumentsPage({
    initialProjectId,
    onConsumeFocus,
    vaultUnlocked,
    onImport,
    onOpen,
    onNavigateTarget,
    refresh,
}: Props) {
    const { projectId, setProjectId, offset, setOffset } = useInitialProjectFilter(
        initialProjectId,
        'all',
        onConsumeFocus,
    );
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [noticeIsError, setNoticeIsError] = useState(false);
    const [protectWithVault, setProtectWithVault] = useState(false);
    const deferredQuery = useDeferredValue(query.trim());

    const fetchDocuments = useCallback(
        (requestedOffset: number) =>
            window.devLedger.documents.listPage({
                limit: PAGE_SIZE,
                offset: requestedOffset,
                query: deferredQuery,
                projectId: projectId === 'all' ? null : projectId,
            }),
        [deferredQuery, projectId],
    );

    const {
        items: visible,
        total,
        loading: pageLoading,
        error: pageError,
        loadPage,
    } = usePaginatedFetch({
        fetcher: fetchDocuments,
        offset,
        errorFallback: 'Documents could not be loaded.',
    });

    const { projectNames } = useProjectNames(visible.map((d) => d.projectId));

    async function importFile() {
        setBusy(true);
        setNotice('');
        setNoticeIsError(false);
        try {
            const res = await onImport(projectId === 'all' ? null : projectId, protectWithVault);
            if (res) setNotice(res);
            setOffset(0);
            await refresh();
            await loadPage(0);
        } catch (e) {
            setNotice(friendlyError(e, 'Document import failed.'));
            setNoticeIsError(true);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="workspace-page page-documents mx-auto space-y-5">
            <PageHeader
                title="Documents"
                description={total ? `${total} ${total === 1 ? 'document' : 'documents'}` : undefined}
                actions={
                    <>
                        <label
                            htmlFor="protect-document"
                            title={
                                vaultUnlocked
                                    ? 'Encrypt imported file with your vault key'
                                    : 'Unlock vault in Settings → Security to encrypt imported documents'
                            }
                            className="inline-flex min-h-8 items-center gap-2 px-1 text-xs text-muted-foreground"
                        >
                            <Checkbox
                                id="protect-document"
                                aria-label="Encrypt with vault"
                                checked={protectWithVault}
                                onCheckedChange={(c) => setProtectWithVault(c === true)}
                                disabled={!vaultUnlocked || busy}
                            />
                            <span>
                                Encrypt with vault
                                {!vaultUnlocked && (
                                    <span className="ml-1 text-muted-foreground/80">(Vault locked)</span>
                                )}
                            </span>
                        </label>
                        <Button
                            size="sm"
                            onClick={() => void importFile()}
                            disabled={busy || (protectWithVault && !vaultUnlocked)}
                        >
                            <Plus className="size-3.5" />
                            {busy ? 'Importing…' : 'Import document'}
                        </Button>
                    </>
                }
            />
            <div className="workspace-toolbar">
                <SearchFilterInput
                    className="min-w-[220px] max-w-md flex-1"
                    value={query}
                    onValueChange={(next) => {
                        setOffset(0);
                        setQuery(next);
                    }}
                    placeholder="Filter documents…"
                    aria-label="Filter documents by title or filename"
                    clearLabel="Clear document filter"
                />
                <RemoteRecordPicker
                    entityType="project"
                    value={projectId === 'all' ? '' : projectId}
                    onValueChange={(v) => {
                        setOffset(0);
                        setProjectId(v || 'all');
                    }}
                    placeholder="All projects"
                    selectedLabel={projectId === 'all' ? undefined : projectNames[projectId]}
                    className="w-48"
                />
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                        setNotice('');
                        setNoticeIsError(false);
                        void refresh()
                            .then(() => loadPage())
                            .catch((c: unknown) => {
                                setNotice(friendlyError(c, 'Documents could not be refreshed.'));
                                setNoticeIsError(true);
                            });
                    }}
                    aria-label="Refresh documents"
                    title="Refresh documents"
                >
                    <RefreshCw className="size-3.5" />
                </Button>
            </div>
            {(pageError || notice) && (
                <div
                    role={pageError || noticeIsError ? 'alert' : 'status'}
                    className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${pageError || noticeIsError ? 'border-danger/20 bg-danger-subtle text-danger-foreground' : 'border-border bg-surface-subtle text-foreground'}`}
                >
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{pageError || notice}</span>
                </div>
            )}

            <div className="workspace-surface overflow-x-auto">
                {pageLoading || visible.length > 0 ? (
                    <div className="min-w-[780px]">
                        <div className="grid grid-cols-[minmax(220px,1fr)_140px_84px_120px_104px_84px] gap-3 border-b border-border bg-surface-subtle px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>Document</span>
                            <span>Project</span>
                            <span>Size</span>
                            <span>Status</span>
                            <span>Added</span>
                            <span className="text-right">Action</span>
                        </div>
                        {pageLoading ? (
                            <p className="py-10 text-center text-xs text-muted-foreground">
                                Loading documents…
                            </p>
                        ) : (
                            visible.map((doc) => (
                                <div
                                    key={doc.id}
                                    className="document-row grid grid-cols-[minmax(220px,1fr)_140px_84px_120px_104px_84px] items-center gap-3 border-b border-border px-4 py-2.5 last:border-0"
                                >
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <button
                                                type="button"
                                                onClick={() => void onOpen(doc.id)}
                                                disabled={doc.encrypted && !vaultUnlocked}
                                                className="max-w-full truncate text-left text-sm font-medium hover:underline disabled:opacity-60"
                                            >
                                                {doc.title}
                                            </button>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {doc.originalName} ·{' '}
                                                {doc.extension.replace('.', '').toUpperCase()}
                                            </p>
                                        </div>
                                    </div>
                                    {doc.projectId ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onNavigateTarget({
                                                    view: 'projects',
                                                    recordId: doc.projectId!,
                                                })
                                            }
                                            className="min-h-6 truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
                                        >
                                            {projectNames[doc.projectId] ?? 'Project'}
                                        </button>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                        {formatBytes(doc.sizeBytes)}
                                    </span>
                                    <Badge variant={doc.encrypted ? 'warning' : statusVariant[doc.status]}>
                                        {doc.encrypted ? 'Protected' : statusLabel[doc.status]}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {formatDate(doc.createdAt)}
                                    </span>
                                    <div className="text-right">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2.5 text-xs"
                                            disabled={doc.encrypted && !vaultUnlocked}
                                            onClick={() => void onOpen(doc.id)}
                                        >
                                            Open <ArrowUpRight className="size-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    !pageError && (
                        <div className="py-14 text-center">
                            <FolderOpen className="mx-auto mb-2.5 size-5 text-muted-foreground" />
                            <p className="text-sm font-medium">No documents yet</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Import PDFs, Word docs, spreadsheets, CSV or Markdown files.
                            </p>
                            <Button
                                className="mt-4"
                                size="sm"
                                onClick={() => void importFile()}
                                disabled={busy}
                            >
                                <Plus className="size-3.5" />
                                Import first document
                            </Button>
                        </div>
                    )
                )}
            </div>

            <PageControls
                offset={offset}
                limit={PAGE_SIZE}
                total={total}
                disabled={pageLoading}
                onPageChange={setOffset}
            />
        </div>
    );
}
