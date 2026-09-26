// OSV.dev — Google's open vulnerability database. Known malware shows up two
// ways: MAL- advisories (OpenSSF malicious-packages project), and GitHub
// advisories (GHSA-) tagged CWE-506 "Embedded Malicious Code". The batch
// endpoint only returns ids, so GHSA details are fetched to check the CWE.
const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN_URL = 'https://api.osv.dev/v1/vulns/';
const BATCH_LIMIT = 1000; // OSV's max queries per request
const DETAIL_CONCURRENCY = 10;
const MALWARE_CWE = 'CWE-506';

export function isMalwareAdvisory(advisory) {
  return advisory?.database_specific?.cwe_ids?.includes(MALWARE_CWE) ?? false;
}

// pkgs: [{ name, version }], results: OSV batch results (same order),
// malwareIds: Set of non-MAL ids confirmed as malware
// → [{ name, version, malicious: [ids], vulns: [ids] }] for packages with hits
export function classifyOsvResults(pkgs, results, malwareIds = new Set()) {
  const isMalware = (id) => id.startsWith('MAL-') || malwareIds.has(id);
  return pkgs
    .map((pkg, i) => {
      const ids = (results[i]?.vulns ?? []).map((v) => v.id);
      return {
        ...pkg,
        malicious: ids.filter(isMalware),
        vulns: ids.filter((id) => !isMalware(id)),
      };
    })
    .filter((r) => r.malicious.length || r.vulns.length);
}

async function findMalwareIds(ids, fetchImpl) {
  const malware = new Set();
  const queue = [...ids];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      try {
        const res = await fetchImpl(OSV_VULN_URL + encodeURIComponent(id));
        if (res.ok && isMalwareAdvisory(await res.json())) malware.add(id);
      } catch {
        // detail lookup failed — leave it classified as an ordinary vuln
      }
    }
  };
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
  return malware;
}

// Returns classified hits, or null if OSV couldn't be reached
export async function queryOsv(pkgs, fetchImpl = fetch) {
  const results = [];
  try {
    for (let i = 0; i < pkgs.length; i += BATCH_LIMIT) {
      const chunk = pkgs.slice(i, i + BATCH_LIMIT);
      const res = await fetchImpl(OSV_BATCH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          queries: chunk.map(({ name, version }) => ({
            package: { name, ecosystem: 'npm' },
            version,
          })),
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      results.push(...(data.results ?? []));
    }
  } catch {
    return null;
  }

  const ghsaIds = new Set(
    results.flatMap((r) => (r?.vulns ?? []).map((v) => v.id)).filter((id) => !id.startsWith('MAL-')),
  );
  const malwareIds = await findMalwareIds(ghsaIds, fetchImpl);
  return classifyOsvResults(pkgs, results, malwareIds);
}
