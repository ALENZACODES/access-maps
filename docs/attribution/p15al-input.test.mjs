import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INPUT_SCHEMA, LIMITS, SourceReviewError, baselineHash, calendarDate,
  elapsedDays, fingerprint, fromRegistry, prepareReview,
} from './p15al-input.mjs';
import { linkedRecord, notice, receipt, sampleInput, sampleRegistry, sampleSource } from './p15al-fixtures.mjs';

const policy = { asOf: '2024-03-01', leadDays: 2, validForDays: 14 };

function rejects(fn, code, field) {
  assert.throws(fn, error => {
    assert.ok(error instanceof SourceReviewError);
    assert.equal(error.code, code);
    if (field) assert.equal(error.field, field);
    return true;
  });
}

test('registry projects only the review metadata and keeps licence text exactly as issued', () => {
  const licence = 'Sample open licence (revision 2024-02-22)';
  const row = sampleRegistry({
    licence_id: licence,
    notes: 'Unused narrative excluded from the review.',
    download_url: 'https://example.invalid/unused',
  });
  const draft = fromRegistry({ sources: [row] }, policy);
  assert.deepEqual(draft, {
    schema: INPUT_SCHEMA, asOf: policy.asOf, leadDays: 2,
    sources: [{
      source: row.id, licence, retrievedOn: row.retrieved_at,
      verificationTier: row.tier, contentDigest: null, validForDays: 14,
    }],
    captures: [], records: [],
  });
  const serialized = JSON.stringify(draft);
  assert.ok(!serialized.includes('Unused narrative'));
  assert.ok(!serialized.includes('example.invalid'));
});

test('source tiers include both endpoints of the authoritative registry range', () => {
  const registry = { sources: [
    sampleRegistry({ id: 'sample-c', tier: 4 }),
    sampleRegistry({ id: 'sample-a', tier: 0 }),
    sampleRegistry({ id: 'sample-b', tier: 2 }),
  ] };
  const sorted = fromRegistry(registry, policy).sources;
  assert.deepEqual(sorted.map(row => row.source), ['sample-a', 'sample-b', 'sample-c']);
  assert.deepEqual(sorted.map(row => row.verificationTier), [0, 2, 4]);
  assert.deepEqual(registry.sources.map(row => row.id), ['sample-c', 'sample-a', 'sample-b']);
});

test('incomplete source metadata blocks a review with the original field location', () => {
  const row = sampleRegistry();
  delete row.retrieved_at;
  rejects(() => fromRegistry({ sources: [row] }, policy), 'date', 'sources[0].retrievedOn');
  rejects(() => fromRegistry({ sources: [sampleRegistry({ tier: '1' })] }, policy), 'tier');
  rejects(() => fromRegistry({ sources: [sampleRegistry({ licence_id: '' })] }, policy), 'licence');
  rejects(() => fromRegistry({ sources: [sampleRegistry({ retrieved_at: '2024-03-02' })] }, policy), 'future');
});

test('preserves exact contributor credit and rejects an altered OSM notice', () => {
  const osm = sampleRegistry({
    id: 'osm-ontario', kind: 'osm', licence_id: 'ODbL-1.0', attribution: '© OpenStreetMap contributors',
  });
  const report = fromRegistry({ sources: [osm] }, policy);
  assert.equal(report.sources[0].source, 'osm-ontario');
  assert.equal(report.sources[0].licence, 'ODbL-1.0');
  rejects(() => fromRegistry({ sources: [{ ...osm, attribution: 'OpenStreetMap' }] }, policy), 'credit');
  rejects(() => fromRegistry({
    sources: [{ ...osm, id: 'osm-sample', attribution: '' }],
  }, policy), 'credit');
});

test('excluded provider is filtered from registry inputs and blocked in explicit baseline inputs', () => {
  const rows = [
    sampleRegistry({ name: 'Mi Way', id: 'sample-provider' }),
    sampleRegistry({ id: 'operator-mi-way' }), sampleRegistry(),
  ];
  assert.deepEqual(fromRegistry({ sources: rows }, policy).sources.map(row => row.source), ['sample-survey']);
  rejects(() => prepareReview(sampleInput({ sources: [sampleSource({ source: 'operator-mi-way' })] })), 'excluded');
});

test('public licence IDs can carry meaningful punctuation without carrying URLs or contact details', () => {
  for (const allowed of ["Droit d’auteur (révision 2)", 'A AND B', 'A+B / OGL-1.0', 'OGL–Ontario']) {
    const row = sampleSource({ licence: allowed });
    assert.equal(prepareReview(sampleInput({ sources: [row] })).sources[0].licence, allowed);
  }
  for (const invalid of ['\tCC0', 'CC0\nfile', '<fake>', 'API key: sample', 'https://example.invalid', 'example@invalid.local', '555-010-1234']) {
    rejects(() => prepareReview(sampleInput({ sources: [sampleSource({ licence: invalid })] })), 'licence');
  }
});

