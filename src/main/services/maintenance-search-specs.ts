export const SEARCH_REBUILD_BATCH_SIZE = 200;

export type SearchIndexRow = Record<string, string | null> & { id: string };

export interface SearchIndexRebuildSpec {
    name: string;
    sourceTable: string;
    idField: string;
    columns: string[];
    createSql: string;
    initializeSql?: string;
    selectSql: string;
    selectValues(row: SearchIndexRow): unknown[];
    insertNewSql: string;
    sourceTriggers: string[];
}

export const SEARCH_INDEX_REBUILDS: SearchIndexRebuildSpec[] = [
    {
        name: 'note_search',
        sourceTable: 'notes',
        idField: 'note_id',
        columns: ['note_id', 'project_id', 'title', 'content'],
        createSql:
            "CREATE VIRTUAL TABLE note_search_rebuild USING fts5(note_id UNINDEXED, project_id UNINDEXED, title, content, tokenize='unicode61 remove_diacritics 2');",
        initializeSql:
            "INSERT INTO note_search_rebuild(note_search_rebuild, rank) VALUES('secure-delete', 1);",
        selectSql: `SELECT id, coalesce(project_id, '') AS project_id, title, content
      FROM notes WHERE locked = 0 AND deleted_at IS NULL AND id > ? ORDER BY id LIMIT ?`,
        selectValues: (row) => [row.id, row['project_id'], row['title'], row['content']],
        insertNewSql: `INSERT INTO note_search_rebuild(note_id, project_id, title, content)
      SELECT new.id, coalesce(new.project_id, ''), new.title, new.content
      WHERE new.locked = 0 AND new.deleted_at IS NULL;`,
        sourceTriggers: [
            `CREATE TRIGGER notes_search_insert AFTER INSERT ON notes WHEN new.locked = 0 AND new.deleted_at IS NULL BEGIN
        INSERT INTO note_search(note_id, project_id, title, content) VALUES(new.id, coalesce(new.project_id, ''), new.title, new.content); END;`,
            `CREATE TRIGGER notes_search_update AFTER UPDATE ON notes BEGIN
        DELETE FROM note_search WHERE note_id = old.id;
        INSERT INTO note_search(note_id, project_id, title, content) SELECT new.id, coalesce(new.project_id, ''), new.title, new.content WHERE new.locked = 0 AND new.deleted_at IS NULL; END;`,
            `CREATE TRIGGER notes_search_delete AFTER DELETE ON notes BEGIN DELETE FROM note_search WHERE note_id = old.id; END;`,
        ],
    },
    {
        name: 'task_search',
        sourceTable: 'tasks',
        idField: 'task_id',
        columns: ['task_id', 'project_id', 'title', 'description'],
        createSql:
            "CREATE VIRTUAL TABLE task_search_rebuild USING fts5(task_id UNINDEXED, project_id UNINDEXED, title, description, tokenize='unicode61 remove_diacritics 2');",
        initializeSql:
            "INSERT INTO task_search_rebuild(task_search_rebuild, rank) VALUES('secure-delete', 1);",
        selectSql: `SELECT id, project_id, title, description
      FROM tasks WHERE deleted_at IS NULL AND id > ? ORDER BY id LIMIT ?`,
        selectValues: (row) => [row.id, row['project_id'], row['title'], row['description']],
        insertNewSql: `INSERT INTO task_search_rebuild(task_id, project_id, title, description)
      SELECT new.id, new.project_id, new.title, new.description WHERE new.deleted_at IS NULL;`,
        sourceTriggers: [
            `CREATE TRIGGER tasks_search_insert AFTER INSERT ON tasks WHEN new.deleted_at IS NULL BEGIN
        INSERT INTO task_search(task_id, project_id, title, description) VALUES(new.id, new.project_id, new.title, new.description); END;`,
            `CREATE TRIGGER tasks_search_update AFTER UPDATE ON tasks BEGIN
        DELETE FROM task_search WHERE task_id = old.id;
        INSERT INTO task_search(task_id, project_id, title, description) SELECT new.id, new.project_id, new.title, new.description WHERE new.deleted_at IS NULL; END;`,
            `CREATE TRIGGER tasks_search_delete AFTER DELETE ON tasks BEGIN DELETE FROM task_search WHERE task_id = old.id; END;`,
        ],
    },
    {
        name: 'contact_search',
        sourceTable: 'contacts',
        idField: 'contact_id',
        columns: ['contact_id', 'name', 'company', 'role', 'email', 'phone', 'notes', 'custom_attributes'],
        createSql:
            "CREATE VIRTUAL TABLE contact_search_rebuild USING fts5(contact_id UNINDEXED, name, company, role, email, phone, notes, custom_attributes, tokenize='unicode61 remove_diacritics 2');",
        selectSql: `SELECT id, name, company, role, email, phone, notes, custom_attributes_json AS custom_attributes
      FROM contacts WHERE deleted_at IS NULL AND id > ? ORDER BY id LIMIT ?`,
        selectValues: (row) => [
            row.id,
            row['name'],
            row['company'],
            row['role'],
            row['email'],
            row['phone'],
            row['notes'],
            row['custom_attributes'],
        ],
        insertNewSql: `INSERT INTO contact_search_rebuild(contact_id, name, company, role, email, phone, notes, custom_attributes)
      SELECT new.id, new.name, new.company, new.role, new.email, new.phone, new.notes, new.custom_attributes_json
      WHERE new.deleted_at IS NULL;`,
        sourceTriggers: [
            `CREATE TRIGGER contacts_search_insert AFTER INSERT ON contacts WHEN new.deleted_at IS NULL BEGIN
        INSERT INTO contact_search(contact_id, name, company, role, email, phone, notes, custom_attributes)
        VALUES(new.id, new.name, new.company, new.role, new.email, new.phone, new.notes, new.custom_attributes_json); END;`,
            `CREATE TRIGGER contacts_search_update AFTER UPDATE ON contacts BEGIN
        DELETE FROM contact_search WHERE contact_id = old.id;
        INSERT INTO contact_search(contact_id, name, company, role, email, phone, notes, custom_attributes)
        SELECT new.id, new.name, new.company, new.role, new.email, new.phone, new.notes, new.custom_attributes_json WHERE new.deleted_at IS NULL; END;`,
            `CREATE TRIGGER contacts_search_delete AFTER DELETE ON contacts BEGIN DELETE FROM contact_search WHERE contact_id = old.id; END;`,
        ],
    },
    {
        name: 'document_search',
        sourceTable: 'documents',
        idField: 'document_id',
        columns: ['document_id', 'project_id', 'title', 'content'],
        createSql:
            "CREATE VIRTUAL TABLE document_search_rebuild USING fts5(document_id UNINDEXED, project_id UNINDEXED, title, content, tokenize='unicode61 remove_diacritics 2');",
        initializeSql:
            "INSERT INTO document_search_rebuild(document_search_rebuild, rank) VALUES('secure-delete', 1);",
        selectSql: `SELECT id, coalesce(project_id, '') AS project_id, title, extracted_text AS content
      FROM documents WHERE status = 'indexed' AND deleted_at IS NULL AND is_encrypted = 0 AND id > ? ORDER BY id LIMIT ?`,
        selectValues: (row) => [row.id, row['project_id'], row['title'], row['content']],
        insertNewSql: `INSERT INTO document_search_rebuild(document_id, project_id, title, content)
      SELECT new.id, coalesce(new.project_id, ''), new.title, new.extracted_text
      WHERE new.status = 'indexed' AND new.deleted_at IS NULL AND new.is_encrypted = 0;`,
        sourceTriggers: [
            `CREATE TRIGGER documents_search_insert AFTER INSERT ON documents WHEN new.status = 'indexed' AND new.deleted_at IS NULL AND new.is_encrypted = 0 BEGIN
        INSERT INTO document_search(document_id, project_id, title, content) VALUES(new.id, coalesce(new.project_id, ''), new.title, new.extracted_text); END;`,
            `CREATE TRIGGER documents_search_update AFTER UPDATE ON documents BEGIN
        DELETE FROM document_search WHERE document_id = old.id;
        INSERT INTO document_search(document_id, project_id, title, content) SELECT new.id, coalesce(new.project_id, ''), new.title, new.extracted_text
        WHERE new.status = 'indexed' AND new.deleted_at IS NULL AND new.is_encrypted = 0; END;`,
            `CREATE TRIGGER documents_search_delete AFTER DELETE ON documents BEGIN DELETE FROM document_search WHERE document_id = old.id; END;`,
        ],
    },
    {
        name: 'semantic_chunk_search',
        sourceTable: 'semantic_chunks',
        idField: 'chunk_id',
        columns: ['chunk_id', 'title', 'content'],
        createSql:
            "CREATE VIRTUAL TABLE semantic_chunk_search_rebuild USING fts5(chunk_id UNINDEXED, title, content, tokenize='unicode61 remove_diacritics 2');",
        selectSql: 'SELECT id, title, content FROM semantic_chunks WHERE id > ? ORDER BY id LIMIT ?',
        selectValues: (row) => [row.id, row['title'], row['content']],
        insertNewSql: `INSERT INTO semantic_chunk_search_rebuild(chunk_id, title, content)
      VALUES(new.id, new.title, new.content);`,
        sourceTriggers: [
            `CREATE TRIGGER semantic_chunk_search_insert AFTER INSERT ON semantic_chunks BEGIN
        INSERT INTO semantic_chunk_search(chunk_id, title, content) VALUES(new.id, new.title, new.content); END;`,
            `CREATE TRIGGER semantic_chunk_search_delete AFTER DELETE ON semantic_chunks BEGIN
        DELETE FROM semantic_chunk_search WHERE chunk_id = old.id;
        DELETE FROM semantic_vector_buckets WHERE chunk_id = old.id; END;`,
        ],
    },
];
