import { PageHeader } from '@/components/shared/PageHeader';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Activity, AlarmClock, AlertCircle, BellRing, CheckCircle2, CircleAlert, Clock3, GitBranch, Inbox, Link2, Tags, Workflow } from 'lucide-react';
import type { ActivityRecord, BackgroundJobRecord, EntityLinkRecord, EntityType, NotificationRecord, PageResult, ReminderRecord, TagRecord, TaskBlockerRecord, TimeEntryRecord } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { friendlyError } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveSmartDateInstant } from '@domain/smart-date-resolution';
import { blockerFormSchema, emptyBlockerForm, emptyReminderForm, emptyTimeEntryForm, reminderFormSchema, timeEntryFormSchema, type BlockerFormValues, type ReminderFormValues, type TimeEntryFormValues } from './operation-form-schema';
import { OperationsLinksTab, OperationsTagsTab } from './OperationsTagsLinksTab';
import { OperationsBlockersTab, OperationsDependenciesTab } from './OperationsWorkflowTab';
import { OperationsRemindersTab, OperationsTimeTab } from './OperationsTimeScheduleTab';
import { OperationsActivityTab, OperationsInboxTab, OperationsJobsTab } from './OperationsSystemTab';

const OPERATIONS_PAGE_SIZE = 50;
function emptyPage<T>(): PageResult<T> { return { items: [], total: 0, limit: OPERATIONS_PAGE_SIZE, offset: 0, hasMore: false }; }
async function fetchClampedPage<T>(offset: number, fetch: (nextOffset: number) => Promise<PageResult<T>>): Promise<PageResult<T>> {
  const page = await fetch(offset);
  const lastOffset = page.total > 0 ? Math.floor((page.total - 1) / page.limit) * page.limit : 0;
  return offset > lastOffset ? fetch(lastOffset) : page;
}

type TabId = 'inbox' | 'tags' | 'links' | 'dependencies' | 'blockers' | 'reminders' | 'time' | 'activity' | 'jobs';
const tabs: Array<{ id: TabId; label: string; icon: typeof Tags }> = [
  { id: 'inbox', label: 'Inbox', icon: Inbox }, { id: 'tags', label: 'Tags', icon: Tags }, { id: 'links', label: 'Links', icon: Link2 },
  { id: 'dependencies', label: 'Dependencies', icon: GitBranch }, { id: 'blockers', label: 'Blockers', icon: CircleAlert },
  { id: 'reminders', label: 'Reminders', icon: AlarmClock }, { id: 'time', label: 'Time', icon: Clock3 }, { id: 'activity', label: 'Activity', icon: Activity }, { id: 'jobs', label: 'Background jobs', icon: Workflow },
];

