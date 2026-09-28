import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint, previousResult, recordResult, RESCAN_DAYS } from '../src/utils/scanState.js';

// Fake HOME so the real ~/.forged-scan-state.json is never touched
process.env.HOME = mkdtempSync(join(tmpdir(), 'forged-home-'));

const project = (lock) => {
  const dir = mkdtempSync(join(tmpdir(), 'forged-state-'));
  writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
  if (lock) writeFileSync(join(dir, 'package-lock.json'), lock);
  return dir;
};
const clean = { errors: [], warnings: [] };
const DAY = 24 * 60 * 60 * 1000;

test('fingerprint changes when the lockfile changes', () => {
  const dir = project('{"v":1}');
  const before = fingerprint(dir);
  writeFileSync(join(dir, 'package-lock.json'), '{"v":2}');
  assert.notEqual(fingerprint(dir), before);
});

test('adding a lockfile changes the fingerprint', () => {
  const dir = project();
  const before = fingerprint(dir);
  writeFileSync(join(dir, 'package-lock.json'), '{}');
  assert.notEqual(fingerprint(dir), before);
});

test('previousResult returns the recorded scan while it is fresh', () => {
  const dir = project('{}');
  const now = Date.now();
  recordResult(dir, { errors: [], warnings: [{}] }, now);
  assert.equal(previousResult(dir, now + DAY).warnings, 1);
});

test(`previousResult expires after ${RESCAN_DAYS} days`, () => {
  const dir = project('{}');
  const now = Date.now();
  recordResult(dir, clean, now);
  assert.equal(previousResult(dir, now + (RESCAN_DAYS + 1) * DAY), null);
});

test('previousResult is null for a project never scanned', () => {
  assert.equal(previousResult(project('{}')), null);
});
