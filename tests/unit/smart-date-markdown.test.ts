import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSmartDateMarkdownLink, serializeSmartDateMarkdown } from '../../src/domain/smart-date-markdown.ts';

test('date-only references round-trip through Markdown without a timezone conversion', () => {
  const source = { date: '2026-12-18', time: null, isoUtc: null, timezone: 'Asia/Kolkata', source: 'Friday' };
  const href = serializeSmartDateMarkdown(source).match(/\]\((.+)\)$/)?.[1] ?? '';
  assert.deepEqual(parseSmartDateMarkdownLink(href, source.source), source);
});

test('timed references preserve UTC instant and original timezone metadata', () => {
  const source = { date: '2026-02-01', time: '13:25', isoUtc: '2026-02-01T07:55:00.000Z', timezone: 'Asia/Kolkata', source: '@0102261325' };
  const href = serializeSmartDateMarkdown(source).match(/\]\((.+)\)$/)?.[1] ?? '';
  assert.deepEqual(parseSmartDateMarkdownLink(href, source.source), source);
});

test('unsafe or malformed smart-date Markdown links are rejected', () => {
  assert.equal(parseSmartDateMarkdownLink('devledger-date:2026-02-30', 'Bad date'), null);
  assert.equal(parseSmartDateMarkdownLink('devledger-date:2026-02-01?time=25:99', 'Bad time'), null);
  assert.equal(parseSmartDateMarkdownLink('javascript:alert(1)', 'Bad scheme'), null);
});


test('rejects date references when timezone metadata does not match the UTC instant', () => {
  const href = 'devledger-date:2026-02-01?time=13%3A25&utc=2026-02-01T07%3A55%3A00.000Z&tz=America%2FNew_York';
  assert.equal(parseSmartDateMarkdownLink(href, '@0102261325'), null);
});

test('rejects timed references with missing timezone or mismatched time fields', () => {
  assert.equal(parseSmartDateMarkdownLink('devledger-date:2026-02-01?time=13%3A25&utc=2026-02-01T07%3A55%3A00.000Z', 'time'), null);
  assert.equal(parseSmartDateMarkdownLink('devledger-date:2026-02-01?time=11%3A25&utc=2026-02-01T07%3A55%3A00.000Z&tz=Asia%2FKolkata', 'time'), null);
});

test('export rejects internally inconsistent smart-date references', () => {
  assert.throws(() => serializeSmartDateMarkdown({ date: '2026-02-01', time: '13:25', isoUtc: '2026-02-01T07:55:00.000Z', timezone: 'America/New_York', source: 'invalid' }));
});

test('legacy Northstar smart-date links remain readable after rebranding', () => {
  const legacy = 'northstar-date:2026-12-18?tz=Asia%2FKolkata';
  assert.deepEqual(parseSmartDateMarkdownLink(legacy, 'Friday'), { date: '2026-12-18', time: null, isoUtc: null, timezone: 'Asia/Kolkata', source: 'Friday' });
  const current = serializeSmartDateMarkdown({ date: '2026-12-18', time: null, isoUtc: null, timezone: 'Asia/Kolkata', source: 'Friday' });
  assert.match(current, /devledger-date:/);
});
