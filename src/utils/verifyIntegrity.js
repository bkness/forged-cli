import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { classifyPublisherChange } from './trustedPublishers.js';
import { hoursSincePublish, FRESH_HOURS } from './freshness.js';

// Fetch registry metadata with a simple in-memory cache to avoid duplicate requests
const registryCache = new Map();

async function fetchRegistryMeta(name) {
  if (registryCache.has(name)) return registryCache.get(name);
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = await res.json();
    registryCache.set(name, data);
    return data;
  } catch {
    return null;
  }
}

function parseLockfile(cwd) {
  const lockPath = join(cwd, 'package-lock.json');
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

export async function verifyTarballIntegrity(cwd, onProgress) {
  const lock = parseLockfile(cwd);
  if (!lock) return { error: 'No package-lock.json found — run npm install first', findings: [] };

  const packages = lock.packages || {};
  const entries = Object.entries(packages).filter(
    ([path, meta]) => path && path !== '' && meta.version && meta.integrity && !meta.link
  );

  if (entries.length === 0) return { error: null, findings: [] };

  const findings = [];
  let checked = 0;

  // Batch requests — 5 at a time to avoid hammering the registry
  const batchSize = 5;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);

    await Promise.all(batch.map(async ([pkgPath, meta]) => {
      // Handle nested node_modules (e.g. "node_modules/pkg/node_modules/dep" → "dep")
      const name = pkgPath.replace(/^.*node_modules\//, '');

      const registryMeta = await fetchRegistryMeta(name);
      checked++;
      if (onProgress) onProgress(checked, entries.length, name);

      if (!registryMeta) {
        findings.push({
          type: 'warning',
          package: name,
          version: meta.version,
          message: 'Could not reach registry — unable to verify',
        });
        return;
      }

      // Package not found on registry at all — highly suspicious
      if (registryMeta.error === 'Not found') {
        findings.push({
          type: 'error',
          package: name,
          version: meta.version,
          message: 'Package not found on npm registry — could be a private or malicious package',
        });
        return;
      }

      const versionData = registryMeta.versions?.[meta.version];
      if (!versionData) {
        // -cjs packages are npm's own CJS compat wrappers (string-width-cjs, strip-ansi-cjs, etc.)
        // They exist on npm but use non-standard version numbers — suppress as info
        const type = name.endsWith('-cjs') ? 'info' : 'warning';
        findings.push({
          type,
          package: name,
          version: meta.version,
          message: `Version ${meta.version} not found on registry`,
        });
        return;
      }

      const registryIntegrity = versionData.dist?.integrity;
      if (!registryIntegrity) return;

      // THE CORE CHECK — lock file hash vs registry hash
      if (meta.integrity !== registryIntegrity) {
        findings.push({
          type: 'error',
          package: name,
          version: meta.version,
          message: 'INTEGRITY MISMATCH — installed package differs from registry',
          detail: {
            locked:   meta.integrity.slice(0, 40) + '...',
            registry: registryIntegrity.slice(0, 40) + '...',
          },
        });
        return;
      }

      // Brand-new versions haven't been vetted yet — the usual window for hijacks
      const ageHours = hoursSincePublish(registryMeta.time, meta.version);
      if (ageHours !== null) {
        findings.push({
          type: 'warning',
          package: name,
          version: meta.version,
          message: `Published ${ageHours}h ago — versions under ${FRESH_HOURS}h old haven't been vetted yet`,
        });
      }

      // Check if the author/publisher changed in this version vs the previous one
      const versions = Object.keys(registryMeta.versions || {});
      const idx = versions.indexOf(meta.version);
      if (idx > 0) {
        const prevVersion    = versions[idx - 1];
        const prevPublisher  = registryMeta.versions[prevVersion]?._npmUser?.name;
        const currPublisher  = versionData._npmUser?.name;
        if (prevPublisher && currPublisher && prevPublisher !== currPublisher) {
          const severity = classifyPublisherChange(prevPublisher, currPublisher);
          findings.push({
            type: severity,
            package: name,
            version: meta.version,
            message: `Publisher changed from "${prevPublisher}" to "${currPublisher}" in this version`,
          });
        }
      }
    }));
  }

  const scanned = entries.map(([pkgPath, meta]) => ({
    name: pkgPath.replace(/^.*node_modules\//, ''),
    version: meta.version,
  }));
  return { error: null, findings, total: entries.length, packages: scanned };
}
