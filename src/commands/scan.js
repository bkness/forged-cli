import { readFileSync, existsSync, readdirSync, lstatSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, basename } from 'path';
import { homedir } from 'os';
import { isSuspiciousName } from '../utils/levenshtein.js';
import { POPULAR_PACKAGES } from '../utils/popularPackages.js';
import { verifyTarballIntegrity } from '../utils/verifyIntegrity.js';
import { queryOsv } from '../utils/osv.js';

const green  = '\x1b[32m';
const yellow = '\x1b[33m';
const red    = '\x1b[31m';
const bold   = '\x1b[1m';
const reset  = '\x1b[0m';

export function checkPackageJson(cwd) {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return { deps: {}, error: 'No package.json found' };
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return {
      deps: { ...pkg.dependencies, ...pkg.devDependencies },
      scripts: pkg.scripts || {},
      name: pkg.name,
      version: pkg.version,
    };
  } catch {
    return { deps: {}, error: 'Could not parse package.json' };
  }
}

export function scanBinaries(cwd) {
  const binDir = join(cwd, 'node_modules', '.bin');
  if (!existsSync(binDir)) return [];
  const results = [];
  for (const file of readdirSync(binDir)) {
    const fullPath = join(binDir, file);
    try {
      // lstat, not stat: stat follows the link, so isSymbolicLink() was
      // always false and every large linked binary got flagged
      const stat = lstatSync(fullPath);
      if (!stat.isSymbolicLink() && stat.size > 50000) {
        results.push({ file, size: stat.size, flag: 'large non-symlink binary' });
      }
    } catch {}
  }
  return results;
}

export function checkDangerousScripts(scripts) {
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
        dangerous.push({ script: name, command: cmd });
        break; // one finding per script, even if several patterns match
      }
    }
  }
  return dangerous;
}

function saveJsonReport(reportPath, data) {
  writeFileSync(reportPath, JSON.stringify(data, null, 2), 'utf8');
}

function saveMarkdownReport(reportPath, data) {
  const { meta, findings } = data;
  const lines = [
    `# Forged Scan Report`,
    ``,
    `**Project:** ${meta.project}`,
    `**Scanned:** ${meta.scannedAt}`,
    `**Packages verified:** ${meta.packagesVerified}`,
    `**Summary:** ${findings.errors.length} error(s), ${findings.warnings.length} warning(s)`,
    ``,
  ];

  if (findings.errors.length > 0) {
    lines.push(`## Errors`, ``);
    for (const e of findings.errors) {
      lines.push(`- ❌ **${e.package ? `${e.package}@${e.version}` : 'project'}**: ${e.message}`);
      if (e.detail) {
        lines.push(`  - locked:   \`${e.detail.locked}\``);
        lines.push(`  - registry: \`${e.detail.registry}\``);
      }
    }
    lines.push(``);
  }

  if (findings.warnings.length > 0) {
    lines.push(`## Warnings`, ``);
    for (const w of findings.warnings) {
      lines.push(`- ⚠️  **${w.package ? `${w.package}@${w.version}` : 'project'}**: ${w.message}`);
    }
    lines.push(``);
  }

  if (findings.errors.length === 0 && findings.warnings.length === 0) {
    lines.push(`## Result`, ``, `✅ No issues found. All packages verified clean.`, ``);
  }

  writeFileSync(reportPath, lines.join('\n'), 'utf8');
}

