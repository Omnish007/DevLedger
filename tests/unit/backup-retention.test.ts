import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRetainedSnapshots } from '../../src/domain/backup-retention.ts';

test('retains short-interval, daily, weekly and monthly restore points', () => {
    const now = new Date('2026-11-22T12:00:00.000Z');
    const snapshots = Array.from({ length: 240 }, (_, index) => {
        const createdAt = new Date(now.getTime() - index * 6 * 60 * 60 * 1000).toISOString();
        return { path: `snapshot-${index}`, createdAt };
    });
    const retained = selectRetainedSnapshots(snapshots, now);
    assert.ok(retained.has('snapshot-0'));
    assert.ok(retained.has('snapshot-4'));
    assert.ok(retained.size < snapshots.length);
    assert.ok(retained.size > 10);
});

test('does not retain future or invalid snapshots', () => {
    const retained = selectRetainedSnapshots(
        [
            { path: 'valid', createdAt: '2026-11-22T11:00:00.000Z' },
            { path: 'future', createdAt: '2026-11-23T11:00:00.000Z' },
            { path: 'invalid', createdAt: 'not-a-date' },
        ],
        new Date('2026-11-22T12:00:00.000Z'),
    );
    assert.deepEqual([...retained], ['valid']);
});

import {
    assertCredentialCanBeInitialized,
    isAutomaticSnapshotName,
} from '../../src/domain/automatic-backup-credential.ts';

test('automatic snapshot recognition excludes manual archive names', () => {
    assert.equal(isAutomaticSnapshotName('snapshot-2026-11-22T12-30-00.000Z.nsbackup'), true);
    assert.equal(isAutomaticSnapshotName('client-handover.nsbackup'), false);
    assert.equal(isAutomaticSnapshotName('snapshot-corrupt.nsbackup'), false);
});

test('a missing OS key cannot be replaced while automatic snapshots exist', () => {
    assert.throws(
        () => assertCredentialCanBeInitialized(['snapshot-2026-11-22T12-30-00.000Z.nsbackup']),
        /key is missing.*snapshots still exist/i,
    );
    assert.doesNotThrow(() => assertCredentialCanBeInitialized(['manual-archive.nsbackup', 'notes.txt']));
});
