import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceService } from '../../src/main/services/workspace.ts';
import { WorkspaceOperationsService } from '../../src/main/services/operations.ts';
import { MIGRATIONS } from '../../src/main/database/schema.ts';

function createDatabase(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
        'p-1',
        'Retail POS',
        'greenfield',
        now,
        now,
    );
    db.prepare(
        'INSERT INTO notes (id, project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
        'n-1',
        'p-1',
        'Connection timeout decision',
        'Use exponential retry after gateway timeout.',
        now,
        now,
    );
    db.prepare(
        "INSERT INTO tasks (id, project_id, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'blocked', ?, ?)",
    ).run('t-1', 'p-1', 'Fix API integration', 'Waiting for client API credentials', now, now);
    db.prepare(
        'INSERT INTO contacts (id, name, role, company, email, phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
        'c-1',
        'Aarav Patel',
        'client',
        'Acme Labs',
        'aarav@example.test',
        '+910000000000',
        'Owns sandbox credential approvals.',
        now,
        now,
    );
    db.prepare(
        'INSERT INTO project_contacts (project_id, contact_id, relationship_role) VALUES (?, ?, ?)',
    ).run('p-1', 'c-1', 'client');
    db.prepare(
        "INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes, sha256, object_relative_path, status, extracted_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?, ?, ?)",
    ).run(
        'd-1',
        'p-1',
        'API Reference',
        'api-reference.pdf',
        'application/pdf',
        '.pdf',
        12,
        'a'.repeat(64),
        'objects/aa/test',
        'Connection timeout and authentication reference.',
        now,
        now,
    );
    return db;
}

test('search DSL combines project and tag filters with FTS results', () => {
    const db = createDatabase();
    try {
        const operations = new WorkspaceOperationsService(db as never);
        const tag = operations.createTag('critical');
        operations.assignTag('note', 'n-1', tag.id);
        const results = new WorkspaceService(db as never).search({
            query: 'timeout p:"Retail POS" #critical',
            limit: 30,
        });
        assert.deepEqual(
            results.map((result) => result.id),
            ['n-1'],
        );
    } finally {
        db.close();
    }
});

test('type:pdf supports filter-only search and excludes other record types', () => {
    const db = createDatabase();
    try {
        const results = new WorkspaceService(db as never).search({ query: 'type:pdf', limit: 30 });
        assert.deepEqual(
            results.map((result) => `${result.type}:${result.id}`),
            ['document:d-1'],
        );
    } finally {
        db.close();
    }
});

test('is:blocked returns only blocked tasks', () => {
    const db = createDatabase();
    try {
        const results = new WorkspaceService(db as never).search({ query: 'is:blocked', limit: 30 });
        assert.deepEqual(
            results.map((result) => `${result.type}:${result.id}`),
            ['task:t-1'],
        );
    } finally {
        db.close();
    }
});

test('date filters use UTC date boundaries and unknown filters remain searchable', () => {
    const db = createDatabase();
    try {
        const workspace = new WorkspaceService(db as never);
        const valid = workspace.search({ query: 'timeout after:2020-01-01', limit: 30 });
        assert.ok(valid.some((result) => result.id === 'n-1'));
        const unknown = workspace.search({ query: 'timeout is:unusual', limit: 30 });
        assert.deepEqual(unknown, []); // Unknown operators are treated as additional literal search terms, not silently ignored.
    } finally {
        db.close();
    }
});

test('contacts are indexed, searchable and scoped by project', () => {
    const db = createDatabase();
    try {
        const workspace = new WorkspaceService(db as never);
        const all = workspace.search({ query: 'type:contact Acme Labs', limit: 30 });
        assert.deepEqual(
            all.map((result) => `${result.type}:${result.id}`),
            ['contact:c-1'],
        );
        const byProject = workspace.search({ query: 'type:contact sandbox p:"Retail POS"', limit: 30 });
        assert.deepEqual(
            byProject.map((result) => result.id),
            ['c-1'],
        );
        db.prepare('UPDATE contacts SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
            new Date().toISOString(),
            new Date().toISOString(),
            'c-1',
        );
        assert.deepEqual(workspace.search({ query: 'type:contact Acme Labs', limit: 30 }), []);
    } finally {
        db.close();
    }
});

test('ambiguous exact project filters stop after enough matches to establish ambiguity', () => {
    const db = createDatabase();
    try {
        const now = new Date().toISOString();
        const insert = db.prepare(
            'INSERT INTO projects (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        );
        for (let index = 0; index < 40; index += 1)
            insert.run(`duplicate-${index}`, 'Retail POS', 'ongoing', now, now);
        assert.throws(
            () => new WorkspaceService(db as never).search({ query: 'timeout p:"Retail POS"' }),
            /ambiguous/i,
        );
    } finally {
        db.close();
    }
});

test('note search excerpts strip TipTap HTML tags and truncated markup', () => {
    const db = createDatabase();
    try {
        const now = new Date().toISOString();
        db.prepare(
            'INSERT INTO notes (id, project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
            'n-html',
            'p-1',
            'Untitled note',
            '<p>Test</p><h1>test user</h1><ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Follow up</p></div></li></ul>',
            now,
            now,
        );
        const workspace = new WorkspaceService(db as never);
        const matchResults = workspace.search({ query: 'Test', limit: 30 });
        const noteHit = matchResults.find((item) => item.id === 'n-html');
        assert.ok(noteHit);
        assert.doesNotMatch(noteHit.excerpt, /<\/?(?:p|h1|ul|li|div|label|input|span)\b/i);
        assert.match(noteHit.excerpt, /<mark>Test<\/mark>/);
        const filterOnlyResults = workspace.search({ query: 'p:"Retail POS"', limit: 30 });
        const filterHit = filterOnlyResults.find((item) => item.id === 'n-html');
        assert.ok(filterHit);
        assert.doesNotMatch(filterHit.excerpt, /<\/?(?:p|h1|ul|li|div|label|input|span)\b/i);
        assert.match(filterHit.excerpt, /Test test user/);
    } finally {
        db.close();
    }
});
