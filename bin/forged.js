#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const [,, command, ...args] = process.argv;

const commands = {
  readme:  'Generate a README.md for the current project',
  scan:    'Audit dependencies for typosquats, bad scripts, and suspicious binaries',
  init:    'Scaffold a new dev environment',
  new:     'Create a new project with GitHub setup',
  install: 'Install Forged into an existing shell config',
  version: 'Show Forged version',
};

if (!command || command === 'help') {
  console.log(`
  ⚒  Forged — your dev environment, forged.

  Usage:
    forged <command>

  Commands:
${Object.entries(commands).map(([cmd, desc]) => `    ${cmd.padEnd(10)} ${desc}`).join('\n')}
  `);
  process.exit(0);
}

if (command === 'version') {
  console.log(`forged-cli v${version}`);
  process.exit(0);
}

if (command === 'readme') {
  const { readmeCommand } = await import('../src/commands/readme.js');
  await readmeCommand(args[0] || 'README.md');
  process.exit(0);
}

if (command === 'scan') {
  const { scanCommand } = await import('../src/commands/scan.js');
  const { resolve } = await import('path');
  const report       = args.includes('--report') || args.includes('--report-md');
  const reportFormat = args.includes('--report-md') ? 'markdown' : 'json';
  const verbose      = args.includes('--verbose') || args.includes('-v');
  const pathArg      = args.find(a => !a.startsWith('--'));
  const targetPath   = pathArg ? resolve(pathArg) : process.cwd();
  await scanCommand(targetPath, { report, reportFormat, verbose });
  process.exit(0);
}

console.log(`⚒  Forged — '${command}' coming soon.`);
