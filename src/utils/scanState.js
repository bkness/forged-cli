import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// An unchanged project still gets rescanned after this long: new malware
// advisories land on OSV even when the lockfile doesn't move.
export const RESCAN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const statePath = () => join(homedir(), '.forged-scan-state.json');

// package.json is part of the fingerprint too — the install-script check reads it
export function fingerprint(cwd) {
  const hash = createHash('sha256');
  for (const file of ['package.json', 'package-lock.json']) {
    const path = join(cwd, file);
    hash.update(`${file}\0`);
    if (existsSync(path)) hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath(), 'utf8'));
  } catch {
    return {};
  }
}

// The last result for this project if nothing changed since and it's recent
// enough to trust, else null (→ scan again)
export function previousResult(cwd, now = Date.now()) {
  const entry = readState()[cwd];
  if (!entry || entry.fingerprint !== fingerprint(cwd)) return null;
  if (now - Date.parse(entry.scannedAt) > RESCAN_DAYS * DAY_MS) return null;
  return entry;
}

export function recordResult(cwd, findings, now = Date.now()) {
  const state = readState();
  state[cwd] = {
    fingerprint: fingerprint(cwd),
    scannedAt: new Date(now).toISOString(),
    errors: findings.errors.length,
    warnings: findings.warnings.length,
  };
  writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8');
}