export function OperationsPage() {
  const [tab, setTab] = useState<TabId>('tags');
  const [tagsPage, setTagsPage] = useState<PageResult<TagRecord>>(() => emptyPage());
  const [remindersPage, setRemindersPage] = useState<PageResult<ReminderRecord>>(() => emptyPage());
  const [tagOffset, setTagOffset] = useState(0); const [reminderOffset, setReminderOffset] = useState(0); const [tagSearch, setTagSearch] = useState(''); const [debouncedTagSearch, setDebouncedTagSearch] = useState('');
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]); const [hasMoreNotifications, setHasMoreNotifications] = useState(false); const [unreadCount, setUnreadCount] = useState(0); const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread' | 'read' | 'dismissed'>('all'); const [snoozeMinutes, setSnoozeMinutes] = useState<15 | 60 | 240 | 1440>(60);
  const [blockersPage, setBlockersPage] = useState<PageResult<TaskBlockerRecord>>(() => emptyPage());
  const [blockerOffset, setBlockerOffset] = useState(0); const [activityOffset, setActivityOffset] = useState(0); const [jobsOffset, setJobsOffset] = useState(0);
  const [activityPage, setActivityPage] = useState<PageResult<ActivityRecord>>(() => emptyPage());
  const [jobsPage, setJobsPage] = useState<PageResult<BackgroundJobRecord>>(() => emptyPage());
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [tagName, setTagName] = useState(''); const [tagColor, setTagColor] = useState('neutral'); const [tagType, setTagType] = useState<EntityType>('project'); const [tagRecordId, setTagRecordId] = useState(''); const [tagId, setTagId] = useState(''); const [selectedTagName, setSelectedTagName] = useState('');
  const [sourceType, setSourceType] = useState<EntityType>('note'); const [sourceId, setSourceId] = useState(''); const [targetType, setTargetType] = useState<EntityType>('task'); const [targetId, setTargetId] = useState(''); const [relation, setRelation] = useState('related'); const [linksPage, setLinksPage] = useState<PageResult<EntityLinkRecord>>(() => emptyPage()); const [linksOffset, setLinksOffset] = useState(0);
  const [taskId, setTaskId] = useState(''); const [prerequisiteId, setPrerequisiteId] = useState(''); const [dependsOnOffset, setDependsOnOffset] = useState(0); const [blocksOffset, setBlocksOffset] = useState(0); const [dependencyData, setDependencyData] = useState<{ dependsOn: PageResult<string>; blocks: PageResult<string> }>({ dependsOn: emptyPage(), blocks: emptyPage() });
  const blockerForm = useForm<BlockerFormValues>({ resolver: zodResolver(blockerFormSchema), defaultValues: emptyBlockerForm });
  const reminderForm = useForm<ReminderFormValues>({ resolver: zodResolver(reminderFormSchema), defaultValues: emptyReminderForm });
  const timeEntryForm = useForm<TimeEntryFormValues>({ resolver: zodResolver(timeEntryFormSchema), defaultValues: emptyTimeEntryForm });
  const [timeTaskId, setTimeTaskId] = useState(''); const [editingTimeEntryId, setEditingTimeEntryId] = useState<string | null>(null);
  const [timeEntriesPage, setTimeEntriesPage] = useState<PageResult<TimeEntryRecord>>(() => emptyPage()); const [timeOffset, setTimeOffset] = useState(0);
  const tags = tagsPage.items; const blockers = blockersPage.items;

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedTagSearch(tagSearch), 250); return () => window.clearTimeout(timer); }, [tagSearch]);

  const refresh = useCallback(async () => {
    const [tagRows, reminderRows, blockerRows, activityRows, jobRows, notificationRows, unread] = await Promise.all([
      fetchClampedPage(tagOffset, (offset) => window.devLedger.operations.listTagsPage({ limit: OPERATIONS_PAGE_SIZE, offset, query: debouncedTagSearch })),
      fetchClampedPage(reminderOffset, (offset) => window.devLedger.operations.listRemindersPage({ limit: OPERATIONS_PAGE_SIZE, offset })),
      fetchClampedPage(blockerOffset, (offset) => window.devLedger.operations.listBlockersPage({ limit: OPERATIONS_PAGE_SIZE, offset })),
      fetchClampedPage(activityOffset, (offset) => window.devLedger.operations.listActivityPage({ limit: OPERATIONS_PAGE_SIZE, offset })),
      fetchClampedPage(jobsOffset, (offset) => window.devLedger.operations.listJobsPage({ limit: OPERATIONS_PAGE_SIZE, offset })),
      window.devLedger.notifications.list(notificationFilter, 100), window.devLedger.notifications.unreadCount(),
    ]);
    if (tagRows.offset !== tagOffset) setTagOffset(tagRows.offset);
    if (reminderRows.offset !== reminderOffset) setReminderOffset(reminderRows.offset);
    if (blockerRows.offset !== blockerOffset) setBlockerOffset(blockerRows.offset);
    if (activityRows.offset !== activityOffset) setActivityOffset(activityRows.offset);
    if (jobRows.offset !== jobsOffset) setJobsOffset(jobRows.offset);
    setTagsPage(tagRows); setRemindersPage(reminderRows); setBlockersPage(blockerRows); setActivityPage(activityRows); setJobsPage(jobRows); setNotifications(notificationRows); setHasMoreNotifications(notificationRows.length === 100); setUnreadCount(unread);
  }, [notificationFilter, tagOffset, reminderOffset, blockerOffset, activityOffset, jobsOffset, debouncedTagSearch]);

  useEffect(() => { void refresh().catch((cause: unknown) => setError(friendlyError(cause, 'Workspace operations could not be loaded.'))); }, [refresh]);
  useEffect(() => {
    if (tab !== 'jobs') return;
    const timer = window.setInterval(() => { void fetchClampedPage(jobsOffset, (offset) => window.devLedger.operations.listJobsPage({ limit: OPERATIONS_PAGE_SIZE, offset })).then(setJobsPage).catch(() => undefined); }, 2_000);
    return () => window.clearInterval(timer);
  }, [tab, jobsOffset]);
  useEffect(() => {
    const selected = tags.find((item) => item.id === tagId);
    if (selected) setSelectedTagName(selected.name);
    else if (!tagId && tags.length) { setTagId(tags[0]!.id); setSelectedTagName(tags[0]!.name); }
  }, [tags, tagId]);
  useEffect(() => {
    let current = true;
    if (!timeTaskId) { setTimeEntriesPage(emptyPage()); return () => { current = false; }; }
    void fetchClampedPage(timeOffset, (offset) => window.devLedger.operations.listTimeEntriesPage(timeTaskId, { limit: OPERATIONS_PAGE_SIZE, offset })).then((rows) => { if (current) { if (rows.offset !== timeOffset) setTimeOffset(rows.offset); setTimeEntriesPage(rows); } }).catch((cause: unknown) => { if (current) setError(friendlyError(cause, 'Time entries are unavailable.')); });
    return () => { current = false; };
  }, [timeTaskId, timeOffset]);
  useEffect(() => {
    let current = true;
    if (!taskId) { setDependencyData({ dependsOn: emptyPage(), blocks: emptyPage() }); return () => { current = false; }; }
    void window.devLedger.operations.listDependencies(taskId, { dependsOn: { limit: OPERATIONS_PAGE_SIZE, offset: dependsOnOffset }, blocks: { limit: OPERATIONS_PAGE_SIZE, offset: blocksOffset } }).then((result) => {
      if (!current) return;
      setDependencyData(result);
      const clamp = (page: PageResult<string>) => page.total > 0 ? Math.floor((page.total - 1) / page.limit) * page.limit : 0;
      if (clamp(result.dependsOn) !== dependsOnOffset) setDependsOnOffset(clamp(result.dependsOn));
      if (clamp(result.blocks) !== blocksOffset) setBlocksOffset(clamp(result.blocks));
    }).catch((cause: unknown) => { if (current) setError(friendlyError(cause, 'Dependencies could not be loaded.')); });
    return () => { current = false; };
  }, [taskId, dependsOnOffset, blocksOffset]);
  useEffect(() => {
    let current = true;
    const ids = [...new Set([...dependencyData.dependsOn.items, ...dependencyData.blocks.items, ...blockers.map((item) => item.taskId)])].slice(0, 200);
    if (!ids.length) { setTaskTitles({}); return () => { current = false; }; }
    void window.devLedger.tasks.getTitles(ids).then((titles) => { if (current) setTaskTitles(titles); }).catch((cause: unknown) => { if (current) setError(friendlyError(cause, 'Task labels could not be loaded.')); });
    return () => { current = false; };
  }, [dependencyData, blockers]);

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await refresh(); setNotice(success); }
    catch (cause) { setError(friendlyError(cause, 'The operation failed.')); }
    finally { setBusy(false); }
  }
  async function loadMoreNotifications() {
    const last = notifications.at(-1);
    if (!last || busy) return;
    setBusy(true); setError('');
    try {
      const more = await window.devLedger.notifications.list(notificationFilter, 100, { createdAt: last.createdAt, id: last.id });
      setNotifications((current) => [...current, ...more.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setHasMoreNotifications(more.length === 100);
    } catch (caught) { setError(friendlyError(caught, 'More notifications could not be loaded.')); }
    finally { setBusy(false); }
  }
  const localDateTime = (value: string) => { const date = new Date(value); if (!Number.isFinite(date.getTime())) return ''; const pad = (part: number) => String(part).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; };
  async function loadLinks(requestedOffset = linksOffset) {
    if (!sourceId) return;
    try { const page = await fetchClampedPage(requestedOffset, (offset) => window.devLedger.operations.listLinksPage(sourceType, sourceId, { limit: OPERATIONS_PAGE_SIZE, offset })); if (page.offset !== linksOffset) setLinksOffset(page.offset); setLinksPage(page); setError(''); }
    catch (cause) { setError(friendlyError(cause, 'Links could not be loaded.')); }
  }
  async function reloadDependencies() {
    if (!taskId) return;
    const result = await window.devLedger.operations.listDependencies(taskId, { dependsOn: { limit: OPERATIONS_PAGE_SIZE, offset: dependsOnOffset }, blocks: { limit: OPERATIONS_PAGE_SIZE, offset: blocksOffset } });
    setDependencyData(result);
  }
  async function loadTime() {
    if (!timeTaskId) return;
    try { const page = await fetchClampedPage(timeOffset, (offset) => window.devLedger.operations.listTimeEntriesPage(timeTaskId, { limit: OPERATIONS_PAGE_SIZE, offset })); if (page.offset !== timeOffset) setTimeOffset(page.offset); setTimeEntriesPage(page); }
    catch (cause) { setError(friendlyError(cause, 'Time entries could not be loaded.')); }
  }
  const submitBlocker = blockerForm.handleSubmit((values) => {
    let followUp: string | null = null;
    try { followUp = values.followUpAt.trim() ? resolveSmartDateInstant(values.followUpAt).isoUtc : null; }
    catch (caught) { blockerForm.setError('followUpAt', { message: friendlyError(caught, 'Enter a valid follow-up date.') }); return; }
    void perform(async () => { await window.devLedger.operations.createBlocker(values.taskId, values.reason, values.waitingContactId || null, followUp); blockerForm.reset(emptyBlockerForm); }, 'Blocker recorded; task marked blocked.');
  });
  const submitReminder = reminderForm.handleSubmit((values) => {
    let dueAt: string;
    try { dueAt = resolveSmartDateInstant(values.dueAt).isoUtc; }
    catch (caught) { reminderForm.setError('dueAt', { message: friendlyError(caught, 'Choose a valid reminder date.') }); return; }
    void perform(async () => { await window.devLedger.operations.createReminder(values.entityType, values.recordId, dueAt, values.message); reminderForm.reset({ ...emptyReminderForm, entityType: values.entityType }); }, 'Reminder scheduled.');
  });
  const submitTimeEntry = timeEntryForm.handleSubmit((values) => {
    const startedAt = new Date(values.startedAt).toISOString(); const endedAt = new Date(values.endedAt).toISOString();
    void perform(async () => {
      if (editingTimeEntryId) await window.devLedger.operations.updateTimeEntry(editingTimeEntryId, startedAt, endedAt, values.note);
      else await window.devLedger.operations.addManualTimeEntry(timeTaskId, startedAt, endedAt, values.note);
      setEditingTimeEntryId(null); timeEntryForm.reset(emptyTimeEntryForm); await loadTime();
    }, editingTimeEntryId ? 'Time entry corrected and logged.' : 'Time entry saved.');
  });

  return <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)} className="workspace-page page-operations mx-auto"><div className="space-y-5">
    <PageHeader title="Operations" description="Manage tags, linked records, dependencies, blockers, reminders and work history." actions={<div className="flex flex-wrap gap-1.5"><Badge variant={unreadCount > 0 ? 'warning' : 'outline'} className="gap-1"><BellRing className="size-3" />{unreadCount} unread</Badge><Badge variant={blockersPage.total > 0 ? 'warning' : 'outline'} className="gap-1"><CircleAlert className="size-3" />{blockersPage.total} blockers</Badge></div>} />
    <TabsList className="operations-nav h-auto w-full flex-wrap justify-start rounded-xl border border-border bg-card p-1.5 shadow-sm">
      {tabs.map((item) => { const Icon = item.icon; return <TabsTrigger key={item.id} value={item.id} className="h-8 gap-1.5 px-2.5"><Icon className="size-3.5" />{item.label}{item.id === 'inbox' && unreadCount > 0 && <Badge variant="warning" className="ml-0.5 px-1.5 py-0">{unreadCount}</Badge>}{item.id === 'blockers' && blockersPage.total > 0 && <Badge variant="secondary" className="ml-0.5 px-1.5 py-0">{blockersPage.total}</Badge>}</TabsTrigger>; })}
    </TabsList>
    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-xs text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div>}
    {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 px-3.5 py-2.5 text-xs text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span>{notice}</span></div>}
    <TabsContent value={tab} className="mt-0">
      {tab === 'inbox' && <OperationsInboxTab notifications={notifications} hasMoreNotifications={hasMoreNotifications} unreadCount={unreadCount} notificationFilter={notificationFilter} snoozeMinutes={snoozeMinutes} busy={busy} onFilterChange={setNotificationFilter} onMarkAllRead={() => void perform(() => window.devLedger.notifications.markAllRead(), 'All notifications marked as read.')} onSnooze={(id) => void perform(() => window.devLedger.notifications.snooze(id, snoozeMinutes), `Reminder snoozed for ${snoozeMinutes} minutes.`)} onMarkRead={(id) => void perform(() => window.devLedger.notifications.markRead(id), 'Notification marked as read.')} onDismiss={(id) => void perform(() => window.devLedger.notifications.dismiss(id), 'Notification dismissed.')} onLoadMore={() => void loadMoreNotifications()} onRefresh={() => void refresh().catch((cause: unknown) => setError(friendlyError(cause, 'Inbox could not be refreshed.')))} />}
      {tab === 'tags' && <OperationsTagsTab tagsPage={tagsPage} tagName={tagName} tagColor={tagColor} tagSearch={tagSearch} tagType={tagType} tagRecordId={tagRecordId} tagId={tagId} selectedTagName={selectedTagName} busy={busy} onTagNameChange={setTagName} onTagColorChange={setTagColor} onTagSearchChange={(value) => { setTagOffset(0); setTagSearch(value); }} onTagTypeChange={(value) => { setTagType(value); setTagRecordId(''); }} onTagRecordChange={setTagRecordId} onTagSelect={(id, name) => { setTagId(id); setSelectedTagName(name); }} onTagOffsetChange={setTagOffset} onCreateTag={() => void perform(async () => { const row = await window.devLedger.operations.createTag(tagName, tagColor); setTagId(row.id); setSelectedTagName(row.name); setTagName(''); setTagSearch(''); setTagOffset(0); }, 'Tag saved.')} onDeleteTag={(tag) => void perform(async () => { await window.devLedger.operations.deleteTag(tag.id); if (tagId === tag.id) { setTagId(''); setSelectedTagName(''); } }, 'Tag deleted.')} onAssignTag={() => void perform(() => window.devLedger.operations.assignTag(tagType, tagRecordId, tagId), 'Tag assigned.')} />}
      {tab === 'links' && <OperationsLinksTab sourceType={sourceType} sourceId={sourceId} targetType={targetType} targetId={targetId} relation={relation} linksPage={linksPage} busy={busy} onSourceTypeChange={(value) => { setSourceType(value); setSourceId(''); setLinksOffset(0); setLinksPage(emptyPage()); }} onSourceIdChange={(value) => { setSourceId(value); setLinksOffset(0); setLinksPage(emptyPage()); }} onTargetTypeChange={(value) => { setTargetType(value); setTargetId(''); }} onTargetIdChange={setTargetId} onRelationChange={setRelation} onCreateLink={() => void perform(async () => { await window.devLedger.operations.createLink(sourceType, sourceId, targetType, targetId, relation); await loadLinks(0); }, 'Records linked bidirectionally.')} onLoadLinks={(offset) => void loadLinks(offset)} onRemoveLink={(id) => void perform(async () => { await window.devLedger.operations.removeLink(id); await loadLinks(); }, 'Link removed.')} />}
      {tab === 'dependencies' && <OperationsDependenciesTab taskId={taskId} prerequisiteId={prerequisiteId} dependencyData={dependencyData} taskTitles={taskTitles} busy={busy} onTaskIdChange={(value) => { setTaskId(value); setDependsOnOffset(0); setBlocksOffset(0); }} onPrerequisiteIdChange={setPrerequisiteId} onAddDependency={() => void perform(async () => { await window.devLedger.operations.addDependency(taskId, prerequisiteId); await reloadDependencies(); }, 'Dependency added.')} onRemoveDependency={(dependentId, prereqId) => void perform(async () => { await window.devLedger.operations.removeDependency(dependentId, prereqId); await reloadDependencies(); }, 'Dependency removed.')} onDependsOnOffsetChange={setDependsOnOffset} onBlocksOffsetChange={setBlocksOffset} />}
      {tab === 'blockers' && <OperationsBlockersTab blockerForm={blockerForm} blockersPage={blockersPage} taskTitles={taskTitles} busy={busy} onSubmit={submitBlocker} onResolve={(id) => void perform(() => window.devLedger.operations.resolveBlocker(id, 'Resolved from operations.'), 'Blocker resolved.')} onOffsetChange={setBlockerOffset} />}
      {tab === 'reminders' && <OperationsRemindersTab reminderForm={reminderForm} remindersPage={remindersPage} snoozeMinutes={snoozeMinutes} busy={busy} onSnoozeMinutesChange={setSnoozeMinutes} onSubmit={submitReminder} onSnooze={(id) => void perform(() => window.devLedger.operations.updateReminder(id, 'snooze', undefined, snoozeMinutes), 'Reminder snoozed.')} onDismiss={(id) => void perform(() => window.devLedger.operations.updateReminder(id, 'dismiss'), 'Reminder dismissed.')} onOffsetChange={setReminderOffset} />}
      {tab === 'time' && <OperationsTimeTab timeTaskId={timeTaskId} editingTimeEntryId={editingTimeEntryId} timeEntryForm={timeEntryForm} timeEntriesPage={timeEntriesPage} busy={busy} onTaskChange={(value) => { setTimeTaskId(value); setTimeOffset(0); setEditingTimeEntryId(null); timeEntryForm.reset(emptyTimeEntryForm); }} onSubmit={submitTimeEntry} onCancelEdit={() => { setEditingTimeEntryId(null); timeEntryForm.reset(emptyTimeEntryForm); }} onBeginEdit={(entry) => { setEditingTimeEntryId(entry.id); timeEntryForm.reset({ startedAt: localDateTime(entry.startedAt), endedAt: localDateTime(entry.endedAt ?? ''), note: entry.note }); }} onDeleteEntry={(id) => void perform(async () => { await window.devLedger.operations.deleteTimeEntry(id); await loadTime(); }, 'Time entry removed.')} onOffsetChange={setTimeOffset} />}
      {tab === 'activity' && <OperationsActivityTab activityPage={activityPage} busy={busy} onOffsetChange={setActivityOffset} />}
      {tab === 'jobs' && <OperationsJobsTab jobsPage={jobsPage} busy={busy} onRefresh={() => void refresh().catch((cause: unknown) => setError(friendlyError(cause, 'Job status could not be refreshed.')))} onEnqueue={(kind) => void perform(() => window.devLedger.operations.enqueueJob(kind), kind === 'search.rebuild' ? 'Search index rebuild queued.' : kind === 'storage.audit' ? 'Document storage audit queued.' : 'Database optimization queued.')} onCancel={(id) => void perform(() => window.devLedger.operations.cancelJob(id), 'Cancellation requested.')} onOffsetChange={setJobsOffset} />}
    </TabsContent>
  </div></Tabs>;
}
