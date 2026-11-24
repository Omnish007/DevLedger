import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSmartDateInstant } from '../../src/domain/smart-date-resolution.ts';

test('date-only reminder resolves to 09:00 in the local timezone', () => {
  const resolved = resolveSmartDateInstant('18/12/2026');
  const local = new Date(resolved.isoUtc);
  assert.equal(resolved.isDateOnly, true);
  assert.equal(resolved.localDate, '2026-12-18');
  assert.equal(resolved.localTime, '09:00');
  assert.equal(local.getFullYear(), 2026);
  assert.equal(local.getMonth(), 11);
  assert.equal(local.getDate(), 18);
  assert.equal(local.getHours(), 9);
});

test('date-time reminder retains the exact parsed UTC instant', () => {
  const resolved = resolveSmartDateInstant('@1812261540');
  assert.equal(resolved.isDateOnly, false);
  assert.equal(resolved.localDate, '2026-12-18');
  assert.equal(resolved.localTime, '15:40');
  assert.equal(resolved.isoUtc, new Date(resolved.isoUtc).toISOString());
});

test('date-only default hour is validated', () => {
  assert.throws(() => resolveSmartDateInstant('18/12/2026', new Date(), 24), /between 00 and 23/);
});