test('a historical observation and review may be on the same day, including February 29', () => {
  const source = sampleSource({ retrievedOn: '2024-02-29' });
  const data = sampleInput({
    asOf: source.retrievedOn,
    sources: [source],
    captures: [receipt(source, { retrievedOn: source.retrievedOn, checkedOn: source.retrievedOn })],
  });
  assert.equal(prepareReview(data).captures[0].retrievedOn, '2024-02-29');
  assert.equal(elapsedDays('2024-02-28', '2024-03-01'), 2);
  assert.equal(elapsedDays('2023-02-28', '2023-03-01'), 1);
});

test('invalid calendar days, UTC timestamps and local dates are never silently normalized', () => {
  assert.equal(calendarDate('2000-02-29', 'day'), '2000-02-29');
  assert.equal(calendarDate('0001-01-01', 'day'), '0001-01-01');
  for (const invalid of ['1900-02-29', '2024-02-30', '2024-2-01', '2024-13-01', '0000-01-01', '2024-03-01T00:00:00Z']) {
    rejects(() => calendarDate(invalid, 'day'), 'date', 'day');
  }
});

test('calendar intervals reject fractional or unbounded values even with an empty source list', () => {
  for (const bad of [0, -1, 1.5, 3651, '14', NaN]) {
    rejects(() => fromRegistry({ sources: [] }, { ...policy, validForDays: bad }), 'days');
  }
  for (const bad of [-1, 2.5, 3651, '14', null]) {
    rejects(() => prepareReview(sampleInput({ leadDays: bad })), 'days', 'leadDays');
  }
  assert.equal(fromRegistry({ sources: [] }, { ...policy, validForDays: 3650, leadDays: 0 }).leadDays, 0);
});

test('capture preparation binds chronological observations to the expected source revision', () => {
  const source = sampleSource();
  const check = patch => prepareReview(sampleInput({ captures: [receipt(source, patch)] }));
  rejects(() => check({ checkedOn: '2024-03-03' }), 'future');
  rejects(() => check({ retrievedOn: '2024-02-29', checkedOn: '2024-02-27' }), 'order');
  rejects(() => check({ retrievedOn: '2024-02-20' }), 'order');
  const old = check({
    baselineHash: fingerprint('old-baseline'), retrievedOn: '2023-02-28', checkedOn: '2023-03-02',
  });
  assert.equal(old.captures[0].retrievedOn, '2023-02-28');
});

test('different review schedules reuse evidence while substantive baseline edits invalidate its binding', () => {
  const source = sampleSource();
  const original = baselineHash(source);
  assert.equal(baselineHash({ ...source, validForDays: 21 }), original);
  assert.equal(baselineHash(Object.fromEntries(Object.entries(source).reverse())), original);
  for (const patch of [
    { source: 'sample-two' }, { contentDigest: null }, { licence: 'CC-BY-4.0' },
    { retrievedOn: '2024-02-23' }, { verificationTier: 1 },
  ]) {
    assert.notEqual(baselineHash({ ...source, ...patch }), original);
  }
});

test('unavailable and withdrawn evidence carries a receipt digest and cannot contain invented source bytes', () => {
  const source = sampleSource();
  const offline = notice(source, 'unavailable');
  assert.deepEqual(prepareReview(sampleInput({ captures: [offline] })).captures, [offline]);
  rejects(() => prepareReview(sampleInput({ captures: [{ ...offline, contentDigest: fingerprint('x') }] })), 'shape');
  rejects(() => prepareReview(sampleInput({ captures: [{ ...offline, evidenceDigest: null }] })), 'digest');
  rejects(() => prepareReview(sampleInput({ captures: [{ ...offline, kind: 'success' }] })), 'shape');
});

test('source and capture attribution cannot be crossed by changing ID case or adding an unknown source', () => {
  const source = sampleSource();
  rejects(() => prepareReview(sampleInput({ captures: [receipt(source, { sourceId: 'Sample-survey' })] })), 'id');
  rejects(() => prepareReview(sampleInput({ captures: [receipt(source, { sourceId: 'sample-other' })] })), 'link');
  rejects(() => prepareReview(sampleInput({ captures: [receipt(source, { baselineHash: 'ABC' })] })), 'digest');
  rejects(() => prepareReview(sampleInput({ captures: [receipt(source, { verificationTier: 5 })] })), 'tier');
});

