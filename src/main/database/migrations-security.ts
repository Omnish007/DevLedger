export const SECURITY_MIGRATIONS = [
    {
        version: 12,
        sql: `
      ALTER TABLE time_entries ADD COLUMN recovery_acknowledged_at TEXT;
      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        reminder_id TEXT REFERENCES reminders(id) ON DELETE SET NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('task', 'project', 'contact', 'note', 'system')),
        entity_id TEXT,
        kind TEXT NOT NULL CHECK(kind IN ('reminder', 'backup', 'system')),
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'dismissed')),
        created_at TEXT NOT NULL,
        delivered_at TEXT NOT NULL,
        read_at TEXT,
        dismissed_at TEXT
      );
      CREATE INDEX notifications_status_created_idx ON notifications(status, created_at DESC);
      CREATE INDEX notifications_entity_idx ON notifications(entity_type, entity_id, created_at DESC);
    `,
    },
    {
        version: 13,
        sql: `
      ALTER TABLE time_entries ADD COLUMN active_session_id TEXT;
      ALTER TABLE time_entries ADD COLUMN heartbeat_at TEXT;
      CREATE INDEX time_entries_active_session_idx ON time_entries(active_session_id) WHERE is_active = 1;
    `,
    },
    {
        version: 14,
        sql: `
      -- Support workspace-wide paginated list screens without requiring full table scans.
      CREATE INDEX contacts_name_nocase_idx ON contacts(name COLLATE NOCASE) WHERE deleted_at IS NULL;
      CREATE INDEX project_contacts_contact_id_idx ON project_contacts(contact_id, project_id);
      CREATE INDEX notes_updated_idx ON notes(updated_at DESC) WHERE deleted_at IS NULL AND locked = 0;
      CREATE INDEX documents_updated_idx ON documents(updated_at DESC) WHERE deleted_at IS NULL;
      CREATE INDEX tasks_due_date_updated_idx ON tasks(due_date, due_at, created_at) WHERE deleted_at IS NULL;
    `,
    },
    {
        version: 15,
        sql: `
      -- Stable, indexed ordering for bounded Operations feed pages.
      CREATE INDEX blockers_queue_page_idx
        ON task_blockers(coalesce(follow_up_at, created_at), id);
      CREATE INDEX reminders_due_page_idx ON reminders(status, due_at, id);
      CREATE INDEX time_entries_task_page_idx ON time_entries(task_id, started_at DESC, id DESC);
    `,
    },
    {
        version: 16,
        sql: `
      -- Unified chronological Notes list includes protected-note metadata without exposing encrypted content.
      CREATE INDEX notes_all_updated_idx ON notes(updated_at DESC, id DESC) WHERE deleted_at IS NULL;
    `,
    },
    {
        version: 17,
        sql: `
      -- Stable ordering for load-more history in the Operations activity and job views.
      CREATE INDEX activity_events_history_page_idx ON activity_events(created_at DESC, id DESC);
      CREATE INDEX background_jobs_history_page_idx ON background_jobs(created_at DESC, id DESC);
    `,
    },
    {
        version: 18,
        sql: `
      -- The inbox has both an unfiltered chronological view and status-filtered history.
      CREATE INDEX notifications_history_page_idx ON notifications(created_at DESC, id DESC);
      CREATE INDEX notifications_status_history_page_idx ON notifications(status, created_at DESC, id DESC);
    `,
    },
    {
        version: 19,
        sql: `
      -- Align relationship lookup indexes with bounded, deterministic relationship pages.
      CREATE INDEX entity_links_source_page_idx
        ON entity_links(source_type, source_id, created_at DESC, id DESC);
      DROP INDEX IF EXISTS entity_links_target_idx;
      CREATE INDEX entity_links_target_page_idx
        ON entity_links(target_type, target_id, created_at DESC, id DESC);
      DROP INDEX IF EXISTS task_dependencies_reverse_idx;
      DROP INDEX IF EXISTS task_dependencies_pair_idx;
      CREATE INDEX task_dependencies_reverse_page_idx
        ON task_dependencies(depends_on_task_id, task_id);
    `,
    },
];
