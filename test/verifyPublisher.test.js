import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGithubRepo,
  collectRegistryEvidence,
  judgeEvidence,
  fetchContributors,
} from '../src/utils/verifyPublisher.js';

test('parseGithubRepo handles git+https URLs', () => {
  assert.deepEqual(
    parseGithubRepo('git+https://github.com/auth0/node-jsonwebtoken.git'),
    {
      owner: 'auth0',
      repo: 'node-jsonwebtoken',
    },
  );
});

test('parseGithubRepo rejects non-GitHub repos', () => {
  assert.equal(parseGithubRepo('https://gitlab.com/org/project.git'), null);
});

test('collectRegistryEvidence matches current verification logic', () => {
  const evidence = collectRegistryEvidence({
    registryMeta: {
      versions: {
        '2.0.0': {
          dist: { attestations: { provenance: 'https://example.com/prov' } },
          repository: { url: 'https://github.com/auth0/node-jsonwebtoken.git' },
          maintainers: [{ name: 'isaacs' }, { name: 'zoontek' }],
          _npmUser: { email: 'zoontek@auth0.com' },
        },
        '1.0.0': {
          maintainers: [{ name: 'necolas' }],
          repository: { url: 'https://github.com/auth0/node-jsonwebtoken.git' },
        },
      },
    },
    version: '2.0.0',
    prevVersion: '1.0.0',
    publisher: 'zoontek',
  });

  assert.equal(evidence.provenance, true);
  assert.equal(evidence.priorMaintainer, false);
  assert.equal(evidence.orgEmail, true);
  assert.equal(evidence.trustedCoMaintainer, true);
});

test('judgeEvidence verifies only when the signal policy is satisfied', () => {
  const verified = judgeEvidence({
    provenance: true,
    priorMaintainer: false,
    contributor: true,
    orgEmail: true,
    trustedCoMaintainer: true,
  });

  assert.deepEqual(verified, {
    verified: true,
    reasons: [
      'signed provenance from the package repo',
      'contributor to the GitHub repo',
      'email domain matches the repo owner',
      'co-maintains with a trusted publisher',
    ],
  });

  const weakOnly = judgeEvidence({
    orgEmail: true,
    trustedCoMaintainer: true,
  });
  assert.deepEqual(weakOnly, {
    verified: false,
    reasons: [
      'email domain matches the repo owner',
      'co-maintains with a trusted publisher',
    ],
  });

  const nothing = judgeEvidence({
    provenance: false,
    priorMaintainer: false,
    contributor: null,
    orgEmail: false,
    trustedCoMaintainer: false,
  });
  assert.deepEqual(nothing, {
    verified: false,
    reasons: [],
  });
});

test('a trusted publisher does not count as their own co-maintainer', () => {
  const evidence = collectRegistryEvidence({
    registryMeta: {
      versions: {
        '1.0.0': { maintainers: [{ name: 'necolas' }] },
        '1.0.1': { maintainers: [{ name: 'brentvatne' }], _npmUser: { name: 'brentvatne' } },
      },
    },
    version: '1.0.1',
    prevVersion: '1.0.0',
    publisher: 'brentvatne',
  });
  assert.equal(evidence.trustedCoMaintainer, false);
});

test('judgeEvidence fails closed on truthy non-boolean signals', () => {
  assert.equal(judgeEvidence({ priorMaintainer: 'necolas', provenance: {} }).verified, false);
});

test('judgeEvidence: medium alone and unknown contributor are not enough', () => {
  assert.equal(judgeEvidence({ contributor: true }).verified, false);
  assert.equal(judgeEvidence({ contributor: null, orgEmail: true }).verified, false);
  assert.equal(judgeEvidence({ contributor: true, orgEmail: true }).verified, true);
});

// Each test uses its own repo name — fetchContributors caches per owner/repo
const fakeFetch = (status, body) => async () => {
  if (status === 'throw') throw new Error('offline');
  return { ok: status === 200, json: async () => body };
};

test('fetchContributors returns lowercase logins', async () => {
  const logins = await fetchContributors('test', 'ok-repo', fakeFetch(200, [{ login: 'Zoontek' }]));
  assert.ok(logins.has('zoontek'));
});

test('fetchContributors returns null when GitHub is unavailable', async () => {
  assert.equal(await fetchContributors('test', 'missing-repo', fakeFetch(404)), null);
  assert.equal(await fetchContributors('test', 'offline-repo', fakeFetch('throw')), null);
});
