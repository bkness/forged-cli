import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlan, hookBlock, zshrcLoadsDotfiles, initCommand, realEnv, TOOLS, HOOK_MARKER, packageFor } from '../src/commands/init.js';

const HOME = '/home/test';
const ALL_TOOLS = Object.keys(TOOLS);

// A fake machine: which commands are on PATH, which files exist
const env = ({ has = [], files = {}, links = {} } = {}) => ({
  home: HOME,
  has: (cmd) => has.includes(cmd),
  exists: (path) => path in files,
  read: (path) => files[path],
  symlinkTarget: (path) => links[path] ?? null,
});
const step = (plan, id) => plan.find((s) => s.id === id);

test('fresh Mac with Homebrew on PATH: every step is to do', () => {
  const plan = buildPlan(env({ has: ['brew', 'git'] }));
  assert.deepEqual(plan.map((s) => s.id), ['tools', 'zinit', 'dotfiles', 'zshrc']);
  assert.ok(plan.every((s) => !s.done));
  assert.deepEqual(step(plan, 'tools').missing, ALL_TOOLS.filter((t) => t !== 'git'));
});

test('Homebrew installed but not on PATH: adds the shellenv step and uses the full path', () => {
  const plan = buildPlan(env({ files: { '/opt/homebrew/bin/brew': '' } }));
  const brewPath = step(plan, 'brew-path');
  assert.ok(brewPath);
  assert.equal(brewPath.line, 'eval "$(/opt/homebrew/bin/brew shellenv)"');
  assert.equal(step(plan, 'tools').brew, '/opt/homebrew/bin/brew');
  assert.equal(step(plan, 'tools').brewAvailable, true);
});

test('no Homebrew at all: tools step says so instead of trying brew', () => {
  const plan = buildPlan(env());
  assert.equal(step(plan, 'brew-path'), undefined);
  assert.equal(step(plan, 'tools').brewAvailable, false);
});

test('an already set-up machine has nothing to do', () => {
  const plan = buildPlan(env({
    has: ['brew', ...ALL_TOOLS],
    files: {
      [`${HOME}/.local/share/zinit/zinit.git`]: '',
      [`${HOME}/dev/dotfiles`]: '',
      [`${HOME}/.zshrc`]: `export FOO=1\n${hookBlock()}`,
    },
  }));
  assert.ok(plan.every((s) => s.done));
});

test('~/.zshrc symlinked into the dotfiles repo counts as loading it', () => {
  assert.equal(zshrcLoadsDotfiles('anything', '/Users/x/dev/dotfiles/zsh/.zshrc'), true);
});

test('a hand-written source line counts as loading the dotfiles', () => {
  assert.equal(zshrcLoadsDotfiles('source ~/dev/dotfiles/zsh/.zshrc\n', null), true);
  assert.equal(zshrcLoadsDotfiles('source ~/.oh-my-zsh/oh-my-zsh.sh\n', null), false);
  assert.equal(zshrcLoadsDotfiles(null, null), false);
});

test('the hook block is marked and guards a missing checkout', () => {
  const block = hookBlock();
  assert.ok(block.includes(HOOK_MARKER));
  assert.match(block, /\[\[ -f "\$HOME\/dev\/dotfiles\/zsh\/\.zshrc" \]\] && source/);
});

// End to end through the CLI, with an empty HOME and a PATH without brew
const BIN = fileURLToPath(new URL('../bin/forged.js', import.meta.url));
const cli = (args, home) => spawnSync(process.execPath, [BIN, ...args], {
  encoding: 'utf8',
  env: { HOME: home, PATH: '/nonexistent', NO_COLOR: '1' },
});

// These run the real binary, which probes /opt/homebrew. --dry-run never runs
// anything, and the --yes test puts a fake brew on PATH so nothing is missing.
test('init --dry-run lists the plan and changes nothing', () => {
  const home = mkdtempSync(join(tmpdir(), 'forged-init-'));
  writeFileSync(join(home, '.zshrc'), 'export KEEP=1\n');
  const r = cli(['init', '--dry-run'], home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Install command-line tools/);
  assert.match(r.stdout, /Dry run: nothing was changed/);
  assert.deepEqual(readdirSync(home), ['.zshrc']);
});

test('init without a terminal asks for --yes instead of hanging', () => {
  const home = mkdtempSync(join(tmpdir(), 'forged-init-'));
  const r = cli(['init'], home);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /forged init --yes/);
});

test('init --yes appends the hook once and backs up ~/.zshrc', () => {
  const home = mkdtempSync(join(tmpdir(), 'forged-init-'));
  // Pretend tools, zinit and dotfiles are done so only the zshrc step runs
  mkdirSync(join(home, '.local/share/zinit/zinit.git'), { recursive: true });
  mkdirSync(join(home, 'dev/dotfiles'), { recursive: true });
  const bin = join(home, 'bin');
  mkdirSync(bin);
  for (const t of ['brew', ...ALL_TOOLS]) writeFileSync(join(bin, t), '');
  writeFileSync(join(home, '.zshrc'), 'export KEEP=1\n');
  const go = () => spawnSync(process.execPath, [BIN, 'init', '--yes'], {
    encoding: 'utf8',
    env: { HOME: home, PATH: bin, NO_COLOR: '1' },
  });

  assert.equal(go().status, 0);
  assert.equal(go().status, 0); // second run: already done, no second hook
  const zshrc = spawnSync('cat', [join(home, '.zshrc')], { encoding: 'utf8' }).stdout;
  assert.ok(zshrc.startsWith('export KEEP=1\n'));
  assert.equal(zshrc.split(HOOK_MARKER).length - 1, 1);
  assert.equal(readdirSync(home).filter((f) => f.startsWith('.zshrc.forged-backup-')).length, 1);
});

test('init --yes without Homebrew lists the tools to install and keeps going', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'forged-init-'));
  mkdirSync(join(home, '.local/share/zinit/zinit.git'), { recursive: true });
  mkdirSync(join(home, 'dev/dotfiles'), { recursive: true });
  // No brew on PATH and none at the usual install paths
  const fakeEnv = { ...realEnv(home), has: () => false, brewPaths: [] };
  const ran = [];
  const out = [];
  t.mock.method(console, 'log', (...a) => out.push(a.join(' ')));

  const code = await initCommand(['--yes'], { home, env: fakeEnv, run: (cmd, args) => ran.push([cmd, ...args]) });

  assert.equal(code, 0);
  assert.deepEqual(ran, []); // never tried to run brew
  assert.match(out.join('\n'), /install these yourself:.*\bgh\b/);
  assert.match(out.join('\n'), /All set/);
  assert.ok(readdirSync(home).includes('.zshrc'));
});

test('tools install under their Homebrew package name', () => {
  assert.equal(packageFor('rg'), 'ripgrep');
  assert.equal(packageFor('jq'), 'jq');
});
