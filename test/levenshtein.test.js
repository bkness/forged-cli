import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levenshtein, isSuspiciousName } from '../src/utils/levenshtein.js';

test('levenshtein: identical strings are distance 0', () => {
  assert.equal(levenshtein('react', 'react'), 0);
});

test('levenshtein: counts single edits', () => {
  assert.equal(levenshtein('react', 'reakt'), 1); // substitution
  assert.equal(levenshtein('react', 'reactt'), 1); // insertion
  assert.equal(levenshtein('react', 'rect'), 1); // deletion
});

test('levenshtein: handles empty strings', () => {
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('abc', ''), 3);
});

test('isSuspiciousName: flags near-miss of a popular package', () => {
  const hits = isSuspiciousName('expres', ['express', 'react']);
  assert.deepEqual(hits, [{ known: 'express', distance: 1 }]);
});

test('isSuspiciousName: exact match is not suspicious', () => {
  assert.deepEqual(isSuspiciousName('express', ['express']), []);
});

test('isSuspiciousName: respects the threshold', () => {
  assert.deepEqual(isSuspiciousName('exprezzz', ['express'], 2), []);
  assert.equal(isSuspiciousName('exprezzz', ['express'], 3).length, 1);
});

test('isSuspiciousName: short names need a 1-character difference', () => {
  // tsx is 2 edits from nx, ws and tar — unrelated, not typosquats
  assert.deepEqual(isSuspiciousName('tsx', ['nx', 'ws', 'tar']), []);
  // but 1 edit from a short popular name still counts
  assert.deepEqual(isSuspiciousName('wss', ['ws']), [{ known: 'ws', distance: 1 }]);
});

test('isSuspiciousName: longer names keep the 2-character threshold', () => {
  assert.deepEqual(isSuspiciousName('crossenv', ['cross-env']), [{ known: 'cross-env', distance: 1 }]);
  assert.deepEqual(isSuspiciousName('lodahs', ['lodash']), [{ known: 'lodash', distance: 2 }]);
});
