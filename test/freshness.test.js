import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoursSincePublish } from '../src/utils/freshness.js';

const NOW = Date.parse('2026-09-26T12:00:00Z');

test('flags a version published within the window', () => {
  const time = { '1.2.3': '2026-09-26T02:00:00Z' };
  assert.equal(hoursSincePublish(time, '1.2.3', NOW), 10);
});

test('ignores versions older than the window', () => {
  const time = { '1.2.3': '2026-09-20T12:00:00Z' };
  assert.equal(hoursSincePublish(time, '1.2.3', NOW), null);
});

test('respects a custom window', () => {
  const time = { '1.2.3': '2026-09-25T00:00:00Z' }; // 36h old
  assert.equal(hoursSincePublish(time, '1.2.3', NOW, 24), null);
  assert.equal(hoursSincePublish(time, '1.2.3', NOW, 48), 36);
});

test('missing or garbage timestamps are not flagged', () => {
  assert.equal(hoursSincePublish(undefined, '1.0.0', NOW), null);
  assert.equal(hoursSincePublish({}, '1.0.0', NOW), null);
  assert.equal(hoursSincePublish({ '1.0.0': 'not a date' }, '1.0.0', NOW), null);
});

test('future timestamps (clock skew) are not flagged', () => {
  assert.equal(hoursSincePublish({ '1.0.0': '2026-09-27T00:00:00Z' }, '1.0.0', NOW), null);
});
