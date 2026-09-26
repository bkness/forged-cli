// Minimal semver ordering — enough to find "the version before this one".
// Registry `versions` keys are in publish order, so a backport (e.g. 0.34.3
// published after 0.41.1) would otherwise look like 0.41.2's predecessor.

function parse(v) {
  const [core, pre = ''] = String(v).split('+')[0].split(/-(.*)/s);
  const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return { nums: [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0], pre };
}

function comparePre(a, b) {
  if (a === b) return 0;
  if (!a) return 1; // release sorts after its prereleases
  if (!b) return -1;
  const as = a.split('.'), bs = b.split('.');
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    if (as[i] === undefined) return -1;
    if (bs[i] === undefined) return 1;
    const an = /^\d+$/.test(as[i]), bn = /^\d+$/.test(bs[i]);
    if (an && bn) {
      const d = Number(as[i]) - Number(bs[i]);
      if (d) return Math.sign(d);
    } else if (an !== bn) {
      return an ? -1 : 1; // numeric identifiers sort before alphanumeric
    } else if (as[i] !== bs[i]) {
      return as[i] < bs[i] ? -1 : 1;
    }
  }
  return 0;
}

export function compareVersions(a, b) {
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = pa.nums[i] - pb.nums[i];
    if (d) return Math.sign(d);
  }
  return comparePre(pa.pre, pb.pre);
}

// Highest version strictly below `version`. Stable releases skip prereleases.
export function previousVersion(versions, version) {
  const isPre = parse(version).pre !== '';
  return versions
    .filter((v) => compareVersions(v, version) < 0 && (isPre || parse(v).pre === ''))
    .sort(compareVersions)
    .at(-1) ?? null;
}
