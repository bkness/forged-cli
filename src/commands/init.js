import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, lstatSync, realpathSync } from 'fs';
import { createInterface } from 'readline/promises';
import { homedir } from 'os';
import { join, delimiter, dirname } from 'path';

const green  = '\x1b[32m';
const yellow = '\x1b[33m';
const red    = '\x1b[31m';
const bold   = '\x1b[1m';
const dim    = '\x1b[2m';
const reset  = '\x1b[0m';

// What the dotfiles expect on PATH, and what each one is for — shown to the
// user so a beginner knows why we're installing it
export const TOOLS = {
  git:      'version control',
  gh:       'GitHub from the terminal (Ctrl+G)',
  fzf:      'fuzzy finder behind every picker',
  eza:      'a nicer `ls`',
  bat:      'a nicer `cat` with syntax colors',
  fd:       'a faster `find`',
  zoxide:   'jump to folders you visit often (Ctrl+J)',
  starship: 'the prompt',
  rg:       'fast code search behind the code finder',
  jq:       'reads JSON, for project settings',
};

// Package names that differ from the command they install
export const PACKAGES = { rg: 'ripgrep' };
export const packageFor = (tool) => PACKAGES[tool] ?? tool;

export const DOTFILES_REPO = 'https://github.com/bkness/dotfiles.git';
export const ZINIT_REPO    = 'https://github.com/zdharma-continuum/zinit.git';
export const HOOK_MARKER   = '# forged: load the Forged shell';

// Where Homebrew lives when it's installed but not on PATH yet (Apple
// Silicon, Intel, Linux). The installer prints a "Next steps" shellenv line
// that beginners skip, which leaves `brew: command not found`.
export const BREW_PATHS = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew', '/home/linuxbrew/.linuxbrew/bin/brew'];

export function paths(home) {
  return {
    dotfiles: join(home, 'dev', 'dotfiles'),
    zinit:    join(home, '.local', 'share', 'zinit', 'zinit.git'),
    zshrc:    join(home, '.zshrc'),
    zprofile: join(home, '.zprofile'),
  };
}

// The one block appended to ~/.zshrc. $HOME stays literal so the line still
// works if the home folder is renamed.
export function hookBlock() {
  return `\n${HOOK_MARKER}\n[[ -f "$HOME/dev/dotfiles/zsh/.zshrc" ]] && source "$HOME/dev/dotfiles/zsh/.zshrc"\n`;
}

// Already loading the dotfiles: our marker, a hand-written source line, or
// ~/.zshrc symlinked straight into the repo (how Brandon's Mac is set up)
export function zshrcLoadsDotfiles(zshrcText, zshrcTarget) {
  if (zshrcTarget && zshrcTarget.endsWith('/dev/dotfiles/zsh/.zshrc')) return true;
  if (!zshrcText) return false;
  return zshrcText.includes(HOOK_MARKER) || /source\s+\S*dev\/dotfiles\/zsh\/\.zshrc/.test(zshrcText);
}

// Everything init would do, in order, with `done` marking steps that are
// already in place. Pure: all probing comes in through `env`.
export function buildPlan(env) {
  const p = paths(env.home);
  const steps = [];

  const brewOnPath = env.has('brew');
  const brewPath = brewOnPath ? null : (env.brewPaths ?? BREW_PATHS).find(env.exists);

  if (!brewOnPath && brewPath) {
    steps.push({
      id: 'brew-path',
      title: 'Put Homebrew on your PATH',
      why: `Homebrew is installed at ${brewPath}, but your shell can't find it yet. This adds one line to ~/.zprofile, the step the Homebrew installer asks you to run at the end.`,
      line: `eval "$(${brewPath} shellenv)"`,
      brewPath,
      done: false,
    });
  }

  const brewAvailable = brewOnPath || Boolean(brewPath);
  const missing = Object.keys(TOOLS).filter((t) => !env.has(t));
  steps.push({
    id: 'tools',
    title: 'Install command-line tools',
    why: missing.length
      ? `Missing: ${missing.map((t) => `${t} (${TOOLS[t]})`).join(', ')}.`
      : 'All installed.',
    missing,
    brewAvailable,
    // Full path when it isn't on PATH, so this works even if step 1 was skipped
    brew: brewOnPath ? 'brew' : brewPath,
    done: missing.length === 0,
  });

  steps.push({
    id: 'zinit',
    title: 'Install zinit, the zsh plugin manager',
    why: 'It loads autosuggestions, syntax highlighting, fuzzy tab completion and abbreviations.',
    dir: p.zinit,
    done: env.exists(p.zinit),
  });

  steps.push({
    id: 'dotfiles',
    title: 'Download the Forged shell config',
    why: `Clones ${DOTFILES_REPO} to ~/dev/dotfiles: the prompt, widgets (Ctrl+P, Ctrl+G, Ctrl+F…), aliases and hooks.`,
    dir: p.dotfiles,
    done: env.exists(p.dotfiles),
  });

  const zshrcText = env.exists(p.zshrc) ? env.read(p.zshrc) : null;
  steps.push({
    id: 'zshrc',
    title: 'Load it from ~/.zshrc',
    why: zshrcText === null
      ? 'Creates ~/.zshrc with one line that loads the Forged shell.'
      : 'Backs up ~/.zshrc, then adds one line at the end that loads the Forged shell. Nothing already in the file is changed.',
    file: p.zshrc,
    exists: zshrcText !== null,
    done: zshrcLoadsDotfiles(zshrcText, env.symlinkTarget(p.zshrc)),
  });

  return steps;
}

