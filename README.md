# ⚒ Forged

> Your dev environment, forged.

[![npm version](https://img.shields.io/npm/v/forged-cli?color=1a7f37&labelColor=161b22&style=flat-square)](https://www.npmjs.com/package/forged-cli)
[![downloads](https://img.shields.io/npm/dt/forged-cli?color=1a7f37&labelColor=161b22&style=flat-square)](https://www.npmjs.com/package/forged-cli)
[![tests](https://img.shields.io/github/actions/workflow/status/bkness/forged-cli/test.yml?branch=main&label=tests&color=1a7f37&labelColor=161b22&style=flat-square)](https://github.com/bkness/forged-cli/actions/workflows/test.yml)
[![license](https://img.shields.io/npm/l/forged-cli?color=1a7f37&labelColor=161b22&style=flat-square)](https://github.com/bkness/forged-cli)

**Forged** is a CLI toolkit for developers: a guided zsh setup, a dependency security scanner, a credential generator, and a README generator.

🌐 **[weballtech-brandon-kellys-projects.vercel.app](https://weballtech-brandon-kellys-projects.vercel.app/)** — full docs and feature overview

---

## Install

```sh
npm install -g forged-cli
```

Requires Node.js 20.12 or newer. Published from GitHub Actions with [npm provenance](https://docs.npmjs.com/generating-provenance-statements), so every release is traceable to the commit that built it.

---

## Quick Start

```sh
# Set up the Forged shell on this machine (asks before each step)
forged init

# Scan a project's dependencies
forged scan ./my-app

# Generate a strong password
forged gen pass

# Write a README for the current project
forged readme
```

---

## 🐚 Shell Setup

`forged init` sets up the Forged zsh environment from my [dotfiles](https://github.com/bkness/dotfiles): the prompt, the Ctrl+P command palette, the Ctrl+G GitHub dashboard (issue → branch → commit → PR, project boards), code finder, abbreviations, and a hook that scans dependencies when you `cd` into a project.

It's written for people new to the terminal. It shows the whole plan first, explains each step, and asks before doing it:

1. **Homebrew on your PATH.** If Homebrew is installed but `brew` isn't found (the installer's last step is easy to miss), adds its `shellenv` line to `~/.zprofile`
2. **Command-line tools.** Installs whichever of `git gh fzf eza bat fd zoxide starship` are missing, with Homebrew
3. **zinit**, the plugin manager, cloned to `~/.local/share/zinit`
4. **The dotfiles**, cloned to `~/dev/dotfiles`
5. **One line in `~/.zshrc`** that loads them. The file is backed up first, and nothing already in it is changed

Steps that are already done are skipped, so it's safe to run again after fixing an error.

| Command | What it does |
|---------|--------------|
| `forged init` | Guided setup |
| `forged init --dry-run` | Show the plan, change nothing |
| `forged init --yes` | Accept every step without asking |

Needs macOS or Linux. Without Homebrew (on Linux, say), init lists the missing tools for you to install yourself and does the rest.

---

## 🔍 Security Scanner

`forged scan [path]` audits every package in your `package-lock.json`:

- **Known malware** — checked against [OSV.dev](https://osv.dev), including OpenSSF `MAL-` reports and GitHub malware advisories (CWE-506)
- **Brand-new versions** — flags versions published in the last 72 hours, the window when hijacked releases usually go unnoticed (packages that routinely release every week or two, like `caniuse-lite`, are skipped)
- **Tarball integrity** — lockfile hashes vs. the npm registry
- **Publisher changes** — flags a version whose publisher has never released this package before. Returning maintainers, known teams, and moves to npm trusted publishing are suppressed. A new publisher is **auto-verified** when the evidence holds up (see below); otherwise it's flagged as needing review. Security-critical packages like `jsonwebtoken` and `bcrypt` are always flagged for review, with the evidence attached
- **Typosquats** — names one or two characters away from popular packages (one for short names, so `tsx` isn't mistaken for `nx`)
- **Suspicious install scripts** — `curl | sh`, `eval`, base64 decoding and similar

```
Summary: 0 error(s), 1 warning(s), 39 suppressed
  ℹ  Verified 760 packages against npm registry
  ℹ  Checked 760 packages against OSV.dev known-malware database
```

### Publisher auto-verify

Most publisher changes are ordinary maintainer rotations. Before flagging one, the scanner checks for evidence the new publisher belongs:

| Signal | Strength | Check |
|--------|----------|-------|
| Provenance | strong | The release carries a signed npm provenance attestation |
| Prior maintainer | strong | The publisher was already a maintainer on the previous version |
| Repo contributor | medium | The publisher's npm name is a contributor to the package's GitHub repo |
| Org email | weak | The publisher's email domain matches the repo owner (`@auth0.com` → `auth0/…`) |
| Trusted co-maintainer | weak | A known trusted publisher also maintains the package |

One strong signal, or a medium plus a weak one, verifies the change. Weak signals alone never do. The contributor check calls the GitHub API: set `GITHUB_TOKEN` or log in with `gh` for 5,000 requests/hour instead of 60. If GitHub can't be reached the signal is skipped, not counted against the publisher.

```
  ⚠  jsonwebtoken@9.0.3: Publisher changed from "charlesrea" to "julien.wollscheid" — security-critical package, review this release (email domain matches the repo owner)
  ~  react-native-web@0.21.3: Publisher changed from "necolas" to "zoontek" — verified: contributor to the GitHub repo; co-maintains with a trusted publisher
```

| Flag | Description |
|------|-------------|
| `--verbose`, `-v` | Show suppressed maintainer rotations and verified publishers |
| `--report` | Save findings to `forged-report.json` |
| `--report-md` | Save findings to `forged-report.md` |
| `--changed` | Skip if `package.json` + lockfile match a scan from the last 7 days (rescans weekly anyway — new malware advisories land even when your lockfile doesn't change) |
| `--quiet`, `-q` | Print nothing unless something is flagged, then one line — for shell hooks |
| `--review` | Second opinion from `claude -p` on publisher changes auto-verify couldn't clear (see below) |

### `--review`: a second opinion

Publisher changes that auto-verify can't clear go to [Claude Code](https://claude.com/claude-code) (`claude -p`) along with what the release actually changed: dependencies added or removed, new install scripts, release history, and which verification signals passed.

```
REVIEW — advisory, from claude -p (doesn't change the results above):
  ✔ likely-legit  jsonwebtoken@9.0.3
       The publisher's email domain (auth0.com) matches the repo owner … the patch adds no dependencies and no install scripts. …
       → Confirm the 9.0.3 tarball matches a tagged commit in auth0/node-jsonwebtoken.
```

- **Advisory only.** The verdict never changes what's flagged or the exit code.
- **No tools.** Everything sent comes from the public registry and may be attacker-written, so `claude` runs with tools, MCP servers and slash commands disabled — an injected instruction has nothing to act with. The prompt marks the data untrusted, and control characters are stripped from the reply before it reaches your terminal.
- **Only what's unresolved** is sent, and only the publisher's email domain, never the address. Needs the `claude` CLI; without it, `--review` says so and the scan runs as normal.

**Scan on `cd`:** `--changed --quiet` is cheap enough to run every time you enter a project (≈50ms when unchanged). A zsh example:

```zsh
_forged_autoscan() { [[ -f package-lock.json ]] && { forged scan --changed --quiet & } 2>/dev/null }
chpwd_functions+=(_forged_autoscan)
```

**In CI:** `forged scan` exits with code `1` when it finds errors (malware, integrity mismatches, dangerous scripts), so it can fail a build:

```yaml
- run: npx forged-cli scan
```

---

## 🔐 Credential Generator

| Command | Output |
|---------|--------|
| `forged gen pass` | 20-character password (upper, lower, digit, symbol) |
| `forged gen pass --safe` | Password using only `-` and `_` as symbols — router and device friendly |
| `forged gen pass --length=32` | Custom length (`-l=32` also works) |
| `forged gen secret` | 32-byte hex secret for JWTs and API keys |
| `forged gen pin` | 6-digit PIN |
| `forged gen uuid` | UUID v4 |

Built on Node's `crypto.randomInt`, so every character is chosen uniformly.

---

## 📝 README Generator

`forged readme` asks a few questions and writes a `README.md`, pre-filling your GitHub username, email, and install/test commands from the project (Node, Python, Rust, or Go).

---

## 🚧 Coming Soon

These are advertised in `forged help` and currently print "coming soon":

| Command | Plan |
|---------|------|
| `forged new` | Create a new project with GitHub setup |
| `forged install` | Add Forged to an existing shell config |

`forged init` already sets up the shell and GitHub workflow these build on.

---

## Development

```sh
git clone https://github.com/bkness/forged-cli.git
cd forged-cli
npm install
npm test        # node:test, no network needed
npm link        # use your local copy as the global `forged`
```

---

## License

MIT © [Brandon Kelly](https://github.com/bkness)

## Contact

Brandon Kelly — [GitHub](https://github.com/bkness) · [weballtech-brandon-kellys-projects.vercel.app](https://weballtech-brandon-kellys-projects.vercel.app/) · kbrandon863@gmail.com
