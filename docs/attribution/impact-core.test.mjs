import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNKNOWN, emptyRecord, parseRecord, parseInventory,
} from './provenance-core.mjs';
import {
  blankSurface, parseSurface, parseReleasePackage,
} from './disclosure-core.mjs';
import {
  IMPACT_SCHEMA, IMPACT_MAX_BYTES, IMPACT_FIELDS, IMPACT_SCOPES, IMPACT_KINDS,
  DATASET_FIELDS, SURFACE_FIELDS, ImpactError, parseImpactPackageText,
  normalizeDate, stableJson, sameValue, sourceUsage, compareReleasePackages,
  changedRecords, filterImpactChanges, impactSummary, buildComparisonText,
  impactChangesJson, impactsForSurface, sourceDependencyTable,
  compareDependencyTables,
} from './impact-core.mjs';

function record(id = 'alpha', changes = {}) {
  return parseRecord({
    ...emptyRecord(id),
    title: 'Local source', provider: 'other', use: 'place', status: 'included',
    sourceName: 'Example Public Data', sourceUrl: 'https://example.org/source',
    licence: 'OTHER-OPEN', licenceUrl: 'https://example.org/licence',
    acquiredOn: '2026-09-01', datasetAsOf: UNKNOWN,
    termsReviewedOn: '2026-09-01', notice: 'Example Public Data — OTHER-OPEN',
    containsOdbl: false, derivedFromOdbl: false, redistributionAllowed: true,
    ...changes,
  });
}

function surface(id = 'screen', changes = {}) {
  return parseSurface({
    ...blankSurface(id), titleEn: 'Places', titleFr: 'Lieux',
    kind: 'place', state: 'included', path: '/places', delivery: 'offline',
    lastReviewedOn: '2026-09-01', sourceIds: ['alpha'],
    creditEn: 'Example Public Data', creditFr: 'Example Public Data',
    noticeEn: 'Example Public Data — OTHER-OPEN',
    noticeFr: 'Example Public Data — OTHER-OPEN',
    supportsKeyboard: 'yes', supportsScreenReader: 'yes', minimumTargetPx: 44,
    ...changes,
  });
}

function bundle(records = [record()], surfaces = [surface()]) {
  return parseReleasePackage({
    inventory: { version: 1, records }, register: { version: 1, surfaces },
  });
}

function changedField(change, field, id = 'alpha') {
  const next = record(id, change);
  return compareReleasePackages(bundle(), bundle([next])).changes.find((row) => row.field === field);
}

function changedSurface(change, field) {
  return compareReleasePackages(bundle(), bundle([record()], [surface('screen', change)]))
    .changes.find((row) => row.field === field);
}

describe('impact schema and immutable output', () => {
  test('schema number is stable', () => assert.equal(IMPACT_SCHEMA, 1));
  test('bounded size is explicit', () => assert.equal(IMPACT_MAX_BYTES, 4_194_304));
  test('field list is frozen', () => assert.ok(Object.isFrozen(IMPACT_FIELDS)));
  test('scope list is frozen', () => assert.ok(Object.isFrozen(IMPACT_SCOPES)));
  test('kind list is frozen', () => assert.ok(Object.isFrozen(IMPACT_KINDS)));
  test('dataset fields cover source and permission', () => {
    for (const field of ['sourceUrl', 'licence', 'redistributionAllowed', 'datasetAsOf']) {
      assert.ok(DATASET_FIELDS.includes(field));
    }
  });
  test('surface fields cover credits and accessibility', () => {
    for (const field of ['noticeEn', 'noticeFr', 'minimumTargetPx', 'delivery']) {
      assert.ok(SURFACE_FIELDS.includes(field));
    }
  });
  test('comparison freezes its field-level changes', () => {
    const result = compareReleasePackages(bundle(), bundle());
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.changes));
    assert.ok(Object.isFrozen(result.counts));
  });
  test('source dependencies are immutable', () => {
    const result = sourceDependencyTable(bundle());
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result[0]));
    assert.ok(Object.isFrozen(result[0].surfaceIds));
  });
});

describe('stable serialization and exact equality', () => {
  test('object key order does not change the value', () => {
    assert.equal(stableJson({ b: 2, a: 1 }), stableJson({ a: 1, b: 2 }));
  });
  test('array order changes the value', () => assert.equal(sameValue([1, 2], [2, 1]), false));
  test('UNKNOWN differs from true', () => assert.equal(sameValue(UNKNOWN, true), false));
  test('null differs from missing string', () => assert.equal(sameValue(null, 'UNKNOWN'), false));
  test('safe scalar comparison', () => {
    assert.ok(sameValue(false, false));
    assert.ok(!sameValue(false, true));
    assert.ok(!sameValue(0, 1));
  });
  test('nested structures are deterministic', () => {
    assert.ok(sameValue({ x: [1, { z: 'A', a: null }] }, { x: [1, { a: null, z: 'A' }] }));
  });
  test('serializes primitive values', () => {
    assert.equal(stableJson('hello'), '"hello"');
    assert.equal(stableJson(10), '10');
    assert.equal(stableJson(null), 'null');
  });
});

