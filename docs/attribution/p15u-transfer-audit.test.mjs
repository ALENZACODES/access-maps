import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { auditOfflineTransfer, transferDiagnostic } from './p15u-transfer-audit.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fresh = () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const parts = [bytes.subarray(0, 3), bytes.subarray(3)];
  return {
    asOf: '2026-11-19',
    sources: [
      { id: 'municipal', en: 'Municipal source', fr: 'Source municipale',
        licence: 'OGL-ON-1.0', observedOn: '2026-11-10', reference: 'sources/municipal.json' },
      { id: 'community', en: 'Community observations', fr: 'Observations communautaires',
        licence: 'CC-BY-4.0', observedOn: '2026-11-11', reference: 'sources/community.json' },
    ],
    assets: [{ id: 'map', path: 'tiles/map.pbf', sourceIds: ['municipal'], silo: 'open',
      sha256: hash(bytes), bytes: bytes.byteLength, observedOn: '2026-11-12',
      parts: parts.map((part, i) => ({ offset: i * 3, bytes: part, sha256: hash(part) })) }],
    records: [{ id: 'library', en: 'Community library', fr: 'Bibliothèque communautaire',
      feature: 'entrance', access: 'YES', tier: 2, silo: 'open', observedOn: '2026-11-12',
      sourceIds: ['municipal'], assetIds: ['map'],
      evidence: [{ sourceId: 'municipal', observedOn: '2026-11-12',
        feature: 'entrance', access: 'YES', tier: 2 }] }],
  };
};
const policy = { maxBytes: 1024, maxAgeDays: 90, allowEmpty: false };
function run(edit = () => {}, customPolicy = policy) {
  const sample = fresh();
  edit(sample);
  return auditOfflineTransfer(sample, customPolicy);
}
const codes = report => report.findings.map(f => f.code);
const blocked = (edit, code) => {
  const report = run(edit);
  assert.equal(report.ok, false);
  assert.ok(codes(report).includes(code), `Expected ${code} in ${codes(report).join(',')}`);
  assert.ok(!Object.hasOwn(report, 'inventory'), 'Blocked output must not expose a partial inventory');
};

