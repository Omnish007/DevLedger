import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { WorkspaceService } from '../../src/main/services/workspace.ts';
import { DocumentStorageService } from '../../src/main/services/storage.ts';

function createDatabase(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    const now = new Date().toISOString();
    for (let index = 1; index <= 5; index += 1) {
        const id = `project-${index}`;
        db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run(id, `Project ${index}`, 'ongoing', now, now);
        db.prepare(
            'INSERT INTO contacts (id, name, role, company, email, phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(`contact-${index}`, `Developer ${index}`, 'developer', 'DevLedger Labs', '', '', '', now, now);
        db.prepare(
            'INSERT INTO project_contacts (project_id, contact_id, relationship_role) VALUES (?, ?, ?)',
        ).run(id, `contact-${index}`, 'developer');
        db.prepare(
            'INSERT INTO notes (id, project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
            `note-${index}`,
            id,
            `Technical note ${index}`,
            index === 1 ? 'x'.repeat(1_500) : `Searchable body ${index}`,
            now,
            now,
        );
        db.prepare(
            'INSERT INTO tasks (id, project_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(`task-${index}`, id, `Task ${index}`, `Description ${index}`, now, now);
        db.prepare(
            `INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes, sha256, object_relative_path, status, extracted_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?, ?, ?)`,
        ).run(
            `document-${index}`,
            id,
            `Document ${index}`,
            `doc-${index}.txt`,
            'text/plain',
            '.txt',
            1500,
            'a'.repeat(64),
            `objects/${index}.txt`,
            `full extracted content ${index}`,
            now,
            now,
        );
    }
    db.prepare(
        'INSERT INTO tasks (id, project_id, parent_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('child-task', 'project-1', 'task-1', 'Child task for pagination', now, now);
    return db;
}

test('workspace list APIs page projects, contacts, notes and task trees', () => {
    const db = createDatabase();
    try {
        const workspace = new WorkspaceService(db as never);
        const projects = workspace.listProjectsPage({ limit: 2, offset: 1 });
        assert.equal(projects.items.length, 2);
        assert.equal(projects.total, 5);
        assert.equal(projects.hasMore, true);
        assert.deepEqual(workspace.getProjectNames(['project-1', 'project-3', 'project-1', 'missing']), {
            'project-1': 'Project 1',
            'project-3': 'Project 3',
        });
        assert.deepEqual(workspace.getProjectNames([]), {});

        const contacts = workspace.listContactsPage({ limit: 2, offset: 0, query: 'Developer 1' });
        assert.deepEqual(
            contacts.items.map((item) => item.id),
            ['contact-1'],
        );
        assert.equal(contacts.total, 1);

        const notes = workspace.listNotesPage({ limit: 1, offset: 0, query: 'Technical note 1' });
        assert.equal(notes.items.length, 1);
        assert.equal(
            notes.items[0]?.content.length,
            600,
            'list page returns a bounded preview rather than a full note body',
        );
        assert.equal(
            workspace.getNoteById('note-1').content.length,
            1_500,
            'opening a note fetches its full content',
        );

        const protectedUpdatedAt = new Date(Date.now() + 2_000).toISOString();
        db.prepare(
            `INSERT INTO notes (id, project_id, title, content, locked, encrypted_payload, encryption_meta, created_at, updated_at)
      VALUES (?, ?, 'Locked note', '', 1, ?, ?, ?, ?)`,
        ).run(
            'protected-note',
            'project-1',
            Buffer.from('ciphertext'),
            JSON.stringify({ version: 1 }),
            protectedUpdatedAt,
            protectedUpdatedAt,
        );
        const combinedNotes = workspace.listNotesPage({ limit: 1, offset: 0, includeLocked: true });
        assert.equal(
            combinedNotes.total,
            6,
            'the Notes page can include protected notes when explicitly requested',
        );
        assert.deepEqual(
            {
                id: combinedNotes.items[0]?.id,
                title: combinedNotes.items[0]?.title,
                content: combinedNotes.items[0]?.content,
                locked: combinedNotes.items[0]?.locked,
            },
            { id: 'protected-note', title: 'Locked note', content: '', locked: true },
            'protected note list rows expose metadata only, never encrypted or plaintext content',
        );
        assert.ok(
            !workspace
                .listNotesPage({ includeLocked: false })
                .items.some((item) => item.id === 'protected-note'),
            'record pickers exclude locked notes by default',
        );
        const protectedSearch = workspace.listNotesPage({ query: 'protected', includeLocked: true });
        assert.deepEqual(
            protectedSearch.items.map((item) => item.id),
            ['protected-note'],
            'the generic protected-note label remains searchable without searching secret content',
        );
        assert.ok(
            !workspace
                .listNotesPage({ query: 'ciphertext', includeLocked: true })
                .items.some((item) => item.id === 'protected-note'),
            'ciphertext is never part of the Notes search index',
        );

        const taskPage = workspace.listTasksPage({ limit: 1, offset: 0, query: 'Child task' });
        assert.equal(taskPage.total, 1);
        assert.deepEqual(
            new Set(taskPage.items.map((item) => item.id)),
            new Set(['task-1', 'child-task']),
            'the page includes ancestor context for nested tasks',
        );
        assert.deepEqual(
            workspace.getTaskTitles(['task-1', 'child-task', 'task-1', 'missing-task']),
            {
                'task-1': 'Task 1',
                'child-task': 'Child task for pagination',
            },
            'task title lookup is batched, deduplicated, and omits missing/deleted records',
        );
        assert.deepEqual(workspace.getTaskTitles([]), {}, 'empty lookups do not issue a query');
        assert.throws(
            () => workspace.updateTask('task-1', { parentId: 'child-task' }),
            /own ancestor/,
            'recursive SQL validation rejects cycles without loading the whole project task tree',
        );
        const contact = workspace.getContactById('contact-1');
        assert.equal(
            contact?.projectIds[0],
            'project-1',
            'contact detail lookup returns project associations without listing every contact',
        );
        assert.equal(
            workspace.getContactById('missing-contact'),
            null,
            'contact lookup does not disclose missing records',
        );
    } finally {
        db.close();
    }
});

test('document metadata page does not return extracted document text', () => {
    const db = createDatabase();
    try {
        const documents = new DocumentStorageService(db as never, '/tmp/devledger-document-list-test');
        const page = documents.listPage({ limit: 2, offset: 0 });
        assert.equal(page.items.length, 2);
        assert.equal(page.total, 5);
        assert.ok(page.items.every((document) => document.extractedText === ''));
        const indexes = new Set(
            (
                db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{
                    name: string;
                }>
            ).map((row) => row.name),
        );
        for (const name of [
            'contacts_name_nocase_idx',
            'project_contacts_contact_id_idx',
            'notes_updated_idx',
            'documents_updated_idx',
            'tasks_due_date_updated_idx',
            'notes_all_updated_idx',
        ])
            assert.ok(indexes.has(name), `expected migration index ${name}`);
    } finally {
        db.close();
    }
});
