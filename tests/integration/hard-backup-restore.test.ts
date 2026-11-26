import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from '../../src/main/database/connection.ts';
import { WorkspaceService } from '../../src/main/services/workspace.ts';
import { BackupService } from '../../src/main/services/backup.ts';
import { MARKER_NAME, readMarker } from '../../src/main/services/restore-activation-validation.ts';
import {
    commitPromotedRestore,
    hasPromotedRestore,
    hasStagedRestore,
    promoteStagedRestore,
    recoverInterruptedRestore,
    requestRollbackPromotedRestore,
    rollbackPromotedRestore,
    stageRestoreCopy,
} from '../../src/main/services/restore-activation.ts';
import {
    listExternalSnapshots,
    mirrorEncryptedBackup,
    validateExternalBackupDirectory,
} from '../../src/main/services/external-backup.ts';
import { selectRetainedSnapshots } from '../../src/domain/backup-retention.ts';

async function setupWorkspace() {
    const root = await mkdtemp(join(tmpdir(), 'devledger-hard-backup-'));
    const dataDirectory = join(root, 'user-data');
    await mkdir(join(dataDirectory, 'objects'), { recursive: true });
    const dbPath = join(dataDirectory, 'northstar.sqlite');
    const db = openDatabase(dbPath);
    const workspace = new WorkspaceService(db);

    const project = workspace.createProject({
        name: 'Payments Kernel',
        description: 'Core ledger reconciliation engine',
        type: 'greenfield',
    });
    const note = workspace.createNote({
        projectId: project.id,
        title: 'Failover Playbook',
        content: '<p>Verify SHA-256 object digests before promoting restore snapshots.</p>',
    });
    const task = workspace.createTask({
        projectId: project.id,
        title: 'Validate cold-start rollback path',
        priority: 'urgent',
        dueDate: '2026-12-01',
    });

    const lockedCipher = randomBytes(48);
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO notes (id, project_id, title, content, locked, encrypted_payload, created_at, updated_at)
         VALUES (?, ?, ?, '', 1, ?, ?, ?)`,
    ).run('note-locked-hard', project.id, 'Vault Secret Note', lockedCipher, now, now);

    const docRelative = 'objects/spec-v1.md';
    const docBody = Buffer.from('# Architecture Spec\nStrictly immutable artifact bytes.\n', 'utf8');
    await writeFile(join(dataDirectory, docRelative), docBody);
    const docHash = createHash('sha256').update(docBody).digest('hex');
    db.prepare(
        `INSERT INTO documents (id, project_id, title, original_name, media_type, extension, size_bytes, sha256, object_relative_path, status, extracted_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?, ?, ?)`,
    ).run(
        'doc-hard-1',
        project.id,
        'Architecture Spec',
        'spec-v1.md',
        'text/markdown',
        '.md',
        docBody.byteLength,
        docHash,
        docRelative,
        docBody.toString('utf8'),
        now,
        now,
    );

    return {
        root,
        dataDirectory,
        dbPath,
        db,
        workspace,
        project,
        note,
        task,
        lockedCipher,
        docRelative,
        docBody,
    };
}

test('hard backup & restore: roundtrips passphrase, recovery key, locked ciphertext, and object files without mutating live state', async () => {
    const ctx = await setupWorkspace();
    const archivePath = join(ctx.root, 'archives', 'snapshot-full.nsbackup');
    const passphrase = 'correct-horse-battery-staple-99';

    try {
        await mkdir(join(ctx.root, 'archives'), { recursive: true });
        const backups = new BackupService(ctx.db, ctx.dataDirectory);

        await assert.rejects(
            () => backups.createEncryptedBackup(join(ctx.root, 'bad-ext.zip'), passphrase),
            /\.nsbackup/,
        );
        await assert.rejects(() => backups.createEncryptedBackup(archivePath, 'too-short'), /12 and 1024/);

        const created = await backups.createEncryptedBackup(archivePath, passphrase);
        assert.equal(created.path, archivePath);
        assert.match(created.recoveryKey, /^[A-Za-z0-9_-]{32,}$/);
        assert.ok((await stat(archivePath)).size > 256);

        // Existing target must be rejected rather than overwritten.
        await assert.rejects(() => backups.createEncryptedBackup(archivePath, passphrase), /already exists/);

        // Wrong credentials must fail cleanly without leaving partial restore copies behind.
        await assert.rejects(
            () => backups.restoreAsCopy(archivePath, 'wrong-passphrase-definitely-invalid'),
            /incorrect|damaged/i,
        );
        await assert.rejects(
            () => backups.restoreAsCopy(archivePath, 'AAAA-BBBB-CCCC-DDDD-EEEE', true),
            /incorrect|damaged/i,
        );

        // Mutate live workspace AFTER taking snapshot to prove restore copy captures point-in-time state
        // and restoring as copy leaves the mutated live DB untouched.
        ctx.workspace.createProject({ name: 'Post-Snapshot Project', type: 'ongoing' });

        // Restore using the recovery key (base64url, with leading/trailing whitespace).
        const restoredViaRecovery = await backups.restoreAsCopy(
            archivePath,
            `  ${created.recoveryKey}  `,
            true,
        );
        assert.ok(restoredViaRecovery.startsWith(join(ctx.dataDirectory, 'restore-copies')));

        const restoredDb = new Database(join(restoredViaRecovery, 'northstar.sqlite'), { readonly: true });
        try {
            const projects = restoredDb.prepare('SELECT name FROM projects').all() as Array<{ name: string }>;
            assert.deepEqual(
                projects.map((p) => p.name),
                ['Payments Kernel'],
            );
            const locked = restoredDb
                .prepare('SELECT encrypted_payload FROM notes WHERE id = ?')
                .get('note-locked-hard') as { encrypted_payload: Buffer };
            assert.deepEqual(Buffer.from(locked.encrypted_payload), ctx.lockedCipher);
        } finally {
            restoredDb.close();
        }
        assert.deepEqual(await readFile(join(restoredViaRecovery, ctx.docRelative)), ctx.docBody);

        // Restore via passphrase also succeeds independently.
        const restoredViaPassphrase = await backups.restoreAsCopy(archivePath, passphrase, false);
        assert.notEqual(restoredViaPassphrase, restoredViaRecovery);
        assert.deepEqual(await readFile(join(restoredViaPassphrase, ctx.docRelative)), ctx.docBody);

        // Live database still contains Post-Snapshot Project.
        assert.equal(ctx.workspace.listProjectsPage({}).items.length, 2);
    } finally {
        ctx.db.close();
        await rm(ctx.root, { recursive: true, force: true });
    }
});

test('hard backup & restore: rejects bit-flipped header, truncated archive, and GCM tag tampering', async () => {
    const ctx = await setupWorkspace();
    const archivePath = join(ctx.root, 'tamper.nsbackup');
    const passphrase = 'tamper-test-passphrase-2026';

    try {
        const backups = new BackupService(ctx.db, ctx.dataDirectory);
        await backups.createEncryptedBackup(archivePath, passphrase);
        const original = await readFile(archivePath);

        // 1. Flip bit inside final GCM auth tag
        const flippedTag = Buffer.from(original);
        flippedTag[flippedTag.length - 1]! ^= 0x01;
        const badTagPath = join(ctx.root, 'bad-tag.nsbackup');
        await writeFile(badTagPath, flippedTag);
        await assert.rejects(() => backups.restoreAsCopy(badTagPath, passphrase), /incorrect|damaged/i);

        // 2. Flip bit inside encrypted archive payload region (middle of file)
        const flippedPayload = Buffer.from(original);
        flippedPayload[Math.floor(original.length / 2)]! ^= 0x80;
        const badPayloadPath = join(ctx.root, 'bad-payload.nsbackup');
        await writeFile(badPayloadPath, flippedPayload);
        await assert.rejects(() => backups.restoreAsCopy(badPayloadPath, passphrase), /incorrect|damaged/i);

        // 3. Corrupt header byte right after MAGIC_V1
        const flippedHeader = Buffer.from(original);
        flippedHeader[16]! ^= 0xff;
        const badHeaderPath = join(ctx.root, 'bad-header.nsbackup');
        await writeFile(badHeaderPath, flippedHeader);
        await assert.rejects(() => backups.restoreAsCopy(badHeaderPath, passphrase));

        // 4. Truncated file
        const truncatedPath = join(ctx.root, 'truncated.nsbackup');
        await writeFile(truncatedPath, original.subarray(0, 64));
        await assert.rejects(() => backups.restoreAsCopy(truncatedPath, passphrase), /truncated|valid/i);
    } finally {
        ctx.db.close();
        await rm(ctx.root, { recursive: true, force: true });
    }
});

test('hard restore lifecycle: validates objects/symlinks, stages cleanly, normalizes rollbackDirectory without path doubling, and recovers rollback-requested crashes', async () => {
    const ctx = await setupWorkspace();
    const archivePath = join(ctx.root, 'lifecycle.nsbackup');
    const passphrase = 'restore-lifecycle-secret-2026';

    try {
        const backups = new BackupService(ctx.db, ctx.dataDirectory);
        await backups.createEncryptedBackup(archivePath, passphrase);
        const copyDir = await backups.restoreAsCopy(archivePath, passphrase);

        // Mutate live workspace with an uncheckpointed WAL write so sidecar handling is exercised.
        const postProject = ctx.workspace.createProject({ name: 'Live Before Rollback', type: 'ongoing' });
        await writeFile(join(ctx.dataDirectory, 'objects', 'extra-live.txt'), 'live file');

        // 1. Corrupt missing object in restore copy must fail staging.
        const docInCopy = join(copyDir, ctx.docRelative);
        const savedDocBytes = await readFile(docInCopy);
        await rm(docInCopy);
        await assert.rejects(() => stageRestoreCopy(ctx.dataDirectory, copyDir), /missing|damaged|corrupt/i);
        await writeFile(docInCopy, savedDocBytes);

        // 2. Symlink in restore copy must be rejected.
        const symlinkPath = join(copyDir, 'objects', 'evil-link');
        await symlink('/etc/hosts', symlinkPath);
        await assert.rejects(() => stageRestoreCopy(ctx.dataDirectory, copyDir), /symbolic link/);
        await rm(symlinkPath);

        // 3. Close live DB, stage cleanly, verify marker uses relative restoreDirectory.
        ctx.db.close();
        await stageRestoreCopy(ctx.dataDirectory, copyDir);
        assert.equal(await hasStagedRestore(ctx.dataDirectory), true);

        // Promote staged restore copy
        const promoted = await promoteStagedRestore(ctx.dataDirectory);
        assert.equal(promoted, true);
        assert.equal(await hasPromotedRestore(ctx.dataDirectory), true);

        // Regression test for path-doubling bug: raw JSON on disk MUST hold relative `.restore-rollback/<uuid>`
        const rawMarker = JSON.parse(await readFile(join(ctx.dataDirectory, MARKER_NAME), 'utf8')) as {
            phase: string;
            rollbackDirectory?: string;
            restoreDirectory?: string;
        };
        assert.equal(rawMarker.phase, 'promoted');
        assert.ok(rawMarker.rollbackDirectory && rawMarker.rollbackDirectory.startsWith('.restore-rollback'));
        assert.ok(!rawMarker.rollbackDirectory.includes(ctx.dataDirectory));

        // readMarker resolves inside dataDirectory without doubling
        const resolvedMarker = await readMarker(ctx.dataDirectory);
        assert.ok(resolvedMarker?.rollbackDirectory);
        assert.equal(resolvedMarker.rollbackDirectory, join(ctx.dataDirectory, rawMarker.rollbackDirectory!));
        assert.ok(await stat(resolvedMarker.rollbackDirectory));

        // startup recovery in 'promoted' state returns 'awaiting-validation'
        assert.equal(await recoverInterruptedRestore(ctx.dataDirectory), 'awaiting-validation');

        // Simulate crash immediately after user clicked Rollback ('rollback-requested')
        await requestRollbackPromotedRestore(ctx.dataDirectory);
        assert.equal(await recoverInterruptedRestore(ctx.dataDirectory), 'rolled-back');
        assert.equal(await hasPromotedRestore(ctx.dataDirectory), false);

        // Live DB after rollback MUST contain Live Before Rollback + extra-live.txt!
        const rolledBackDb = openDatabase(ctx.dbPath);
        try {
            const row = rolledBackDb.prepare('SELECT id FROM projects WHERE id = ?').get(postProject.id) as
                { id: string } | undefined;
            assert.equal(row?.id, postProject.id);
        } finally {
            rolledBackDb.close();
        }
        assert.equal(
            await readFile(join(ctx.dataDirectory, 'objects', 'extra-live.txt'), 'utf8'),
            'live file',
        );

        // Clean second promotion followed by full commit removes rollback directory & leftover marker.
        const copy2 = await (async () => {
            const reopened = openDatabase(ctx.dbPath);
            try {
                return await new BackupService(reopened, ctx.dataDirectory).restoreAsCopy(
                    archivePath,
                    passphrase,
                );
            } finally {
                reopened.close();
            }
        })();
        await stageRestoreCopy(ctx.dataDirectory, copy2);
        assert.equal(await promoteStagedRestore(ctx.dataDirectory), true);
        await commitPromotedRestore(ctx.dataDirectory);
        assert.equal(await hasPromotedRestore(ctx.dataDirectory), false);

        // After commit, DB reflects backup state (Live Before Rollback is gone) and no rollback folders remain.
        const committedDb = openDatabase(ctx.dbPath);
        try {
            const count = committedDb.prepare('SELECT count(*) AS n FROM projects').get() as { n: number };
            assert.equal(count.n, 1);
        } finally {
            committedDb.close();
        }
        const rootEntries = await readdir(join(ctx.dataDirectory, '.restore-rollback')).catch(() => []);
        assert.equal(rootEntries.length, 0);

        // Calling rollback without a promoted marker must fail explicitly.
        await assert.rejects(() => rollbackPromotedRestore(ctx.dataDirectory), /no promoted restore/i);
    } finally {
        await rm(ctx.root, { recursive: true, force: true });
    }
});

test('hard external mirror & GFS retention: verifies digests, ignores manual backups, and enforces window pruning', async () => {
    const root = await mkdtemp(join(tmpdir(), 'devledger-retention-'));
    const data = join(root, 'data');
    const external = join(root, 'external-drive');
    await mkdir(data, { recursive: true });
    await mkdir(external, { recursive: true });

    try {
        const insideSub = join(data, 'sub');
        await mkdir(insideSub, { recursive: true });
        await assert.rejects(() => validateExternalBackupDirectory(insideSub, data), /outside DevLedger/);

        const source = join(data, 'snapshot-2026-11-26T10-00-00.000Z.nsbackup');
        await writeFile(source, Buffer.from('deterministic-snapshot-payload'));
        const mirrored = await mirrorEncryptedBackup(source, external, data);
        const expectedSha = createHash('sha256').update('deterministic-snapshot-payload').digest('hex');
        assert.equal(mirrored.sha256, expectedSha);

        await writeFile(join(external, 'manual-archive.nsbackup'), 'keep-me');
        const snapshots = await listExternalSnapshots(external);
        assert.equal(snapshots.length, 1);

        // Verify GFS retention schedule: 48 newest always kept, plus up to 7 daily, 4 weekly, 6 monthly.
        const now = new Date('2026-11-26T12:00:00Z');
        const recent = Array.from({ length: 48 }, (_, index) => ({
            path: `recent-${index}`,
            createdAt: new Date(now.getTime() - index * 30 * 60_000).toISOString(),
        }));
        const daily = [
            { path: 'd-24', createdAt: '2026-11-24T12:00:00Z' },
            { path: 'd-23-old', createdAt: '2026-11-23T06:00:00Z' },
            { path: 'd-23-new', createdAt: '2026-11-23T18:00:00Z' },
            { path: 'd-22', createdAt: '2026-11-22T12:00:00Z' },
            { path: 'd-21', createdAt: '2026-11-21T12:00:00Z' },
            { path: 'd-20', createdAt: '2026-11-20T12:00:00Z' },
            { path: 'd-19', createdAt: '2026-11-19T12:00:00Z' },
        ];
        const candidates = [
            ...recent,
            ...daily,
            // Two snapshots in an earlier week (past all 7 daily slots): newest kept in weekly bucket, older pruned
            { path: 'w2-old', createdAt: '2026-11-09T09:00:00Z' },
            { path: 'w2-new', createdAt: '2026-11-11T09:00:00Z' },
            // Monthly anchor in October
            { path: 'm1', createdAt: '2026-10-10T10:00:00Z' },
        ];
        const kept = selectRetainedSnapshots(candidates, now);
        assert.equal(kept.has('recent-0'), true);
        assert.equal(kept.has('recent-47'), true);
        assert.equal(kept.has('d-23-new'), true);
        assert.equal(kept.has('d-23-old'), false);
        assert.equal(kept.has('w2-new'), true);
        assert.equal(kept.has('w2-old'), false);
        assert.equal(kept.has('m1'), true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
