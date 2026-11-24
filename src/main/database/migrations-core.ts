export const CORE_MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL CHECK(type IN ('greenfield', 'ongoing')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'on_hold', 'completed', 'archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX projects_status_updated_idx ON projects(status, updated_at DESC) WHERE deleted_at IS NULL;

      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
        role TEXT NOT NULL DEFAULT 'other',
        company TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE project_contacts (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        relationship_role TEXT NOT NULL DEFAULT 'other',
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0, 1)),
        PRIMARY KEY(project_id, contact_id)
      );

      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        title TEXT NOT NULL DEFAULT 'Untitled note',
        content TEXT NOT NULL DEFAULT '',
        content_version INTEGER NOT NULL DEFAULT 1,
        locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0, 1)),
        encrypted_payload BLOB,
        encryption_meta TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        CHECK ((locked = 0 AND encrypted_payload IS NULL) OR (locked = 1 AND encrypted_payload IS NOT NULL))
      );
      CREATE INDEX notes_project_updated_idx ON notes(project_id, updated_at DESC) WHERE deleted_at IS NULL;

      CREATE TABLE note_versions (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        content_version INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(note_id, content_version)
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT,
        title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 240),
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'blocked', 'waiting', 'completed', 'cancelled')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        due_at TEXT,
        estimate_minutes INTEGER CHECK(estimate_minutes IS NULL OR estimate_minutes >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX tasks_project_status_due_idx ON tasks(project_id, status, due_at) WHERE deleted_at IS NULL;
      CREATE INDEX tasks_parent_idx ON tasks(parent_id) WHERE deleted_at IS NULL;

      CREATE TABLE task_dependencies (
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY(task_id, depends_on_task_id),
        CHECK(task_id <> depends_on_task_id)
      );
      CREATE INDEX task_dependencies_reverse_idx ON task_dependencies(depends_on_task_id);

      CREATE TABLE time_entries (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds >= 0),
        note TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        CHECK ((is_active = 1 AND ended_at IS NULL) OR (is_active = 0 AND ended_at IS NOT NULL))
      );
      CREATE UNIQUE INDEX one_active_timer_idx ON time_entries(is_active) WHERE is_active = 1;
      CREATE INDEX time_entries_task_started_idx ON time_entries(task_id, started_at DESC);

      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        original_name TEXT NOT NULL,
        media_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
        sha256 TEXT NOT NULL,
        object_relative_path TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued', 'extracting', 'ocr_required', 'indexed', 'failed', 'needs_attention')),
        extracted_text TEXT NOT NULL DEFAULT '',
        extraction_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX documents_project_updated_idx ON documents(project_id, updated_at DESC) WHERE deleted_at IS NULL;
      CREATE INDEX documents_hash_idx ON documents(sha256);

      CREATE TABLE tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 64),
        color TEXT NOT NULL DEFAULT 'neutral',
        created_at TEXT NOT NULL
      );
      CREATE TABLE entity_tags (
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('project', 'note', 'task', 'document', 'contact')),
        entity_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(tag_id, entity_type, entity_id)
      );
      CREATE INDEX entity_tags_entity_idx ON entity_tags(entity_type, entity_id);

      CREATE TABLE entity_links (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relationship TEXT NOT NULL DEFAULT 'related',
        created_at TEXT NOT NULL,
        UNIQUE(source_type, source_id, target_type, target_id, relationship),
        CHECK(NOT (source_type = target_type AND source_id = target_id))
      );
      CREATE INDEX entity_links_target_idx ON entity_links(target_type, target_id);

      CREATE TABLE reminders (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('task', 'project', 'contact', 'note')),
        entity_id TEXT NOT NULL,
        due_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'delivered', 'snoozed', 'dismissed', 'cancelled')),
        message TEXT NOT NULL DEFAULT '',
        last_delivered_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX reminders_due_idx ON reminders(status, due_at);

      CREATE TABLE activity_events (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX activity_events_entity_idx ON activity_events(entity_type, entity_id, created_at DESC);
      CREATE INDEX activity_events_recent_idx ON activity_events(created_at DESC);

      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE note_search USING fts5(note_id UNINDEXED, project_id UNINDEXED, title, content, tokenize='unicode61 remove_diacritics 2');
      CREATE VIRTUAL TABLE task_search USING fts5(task_id UNINDEXED, project_id UNINDEXED, title, description, tokenize='unicode61 remove_diacritics 2');
      CREATE VIRTUAL TABLE document_search USING fts5(document_id UNINDEXED, project_id UNINDEXED, title, content, tokenize='unicode61 remove_diacritics 2');

      CREATE TRIGGER notes_search_insert AFTER INSERT ON notes WHEN new.locked = 0 AND new.deleted_at IS NULL BEGIN
        INSERT INTO note_search(note_id, project_id, title, content) VALUES(new.id, coalesce(new.project_id, ''), new.title, new.content);
      END;
      CREATE TRIGGER notes_search_update AFTER UPDATE ON notes BEGIN
        DELETE FROM note_search WHERE note_id = old.id;
        INSERT INTO note_search(note_id, project_id, title, content)
          SELECT new.id, coalesce(new.project_id, ''), new.title, new.content
          WHERE new.locked = 0 AND new.deleted_at IS NULL;
      END;
      CREATE TRIGGER notes_search_delete AFTER DELETE ON notes BEGIN
        DELETE FROM note_search WHERE note_id = old.id;
      END;

      CREATE TRIGGER tasks_search_insert AFTER INSERT ON tasks WHEN new.deleted_at IS NULL BEGIN
        INSERT INTO task_search(task_id, project_id, title, description) VALUES(new.id, new.project_id, new.title, new.description);
      END;
      CREATE TRIGGER tasks_search_update AFTER UPDATE ON tasks BEGIN
        DELETE FROM task_search WHERE task_id = old.id;
        INSERT INTO task_search(task_id, project_id, title, description)
          SELECT new.id, new.project_id, new.title, new.description WHERE new.deleted_at IS NULL;
      END;
      CREATE TRIGGER tasks_search_delete AFTER DELETE ON tasks BEGIN
        DELETE FROM task_search WHERE task_id = old.id;
      END;

      CREATE TRIGGER documents_search_insert AFTER INSERT ON documents WHEN new.status = 'indexed' AND new.deleted_at IS NULL BEGIN
        INSERT INTO document_search(document_id, project_id, title, content) VALUES(new.id, coalesce(new.project_id, ''), new.title, new.extracted_text);
      END;
      CREATE TRIGGER documents_search_update AFTER UPDATE ON documents BEGIN
        DELETE FROM document_search WHERE document_id = old.id;
        INSERT INTO document_search(document_id, project_id, title, content)
          SELECT new.id, coalesce(new.project_id, ''), new.title, new.extracted_text
          WHERE new.status = 'indexed' AND new.deleted_at IS NULL;
      END;
      CREATE TRIGGER documents_search_delete AFTER DELETE ON documents BEGIN
        DELETE FROM document_search WHERE document_id = old.id;
      END;
    `,
  },
];
