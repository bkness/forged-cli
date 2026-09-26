// Brand-new versions are the riskiest window: hijacked releases are usually
// caught and unpublished within days, so a version this fresh hasn't had
// time to be vetted by the community yet.
export const FRESH_HOURS = 72;

// Packages that ship data updates every few days (caniuse-lite,
// electron-to-chromium, ...) are always "fresh" — a hijack stands out as an
// unexpected release, not another routine one.
const ROUTINE_SAMPLE = 10;   // look at the last N releases before this one
const ROUTINE_MIN = 5;       // need at least this many to judge cadence
const ROUTINE_GAP_DAYS = 14; // median gap at or under this = routine

// Returns hours since publish if the version is younger than `hours`, else null
export function hoursSincePublish(time, version, now = Date.now(), hours = FRESH_HOURS) {
  const published = Date.parse(time?.[version]);
  if (Number.isNaN(published)) return null;
  const age = (now - published) / 3_600_000;
  return age >= 0 && age < hours ? Math.floor(age) : null;
}

// True when the package normally publishes every couple of weeks or faster
export function isRoutineRelease(time, version) {
  const published = Date.parse(time?.[version]);
  if (Number.isNaN(published)) return false;
  const earlier = Object.entries(time)
    .filter(([v]) => v !== 'created' && v !== 'modified' && v !== version)
    .map(([, t]) => Date.parse(t))
    .filter((t) => !Number.isNaN(t) && t < published)
    .sort((a, b) => a - b)
    .slice(-ROUTINE_SAMPLE);
  if (earlier.length < ROUTINE_MIN) return false;

  const stamps = [...earlier, published];
  const gaps = stamps.slice(1).map((t, i) => t - stamps[i]).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return median <= ROUTINE_GAP_DAYS * 86_400_000;
}