test('duplicate IDs reject all entries including apparently identical copies', () => {
  const source = sampleSource();
  const captured = receipt(source);
  const record = linkedRecord('demo-record', [source.source]);
  for (const patch of [
    { sources: [source, { ...source }] },
    { records: [record, { ...record, access: 'NO' }] },
    { captures: [captured, { ...captured, evidenceDigest: fingerprint('second') }] },
  ]) {
    rejects(() => prepareReview(sampleInput(patch)), 'duplicate');
  }
});

test('validates the full record graph reference set before traversing any paths', () => {
  const input = sampleInput();
  rejects(() => prepareReview({ ...input, records: [linkedRecord('demo-record', ['sample-missing'])] }), 'link');
  rejects(() => prepareReview({ ...input, records: [linkedRecord('demo-record', [], ['demo-missing'])] }), 'link');
  rejects(() => prepareReview({ ...input, records: [linkedRecord('demo-record')] }), 'origin');
  rejects(() => prepareReview({
    ...input, records: [linkedRecord('demo-record', ['sample-survey', 'sample-survey'])],
  }), 'duplicate');
  rejects(() => prepareReview({
    ...input, records: [linkedRecord('demo-record', ['sample-survey'], [], true)],
  }), 'access');
});

test('rejects extra properties on closed contracts and accepts JSON records with a null prototype', () => {
  const source = sampleSource();
  for (const input of [
    { ...sampleInput(), published: true },
    sampleInput({ sources: [{ ...source, approved: true }] }),
    sampleInput({ captures: [{ ...receipt(source), note: 'unused' }] }),
    sampleInput({ records: [{ ...linkedRecord('demo-record', ['sample-survey']), owner: 'individual' }] }),
    Object.assign(Object.create({ untrusted: true }), sampleInput()),
  ]) {
    rejects(() => prepareReview(input), 'shape');
  }
  const row = Object.assign(Object.create(null), source);
  assert.deepEqual(prepareReview(sampleInput({ sources: [row] })).sources, [source]);
});

test('sparse lists and batches outside the configured limits reject without partial projections', () => {
  rejects(() => prepareReview(sampleInput({ records: Array(3) })), 'shape');
  rejects(() => prepareReview(sampleInput({ sources: Array(LIMITS.sources + 1) })), 'limit');
  rejects(() => prepareReview(sampleInput({ captures: Array(LIMITS.captures + 1) })), 'limit');
  const links = Array.from({ length: LIMITS.records + 1 }, (_, i) => 'demo-' + i);
  rejects(() => prepareReview(sampleInput({ records: [linkedRecord('demo', links)] })), 'limit');
});

test('normalization is independent of input order and leaves inputs intact', () => {
  const source = sampleSource();
  const other = sampleSource({ source: 'sample-other' });
  const input = sampleInput({
    sources: [source, other],
    records: [
      linkedRecord('route-b', [source.source, other.source], ['route-a']),
      linkedRecord('route-a', [other.source]),
    ],
    captures: [
      receipt(source, { captureId: 'capture-z' }),
      notice(other, 'unavailable', { captureId: 'capture-a' }),
    ],
  });
  const original = structuredClone(input);
  const normalized = prepareReview(input);
  assert.deepEqual(normalized.sources.map(row => row.source), ['sample-other', 'sample-survey']);
  assert.deepEqual(normalized.records.map(row => row.recordId), ['route-a', 'route-b']);
  assert.deepEqual(normalized.records[1].sourceIds, ['sample-other', 'sample-survey']);
  assert.deepEqual(normalized.captures.map(row => row.captureId), ['capture-a', 'capture-z']);
  normalized.captures.length = 0;
  normalized.records[1].sourceIds.length = 0;
  assert.deepEqual(input, original);
});

test('localized validation messages retain a structural field path and omit rejected input values', () => {
  try {
    prepareReview(sampleInput({ sources: [sampleSource({ licence: '<example>' })] }));
    assert.fail('Expected the invalid licence to be rejected');
  } catch (error) {
    assert.equal(error.name, 'SourceReviewError');
    assert.match(error.localize('fr'), /licence public/u);
    assert.match(error.message, /sources\[0\]\.licence/u);
    assert.ok(!error.message.includes('example'));
  }
});

test('manual UNKNOWN tier survives normalization while registry tier still obeys its numeric schema', () => {
  const source = sampleSource({ verificationTier: 'UNKNOWN' });
  const input = sampleInput({ sources: [source], captures: [receipt(source)] });
  const checked = prepareReview(input);
  assert.equal(checked.sources[0].verificationTier, 'UNKNOWN');
  assert.equal(checked.captures[0].verificationTier, 'UNKNOWN');
  rejects(() => fromRegistry({ sources: [sampleRegistry({ tier: 'UNKNOWN' })] }, policy), 'tier');
  const omitted = { ...source };
  delete omitted.verificationTier;
  rejects(() => prepareReview(sampleInput({ sources: [omitted] })), 'shape');
});
