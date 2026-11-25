import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/database/schema.ts';
import { WorkspaceService } from '../../src/main/services/workspace.ts';
import { WorkspaceOperationsService } from '../../src/main/services/operations.ts';
import { OllamaService } from '../../src/main/services/ollama.ts';
import type { EmbeddingAdapter } from '../../src/main/services/embeddings.ts';
import { resolveChatModel, resolveEmbeddingModel } from '../../src/main/services/ai-models.ts';
import { addTransactionAdapter } from './sqlite-transaction-adapter.ts';

function seedHardWorkspace(db: DatabaseSync) {
    addTransactionAdapter(db);
    const workspace = new WorkspaceService(db as never);
    const ops = new WorkspaceOperationsService(db as never);
    const tOld = '2026-01-10T09:00:00.000Z';
    const tNew = '2026-11-25T10:00:00.000Z';

    const payments = workspace.createProject({
        name: 'Payments Gateway v2',
        description:
            'Merchant onboarding, settlement webhooks, idempotency_key validation, and PCI-DSS audit.',
        type: 'ongoing',
    });
    const pos = workspace.createProject({
        name: 'Retail POS Rollout',
        description: 'Store terminal fleet rollout and hardware staging.',
        type: 'greenfield',
    });

    const aarav = workspace.createContact({
        name: 'Aarav Patel',
        role: 'Partner Ops Lead',
        company: 'NPCI Clearing',
        email: 'aarav.patel@npci.example.test',
        phone: '+91-9800001122',
        notes: 'Handles UAT merchant whitelisting and TLSv1.3 certificate rotation approvals.',
        customAttributes: { slaTier: 'P1-4h', region: 'ap-south-1', slack: '@aarav-ops' },
    });

    const webhookNote = workspace.createNote({
        projectId: payments.id,
        title: 'Webhook backoff & dead-letter policy',
        content: [
            '<p>Outbound merchant webhooks enforce HMAC SHA-256 signatures over TLSv1.3.</p>',
            '<ul data-type="taskList">',
            '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Verify exponential backoff up to 6 hours before dead-letter alert</p></div></li>',
            '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked><span></span></label><div><p>Enable idempotency_key header validation</p></div></li>',
            '</ul>',
        ].join(''),
    });
    const incidentalNote = workspace.createNote({
        projectId: pos.id,
        title: 'Storefront UI notes',
        content: '<p>Quick note touching webhook button label spacing after redesign.</p>',
    });
    db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(tOld, webhookNote.id);
    db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(tNew, incidentalNote.id);

    const schemaTask = workspace.createTask({
        projectId: payments.id,
        title: 'Finalize ledger partition schema',
        description: 'Required before replaying historical settlement batches.',
        priority: 'high',
        dueDate: '2026-11-28',
    });
    const replayTask = workspace.createTask({
        projectId: payments.id,
        title: 'Replay failed merchant settlements',
        description: 'Re-drive idempotent events after partition table is live.',
        priority: 'medium',
    });
    const readyTask = workspace.createTask({
        projectId: payments.id,
        title: 'Rotate staging signing secret',
        description: 'Rotate HMAC secret and verify TLSv1.3 handshake.',
        priority: 'urgent',
    });
    const overdueTask = workspace.createTask({
        projectId: pos.id,
        title: 'Ship store terminal config',
        description: 'Upload terminal bundle before pilot cutoff.',
        priority: 'urgent',
        dueDate: '2020-01-15',
    });
    const blockedTask = workspace.createTask({
        projectId: payments.id,
        title: 'Enable UAT callback endpoint',
        description: 'Endpoint deployed; waiting on upstream gateway team.',
        priority: 'high',
    });
    ops.addDependency(replayTask.id, schemaTask.id);
    ops.createBlocker(
        blockedTask.id,
        'Pending NPCI UAT IP whitelist approval',
        aarav.id,
        '2026-12-01T09:00:00.000Z',
    );
    ops.createLink('note', webhookNote.id, 'task', readyTask.id, 'documents');
    ops.createReminder('task', readyTask.id, '2020-02-01T09:00:00.000Z', 'Rotate secret with security lead');

    return {
        workspace,
        ops,
        payments,
        pos,
        aarav,
        webhookNote,
        incidentalNote,
        schemaTask,
        replayTask,
        readyTask,
        overdueTask,
        blockedTask,
    };
}

class ConceptEmbeddingAdapter implements EmbeddingAdapter {
    async embed(texts: string[]): Promise<number[][]> {
        return texts.map((raw) => {
            const text = raw.toLowerCase();
            return [
                /webhook|backoff|dead-letter|callback|retry/.test(text) ? 1 : 0.05,
                /tlsv1\.3|hmac|sha-256|secret|signing|security|certificate/.test(text) ? 1 : 0.05,
                /whitelist|uat|npci|aarav|ap-south-1|approval/.test(text) ? 1 : 0.05,
                /ledger|partition|schema|settlement|idempotency/.test(text) ? 1 : 0.05,
            ];
        });
    }
}

