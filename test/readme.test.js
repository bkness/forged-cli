import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import inquirer from 'inquirer';
import { readmeCommand } from '../src/commands/readme.js';

// `require('inquirer').prompt` is undefined on Inquirer 13 (it lives under
// .default), which made `forged readme` crash before its first question
test('inquirer.prompt resolves to a function', () => {
  assert.equal(typeof inquirer.prompt, 'function');
});

test('Ctrl+C at a prompt cancels cleanly and writes nothing', async (t) => {
  const out = join(mkdtempSync(join(tmpdir(), 'forged-readme-')), 'README.md');
  t.mock.method(console, 'log', () => {});
  t.mock.method(inquirer, 'prompt', async () => {
    const err = new Error('User force closed the prompt with SIGINT');
    err.name = 'ExitPromptError';
    throw err;
  });

  assert.equal(await readmeCommand(out), false);
  assert.equal(existsSync(out), false);
});

test('other prompt errors still surface', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(inquirer, 'prompt', async () => { throw new Error('boom'); });
  await assert.rejects(readmeCommand(join(tmpdir(), 'never.md')), /boom/);
});