export function realEnv(home) {
  return {
    home,
    brewPaths: BREW_PATHS,
    has: (cmd) => (process.env.PATH || '').split(delimiter).some((dir) => dir && existsSync(join(dir, cmd))),
    exists: existsSync,
    read: (file) => readFileSync(file, 'utf8'),
    symlinkTarget: (file) => {
      try { return lstatSync(file).isSymbolicLink() ? realpathSync(file) : null; } catch { return null; }
    },
  };
}

const runCommand = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' }).status === 0;

// Carries out one step: true when done, false when it failed (init stops so
// later steps don't build on a broken one), 'manual' when the user has to do
// it themselves.
function apply(step, home, run) {
  switch (step.id) {
    case 'brew-path': {
      appendFileSync(paths(home).zprofile, `\n${step.line}\n`);
      // Later steps in this same run need brew too
      process.env.PATH = `${dirname(step.brewPath)}${delimiter}${process.env.PATH}`;
      return true;
    }
    case 'tools': {
      if (!step.brewAvailable) {
        console.log(`  ${yellow}Homebrew isn't installed, so install these yourself:${reset} ${bold}${step.missing.map(packageFor).join(' ')}${reset}`);
        console.log(`  ${dim}On a Mac, get Homebrew from https://brew.sh and run forged init again. On Linux, use your package manager.${reset}`);
        return 'manual';
      }
      return run(step.brew, ['install', ...step.missing.map(packageFor)]);
    }
    case 'zinit':
      return run('git', ['clone', '--depth', '1', ZINIT_REPO, step.dir]);
    case 'dotfiles':
      return run('git', ['clone', DOTFILES_REPO, step.dir]);
    case 'zshrc': {
      if (step.exists) {
        const backup = `${step.file}.forged-backup-${Date.now()}`;
        copyFileSync(step.file, backup);
        console.log(`  ${dim}Backed up to ${backup}${reset}`);
        appendFileSync(step.file, hookBlock());
      } else {
        writeFileSync(step.file, hookBlock().trimStart());
      }
      return true;
    }
  }
  return false;
}

// `env` and `run` are swappable so tests never touch the real Homebrew
export async function initCommand(args, { home = homedir(), env = realEnv(home), run = runCommand } = {}) {
  const yes    = args.includes('--yes') || args.includes('-y');
  const dryRun = args.includes('--dry-run');

  console.log(`\n  ${green}⚒  Forged init${reset} — set up the Forged shell on this machine\n`);

  if (process.platform === 'win32') {
    console.log(`  ${red}The Forged shell is zsh-based and needs macOS or Linux.${reset}\n`);
    return 1;
  }

  const plan = buildPlan(env);
  const todo = plan.filter((s) => !s.done);

  plan.forEach((s, i) => {
    const mark = s.done ? `${green}✓${reset}` : `${yellow}○${reset}`;
    console.log(`  ${mark} ${i + 1}. ${s.title}${s.done ? ` ${dim}(already done)${reset}` : ''}`);
  });
  console.log();

  if (todo.length === 0) {
    console.log(`  ${green}Everything's already set up.${reset} Open a new terminal tab to use it.\n`);
    return 0;
  }

  if (dryRun) {
    for (const s of todo) console.log(`  ${bold}${s.title}${reset}\n  ${dim}${s.why}${reset}\n`);
    console.log(`  ${dim}Dry run: nothing was changed.${reset}\n`);
    return 0;
  }

  if (!yes && !process.stdin.isTTY) {
    console.log(`  No terminal to ask in. Run ${bold}forged init --yes${reset} to accept every step.\n`);
    return 1;
  }

  const rl = yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const s of todo) {
      console.log(`  ${bold}${s.title}${reset}\n  ${dim}${s.why}${reset}`);
      if (rl) {
        const answer = (await rl.question(`  Do it? ${dim}[Y/n]${reset} `)).trim().toLowerCase();
        if (answer && answer !== 'y' && answer !== 'yes') {
          console.log(`  ${dim}Skipped.${reset}\n`);
          continue;
        }
      }
      const result = apply(s, home, run);
      if (!result) {
        console.log(`\n  ${red}✗ ${s.title} didn't finish.${reset} Fix the error above, then run ${bold}forged init${reset} again; finished steps are skipped.\n`);
        return 1;
      }
      console.log(result === 'manual' ? '' : `  ${green}✓ Done${reset}\n`);
    }
  } finally {
    rl?.close();
  }

  console.log(`  ${green}${bold}All set.${reset} Next:`);
  console.log(`    ${bold}exec zsh${reset}          load the new shell in this window`);
  console.log(`    ${bold}gh auth login${reset}     connect GitHub, for the Ctrl+G dashboard`);
  console.log(`    ${bold}a Nerd Font${reset}       for file icons: ${bold}brew install --cask font-jetbrains-mono-nerd-font${reset},`);
  console.log(`                      then pick it in your terminal's font settings`);
  console.log(`    ${bold}Ctrl+P${reset}            browse every command\n`);
  return 0;
}
