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
  'ulisesgascon', 'formidablelabs',
  'blakeembrey', 'wesleytodd', 'danez', 'domenic', 'panva', 'joshuakgoldberg',
  'matteo.collina', 'rvagg',
  // React-Bootstrap / @restart team
  'kytsang', 'monastic.panic',
  // Chart.js core
  'etimberg',
  // commander contributor
  'abetomo',
  // isomorphic-fetch (Financial Times official org)
  'financial-times',
  // webpack core team
  'evilebottnawi',
  // mass transfer from shinnn — all legitimate
  'stevemao',
  // TC39 delegate, took over ESLint packages from nzakas
  'michaelficarra',
  // raf maintainer
  'cmtegner',
  // known React developer, react-text-mask
  'browniefed',
  // perfect-scrollbar current maintainer
  'mattonit',
  // Mapbox internal npm account rotation
  'mapbox-npm-01', 'mapbox-npm-03', 'mbx-npm-02-production', 'mbx-npm-03-production',
  // Prettier automated release bot (replaced fisker)
  'prettier-bot',
  // Sequelize current maintainer (replaced sdepold, original creator)
  'wikirik',
  // Meta/React Native core team (replaced zertosh on v8-compile-cache)
  'yungsters',
  // cosmiconfig new maintainer (replaced davidtheclark)
  'd-fischer',
  // find-root: jden renamed their npm account
  'jsdnxx',
  // Express.js core team (replaced ulisesgascon on express@5)
  'jonchurch',
  // source-map maintainer, Mozilla engineer (replaced nickfitzgerald)
  'tromey',
  // async: long-standing transfer from aearly
  'hargasinski',
  // http-proxy: known contributor, took over from indexzero
  'jcrugzz',
  // prebuild-install: known npm ecosystem contributor, took over from lovell
  'vweevers',
  // Fastify core team (safe-regex2 and other fastify-org packages)
  'climba03003',
  // Better Auth team — now maintains Auth.js / @auth/core
  'better-gustavo', 'bekacru',
  // Expo core team (bot → human publisher rotations)
  'brentvatne', 'alanhughes', 'kudochien', 'philpl',
  // Software Mansion team (React Native Reanimated / Screens / Worklets)
  'kmag', 'matipl01', 'tjzel', 'kkafar',
  // MongoDB Node.js driver team org (replaced addaleax)
  'dbx-node',
  // Meta/Flow official team org (replaced gkz)
  'flowtype',
]);

// Security-critical packages: any publisher change gets a human look, even
// from a returning maintainer (e.g. jsonwebtoken, julien.wollscheid).
export const ALWAYS_REVIEW = new Set([
  'jsonwebtoken', 'jose', 'bcrypt', 'bcryptjs', 'argon2',
  'node-forge', 'crypto-js', 'tweetnacl', 'express-session', 'cookie-session',
]);

// "GitHub Actions" as publisher = npm trusted publishing (OIDC from CI)
const TRUSTED_PUBLISHING = 'GitHub Actions';

// → { type: 'warn' | 'info', reason: 'review' | 'oidc' | 'returning' | 'trusted' | 'new' }
export function publisherChangeSeverity({ pkg, from, to, returning }) {
  if (ALWAYS_REVIEW.has(pkg)) return { type: 'warn', reason: 'review' };
  if (to === TRUSTED_PUBLISHING) return { type: 'info', reason: 'oidc' };
  if (returning) return { type: 'info', reason: 'returning' };
  const type = classifyPublisherChange(from, to);
  return { type, reason: type === 'info' ? 'trusted' : 'new' };
}

export function classifyPublisherChange(from, to) {
  const fromTrusted = NPM_TEAM.has(from) || TRUSTED_COMMUNITY.has(from);
  const toTrusted   = NPM_TEAM.has(to)   || TRUSTED_COMMUNITY.has(to);

  if (toTrusted)   return 'info';   // handed to a trusted publisher — suppress
  if (fromTrusted) return 'warn';   // trusted → unknown — flag it
  return 'warn';                    // unknown → unknown — flag it
}
