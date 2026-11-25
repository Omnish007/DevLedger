import { Activity, BellRing, RefreshCw, Workflow } from 'lucide-react';
import type { ActivityRecord, BackgroundJobRecord, NotificationRecord, PageResult } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatDate, formatRelative } from '@/lib/utils';
import { PageControls } from '@/components/shared/PageControls';

interface InboxTabProps {
  notifications: NotificationRecord[];
  hasMoreNotifications: boolean;
  unreadCount: number;
  notificationFilter: 'all' | 'unread' | 'read' | 'dismissed';
  snoozeMinutes: 15 | 60 | 240 | 1440;
  busy: boolean;
  onFilterChange: (filter: 'all' | 'unread' | 'read' | 'dismissed') => void;
  onMarkAllRead: () => void;
  onSnooze: (id: string) => void;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}

export function OperationsInboxTab({
  notifications, hasMoreNotifications, unreadCount, notificationFilter, snoozeMinutes, busy,
  onFilterChange, onMarkAllRead, onSnooze, onMarkRead, onDismiss, onLoadMore, onRefresh,
}: InboxTabProps) {
  return (
    <section className="workspace-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground"><BellRing className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Notification inbox</h3>
          <p className="text-xs text-muted-foreground">Reminder delivery history stays here even when desktop notifications are unavailable.</p>
        </div>
        <Badge variant={unreadCount ? 'warning' : 'secondary'}>{unreadCount} unread</Badge>
        <Button size="sm" variant="outline" disabled={busy || !unreadCount} onClick={onMarkAllRead}>Mark all read</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'unread', 'read', 'dismissed'] as const).map((filter) => (
            <Button key={filter} size="sm" variant={notificationFilter === filter ? 'secondary' : 'outline'} onClick={() => onFilterChange(filter)}>
              {filter[0]!.toUpperCase() + filter.slice(1)}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRefresh}><RefreshCw className="size-3.5" />Refresh inbox</Button>
      </div>

      {notifications.length ? (
        <div className="divide-y divide-border">
          {notifications.map((item) => (
            <article key={item.id} className="flex flex-wrap items-start gap-3 py-3.5 first:pt-0 last:pb-0">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.status === 'unread' ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold">{item.title}</p>
                  <Badge variant={item.kind === 'backup' ? 'warning' : 'outline'}>{item.kind}</Badge>
                  <Badge variant="secondary">{item.status}</Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{item.entityType} · {formatRelative(item.deliveredAt)}</p>
              </div>
              <div className="flex gap-1">
                {item.kind === 'reminder' && item.reminderId && item.status !== 'dismissed' && (
                  <Button size="sm" variant="outline" title={`Snooze for ${snoozeMinutes} minutes`} onClick={() => onSnooze(item.id)}>Snooze</Button>
                )}
                {item.status === 'unread' && <Button size="sm" variant="outline" onClick={() => onMarkRead(item.id)}>Mark read</Button>}
                {item.status !== 'dismissed' && <Button size="sm" variant="ghost" onClick={() => onDismiss(item.id)}>Dismiss</Button>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <BellRing className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-xs font-medium">No notifications in this filter</p>
          <p className="mt-1 text-[11px] text-muted-foreground">New reminders and backup alerts will appear here when due.</p>
        </div>
      )}
      {hasMoreNotifications && <div className="mt-4 flex justify-end"><Button size="sm" variant="outline" disabled={busy} onClick={onLoadMore}>Load more</Button></div>}
    </section>
  );
}

export function OperationsActivityTab({ activityPage, busy, onOffsetChange }: { activityPage: PageResult<ActivityRecord>; busy: boolean; onOffsetChange: (offset: number) => void }) {
  const activity = activityPage.items;
  return (
    <section className="workspace-surface p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground"><Activity className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Workspace activity</h3>
          <p className="text-xs text-muted-foreground">Audit log of created, updated, and archived workspace records.</p>
        </div>
        <Badge variant="secondary">{activityPage.total}</Badge>
      </div>
      {activity.length ? (
        <div className="divide-y divide-border">
          {activity.map((item) => (
            <div key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{item.summary}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{item.entityType} · {item.eventType}</p>
              </div>
              <time className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(item.createdAt)}</time>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-xs text-muted-foreground">Activity appears here as you work.</div>
      )}
      <PageControls offset={activityPage.offset} limit={activityPage.limit} total={activityPage.total} onPageChange={onOffsetChange} disabled={busy} className="mt-4 border-t border-border pt-3" />
    </section>
  );
}

interface JobsTabProps {
  jobsPage: PageResult<BackgroundJobRecord>;
  busy: boolean;
  onRefresh: () => void;
  onEnqueue: (kind: 'search.rebuild' | 'storage.audit' | 'maintenance.optimize') => void;
  onCancel: (id: string) => void;
  onOffsetChange: (offset: number) => void;
}

export function OperationsJobsTab({ jobsPage, busy, onRefresh, onEnqueue, onCancel, onOffsetChange }: JobsTabProps) {
  const jobs = jobsPage.items;
  return (
    <section className="workspace-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground"><Workflow className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Persistent background jobs</h3>
          <p className="text-xs text-muted-foreground">Covers document extraction, semantic indexing, AI summaries, and project archives.</p>
        </div>
        <Badge variant="secondary">{jobsPage.total}</Badge>
        <Button size="sm" variant="outline" onClick={onRefresh}><RefreshCw className="size-3.5" />Refresh</Button>
      </div>
      <div className="mb-5 flex flex-wrap gap-2 rounded-lg border border-border/80 bg-surface-subtle/30 p-3">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onEnqueue('search.rebuild')}>Rebuild search index</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onEnqueue('storage.audit')}>Audit document storage</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onEnqueue('maintenance.optimize')}>Optimize database</Button>
      </div>
      {jobs.length ? (
        <div className="divide-y divide-border">
          {jobs.map((job) => {
            const percent = typeof job.progress.percent === 'number' ? Math.max(0, Math.min(100, job.progress.percent)) : null;
            return (
              <article key={job.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{job.kind} · {job.targetType}</span>
                  <Badge variant={job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'destructive' : job.status === 'running' ? 'warning' : 'secondary'}>{job.status}</Badge>
                  <span className="text-[10px] text-muted-foreground">Attempt {job.attempts}/{job.maxAttempts}</span>
                  {(job.status === 'queued' || job.status === 'running') && <Button size="sm" variant="ghost" onClick={() => onCancel(job.id)}>Cancel</Button>}
                </div>
                {percent !== null && <Progress value={percent} aria-label={`Job progress ${percent}%`} className="mt-2 h-1.5 bg-surface-subtle" />}
                {typeof job.progress.phase === 'string' && <p className="mt-1 text-[10px] text-muted-foreground">{job.progress.phase.replaceAll('-', ' ')}{percent !== null ? ` · ${percent}%` : ''}</p>}
                {job.result && <p className="mt-1 break-words text-[10px] text-muted-foreground">{Object.entries(job.result).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`).join(' · ').slice(0, 500)}</p>}
                {job.errorMessage && <p className="mt-2 rounded-md border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-[11px] text-danger">{job.errorMessage}</p>}
                <p className="mt-1 text-[10px] text-muted-foreground">Updated {formatRelative(job.updatedAt)}{job.completedAt ? ` · Completed ${formatDate(job.completedAt)}` : ''}</p>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-xs text-muted-foreground">No background jobs have been queued.</div>
      )}
      <PageControls offset={jobsPage.offset} limit={jobsPage.limit} total={jobsPage.total} onPageChange={onOffsetChange} disabled={busy} className="mt-4 border-t border-border pt-3" />
    </section>
  );
}
