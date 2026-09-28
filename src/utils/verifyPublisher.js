import { execFileSync } from 'child_process';
import { NPM_TEAM, TRUSTED_COMMUNITY } from './trustedPublishers.js';

export function parseGithubRepo(url) {
  if (!url || typeof url !== 'string') return null;

  const normalized = url
    .replace(/^git\+/, '')
    .replace(/^git:/, 'https:')
    .trim();

  const m = normalized.match(
    /(?:https?:\/\/|git@|ssh:\/\/git@)?github\.com[:/]+([^/]+)\/([^/#]+?)(?:\.git)?(?:[/?#].*)?$/i,
  );

  return m ? { owner: m[1], repo: m[2] } : null;
}

export function collectRegistryEvidence({
  registryMeta,
  version,
  prevVersion,
  publisher,
}) {
  const curr = registryMeta?.versions?.[version] ?? {};
  const prev = registryMeta?.versions?.[prevVersion] ?? {};

  const provenance = !!curr.dist?.attestations?.provenance;

  const prevMaintainers = Array.isArray(prev.maintainers)
    ? prev.maintainers
    : [];
  const currMaintainers = Array.isArray(curr.maintainers)
    ? curr.maintainers
    : [];

  const priorMaintainer = prevMaintainers.some((m) => {
    const name = typeof m === 'string' ? m : m?.name;
    return name === publisher;
  });

  const email = curr?._npmUser?.email ?? curr?.publisher?.email ?? null;
  const owner =
    parseGithubRepo(curr?.repository?.url ?? prev?.repository?.url ?? null)
      ?.owner ?? null;
  const orgEmail =
    !!email &&
    !!owner &&
    email.toLowerCase().split('@')?.[1]?.split('.')?.[0]?.toLowerCase() ===
      owner.toLowerCase();

  const trustedCoMaintainer = currMaintainers.some((m) => {
    const name = typeof m === 'string' ? m : m?.name;
    if (!name || name === publisher) return false;
    return NPM_TEAM.has(name) || TRUSTED_COMMUNITY.has(name);
  });

  return { provenance, priorMaintainer, orgEmail, trustedCoMaintainer };
}

// GITHUB_TOKEN if set, else the gh CLI's token, else none (60 req/hr).
// Looked up once per run — spawning gh for every repo adds up.
let cachedToken;
function githubToken() {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = process.env.GITHUB_TOKEN || readGhToken();
  return cachedToken;
}

function readGhToken() {
  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

const contributorCache = new Map();

// → Set of lowercase GitHub logins (top 100 contributors), or null if unknown
export async function fetchContributors(owner, repo, fetchImpl = fetch) {
  const key = `${owner}/${repo}`.toLowerCase();
  if (contributorCache.has(key)) return contributorCache.get(key);

  let result;
  const token = githubToken();
  const headers = { accept: 'application/vnd.github+json' };
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=100`,
      { headers },
    );

    if (!res.ok) {
      result = null;
    } else {
      const data = await res.json();
      result = new Set((Array.isArray(data) ? data : []).map((c) => String(c?.login || '').toLowerCase()).filter(Boolean));
    }
  } catch {
    result = null;
  }

  contributorCache.set(key, result);
  return result;
}

const SIGNALS = {
  provenance: { weight: 'strong', label: 'signed provenance from the package repo' },
  priorMaintainer: { weight: 'strong', label: 'already a maintainer before this release' },
  contributor: { weight: 'medium', label: 'contributor to the GitHub repo' },
  orgEmail: { weight: 'weak', label: 'email domain matches the repo owner' },
  trustedCoMaintainer: { weight: 'weak', label: 'co-maintains with a trusted publisher' },
};

// evidence: collectRegistryEvidence(...) plus contributor: true | false | null
// → { verified, reasons: [labels of the signals present] }
export function judgeEvidence(evidence) {
  const present = Object.keys(SIGNALS).filter((key) => evidence?.[key] === true);
  const count = (weight) => present.filter((key) => SIGNALS[key].weight === weight).length;

  const strong = count('strong');
  const medium = count('medium');
  const weak = count('weak');

  const verified = strong >= 1 || (medium >= 1 && weak >= 1);
  const reasons = present.map((key) => SIGNALS[key].label);

  return { verified, reasons };
}
