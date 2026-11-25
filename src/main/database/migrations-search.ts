export const SEARCH_MIGRATIONS = [
    {
        version: 7,
        sql: `
      CREATE TABLE semantic_chunks (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL CHECK(source_type IN ('project', 'contact', 'note', 'task', 'document')),
        source_id TEXT NOT NULL,
        project_id TEXT,
        chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        excerpt TEXT NOT NULL,
        source_updated_at TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        generation_id TEXT NOT NULL,
        dimensions INTEGER NOT NULL CHECK(dimensions > 0 AND dimensions <= 8192),
        vector_json TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        UNIQUE(source_type, source_id, chunk_index, model, generation_id)
      );
      CREATE INDEX semantic_chunks_model_generation_idx ON semantic_chunks(model, generation_id, project_id);
      CREATE INDEX semantic_chunks_source_idx ON semantic_chunks(source_type, source_id);
      CREATE TRIGGER semantic_project_invalidate AFTER UPDATE ON projects BEGIN
        DELETE FROM semantic_chunks WHERE source_type = 'project' AND source_id = old.id;
      END;
      CREATE TRIGGER semantic_contact_invalidate AFTER UPDATE ON contacts BEGIN
        DELETE FROM semantic_chunks WHERE source_type = 'contact' AND source_id = old.id;
      END;
      CREATE TRIGGER semantic_note_invalidate AFTER UPDATE ON notes BEGIN
        DELETE FROM semantic_chunks WHERE source_type = 'note' AND source_id = old.id;
      END;
      CREATE TRIGGER semantic_task_invalidate AFTER UPDATE ON tasks BEGIN
        DELETE FROM semantic_chunks WHERE source_type = 'task' AND source_id = old.id;
      END;
      CREATE TRIGGER semantic_document_invalidate AFTER UPDATE ON documents BEGIN
        DELETE FROM semantic_chunks WHERE source_type = 'document' AND source_id = old.id;
      END;
      CREATE TRIGGER semantic_project_delete AFTER DELETE ON projects BEGIN
        DELETE FROM semantic_chunks WHERE source_type = 'project' AND source_id = old.id;
      END;
      CREATE TRIGGER semantic_contact_delete AFTER DELETE ON contacts BEGIN
        DELETE FROM semantic_chunks WHERE source_type = 'contact' AND source_id = old.id;
      END;
      CREATE TRIGGER semantic_note_delete AFTER DELETE ON notes BEGIN
        DELETE FROM semantic_chunks WHERE source_type = 'note' AND source_id = old.id;
      END;
      CREATE TRIGGER semantic_task_delete AFTER DELETE ON tasks BEGIN
        DELETE FROM semantic_chunks WHERE source_type = 'task' AND source_id = old.id;
      END;
      CREATE TRIGGER semantic_document_delete AFTER DELETE ON documents BEGIN
        DELETE FROM semantic_chunks WHERE source_type = 'document' AND source_id = old.id;
      END;
    `,
    },
    {
        version: 8,
        sql: `
      ALTER TABLE tasks ADD COLUMN due_date TEXT
        CHECK(due_date IS NULL OR (length(due_date) = 10 AND due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'));
      CREATE INDEX tasks_project_status_due_date_idx
        ON tasks(project_id, status, due_date) WHERE deleted_at IS NULL;
      CREATE INDEX tasks_due_date_idx ON tasks(due_date) WHERE deleted_at IS NULL AND due_date IS NOT NULL;
    `,
    },
    {
        version: 9,
        sql: `
      ALTER TABLE contacts ADD COLUMN custom_attributes_json TEXT NOT NULL DEFAULT '{}';
      DROP TRIGGER contacts_search_insert;
      DROP TRIGGER contacts_search_update;
      DROP TRIGGER contacts_search_delete;
      DROP TABLE contact_search;
      CREATE VIRTUAL TABLE contact_search USING fts5(contact_id UNINDEXED, name, company, role, email, phone, notes, custom_attributes, tokenize='unicode61 remove_diacritics 2');
      CREATE TRIGGER contacts_search_insert AFTER INSERT ON contacts WHEN new.deleted_at IS NULL BEGIN
        INSERT INTO contact_search(contact_id, name, company, role, email, phone, notes, custom_attributes)
        VALUES(new.id, new.name, new.company, new.role, new.email, new.phone, new.notes, new.custom_attributes_json);
      END;
      CREATE TRIGGER contacts_search_update AFTER UPDATE ON contacts BEGIN
        DELETE FROM contact_search WHERE contact_id = old.id;
        INSERT INTO contact_search(contact_id, name, company, role, email, phone, notes, custom_attributes)
        SELECT new.id, new.name, new.company, new.role, new.email, new.phone, new.notes, new.custom_attributes_json
        WHERE new.deleted_at IS NULL;
      END;
      CREATE TRIGGER contacts_search_delete AFTER DELETE ON contacts BEGIN
        DELETE FROM contact_search WHERE contact_id = old.id;
      END;
      INSERT INTO contact_search(contact_id, name, company, role, email, phone, notes, custom_attributes)
      SELECT id, name, company, role, email, phone, notes, custom_attributes_json FROM contacts WHERE deleted_at IS NULL;
    `,
    },
    {
        version: 10,
        sql: `
      ALTER TABLE documents ADD COLUMN is_encrypted INTEGER NOT NULL DEFAULT 0 CHECK(is_encrypted IN (0, 1));
      ALTER TABLE documents ADD COLUMN encryption_meta TEXT;
      ALTER TABLE documents ADD COLUMN stored_sha256 TEXT;

      DROP TRIGGER documents_search_insert;
      DROP TRIGGER documents_search_update;
      CREATE TRIGGER documents_search_insert AFTER INSERT ON documents
      WHEN new.status = 'indexed' AND new.deleted_at IS NULL AND new.is_encrypted = 0 BEGIN
        INSERT INTO document_search(document_id, project_id, title, content)
        VALUES(new.id, coalesce(new.project_id, ''), new.title, new.extracted_text);
      END;
      CREATE TRIGGER documents_search_update AFTER UPDATE ON documents BEGIN
        DELETE FROM document_search WHERE document_id = old.id;
        INSERT INTO document_search(document_id, project_id, title, content)
        SELECT new.id, coalesce(new.project_id, ''), new.title, new.extracted_text
        WHERE new.status = 'indexed' AND new.deleted_at IS NULL AND new.is_encrypted = 0;
      END;

      ALTER TABLE background_jobs ADD COLUMN worker_id TEXT;
      ALTER TABLE background_jobs ADD COLUMN heartbeat_at TEXT;
      ALTER TABLE background_jobs ADD COLUMN cancel_requested_at TEXT;
      ALTER TABLE background_jobs ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}';
      CREATE INDEX background_jobs_lease_idx ON background_jobs(status, heartbeat_at);

      CREATE VIRTUAL TABLE semantic_chunk_search USING fts5(
        chunk_id UNINDEXED, title, content, tokenize='unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER semantic_chunk_search_insert AFTER INSERT ON semantic_chunks BEGIN
        INSERT INTO semantic_chunk_search(chunk_id, title, content)
        VALUES(new.id, new.title, new.content);
      END;
      CREATE TABLE semantic_vector_buckets (
        chunk_id TEXT NOT NULL REFERENCES semantic_chunks(id) ON DELETE CASCADE,
        band INTEGER NOT NULL CHECK(band BETWEEN 0 AND 2),
        bucket INTEGER NOT NULL CHECK(bucket BETWEEN 0 AND 65535),
        PRIMARY KEY(chunk_id, band)
      ) WITHOUT ROWID;
      CREATE INDEX semantic_vector_bucket_lookup_idx ON semantic_vector_buckets(band, bucket, chunk_id);
      CREATE TRIGGER semantic_chunk_search_delete AFTER DELETE ON semantic_chunks BEGIN
        DELETE FROM semantic_chunk_search WHERE chunk_id = old.id;
        DELETE FROM semantic_vector_buckets WHERE chunk_id = old.id;
      END;
      INSERT INTO semantic_chunk_search(chunk_id, title, content)
      SELECT id, title, content FROM semantic_chunks;
      CREATE INDEX semantic_chunks_recent_idx
        ON semantic_chunks(model, generation_id, indexed_at DESC, project_id);
    `,
    },
    {
        version: 11,
        sql: `
      ALTER TABLE background_jobs ADD COLUMN result_json TEXT;
      CREATE INDEX background_jobs_kind_queue_idx
        ON background_jobs(kind, status, available_at, priority DESC, created_at);
      CREATE INDEX background_jobs_stale_lease_idx
        ON background_jobs(status, heartbeat_at) WHERE status = 'running';
    `,
    },
];