describe('input safety', () => {
  test('rejects objects in the JSON text parser', () => {
    assert.throws(() => parseImpactPackageText({}), ImpactError);
  });
  test('rejects huge text', () => {
    assert.throws(() => parseImpactPackageText('x'.repeat(IMPACT_MAX_BYTES + 1)), ImpactError);
  });
  test('rejects malformed JSON', () => {
    assert.throws(() => parseImpactPackageText('{'), /INVALID_JSON/u);
  });
  test('rejects wrong package shape', () => {
    assert.throws(() => parseImpactPackageText('{}'), /PACKAGE_KEYS/u);
  });
  test('rejects unexpected package keys', () => {
    const value = { ...bundle(), unknown: true };
    assert.throws(() => parseImpactPackageText(JSON.stringify(value)), /PACKAGE_KEYS/u);
  });
  test('rejects missing inventory', () => {
    assert.throws(() => parseImpactPackageText(JSON.stringify({ register: bundle().register })), /PACKAGE_KEYS/u);
  });
  test('accepts a valid complete package', () => {
    const value = bundle();
    assert.equal(parseImpactPackageText(JSON.stringify(value)).register.surfaces.length, 1);
  });
  test('retains missing dates as UNKNOWN', () => {
    const value = parseImpactPackageText(JSON.stringify(bundle()));
    assert.equal(value.inventory.records[0].datasetAsOf, UNKNOWN);
  });
  test('does not rewrite a licence URL', () => {
    const value = parseImpactPackageText(JSON.stringify(bundle()));
    assert.equal(value.inventory.records[0].licenceUrl, 'https://example.org/licence');
  });
  test('rejects embedded unsafe source URL', () => {
    const input = JSON.parse(JSON.stringify(bundle()));
    input.inventory.records[0].sourceUrl = 'javascript:alert(1)';
    assert.throws(() => parseImpactPackageText(JSON.stringify(input)), /UNSAFE_URL/u);
  });
  test('rejects invalid record targets', () => {
    const input = JSON.parse(JSON.stringify(bundle()));
    input.register.surfaces[0].minimumTargetPx = -1;
    assert.throws(() => parseImpactPackageText(JSON.stringify(input)), /INVALID_TARGET/u);
  });
  test('rejects duplicate ids in the candidate', () => {
    const input = JSON.parse(JSON.stringify(bundle()));
    input.inventory.records.push(input.inventory.records[0]);
    assert.throws(() => parseImpactPackageText(JSON.stringify(input)), /DUPLICATE_ID/u);
  });
  test('rejects invalid top-level reference date', () => {
    assert.throws(() => normalizeDate('2026-02-30'), ImpactError);
  });
  test('rejects undefined reference date', () => {
    assert.throws(() => normalizeDate(undefined), ImpactError);
  });
  test('accepts leap day', () => assert.equal(normalizeDate('2024-02-29'), '2024-02-29'));
  test('accepts explicit UNKNOWN', () => assert.equal(normalizeDate(UNKNOWN), UNKNOWN));
  test('does not invent current date', () => {
    assert.equal(normalizeDate(UNKNOWN), 'UNKNOWN');
  });
});

describe('source dependencies', () => {
  test('tracks source to surface relationships', () => {
    assert.deepEqual([...sourceUsage(bundle()).get('alpha')], ['screen']);
  });
  test('shows unused sources with zero consumers', () => {
    const result = sourceDependencyTable(bundle([
      record(), record('beta', { sourceUrl: 'https://example.org/second' }),
    ]));
    assert.deepEqual(result.find((entry) => entry.sourceId === 'beta').surfaceIds, []);
  });
  test('tracks orphan references without inventing a record', () => {
    const result = sourceUsage(bundle([record()], [surface('screen', { sourceIds: ['missing'] })]));
    assert.deepEqual([...result.get('missing')], ['screen']);
  });
  test('deduplicates repeated consumption across surfaces', () => {
    const result = sourceDependencyTable(bundle([record()], [
      surface(), surface('second', { path: '/second' }),
    ]));
    assert.equal(result[0].count, 2);
  });
  test('sorts relationships regardless of record order', () => {
    const result = sourceDependencyTable(bundle([record()], [
      surface('second', { path: '/second' }), surface(),
    ]));
    assert.deepEqual(result[0].surfaceIds, ['screen', 'second']);
  });
  test('dependency table changes after a surface is removed', () => {
    const result = compareDependencyTables(bundle(), bundle([record()], []));
    assert.deepEqual(result[0].before, ['screen']);
    assert.deepEqual(result[0].after, []);
  });
  test('dependency table records new sources', () => {
    const result = compareDependencyTables(bundle(), bundle([
      record(), record('beta', { sourceUrl: 'https://example.org/second' }),
    ]));
    assert.deepEqual(result.find((entry) => entry.sourceId === 'beta').before, []);
  });
});

