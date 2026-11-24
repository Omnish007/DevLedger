export const RELATION_MIGRATIONS = [
  {
    version: 2,
    sql: `
      CREATE TABLE vault_metadata (
        singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
        pass_salt TEXT NOT NULL, pass_nonce TEXT NOT NULL, pass_wrapped_key TEXT NOT NULL, pass_tag TEXT NOT NULL,
        recovery_salt TEXT NOT NULL, recovery_nonce TEXT NOT NULL, recovery_wrapped_key TEXT NOT NULL, recovery_tag TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 3,
    sql: `
      INSERT INTO note_search(note_search, rank) VALUES('secure-delete', 1);
      INSERT INTO task_search(task_search, rank) VALUES('secure-delete', 1);
      INSERT INTO document_search(document_search, rank) VALUES('secure-delete', 1);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE task_blockers (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 4000),
        waiting_contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
        follow_up_at TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution_note TEXT NOT NULL DEFAULT ''
      );
      CREATE UNIQUE INDEX one_open_blocker_per_task_idx ON task_blockers(task_id) WHERE resolved_at IS NULL;
      CREATE INDEX blockers_followup_idx ON task_blockers(follow_up_at) WHERE resolved_at IS NULL;

      CREATE TABLE background_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 5 CHECK(priority BETWEEN 0 AND 10),
        status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
        max_attempts INTEGER NOT NULL DEFAULT 4 CHECK(max_attempts BETWEEN 1 AND 20),
        progress_json TEXT NOT NULL DEFAULT '{}',
        error_message TEXT,
        idempotency_key TEXT UNIQUE,
        available_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX background_jobs_queue_idx ON background_jobs(status, available_at ASC, priority DESC, created_at ASC);
      CREATE INDEX background_jobs_target_idx ON background_jobs(target_type, target_id, created_at DESC);

      CREATE TABLE entity_trash (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        restore_until TEXT,
        snapshot_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX entity_trash_deleted_idx ON entity_trash(deleted_at DESC);

      CREATE INDEX reminders_entity_status_idx ON reminders(entity_type, entity_id, status);
      CREATE INDEX task_dependencies_pair_idx ON task_dependencies(task_id, depends_on_task_id);
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE ai_summary_cache (
        cache_key TEXT PRIMARY KEY,
        normalized_query TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        summary TEXT NOT NULL,
        citations_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX ai_summary_cache_created_idx ON ai_summary_cache(created_at DESC);
    `,
  },
  {
    version: 6,
    sql: `
      CREATE VIRTUAL TABLE contact_search USING fts5(contact_id UNINDEXED, name, company, role, email, phone, notes, tokenize='unicode61 remove_diacritics 2');
      CREATE TRIGGER contacts_search_insert AFTER INSERT ON contacts WHEN new.deleted_at IS NULL BEGIN
        INSERT INTO contact_search(contact_id, name, company, role, email, phone, notes)
        VALUES(new.id, new.name, new.company, new.role, new.email, new.phone, new.notes);
      END;
      CREATE TRIGGER contacts_search_update AFTER UPDATE ON contacts BEGIN
        DELETE FROM contact_search WHERE contact_id = old.id;
        INSERT INTO contact_search(contact_id, name, company, role, email, phone, notes)
        SELECT new.id, new.name, new.company, new.role, new.email, new.phone, new.notes
        WHERE new.deleted_at IS NULL;
      END;
      CREATE TRIGGER contacts_search_delete AFTER DELETE ON contacts BEGIN
        DELETE FROM contact_search WHERE contact_id = old.id;
      END;
      INSERT INTO contact_search(contact_id, name, company, role, email, phone, notes)
      SELECT id, name, company, role, email, phone, notes FROM contacts WHERE deleted_at IS NULL;
    `,
  },
];