export async function scanCommand(cwd = process.cwd(), opts = {}) {
  const { report, reportFormat = 'json', verbose = false } = opts;

  console.log(`\n${bold}⚒  Forged Scanner${reset}`);
  console.log(`   Scanning: ${cwd}\n`);

  const findings = { warnings: [], errors: [], info: [], suppressed: [] };
  let packagesVerified = 0;

  // 1. Parse package.json
  const { deps, scripts, error, name: pkgName, version: pkgVersion } = checkPackageJson(cwd);

  // Not a Node project: nothing to scan. Return before writing the scan
  // cache, so the dotfiles badge keeps the last real result.
  if (!existsSync(join(cwd, 'package.json'))) {
    console.log(`${yellow}ℹ  No package.json here — not a Node project, nothing to scan.${reset}\n`);
    return null;
  }
  if (error) findings.errors.push({ message: error });

  // 2. Dangerous scripts
  if (scripts) {
    for (const d of checkDangerousScripts(scripts)) {
      findings.errors.push({ message: `Dangerous script "${d.script}": ${d.command}` });
    }
  }

  // 3. Typosquat check
  const popularSet = new Set(POPULAR_PACKAGES);
  for (const name of Object.keys(deps)) {
    if (popularSet.has(name)) continue;
    for (const { known, distance } of isSuspiciousName(name, POPULAR_PACKAGES)) {
      let resolvedVersion;
      try {
        const nmPkg = JSON.parse(readFileSync(join(cwd, 'node_modules', name, 'package.json'), 'utf8'));
        resolvedVersion = nmPkg.version;
      } catch {}
      findings.warnings.push({
        package: name,
        version: resolvedVersion,
        message: `${distance} character(s) from popular package "${known}" — possible typosquat`,
      });
    }
  }

  // 4. Tarball integrity verification
  process.stdout.write('   Verifying tarball integrity');
  const { error: integrityError, findings: integrityFindings, total, packages } = await verifyTarballIntegrity(
    cwd,
    (checked, t) => {
      if (checked % 10 === 0 || checked === t) {
        process.stdout.write(`\r   Verifying tarball integrity (${checked}/${t})...`);
      }
    }
  );
  process.stdout.write('\n');

  if (integrityError) {
    findings.warnings.push({ message: integrityError });
  } else {
    packagesVerified = total || 0;
    for (const f of integrityFindings) {
      if (f.type === 'error')        findings.errors.push(f);
      else if (f.type === 'info')    findings.suppressed.push(f);
      else                           findings.warnings.push(f);
    }
    if (total) findings.info.push(`Verified ${total} packages against npm registry`);
  }

  // 4b. Known-malware + vulnerability lookup (OSV.dev)
  if (packages?.length) {
    const osv = await queryOsv(packages);
    if (osv === null) {
      findings.warnings.push({ message: 'Could not reach OSV.dev — skipped known-malware check' });
    } else {
      for (const hit of osv) {
        if (hit.malicious.length) {
          findings.errors.push({
            package: hit.name,
            version: hit.version,
            message: `KNOWN MALICIOUS PACKAGE (${hit.malicious.join(', ')}) — remove it and rotate any secrets on this machine`,
          });
        }
      }
      const vulnerable = osv.filter((h) => h.vulns.length).length;
      findings.info.push(`Checked ${packages.length} packages against OSV.dev known-malware database`);
      if (vulnerable) {
        findings.info.push(`${vulnerable} package(s) have published vulnerabilities — run \`npm audit\` for details`);
      }
    }
  }

  // 5. Binary scan
  for (const b of scanBinaries(cwd)) {
    findings.warnings.push({
      message: `node_modules/.bin/${b.file} is a large non-symlink binary (${(b.size / 1024).toFixed(1)}KB)`,
    });
  }

  // Print results
  if (findings.errors.length === 0 && findings.warnings.length === 0) {
    console.log(`${green}✔  No issues found. Looks clean.${reset}\n`);
  } else {
    if (findings.errors.length > 0) {
      console.log(`${red}${bold}ERRORS (${findings.errors.length}):${reset}`);
      for (const e of findings.errors) {
        const label = e.package ? `${e.package}@${e.version}: ` : '';
        console.log(`  ${red}✖${reset}  ${label}${e.message}`);
        if (e.detail) {
          console.log(`       locked:   ${e.detail.locked}`);
          console.log(`       registry: ${e.detail.registry}`);
        }
      }
      console.log();
    }

    if (findings.warnings.length > 0) {
      console.log(`${yellow}${bold}WARNINGS (${findings.warnings.length}):${reset}`);
      for (const w of findings.warnings) {
        const label = w.package ? `${w.package}@${w.version}: ` : '';
        console.log(`  ${yellow}⚠${reset}  ${label}${w.message}`);
      }
      console.log();
    }
  }

  // Verbose: show suppressed trusted rotations
  if (verbose && findings.suppressed.length > 0) {
    console.log(`${bold}SUPPRESSED — trusted, returning, or trusted-publishing publishers:${reset}`);
    for (const s of findings.suppressed) {
      console.log(`  ${green}~${reset}  ${s.package}@${s.version}: ${s.message}`);
    }
    console.log();
  }

  if (findings.info.length > 0) {
    for (const i of findings.info) console.log(`  ${green}ℹ${reset}  ${i}`);
  }
  if (findings.suppressed.length > 0) {
    const note = verbose ? '' : '  (run with --verbose to see them)';
    console.log(`  ${green}ℹ${reset}  ${findings.suppressed.length} publisher change(s) suppressed${note}`);
  }
  console.log();

  console.log(`${bold}Summary:${reset} ${findings.errors.length} error(s), ${findings.warnings.length} warning(s), ${findings.suppressed.length} suppressed\n`);

  // Write local scan cache — dotfiles reads this to push telemetry
  const flagged = [
    ...findings.errors.filter(f => f.package).map(f => f.package),
    ...findings.warnings.filter(f => f.package).map(f => f.package),
  ];
  writeFileSync(
    join(homedir(), '.forged-scan-cache.json'),
    JSON.stringify({
      safe:       findings.errors.length === 0 && findings.warnings.length === 0,
      packages:   packagesVerified,
      flagged,
      checked_at: new Date().toISOString(),
    }),
    'utf8'
  );

  // Save report if requested
  if (report) {
    const reportData = {
      meta: {
        project: pkgName || basename(cwd),
        version: pkgVersion || 'unknown',
        scannedAt: new Date().toISOString(),
        packagesVerified,
        cwd,
      },
      findings,
      summary: {
        errors: findings.errors.length,
        warnings: findings.warnings.length,
        clean: findings.errors.length === 0 && findings.warnings.length === 0,
      },
    };

    const ext = reportFormat === 'markdown' ? 'md' : 'json';
    const reportFile = join(cwd, `forged-report.${ext}`);

    if (reportFormat === 'markdown') {
      saveMarkdownReport(reportFile, reportData);
    } else {
      saveJsonReport(reportFile, reportData);
    }

    console.log(`${green}✔  Report saved: ${reportFile}${reset}\n`);
  }

  return findings;
}
