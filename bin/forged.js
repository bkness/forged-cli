#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const [,, command, ...args] = process.argv;

const commands = {
  scan:    'Audit dependencies — known malware, integrity, publisher changes, typosquats',
  gen:     'Generate passwords, secrets, PINs, and UUIDs',
  readme:  'Generate a README.md for the current project',
  version: 'Show Forged version',
};

// Advertised but not built yet — say so instead of treating them as typos
const planned = {
  init:    'Scaffold a new dev environment',
  new:     'Create a new project with GitHub setup',
  install: 'Install Forged into an existing shell config',
};

if (!command || command === 'help') {
  console.log(`
  ⚒  Forged — your dev environment, forged.

  Usage:
    forged <command>

  Commands:
${Object.entries(commands).map(([cmd, desc]) => `    ${cmd.padEnd(10)} ${desc}`).join('\n')}

  Coming soon:
${Object.entries(planned).map(([cmd, desc]) => `    ${cmd.padEnd(10)} ${desc}`).join('\n')}

  Scan options:
    forged scan [path] [--verbose|-v] [--report|--report-md]
    Exits 1 when errors are found, so it can fail a CI job.
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

if (command === 'gen') {
  const { genCommand } = await import('../src/commands/gen.js');
  await genCommand(args);
  process.exit(0);
}

if (command === 'scan') {
  const { scanCommand } = await import('../src/commands/scan.js');
  const { resolve } = await import('path');
  const report       = args.includes('--report') || args.includes('--report-md');
  const reportFormat = args.includes('--report-md') ? 'markdown' : 'json';
  const verbose      = args.includes('--verbose') || args.includes('-v');
  // Any dash-prefixed arg is a flag, not the path (so `-v` isn't scanned as a dir)
  const pathArg      = args.find(a => !a.startsWith('-'));
  const targetPath   = pathArg ? resolve(pathArg) : process.cwd();
  const findings     = await scanCommand(targetPath, { report, reportFormat, verbose });
  process.exit(findings?.errors.length ? 1 : 0);
}

if (planned[command]) {
  console.log(`⚒  Forged — '${command}' is coming soon.`);
  process.exit(0);
}

console.error(`⚒  Forged — unknown command '${command}'. Run \`forged help\` to see commands.`);
process.exit(1);
