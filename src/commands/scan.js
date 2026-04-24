import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { isSuspiciousName } from '../utils/levenshtein.js';
import { POPULAR_PACKAGES } from '../utils/popularPackages.js';

const green  = '\x1b[32m';
const yellow = '\x1b[33m';
const red    = '\x1b[31m';
const bold   = '\x1b[1m';
const reset  = '\x1b[0m';

function hashFile(filepath) {
  try {
    const buf = readFileSync(filepath);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

function checkPackageJson(cwd) {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return { deps: {}, error: 'No package.json found' };
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return {
      deps: { ...pkg.dependencies, ...pkg.devDependencies },
      scripts: pkg.scripts || {},
    };
  } catch {
    return { deps: {}, error: 'Could not parse package.json' };
  }
}

async function fetchRegistryMeta(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function scanBinaries(cwd) {
  const binDir = join(cwd, 'node_modules', '.bin');
  if (!existsSync(binDir)) return [];

  const results = [];
  for (const file of readdirSync(binDir)) {
    const fullPath = join(binDir, file);
    try {
      const stat = statSync(fullPath);
      // Flag files that are unexpectedly large for a bin symlink/wrapper
      if (!stat.isSymbolicLink() && stat.size > 50000) {
        results.push({ file, size: stat.size, flag: 'large non-symlink binary' });
      }
    } catch {}
  }
  return results;
}

function checkDangerousScripts(scripts) {
  const dangerous = [];
  const patterns = [
    /curl\s+.*\|.*sh/,
    /wget\s+.*\|.*sh/,
    /eval\s*\(/,
    /base64\s+--decode/,
    /python\s+-c/,
    /exec\s*\(/,
  ];

  for (const [name, cmd] of Object.entries(scripts)) {
    for (const pattern of patterns) {
      if (pattern.test(cmd)) {
        dangerous.push({ script: name, command: cmd, pattern: pattern.toString() });
      }
    }
  }
  return dangerous;
}

export async function scanCommand(cwd = process.cwd()) {
  console.log(`\n${bold}⚒  Forged Scanner${reset}`);
  console.log(`   Scanning: ${cwd}\n`);

  const findings = { warnings: [], errors: [], info: [] };

  // 1. Parse package.json
  const { deps, scripts, error } = checkPackageJson(cwd);
  if (error) {
    findings.errors.push(error);
  }

  // 2. Dangerous install scripts
  if (scripts) {
    const dangerous = checkDangerousScripts(scripts);
    for (const d of dangerous) {
      findings.errors.push(`Dangerous script "${d.script}": ${d.command}`);
    }
  }

  // 3. Typosquat check
  const depNames = Object.keys(deps);
  for (const name of depNames) {
    const suspects = isSuspiciousName(name, POPULAR_PACKAGES);
    for (const { known, distance } of suspects) {
      findings.warnings.push(
        `"${name}" is ${distance} character(s) away from popular package "${known}" — possible typosquat`
      );
    }
  }

  // 4. Registry author check (sample first 10 deps to avoid rate limiting)
  console.log(`   Checking ${depNames.length} dependencies against npm registry...`);
  const sample = depNames.slice(0, 10);
  for (const name of sample) {
    const meta = await fetchRegistryMeta(name);
    if (!meta) {
      findings.warnings.push(`Could not fetch registry data for "${name}"`);
      continue;
    }

    // Flag packages with no maintainers listed
    if (!meta.maintainers || meta.maintainers.length === 0) {
      findings.warnings.push(`"${name}" has no maintainers listed on npm`);
    }

    // Flag packages with very recent creation + high version (rushed publish pattern)
    const created = new Date(meta.time?.created);
    const latest = meta['dist-tags']?.latest;
    if (latest && created) {
      const parts = latest.split('.').map(Number);
      const agedays = (Date.now() - created) / 86400000;
      if (agedays < 7 && parts[0] > 0) {
        findings.warnings.push(
          `"${name}" v${latest} was published within the last 7 days and has a high version number`
        );
      }
    }
  }

  // 5. Binary scan
  const suspiciousBins = scanBinaries(cwd);
  for (const b of suspiciousBins) {
    findings.warnings.push(
      `node_modules/.bin/${b.file} is a large non-symlink binary (${(b.size / 1024).toFixed(1)}KB) — ${b.flag}`
    );
  }

  // Print results
  if (findings.errors.length === 0 && findings.warnings.length === 0) {
    console.log(`${green}✔  No issues found. Looks clean.${reset}\n`);
    return;
  }

  if (findings.errors.length > 0) {
    console.log(`${red}${bold}ERRORS (${findings.errors.length}):${reset}`);
    for (const e of findings.errors) console.log(`  ${red}✖${reset}  ${e}`);
    console.log();
  }

  if (findings.warnings.length > 0) {
    console.log(`${yellow}${bold}WARNINGS (${findings.warnings.length}):${reset}`);
    for (const w of findings.warnings) console.log(`  ${yellow}⚠${reset}  ${w}`);
    console.log();
  }

  console.log(`${bold}Summary:${reset} ${findings.errors.length} error(s), ${findings.warnings.length} warning(s)\n`);
}
