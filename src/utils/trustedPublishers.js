// Known npm core team — ownership rotates freely between these accounts
export const NPM_TEAM = new Set([
  'isaacs', 'gar', 'lukekarrys', 'nlf', 'zkat', 'ruyadorno',
  'npm-cli-ops', 'iarna', 'darcyclarke', 'wraithgar', 'fritzy',
  'GitHub Actions',
]);

// Trusted community maintainers — well-known, long-standing accounts
export const TRUSTED_COMMUNITY = new Set([
  'sindresorhus', 'jbnicolai', 'jonschlinkert', 'doowb',
  'tjholowaychuk', 'dominicbarnes', 'loganfsmyth', 'eemeli',
  'styfle', 'leo', 'dsblv', 'ljharb', 'nicolo-ribaudo',
  'mysticatea', 'feross', 'mafintosh',
  'phated', 'nodejs-foundation', 'legendecas',
]);

export function classifyPublisherChange(from, to) {
  const fromTrusted = NPM_TEAM.has(from) || TRUSTED_COMMUNITY.has(from);
  const toTrusted   = NPM_TEAM.has(to)   || TRUSTED_COMMUNITY.has(to);

  if (fromTrusted && toTrusted) return 'info';   // known rotation — suppress
  if (toTrusted)                return 'warn';   // unknown → trusted (less risky but flag)
  return 'warn';                                 // anything else — flag it
}
