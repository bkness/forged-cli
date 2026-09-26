import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePassword, generatePin, parseLength } from '../src/commands/gen.js';

test('generatePassword: exact requested length', () => {
  for (const len of [4, 12, 20, 64, 300]) {
    assert.equal(generatePassword(len).length, len);
  }
});

test('generatePassword: always has upper, lower, digit and symbol', () => {
  for (let i = 0; i < 200; i++) {
    const p = generatePassword(8);
    assert.match(p, /[A-Z]/);
    assert.match(p, /[a-z]/);
    assert.match(p, /[0-9]/);
    assert.match(p, /[^A-Za-z0-9]/);
  }
});

test('generatePassword --safe: only URL/shell-safe symbols', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(generatePassword(16, true), /^[A-Za-z0-9_-]+$/);
  }
});

test('generatePassword: character choice is not biased', () => {
  // Compare within the symbol group only — the required upper/lower/digit/
  // symbol picks skew counts *between* groups by design. The full charset is
  // 88 chars and 256 % 88 != 0, so a `byte % length` picker gave the first
  // 18 symbols 3/256 odds and the last 8 only 2/256 (ratio ~1.5).
  const counts = new Map();
  for (let i = 0; i < 4000; i++) {
    for (const c of generatePassword(40)) {
      if (/[^A-Za-z0-9]/.test(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const values = [...counts.values()];
  const ratio = Math.max(...values) / Math.min(...values);
  assert.ok(ratio < 1.25, `most/least common symbol ratio ${ratio.toFixed(2)} (expected ~1.0)`);
});

test('generatePin: digits only, exact length', () => {
  const pin = generatePin(6);
  assert.match(pin, /^[0-9]{6}$/);
});

test('parseLength: reads --length= and -l=', () => {
  assert.equal(parseLength(['pass', '--length=32']), 32);
  assert.equal(parseLength(['pin', '-l=8']), 8);
  assert.equal(parseLength(['pass']), null);
});

test('parseLength: rejects non-numeric lengths', () => {
  assert.ok(Number.isNaN(parseLength(['pass', '--length=abc'])));
  assert.ok(Number.isNaN(parseLength(['pass', '--length=12abc'])));
});
