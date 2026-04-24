import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { basename, resolve } from 'path';

export function detectProjectInfo() {
  const cwd = process.cwd();
  const info = {
    title: basename(cwd),
    github: '',
    email: '',
    installCommand: 'npm i',
    testCommand: 'npm test',
  };

  // Pull GitHub username + email from git config
  try {
    const remoteUrl = execSync('git remote get-url origin 2>/dev/null', { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString().trim();
    const match = remoteUrl.match(/github\.com[:/]([^/]+)/);
    if (match) info.github = match[1];
  } catch {}

  try {
    info.email = execSync('git config user.email', { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {}

  // Detect stack and set install/test defaults
  if (existsSync('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      if (pkg.scripts?.test && !pkg.scripts.test.includes('no test')) {
        info.testCommand = 'npm test';
      }
    } catch {}
  } else if (existsSync('requirements.txt')) {
    info.installCommand = 'pip install -r requirements.txt';
    info.testCommand = 'pytest';
  } else if (existsSync('Cargo.toml')) {
    info.installCommand = 'cargo build';
    info.testCommand = 'cargo test';
  } else if (existsSync('go.mod')) {
    info.installCommand = 'go mod download';
    info.testCommand = 'go test ./...';
  }

  return info;
}
