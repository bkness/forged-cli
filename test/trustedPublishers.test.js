import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPublisherChange, NPM_TEAM, TRUSTED_COMMUNITY } from '../src/utils/trustedPublishers.js';

test('handoff to an npm team account is info', () => {
  assert.equal(classifyPublisherChange('someone', 'isaacs'), 'info');
});

test('handoff to a trusted community publisher is info', () => {
  assert.equal(classifyPublisherChange('addaleax', 'dbx-node'), 'info');
});

test('trusted → unknown publisher is flagged', () => {
  assert.equal(classifyPublisherChange('sindresorhus', 'totally-new-account'), 'warn');
});

test('unknown → unknown publisher is flagged', () => {
  assert.equal(classifyPublisherChange('a-stranger', 'another-stranger'), 'warn');
});

test('publisher lists have no duplicates across sets', () => {
  const overlap = [...NPM_TEAM].filter((p) => TRUSTED_COMMUNITY.has(p));
  assert.deepEqual(overlap, []);
});
