#!/usr/bin/env node

const [,, command] = process.argv;

const commands = {
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
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const { version } = require('../package.json');
  console.log(`forged-cli v${version}`);
  process.exit(0);
}

console.log(`⚒  Forged — '${command}' coming soon.`);
