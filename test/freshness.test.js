import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoursSincePublish, isRoutineRelease } from '../src/utils/freshness.js';

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

// Build a registry `time` map: versions published `gapDays` apart ending at `end`
const series = (n, gapDays, end = '2026-09-26T00:00:00Z') => {
  const t = { created: '2020-01-01T00:00:00Z', modified: end };
  for (let i = 0; i < n; i++) {
    t[`1.0.${i}`] = new Date(Date.parse(end) - (n - 1 - i) * gapDays * 86_400_000).toISOString();
  }
  return t;
};

test('isRoutineRelease: weekly data packages are routine', () => {
  assert.equal(isRoutineRelease(series(12, 3), '1.0.11'), true);
  assert.equal(isRoutineRelease(series(12, 14), '1.0.11'), true);
});

test('isRoutineRelease: a surprise release on a slow package is not', () => {
  const t = series(8, 120);
  t['1.0.8'] = '2026-09-26T06:00:00Z'; // six hours after a 4-month quiet stretch
  assert.equal(isRoutineRelease(t, '1.0.8'), false);
});

test('isRoutineRelease: too little history to judge', () => {
  assert.equal(isRoutineRelease(series(3, 1), '1.0.2'), false);
  assert.equal(isRoutineRelease({}, '1.0.0'), false);
});
