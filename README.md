# ⚒ Forged

> Your dev environment, forged.

[![npm version](https://img.shields.io/npm/v/forged-cli?color=00ff41&style=flat-square)](https://www.npmjs.com/package/forged-cli)
[![downloads](https://img.shields.io/npm/dt/forged-cli?color=00ff41&style=flat-square)](https://www.npmjs.com/package/forged-cli)
[![tests](https://img.shields.io/github/actions/workflow/status/bkness/forged-cli/test.yml?branch=main&label=tests&color=00ff41&style=flat-square)](https://github.com/bkness/forged-cli/actions/workflows/test.yml)
[![license](https://img.shields.io/npm/l/forged-cli?color=00ff41&style=flat-square)](https://github.com/bkness/forged-cli)

**Forged** is a CLI toolkit for developers: a dependency security scanner, a credential generator, and a README generator, with shell and workflow tooling on the way.

🌐 **[weballtech-brandon-kellys-projects.vercel.app](https://weballtech-brandon-kellys-projects.vercel.app/)** — full docs and feature overview

---

## Install

```sh
npm install -g forged-cli
```

Requires Node.js 18 or newer. Published from GitHub Actions with [npm provenance](https://docs.npmjs.com/generating-provenance-statements), so every release is traceable to the commit that built it.

---

## Quick Start

```sh
# Scan a project's dependencies
forged scan ./my-app

# Generate a strong password
forged gen pass

# Write a README for the current project
forged readme
```

---

## 🔍 Security Scanner

`forged scan [path]` audits every package in your `package-lock.json`:

- **Known malware** — checked against [OSV.dev](https://osv.dev), including OpenSSF `MAL-` reports and GitHub malware advisories (CWE-506)
- **Brand-new versions** — flags versions published in the last 72 hours, the window when hijacked releases usually go unnoticed (packages that routinely release every week or two, like `caniuse-lite`, are skipped)
- **Tarball integrity** — lockfile hashes vs. the npm registry
- **Publisher changes** — flags a version whose publisher has never released this package before. Returning maintainers, known teams, and moves to npm trusted publishing are suppressed; security-critical packages like `jsonwebtoken` and `bcrypt` are always flagged for review
- **Typosquats** — names one or two characters away from popular packages (one for short names, so `tsx` isn't mistaken for `nx`)
- **Suspicious install scripts** — `curl | sh`, `eval`, base64 decoding and similar

```
Summary: 0 error(s), 1 warning(s), 39 suppressed
  ℹ  Verified 760 packages against npm registry
  ℹ  Checked 760 packages against OSV.dev known-malware database
```

| Flag | Description |
|------|-------------|
| `--verbose`, `-v` | Show suppressed maintainer rotations |
| `--report` | Save findings to `forged-report.json` |
| `--report-md` | Save findings to `forged-report.md` |

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
| `forged init` | Set up a modular zsh environment — plugins, hooks, project auto-detection, and a GitHub dashboard |
| `forged new` | Create a new project with GitHub setup |
| `forged install` | Add Forged to an existing shell config |

Want them today? They're running in my [dotfiles](https://github.com/bkness/dotfiles).

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
