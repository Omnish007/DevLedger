import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ActivityRecord, BackgroundJobRecord, PageResult } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PageControls } from '@/components/shared/PageControls';
import { formatDate, formatRelative, friendlyError } from '@/lib/utils';

const JOB_LABELS: Record<string, string> = {
    'search.rebuild': 'Search index rebuild',
    'storage.audit': 'Storage integrity audit',
    'maintenance.optimize': 'Database optimization',
    'document.extract': 'Document text extraction',
    'project.export': 'Project export',
    'project.import': 'Project import',
    'semantic.index': 'Semantic index build',
    'ai.summarize': 'AI summary',
    'notifications.deliver': 'Reminder delivery',
};

export function SettingsSystemTab() {
    const [activityOffset, setActivityOffset] = useState(0);
    const [jobsOffset, setJobsOffset] = useState(0);
    const [activityPage, setActivityPage] = useState<PageResult<ActivityRecord>>({
        items: [],
        total: 0,
        limit: 30,
        offset: 0,
        hasMore: false,
    });
    const [jobsPage, setJobsPage] = useState<PageResult<BackgroundJobRecord>>({
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
        hasMore: false,
    });
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');

    const refresh = useCallback(async () => {
        try {
            const [activity, jobs] = await Promise.all([
                window.devLedger.operations.listActivityPage({ limit: 30, offset: activityOffset }),
                window.devLedger.operations.listJobsPage({ limit: 25, offset: jobsOffset }),
            ]);
            setActivityPage(activity);
            setJobsPage(jobs);
            setError('');
        } catch (caught) {
            setError(friendlyError(caught, 'Workspace diagnostics could not be loaded.'));
        }
    }, [activityOffset, jobsOffset]);

    useEffect(() => {
        void refresh();
        const timer = window.setInterval(() => {
            void refresh();
        }, 3000);
        return () => window.clearInterval(timer);
    }, [refresh]);

    async function enqueue(kind: 'search.rebuild' | 'storage.audit' | 'maintenance.optimize') {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await window.devLedger.operations.enqueueJob(kind);
            setNotice(
                kind === 'search.rebuild'
                    ? 'Search index rebuild queued.'
                    : kind === 'storage.audit'
                      ? 'Document storage audit queued.'
                      : 'Database optimization queued.',
            );
            await refresh();
        } catch (caught) {
            setError(friendlyError(caught, 'Maintenance job could not be started.'));
        } finally {
            setBusy(false);
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
            {notice && (
                <p
                    role="status"
                    className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-foreground"
                >
                    {notice}
                </p>
            )}

            <section className="workspace-surface space-y-4 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/75 pb-3.5">
                    <div className="space-y-0.5">
                        <h2 className="text-sm font-semibold">Workspace maintenance & background jobs</h2>
                        <p className="text-muted-foreground">
                            Rebuild full-text indexes, verify document hashes, and optimize SQLite storage.
                        </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => void refresh()}>
                        <RefreshCw className="size-3.5" />
                        Refresh
                    </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/80 bg-surface-subtle/30 p-3.5">
                        <p className="text-muted-foreground">
                            Recreate FTS5 tables across notes, tasks, contacts, and documents.
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void enqueue('search.rebuild')}
                        >
                            Rebuild search index
                        </Button>
                    </div>
                    <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/80 bg-surface-subtle/30 p-3.5">
                        <p className="text-muted-foreground">
                            Verify SHA-256 object checksums for all imported files.
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void enqueue('storage.audit')}
                        >
                            Audit document storage
                        </Button>
                    </div>
                    <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/80 bg-surface-subtle/30 p-3.5">
                        <p className="text-muted-foreground">
                            Compact WAL frames and refresh SQLite query planner stats.
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void enqueue('maintenance.optimize')}
                        >
                            Optimize database
                        </Button>
                    </div>
                </div>

                {jobsPage.items.length ? (
                    <div className="divide-y divide-border/75 rounded-xl border border-border/80 bg-card">
                        {jobsPage.items.map((job) => {
                            const percent =
                                typeof job.progress['percent'] === 'number'
                                    ? Math.max(0, Math.min(100, job.progress['percent']))
                                    : null;
                            return (
                                <div key={job.id} className="space-y-1.5 px-4 py-3 text-xs">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                            {JOB_LABELS[job.kind] ?? job.kind}
                                        </span>
                                        <Badge
                                            variant={
                                                job.status === 'succeeded'
                                                    ? 'success'
                                                    : job.status === 'failed'
                                                      ? 'destructive'
                                                      : job.status === 'running'
                                                        ? 'warning'
                                                        : 'secondary'
                                            }
                                        >
                                            {job.status}
                                        </Badge>
                                        <span className="tabular-nums text-muted-foreground">
                                            Attempt {job.attempts}/{job.maxAttempts}
                                        </span>
                                        {(job.status === 'queued' || job.status === 'running') && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 text-xs"
                                                onClick={() =>
                                                    void window.devLedger.operations
                                                        .cancelJob(job.id)
                                                        .then(refresh)
                                                }
                                            >
                                                Cancel
                                            </Button>
                                        )}
                                    </div>
                                    {percent !== null && (
                                        <Progress value={percent} className="h-1.5 bg-surface-subtle" />
                                    )}
                                    {job.errorMessage && <p className="text-danger">{job.errorMessage}</p>}
                                    <p className="text-muted-foreground">
                                        Updated {formatRelative(job.updatedAt)}
                                        {job.completedAt ? ` · Completed ${formatDate(job.completedAt)}` : ''}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="py-2 text-center text-muted-foreground">No background jobs queued.</p>
                )}
                <PageControls
                    offset={jobsPage.offset}
                    limit={jobsPage.limit}
                    total={jobsPage.total}
                    onPageChange={setJobsOffset}
                    disabled={busy}
                />
            </section>

            <section className="workspace-surface space-y-4 p-6">
                <div className="flex items-center justify-between border-b border-border/75 pb-3.5">
                    <div className="space-y-0.5">
                        <h2 className="text-sm font-semibold">Activity history</h2>
                        <p className="text-muted-foreground">
                            Audit log of workspace edits, timers, blockers and maintenance runs.
                        </p>
                    </div>
                    <Badge variant="secondary" className="tabular-nums">
                        {activityPage.total}
                    </Badge>
                </div>
                {activityPage.items.length ? (
                    <div className="divide-y divide-border/75 rounded-xl border border-border/80 bg-surface-subtle/20">
                        {activityPage.items.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-start justify-between gap-3 px-4 py-3 text-xs"
                            >
                                <div className="min-w-0 space-y-0.5">
                                    <p className="font-medium text-foreground">{item.summary}</p>
                                    <p className="capitalize text-muted-foreground">
                                        {item.entityType} · {item.eventType.replaceAll('_', ' ')}
                                    </p>
                                </div>
                                <time className="shrink-0 tabular-nums text-muted-foreground">
                                    {formatRelative(item.createdAt)}
                                </time>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="py-6 text-center text-muted-foreground">
                        Activity appears here as you work.
                    </p>
                )}
                <PageControls
                    offset={activityPage.offset}
                    limit={activityPage.limit}
                    total={activityPage.total}
                    onPageChange={setActivityOffset}
                    disabled={busy}
                />
            </section>
        </div>
    );
}