describe('P15U basic offline transfer behaviour', () => {
  it('accepts a complete two-part byte transfer', () => {
    const result = run();
    assert.equal(result.ok, true);
    assert.equal(result.totalBytes, 6);
    assert.equal(result.inventory.assets[0].sha256, fresh().assets[0].sha256);
  });
  it('never includes the supplied byte arrays in the emitted inventory', () => {
    const result = run();
    assert.ok(!('parts' in result.inventory.assets[0]));
    assert.equal(JSON.stringify(result).includes('"offset"'), false);
  });
  it('does not mutate input arrays or buffers', () => {
    const input = fresh();
    const before = JSON.stringify(input);
    const bytes = [...input.assets[0].parts[0].bytes];
    auditOfflineTransfer(input, policy);
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual([...input.assets[0].parts[0].bytes], bytes);
  });
  it('produces deterministic output', () => {
    assert.deepEqual(run(), run());
  });
  it('sorts independent records by stable identifiers', () => {
    const a = fresh();
    const b = fresh();
    b.sources.reverse();
    assert.deepEqual(auditOfflineTransfer(a, policy), auditOfflineTransfer(b, policy));
  });
  it('supports fully empty exports only with an explicit policy', () => {
    const empty = { asOf: '2026-11-19', sources: [], assets: [], records: [] };
    assert.equal(auditOfflineTransfer(empty, { ...policy, allowEmpty: true }).ok, true);
    assert.equal(auditOfflineTransfer(empty, policy).ok, false);
  });
  it('returns localized pass messages', () => {
    assert.match(transferDiagnostic(run(), 'en'), /^Check passed/u);
    assert.match(transferDiagnostic(run(), 'fr'), /^Contrôle réussi/u);
  });
  it('returns localized blocked messages', () => {
    const report = run(value => { value.records[0].access = 'NO'; });
    assert.match(transferDiagnostic(report, 'en'), /^Transfer blocked/u);
    assert.match(transferDiagnostic(report, 'fr'), /^Transfert bloqué/u);
  });
  it('uses narrow no-data diagnostic fields only', () => {
    const report = run(value => { value.sources[0].en = 'contact@example.com'; });
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes('contact@example.com'));
  });
  it('keeps diagnostics deterministically sorted', () => {
    const report = run(value => { value.records[0].assetIds.push('missing'); value.records[0].tier = 1; });
    assert.deepEqual(report.findings, [...report.findings].sort((a, b) =>
      a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en')));
  });
  it('rejects unknown diagnostic locales', () => {
    assert.throws(() => transferDiagnostic(run(), 'es'), TypeError);
  });
  it('rejects malformed diagnostic input', () => {
    assert.throws(() => transferDiagnostic({ ok: true }), TypeError);
  });
  it('does not call fetch, timers, or file APIs', () => {
    const result = run();
    assert.equal(result.ok, true);
    assert.equal(result.inventory.records.length, 1);
  });
});

describe('P15U policy and document bounds', () => {
  for (const candidate of [null, {}, [], '', 1, false, { allowEmpty: true }]) {
    it(`rejects incomplete policies: ${String(candidate)}`, () => {
      assert.ok(codes(auditOfflineTransfer(fresh(), candidate)).includes('POLICY'));
    });
  }
  for (const candidate of [0, -1, 1.5, 64 * 1024 * 1024 + 1, NaN, Infinity, '1024']) {
    it(`rejects out-of-bounds byte budgets ${String(candidate)}`, () => {
      assert.ok(codes(run(() => {}, { ...policy, maxBytes: candidate })).includes('POLICY'));
    });
  }
  for (const candidate of [-1, 3651, 1.25, '90', null]) {
    it(`rejects invalid retention windows ${String(candidate)}`, () => {
      assert.ok(codes(run(() => {}, { ...policy, maxAgeDays: candidate })).includes('POLICY'));
    });
  }
  it('blocks actual aggregate transfer beyond policy', () => {
    const report = run(() => {}, { ...policy, maxBytes: 5 });
    assert.ok(codes(report).includes('LIMIT'));
  });
  it('supports exact asset-size budget', () => {
    assert.equal(run(() => {}, { ...policy, maxBytes: 6 }).ok, true);
  });
  it('rejects unknown top-level properties', () => {
    blocked(value => { value.debug = true; }, 'ROOT');
  });
  it('rejects unexpected policy properties', () => {
    assert.ok(codes(run(() => {}, { ...policy, unsafe: true })).includes('POLICY'));
  });
  for (const bad of [null, [], 2, 'bad', {}, { asOf: '2026-11-19', sources: [] }]) {
    it(`rejects malformed root ${String(bad)}`, () => {
      assert.ok(codes(auditOfflineTransfer(bad, policy)).includes('ROOT'));
    });
  }
});

describe('P15U sources, open licences and local references', () => {
  const badPaths = ['../private', '/root/data', './data', 'one//two', 'one/./two',
    'one/../two', 'https://host/x', 'data:asset', 'one?x=1', 'one#f', 'one%2ftwo',
    'one\\two', '.hidden', 'folder/.hidden', 'folder/', ''];
  for (const candidate of badPaths) {
    it(`rejects unsafe local source reference ${JSON.stringify(candidate)}`, () => {
      blocked(value => { value.sources[0].reference = candidate; }, 'SOURCE');
    });
    it(`rejects unsafe local asset path ${JSON.stringify(candidate)}`, () => {
      blocked(value => { value.assets[0].path = candidate; }, 'ROOT');
    });
  }
  for (const licence of ['private', 'unknown', '', 'CC-BY-SA', 'ODbL-2.0', null]) {
    it(`rejects unsupported licence ${String(licence)}`, () => {
      blocked(value => { value.sources[0].licence = licence; }, 'LICENCE');
    });
  }
  for (const licence of ['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0']) {
    it(`accepts a supported non-ODbL licence ${licence}`, () => {
      assert.equal(run(value => { value.sources[0].licence = licence; }).ok, true);
    });
  }
  it('blocks ODbL source in an open export', () => {
    blocked(value => { value.sources[0].licence = 'ODbL-1.0'; }, 'SILO');
  });
  it('permits an isolated ODbL export', () => {
    const report = run(value => {
      value.sources[0].licence = 'ODbL-1.0';
      value.records[0].silo = 'odbl';
      value.assets[0].silo = 'odbl';
    });
    assert.equal(report.ok, true);
  });
  it('blocks an asset with a missing source', () => {
    blocked(value => { value.assets[0].sourceIds = ['absent']; }, 'ORPHAN');
  });
  it('blocks a record with a missing source', () => {
    blocked(value => { value.records[0].sourceIds = ['absent']; }, 'ORPHAN');
  });
  it('blocks a record with a missing asset', () => {
    blocked(value => { value.records[0].assetIds = ['absent']; }, 'ORPHAN');
  });
  it('blocks duplicate source identifiers', () => {
    blocked(value => { value.sources.push({ ...value.sources[0] }); }, 'DUPLICATE');
  });
  it('blocks duplicate asset identifiers', () => {
    blocked(value => { value.assets.push({ ...value.assets[0], path: 'other/data.bin' }); }, 'DUPLICATE');
  });
  it('blocks duplicate asset paths', () => {
    blocked(value => { value.assets.push({ ...value.assets[0], id: 'other' }); }, 'DUPLICATE');
  });
  it('blocks duplicate record identifiers', () => {
    blocked(value => { value.records.push({ ...value.records[0] }); }, 'DUPLICATE');
  });
  it('blocks empty source references on an asset', () => {
    blocked(value => { value.assets[0].sourceIds = []; }, 'ROOT');
  });
  it('blocks duplicated source IDs on an asset', () => {
    blocked(value => { value.assets[0].sourceIds = ['municipal', 'municipal']; }, 'ROOT');
  });
  it('blocks duplicated source IDs on a record', () => {
    blocked(value => { value.records[0].sourceIds = ['municipal', 'municipal']; }, 'ROOT');
  });
  it('blocks an asset that crosses a record licence boundary', () => {
    blocked(value => { value.records[0].sourceIds = ['community']; }, 'SILO');
  });
});

describe('P15U content and calendar dates', () => {
  for (const candidate of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-11-31',
    '2026-11-19T00:00:00Z', '0000-01-01', '', 'not-a-date']) {
    it(`rejects invalid publication date ${JSON.stringify(candidate)}`, () => {
      const sample = fresh(); sample.asOf = candidate;
      assert.ok(codes(auditOfflineTransfer(sample, policy)).includes('DATE'));
    });
  }
  it('allows leap day in a correct year and within retention', () => {
    const sample = fresh(); sample.asOf = '2024-03-01';
    for (const source of sample.sources) source.observedOn = '2024-02-29';
    for (const asset of sample.assets) asset.observedOn = '2024-02-29';
    for (const record of sample.records) {
      record.observedOn = '2024-02-29';
      for (const entry of record.evidence) entry.observedOn = '2024-02-29';
    }
    assert.equal(auditOfflineTransfer(sample, policy).ok, true);
  });
  for (const candidate of ['2026-02-29', '2026-11-20', '2025-01-01', null]) {
    it(`blocks stale or invalid source date ${String(candidate)}`, () => {
      blocked(value => { value.sources[0].observedOn = candidate; }, 'DATE');
    });
    it(`blocks stale or invalid asset date ${String(candidate)}`, () => {
      blocked(value => { value.assets[0].observedOn = candidate; }, 'DATE');
    });
    it(`blocks stale or invalid record date ${String(candidate)}`, () => {
      blocked(value => { value.records[0].observedOn = candidate; }, 'DATE');
    });
  }
  for (const candidate of ['', ' contact@example.com', 'contact@example.com',
    '<b>Unsafe</b>', 'javascript:alert(1)', 'password: hidden', 'Guaranteed access',
    '\u0001', 'Real-time results']) {
    it(`blocks unsafe English copy ${JSON.stringify(candidate)}`, () => {
      blocked(value => { value.records[0].en = candidate; }, 'ROOT');
    });
    it(`blocks unsafe French copy ${JSON.stringify(candidate)}`, () => {
      blocked(value => { value.records[0].fr = candidate; }, 'ROOT');
    });
  }
  it('enforces nonbreaking French colon spacing', () => {
    blocked(value => { value.sources[0].fr = 'Source: municipale'; }, 'SOURCE');
    assert.equal(run(value => { value.sources[0].fr = 'Source\u00a0: municipale'; }).ok, true);
  });
  it('enforces narrow nonbreaking French semicolon spacing', () => {
    blocked(value => { value.sources[0].fr = 'Source; municipale'; }, 'SOURCE');
    assert.equal(run(value => { value.sources[0].fr = 'Source\u202f; municipale'; }).ok, true);
  });
  it('uses narrow nonbreaking spacing in the conflict diagnostic', () => {
    const result = run(value => {
      value.records[0].evidence.push({ sourceId: 'community', observedOn: '2026-11-12',
        feature: 'entrance', access: 'NO', tier: 2 });
      value.records[0].sourceIds.push('community');
    });
    const finding = result.findings.find(item => item.code === 'CONFLICT');
    assert.ok(finding);
    assert.match(finding.fr, /\u202f;/u);
  });
});

