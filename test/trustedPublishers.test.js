import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPublisherChange, publisherChangeSeverity, NPM_TEAM, TRUSTED_COMMUNITY } from '../src/utils/trustedPublishers.js';

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

const sev = (o) => publisherChangeSeverity({ pkg: 'some-lib', from: 'a', to: 'b', returning: false, ...o });

test('publisherChangeSeverity: first release by an unknown account warns', () => {
  assert.deepEqual(sev({}), { type: 'warn', reason: 'new' });
});

test('publisherChangeSeverity: returning maintainer is suppressed', () => {
  assert.deepEqual(sev({ returning: true }), { type: 'info', reason: 'returning' });
});

test('publisherChangeSeverity: move to npm trusted publishing is suppressed', () => {
  assert.deepEqual(sev({ to: 'GitHub Actions' }), { type: 'info', reason: 'oidc' });
});

test('publisherChangeSeverity: trusted publisher is suppressed', () => {
  assert.deepEqual(sev({ to: 'climba03003' }), { type: 'info', reason: 'trusted' });
});

test('publisherChangeSeverity: security-critical packages always warn', () => {
  assert.deepEqual(
    sev({ pkg: 'jsonwebtoken', from: 'charlesrea', to: 'julien.wollscheid', returning: true }),
    { type: 'warn', reason: 'review' },
  );
});
