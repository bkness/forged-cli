// Brand-new versions are the riskiest window: hijacked releases are usually
// caught and unpublished within days, so a version this fresh hasn't had
// time to be vetted by the community yet.
export const FRESH_HOURS = 72;

// Returns hours since publish if the version is younger than `hours`, else null
export function hoursSincePublish(time, version, now = Date.now(), hours = FRESH_HOURS) {
  const published = Date.parse(time?.[version]);
  if (Number.isNaN(published)) return null;
  const age = (now - published) / 3_600_000;
  return age >= 0 && age < hours ? Math.floor(age) : null;
}