describe('P15U byte-level integrity, part order and limits', () => {
  it('blocks wrong complete digest', () => {
    blocked(value => { value.assets[0].sha256 = '0'.repeat(64); }, 'HASH');
  });
  it('blocks wrong per-part digest', () => {
    blocked(value => { value.assets[0].parts[0].sha256 = '0'.repeat(64); }, 'HASH');
  });
  it('blocks missing part', () => {
    blocked(value => { value.assets[0].parts.pop(); }, 'HASH');
  });
  it('blocks a zero part count', () => {
    blocked(value => { value.assets[0].parts = []; }, 'PART');
  });
  it('blocks nonconsecutive offsets', () => {
    blocked(value => { value.assets[0].parts[1].offset = 4; }, 'PART');
  });
  it('blocks repeated offsets', () => {
    blocked(value => { value.assets[0].parts[1].offset = 0; }, 'PART');
  });
  it('blocks malformed part metadata', () => {
    blocked(value => { value.assets[0].parts[0].unexpected = true; }, 'PART');
  });
  it('blocks malformed part digest', () => {
    blocked(value => { value.assets[0].parts[0].sha256 = 'ABC'; }, 'PART');
  });
  it('blocks part bytes missing', () => {
    blocked(value => { value.assets[0].parts[0].bytes = null; }, 'PART');
  });
  it('blocks zero-byte parts', () => {
    blocked(value => { value.assets[0].parts[0].bytes = new Uint8Array([]); }, 'PART');
  });
  it('blocks size declarations different from actual bytes', () => {
    blocked(value => { value.assets[0].bytes = 8; }, 'HASH');
  });
  it('supports a caller-owned ArrayBuffer', () => {
    const report = run(value => {
      const part = value.assets[0].parts[0];
      part.bytes = part.bytes.buffer.slice(part.bytes.byteOffset, part.bytes.byteOffset + part.bytes.byteLength);
    });
    assert.equal(report.ok, true);
  });
  it('blocks string content in place of actual bytes', () => {
    blocked(value => { value.assets[0].parts[0].bytes = 'AQID'; }, 'PART');
  });
  it('blocks changed content with unchanged hashes', () => {
    blocked(value => { value.assets[0].parts[0].bytes[0] = 99; }, 'HASH');
  });
});

