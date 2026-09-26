import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, previousVersion } from '../src/utils/semver.js';

test('compareVersions: numeric, not string, ordering', () => {
  assert.equal(compareVersions('0.41.2', '0.34.3'), 1);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0);
});

test('compareVersions: prereleases sort before their release', () => {
  assert.equal(compareVersions('5.0.0-beta.31', '5.0.0'), -1);
  assert.equal(compareVersions('5.0.0-beta.31', '5.0.0-beta.4'), 1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1);
});

test('previousVersion: ignores a backport published later', () => {
  // registry (publish) order: 0.41.1, 0.34.3 backport, 0.41.2
  assert.equal(previousVersion(['0.41.1', '0.34.3', '0.41.2'], '0.41.2'), '0.41.1');
});

test('previousVersion: stable releases skip prereleases', () => {
  assert.equal(previousVersion(['4.0.0', '5.0.0-rc.1', '5.0.0'], '5.0.0'), '4.0.0');
  assert.equal(previousVersion(['5.0.0-beta.30', '5.0.0-beta.31'], '5.0.0-beta.31'), '5.0.0-beta.30');
});

test('previousVersion: first version has no predecessor', () => {
  assert.equal(previousVersion(['1.0.0'], '1.0.0'), null);
});
