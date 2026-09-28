import { createRequire } from 'module';
import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import { detectProjectInfo } from '../utils/detectProject.js';
import { generateMarkdown } from '../utils/generateMarkdown.js';

const require = createRequire(import.meta.url);
const { prompt } = require('inquirer');

const green  = '\x1b[32m';
const purple = '\x1b[35m';
const reset  = '\x1b[0m';

export async function readmeCommand(outputPath = 'README.md') {
  const detected = detectProjectInfo();

  console.log(`\n${green}⚒  Forged README Generator${reset}`);
  if (detected.github) console.log(`   Detected GitHub user: ${detected.github}`);
  console.log('   Press Enter to accept defaults.\n');

  const answers = await prompt([
    {
      type: 'input',
      name: 'title',
      message: `${green}Project name:${reset}`,
      default: detected.title,
    },
    {
      type: 'input',
      name: 'description',
      message: `${green}Short description:${reset}`,
    },
    {
      type: 'input',
      name: 'toDo',
      message: `${green}To-do items (leave blank to skip section):${reset}`,
    },
    {
      type: 'list',
      name: 'license',
      message: `${green}License:${reset}`,
      choices: ['MIT', 'APACHE 2.0', 'GPL 3.0', 'BSD 3', 'None'],
    },
    {
      type: 'input',
      name: 'installation',
      message: `${green}Install command:${reset}`,
      default: detected.installCommand,
    },
    {
      type: 'input',
      name: 'test',
      message: `${green}Test command:${reset}`,
      default: detected.testCommand,
    },
    {
      type: 'input',
      name: 'usage',
      message: `${green}Usage instructions:${reset}`,
    },
    {
      type: 'input',
      name: 'contributing',
      message: `${green}Contributing guidelines:${reset}`,
      default: 'Fork the project and open a pull request with your changes',
    },
    {
      type: 'input',
      name: 'github',
      message: `${green}GitHub username:${reset}`,
      default: detected.github,
    },
    {
      type: 'input',
      name: 'email',
      message: `${green}Email address:${reset}`,
      default: detected.email,
    },
  ]);

  const markdown = generateMarkdown(answers);
  await writeFile(resolve(outputPath), markdown, 'utf8');
  console.log(`\n${purple}✔  README written to ${outputPath}${reset}\n`);
}