describe('field-level dataset changes', () => {
  for (const [field, next] of [
    ['title', 'New source title'], ['sourceName', 'Other provider'],
    ['sourceUrl', 'https://example.org/new'], ['licence', 'LTC-Open-Data-Terms'],
    ['licenceUrl', 'https://example.org/new-licence'], ['acquiredOn', '2026-09-02'],
    ['datasetAsOf', '2026-08-01'], ['termsReviewedOn', '2026-09-02'],
    ['notice', 'New licence statement'], ['notes', 'Changed notes'],
    ['redistributionAllowed', false], ['containsOdbl', true],
    ['derivedFromOdbl', true], ['status', 'held'], ['use', 'map'],
    ['provider', 'ltc'],
  ]) {
    test(`detects ${field}`, () => {
      const row = changedField({ [field]: next }, field);
      assert.ok(row, `${field} was not included in comparison`);
      assert.equal(row.scope, 'dataset');
      assert.equal(row.id, 'alpha');
      assert.equal(row.after, next);
      assert.deepEqual(row.surfaceIds, ['screen']);
    });
  }
  test('does not report equal records', () => {
    assert.equal(compareReleasePackages(bundle(), bundle()).changes.length, 0);
  });
  test('reports added datasets', () => {
    const candidate = bundle([record(), record('beta', { sourceUrl: 'https://example.org/second' })]);
    const row = compareReleasePackages(bundle(), candidate).changes.find((value) => value.id === 'beta');
    assert.equal(row.kind, 'added');
    assert.equal(row.before, null);
    assert.equal(row.after.id, 'beta');
  });
  test('reports deleted datasets', () => {
    const row = compareReleasePackages(bundle(), bundle([], [surface()])).changes
      .find((value) => value.id === 'alpha' && value.scope === 'dataset');
    assert.equal(row.kind, 'removed');
    assert.equal(row.after, null);
  });
  test('keeps changed dates rather than inventing them', () => {
    const row = changedField({ datasetAsOf: '2026-08-01' }, 'datasetAsOf');
    assert.equal(row.before, UNKNOWN);
    assert.equal(row.after, '2026-08-01');
  });
  test('counts multiple independent changes', () => {
    const next = record('alpha', { licence: 'LTC-Open-Data-Terms', sourceName: 'Other' });
    const comparison = compareReleasePackages(bundle(), bundle([next]));
    assert.equal(comparison.counts.changed, 2);
  });
});

describe('field-level publication changes', () => {
  for (const [field, next] of [
    ['titleEn', 'New English title'], ['titleFr', 'Nouveau titre'],
    ['kind', 'map'], ['state', 'held'], ['path', '/new-path'],
    ['delivery', 'online'], ['lastReviewedOn', '2026-09-02'],
    ['creditEn', 'A different credit'], ['creditFr', 'Autre source'],
    ['noticeEn', 'New English notice'], ['noticeFr', 'Nouvelle mention'],
    ['sourceDate', '2026-08-01'], ['supportsKeyboard', 'no'],
    ['supportsScreenReader', UNKNOWN], ['minimumTargetPx', 40],
    ['notesEn', 'Review request'], ['notesFr', 'Notes locales'],
  ]) {
    test(`detects surface ${field}`, () => {
      const row = changedSurface({ [field]: next }, field);
      assert.ok(row, `Missing change to ${field}`);
      assert.equal(row.scope, 'surface');
      assert.equal(row.id, 'screen');
      assert.equal(row.after, next);
    });
  }
  test('detects surface addition', () => {
    const candidate = bundle([record()], [surface(), surface('second', { path: '/second' })]);
    const row = compareReleasePackages(bundle(), candidate).changes.find((value) => value.id === 'second');
    assert.equal(row.kind, 'added');
  });
  test('detects surface removal', () => {
    const comparison = compareReleasePackages(bundle(), bundle([record()], []));
    assert.ok(comparison.changes.some((row) => row.scope === 'surface' && row.kind === 'removed'));
  });
  test('detects newly linked dataset', () => {
    const comparison = compareReleasePackages(bundle(), bundle([record()], [
      surface('screen', { sourceIds: ['alpha', 'beta'] }),
    ]));
    assert.ok(comparison.changes.some((row) => row.kind === 'linked' && row.id === 'screen/beta'));
  });
  test('detects removed dataset link', () => {
    const comparison = compareReleasePackages(bundle(), bundle([record()], [
      surface('screen', { sourceIds: [] }),
    ]));
    assert.ok(comparison.changes.some((row) => row.kind === 'unlinked' && row.id === 'screen/alpha'));
  });
  test('source links are not considered equivalent when reordered', () => {
    const previous = bundle([record(), record('beta', { sourceUrl: 'https://example.org/beta' })], [
      surface('screen', { sourceIds: ['alpha', 'beta'] }),
    ]);
    const candidate = bundle([record(), record('beta', { sourceUrl: 'https://example.org/beta' })], [
      surface('screen', { sourceIds: ['beta', 'alpha'] }),
    ]);
    assert.equal(compareReleasePackages(previous, candidate).counts.linked, 0);
    assert.equal(compareReleasePackages(previous, candidate).counts.unlinked, 0);
  });
});