test('lexical search handles punctuation, conversational queries, blocker reasons, custom attributes and relevance ranking', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    try {
        const { workspace, webhookNote, incidentalNote, blockedTask, aarav } = seedHardWorkspace(db);

        const punct = workspace.search({ query: 'webhook, retry? dead-letter!', limit: 20 });
        assert.equal(punct[0]?.id, webhookNote.id);

        const natural = workspace.search({
            query: 'how does the webhook backoff policy handle dead-letter alerts?',
            limit: 20,
        });
        assert.equal(natural[0]?.id, webhookNote.id);

        const rankedTitle = workspace.search({ query: 'webhook', limit: 20 });
        assert.ok(rankedTitle.some((r) => r.id === webhookNote.id));
        assert.ok(rankedTitle.some((r) => r.id === incidentalNote.id));
        assert.equal(
            rankedTitle.findIndex((r) => r.id === webhookNote.id) <
                rankedTitle.findIndex((r) => r.id === incidentalNote.id),
            true,
            'Title/topic match must outrank newer incidental note mention',
        );

        const blockerHit = workspace.search({ query: 'NPCI IP whitelist', limit: 20 });
        assert.ok(blockerHit.some((r) => r.type === 'task' && r.id === blockedTask.id));

        const attrHit = workspace.search({ query: 'ap-south-1 P1-4h', limit: 20 });
        assert.ok(attrHit.some((r) => r.type === 'contact' && r.id === aarav.id));

        const tlsHit = workspace.search({ query: '(TLSv1.3) SHA-256', limit: 20 });
        assert.ok(tlsHit.some((r) => r.id === webhookNote.id));

        assert.deepEqual(workspace.search({ query: 'webhook is:unusual', limit: 20 }), []);
    } finally {
        db.close();
    }
});

test('semantic search auto-syncs invalidated edits and new records without missing results', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
        new Response(
            JSON.stringify({ models: [{ name: 'nomic-embed-text:latest' }, { name: 'qwen3.5:2b-q4_K_M' }] }),
            {
                status: 200,
            },
        )) as typeof fetch;
    try {
        const { workspace, webhookNote, blockedTask } = seedHardWorkspace(db);
        const ai = new OllamaService(db as never, new ConceptEmbeddingAdapter());
        assert.equal(
            resolveEmbeddingModel(db as never, ['nomic-embed-text:latest']).model,
            'nomic-embed-text:latest',
        );
        assert.equal(resolveChatModel(db as never, ['qwen3.5:2b-q4_K_M']).model, 'qwen3.5:2b-q4_K_M');

        // Auto-build initial index automatically when semanticSearch runs and model is installed
        const initial = await ai.semanticSearch('UAT gateway whitelist approval');
        assert.ok(initial.some((item) => item.id === blockedTask.id));

        // Update existing note (invalidates chunks via DB trigger) and add brand new task
        workspace.updateNote(webhookNote.id, {
            title: 'Webhook backoff & dead-letter policy',
            content: '<p>Includes TLSv1.3 mutual auth rotation schedule and HMAC SHA-256 verification.</p>',
        });
        const newTask = workspace.createTask({
            projectId: blockedTask.projectId,
            title: 'Audit certificate pinning for TLSv1.3',
            description: 'Rotate pinning leaf certificate across staging gateways.',
            priority: 'high',
        });

        const fresh = await ai.semanticSearch('certificate rotation TLSv1.3 secret');
        assert.ok(
            fresh.some((item) => item.id === newTask.id),
            'Newly created task must be auto-synced',
        );
        assert.ok(
            fresh.some((item) => item.id === webhookNote.id),
            'Updated note must be re-embedded',
        );
    } finally {
        globalThis.fetch = previousFetch;
        db.close();
    }
});

test('dashboard narrative and task relation summaries surface ready work, blockers, contacts, checklists, and links', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS) db.exec(migration.sql);
    try {
        const { workspace, ops, schemaTask, replayTask, readyTask, overdueTask, blockedTask } =
            seedHardWorkspace(db);
        const summary = workspace.dashboardSummary();

        assert.equal(summary.overdueTasks, 1);
        assert.ok(summary.overdueTaskItems.some((t) => t.id === overdueTask.id));
        assert.equal(summary.blockedTasks, 1);
        assert.equal(summary.blockedItems[0]?.task.id, blockedTask.id);
        assert.equal(summary.blockedItems[0]?.waitingContactName, 'Aarav Patel');
        assert.match(summary.blockedItems[0]?.reason ?? '', /NPCI UAT/);
        assert.ok(summary.readyTasks.some((t) => t.id === schemaTask.id));
        assert.ok(summary.readyTasks.some((t) => t.id === readyTask.id));
        assert.ok(
            !summary.readyTasks.some((t) => t.id === replayTask.id),
            'Task with unfinished dependency must not appear in Ready to start',
        );
        assert.ok(!summary.readyTasks.some((t) => t.id === blockedTask.id));
        assert.ok(summary.noteActionItems.some((item) => item.text.includes('Verify exponential backoff')));
        assert.ok(
            !summary.noteActionItems.some((item) => item.text.includes('idempotency_key header')),
            'Checked boxes must not appear as open action items',
        );
        assert.equal(summary.dueReminders.length, 1);
        assert.equal(summary.dueReminders[0]?.entityTitle, 'Rotate staging signing secret');

        const relations = workspace.getTaskRelationSummaries([
            schemaTask.id,
            replayTask.id,
            readyTask.id,
            blockedTask.id,
        ]);
        assert.equal(relations[schemaTask.id]?.blocksCount, 1);
        assert.equal(relations[replayTask.id]?.dependsOnOpen, 1);
        assert.equal(relations[replayTask.id]?.firstPrereqTitle, 'Finalize ledger partition schema');
        assert.equal(relations[readyTask.id]?.linkCount, 1);
        assert.equal(relations[blockedTask.id]?.waitingContactName, 'Aarav Patel');

        // Completing prerequisite moves downstream task into Ready!
        workspace.updateTask(schemaTask.id, { status: 'completed' });
        ops.resolveBlocker(summary.blockedItems[0]!.blockerId, 'Approved by NPCI');
        const updatedSummary = workspace.dashboardSummary();
        assert.ok(updatedSummary.readyTasks.some((t) => t.id === replayTask.id));
    } finally {
        db.close();
    }
});
