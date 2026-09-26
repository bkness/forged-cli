import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOsvResults, isMalwareAdvisory, queryOsv } from '../src/utils/osv.js';

const pkgs = [
  { name: 'express', version: '5.0.0' },
  { name: 'evil-pkg', version: '1.0.0' },
  { name: 'old-lib', version: '0.1.0' },
];

// Fake OSV: batch POSTs return `results`; detail GETs look up `advisories`
const fakeOsv = (results, advisories = {}, { ok = true } = {}) => {
  const calls = { batch: [], detail: [] };
  const impl = async (url, init) => {
    if (init?.method === 'POST') {
      calls.batch.push(JSON.parse(init.body));
      return { ok, json: async () => ({ results }) };
    }
    const id = decodeURIComponent(url.split('/').pop());
    calls.detail.push(id);
    return { ok: true, json: async () => advisories[id] ?? {} };
  };
  return { impl, calls };
};

const malwareGhsa = { database_specific: { cwe_ids: ['CWE-506'] } };
const ordinaryGhsa = { database_specific: { cwe_ids: ['CWE-77', 'CWE-94'] } };

test('isMalwareAdvisory: CWE-506 is malware, other CWEs are not', () => {
  assert.equal(isMalwareAdvisory(malwareGhsa), true);
  assert.equal(isMalwareAdvisory(ordinaryGhsa), false);
  assert.equal(isMalwareAdvisory({}), false);
});

test('classifyOsvResults: MAL- and confirmed GHSA ids are malicious', () => {
  const hits = classifyOsvResults(
    pkgs,
    [
      {},
      { vulns: [{ id: 'MAL-2025-1234' }, { id: 'GHSA-mal' }] },
      { vulns: [{ id: 'GHSA-bug' }, { id: 'CVE-2024-1' }] },
    ],
    new Set(['GHSA-mal']),
  );
  assert.deepEqual(hits, [
    { name: 'evil-pkg', version: '1.0.0', malicious: ['MAL-2025-1234', 'GHSA-mal'], vulns: [] },
    { name: 'old-lib', version: '0.1.0', malicious: [], vulns: ['GHSA-bug', 'CVE-2024-1'] },
  ]);
});

test('classifyOsvResults: clean packages are dropped', () => {
  assert.deepEqual(classifyOsvResults(pkgs, [{}, {}, {}]), []);
});

test('queryOsv: sends npm ecosystem queries in one batch', async () => {
  const { impl, calls } = fakeOsv([{}, { vulns: [{ id: 'MAL-2025-1' }] }, {}]);
  const hits = await queryOsv(pkgs, impl);
  assert.equal(calls.batch.length, 1);
  assert.deepEqual(calls.batch[0].queries[1], {
    package: { name: 'evil-pkg', ecosystem: 'npm' },
    version: '1.0.0',
  });
  assert.deepEqual(hits[0].malicious, ['MAL-2025-1']);
});

test('queryOsv: GHSA tagged CWE-506 is reported as malware', async () => {
  const { impl, calls } = fakeOsv(
    [{}, { vulns: [{ id: 'GHSA-mal' }] }, { vulns: [{ id: 'GHSA-bug' }] }],
    { 'GHSA-mal': malwareGhsa, 'GHSA-bug': ordinaryGhsa },
  );
  const hits = await queryOsv(pkgs, impl);
  assert.deepEqual(calls.detail.sort(), ['GHSA-bug', 'GHSA-mal']);
  assert.deepEqual(hits.find((h) => h.name === 'evil-pkg').malicious, ['GHSA-mal']);
  assert.deepEqual(hits.find((h) => h.name === 'old-lib').vulns, ['GHSA-bug']);
});

test('queryOsv: MAL- ids skip the detail lookup', async () => {
  const { impl, calls } = fakeOsv([{}, { vulns: [{ id: 'MAL-2025-1' }] }, {}]);
  await queryOsv(pkgs, impl);
  assert.deepEqual(calls.detail, []);
});

test('queryOsv: splits more than 1000 packages into chunks', async () => {
  const many = Array.from({ length: 2500 }, (_, i) => ({ name: `p${i}`, version: '1.0.0' }));
  const sizes = [];
  const impl = async (url, init) => {
    const n = JSON.parse(init.body).queries.length;
    sizes.push(n);
    return { ok: true, json: async () => ({ results: Array(n).fill({}) }) };
  };
  await queryOsv(many, impl);
  assert.deepEqual(sizes, [1000, 1000, 500]);
});

test('queryOsv: returns null when OSV is unreachable or errors', async () => {
  assert.equal(await queryOsv(pkgs, fakeOsv([], {}, { ok: false }).impl), null);
  assert.equal(await queryOsv(pkgs, async () => { throw new Error('offline'); }), null);
});