describe('filtering, summaries and exports', () => {
  const previous = bundle();
  const candidate = bundle([record('alpha', { licence: 'LTC-Open-Data-Terms' })], [
    surface('screen', { titleFr: 'Autre lieu', sourceIds: [] }),
  ]);
  const comparison = compareReleasePackages(previous, candidate);
  test('filter scope dataset', () => {
    assert.ok(filterImpactChanges(comparison, { scope: 'dataset' }).every((row) => row.scope === 'dataset'));
  });
  test('filter scope surface', () => {
    assert.ok(filterImpactChanges(comparison, { scope: 'surface' }).every((row) => row.scope === 'surface'));
  });
  test('filter kind unlinked', () => {
    assert.ok(filterImpactChanges(comparison, { kind: 'unlinked' }).every((row) => row.kind === 'unlinked'));
  });
  test('filter ID', () => {
    assert.ok(filterImpactChanges(comparison, { query: 'alpha' }).length >= 1);
  });
  test('filter field', () => {
    assert.ok(filterImpactChanges(comparison, { query: 'licence' }).some((row) => row.field === 'licence'));
  });
  test('case-insensitive query', () => {
    assert.deepEqual(filterImpactChanges(comparison, { query: 'ALPHA' }),
      filterImpactChanges(comparison, { query: 'alpha' }));
  });
  test('invalid scope fails closed', () => {
    assert.throws(() => filterImpactChanges(comparison, { scope: 'everything' }), ImpactError);
  });
  test('invalid kind fails closed', () => {
    assert.throws(() => filterImpactChanges(comparison, { kind: 'changedish' }), ImpactError);
  });
  test('long query fails closed', () => {
    assert.throws(() => filterImpactChanges(comparison, { query: 'x'.repeat(251) }), ImpactError);
  });
  test('summary counts reflect changes', () => {
    const summary = impactSummary(comparison);
    assert.equal(summary.total, comparison.changes.length);
    assert.ok(summary.changedDatasets.includes('alpha'));
    assert.ok(summary.changedSurfaces.includes('screen'));
  });
  test('summary affected surfaces includes source consumers', () => {
    assert.ok(impactSummary(comparison).affectedSurfaces.includes('screen'));
  });
  test('empty comparison is unchanged', () => {
    assert.equal(impactSummary(compareReleasePackages(previous, previous)).unchanged, true);
  });
  test('changed record IDs are unique', () => {
    assert.deepEqual(changedRecords(comparison, 'surface'), ['screen']);
  });
  test('changed link IDs are source-qualified', () => {
    assert.ok(changedRecords(comparison, 'link').includes('screen/alpha'));
  });
  test('invalid changed record scope is rejected', () => {
    assert.throws(() => changedRecords(comparison, 'other'), ImpactError);
  });
  test('surface impact picks dataset and surface changes', () => {
    const rows = impactsForSurface(comparison, 'screen');
    assert.ok(rows.some((row) => row.scope === 'dataset'));
    assert.ok(rows.some((row) => row.scope === 'surface'));
  });
  test('invalid surface ID is rejected', () => {
    assert.throws(() => impactsForSurface(comparison, '../../x'), ImpactError);
  });
  test('JSON change export is valid and stable', () => {
    const first = impactChangesJson(comparison);
    assert.deepEqual(JSON.parse(first).counts, comparison.counts);
    assert.equal(first, impactChangesJson(comparison));
    assert.ok(first.endsWith('\n'));
  });
  test('JSON text comparison uses same engine', () => {
    assert.deepEqual(buildComparisonText(JSON.stringify(previous), JSON.stringify(candidate)).counts,
      comparison.counts);
  });
  test('candidate remains unchanged by compare', () => {
    const before = JSON.stringify(candidate);
    compareReleasePackages(previous, candidate);
    assert.equal(JSON.stringify(candidate), before);
  });
});