describe('P15U evidence and confidence tiers', () => {
  for (const feature of ['entrance', 'washroom', 'lift', 'parking', 'path', 'seating']) {
    it(`accepts a matching feature ${feature}`, () => {
      const report = run(value => {
        value.records[0].feature = feature;
        value.records[0].evidence[0].feature = feature;
      });
      assert.equal(report.ok, true);
    });
  }
  for (const access of ['YES', 'NO']) {
    it(`supports dated evidence for ${access}`, () => {
      const report = run(value => {
        value.records[0].access = access;
        value.records[0].evidence[0].access = access;
      });
      assert.equal(report.ok, true);
    });
  }
  for (const bad of ['MAYBE', 'YES ', '', 2]) {
    it(`rejects unsupported access state ${String(bad)}`, () => {
      blocked(value => { value.records[0].access = bad; }, 'ROOT');
    });
  }
  it('blocks unsupported feature', () => {
    blocked(value => { value.records[0].feature = 'stairs-only'; }, 'ROOT');
  });
  it('blocks tier 0 asserted access', () => {
    blocked(value => { value.records[0].tier = 0; }, 'TIER');
  });
  it('blocks tier 1 asserted access', () => {
    blocked(value => { value.records[0].tier = 1; }, 'TIER');
  });
  it('accepts tier 0 UNKNOWN without evidence', () => {
    const report = run(value => {
      value.records[0].tier = 0;
      value.records[0].access = 'UNKNOWN';
      value.records[0].evidence = [];
    });
    assert.equal(report.ok, true);
  });
  it('requires two distinct sources for tier 3', () => {
    blocked(value => { value.records[0].tier = 3; value.records[0].evidence[0].tier = 3; }, 'TIER');
  });
  it('accepts two distinct sources for tier 3', () => {
    const report = run(value => {
      value.records[0].tier = 3;
      value.records[0].sourceIds.push('community');
      value.records[0].evidence[0].tier = 3;
      value.records[0].evidence.push({ sourceId: 'community', observedOn: '2026-11-12',
        feature: 'entrance', access: 'YES', tier: 3 });
    });
    assert.equal(report.ok, true);
  });
  it('blocks mismatched feature in evidence', () => {
    blocked(value => { value.records[0].evidence[0].feature = 'lift'; }, 'ORPHAN');
  });
  it('blocks evidence with missing source', () => {
    blocked(value => { value.records[0].evidence[0].sourceId = 'missing'; }, 'ORPHAN');
  });
  it('blocks evidence dated before its source observation', () => {
    blocked(value => { value.records[0].evidence[0].observedOn = '2026-11-01'; }, 'DATE');
  });
  it('blocks evidence dated in the future', () => {
    blocked(value => { value.records[0].evidence[0].observedOn = '2026-11-20'; }, 'DATE');
  });
  it('blocks duplicate matching evidence', () => {
    blocked(value => { value.records[0].evidence.push({ ...value.records[0].evidence[0] }); }, 'DUPLICATE');
  });
  it('blocks opposing asserted observations', () => {
    blocked(value => {
      value.records[0].sourceIds.push('community');
      value.records[0].evidence.push({ sourceId: 'community', observedOn: '2026-11-12',
        feature: 'entrance', access: 'NO', tier: 2 });
    }, 'CONFLICT');
  });
  it('blocks a claim without matching observations', () => {
    blocked(value => { value.records[0].access = 'NO'; }, 'EVIDENCE');
  });
  it('blocks a claim exceeding the evidence tier', () => {
    blocked(value => { value.records[0].tier = 3; }, 'EVIDENCE');
  });
});
