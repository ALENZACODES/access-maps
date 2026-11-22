import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { baselineHash, fingerprint, fromRegistry, SourceReviewError } from './p15al-input.mjs';
import { RECEIPT_SCHEMA, fileDigest, importReceipts, receiptFromFiles } from './p15al-receipts.mjs';
import { buildReview, toQueueCandidates } from './p15al-review.mjs';
import { compareReviews, summarizeReview } from './p15al-summary.mjs';
import { linkedRecord, notice, receipt, sampleInput, sampleRegistry, sampleSource } from './p15al-fixtures.mjs';

const source = sampleSource();
const bytes = input => new TextEncoder().encode(input);
const batch = (...captures) => ({ schema: RECEIPT_SCHEMA, captures });

function rejected(fn, code) {
  assert.throws(fn, err => err instanceof SourceReviewError && err.code === code);
}

test('file evidence hashes the actual bytes including binary octets, independently of JSON encoding', () => {
  const chunks = [Uint8Array.from([0x00,0xff,0x80]), bytes('évidence locale')];
  for (const buffer of chunks) {
    const native = createHash('sha256').update(buffer).digest('hex');
    assert.equal(fileDigest(buffer), native);
    assert.equal(fileDigest(Buffer.from(buffer)), native);
    assert.notEqual(fileDigest(buffer), fingerprint(Array.from(buffer)));
  }
  rejected(() => fileDigest('bytes'), 'shape');
  rejected(() => fileDigest(bytes('')), 'limit');
});

test('a file-backed receipt binds declaration, witness and content without serializing either file', () => {
  const declaration = {
    captureId: 'receipt-demo', checkedOn: '2024-02-26', retrievedOn: '2024-02-24',
    licence: 'OGL-ON-1.0', verificationTier: 4,
  };
  const content = bytes('fictional offline contents');
  const witness = bytes('fictional witness receipt');
  const capture = receiptFromFiles(source, declaration, content, witness);
  assert.deepEqual(capture, {
    ...declaration, sourceId: source.source, baselineHash: baselineHash(source), kind: 'retrieved',
    evidenceDigest: fileDigest(witness), contentDigest: fileDigest(content),
  });
  assert.ok(!JSON.stringify(capture).includes('fictional'));
  content[0] = 0;
  witness.fill(1);
  assert.notEqual(fileDigest(content), capture.contentDigest);
  assert.notEqual(fileDigest(witness), capture.evidenceDigest);
});

test('a witness created before the source retrieval cannot be used as a later capture', () => {
  const bad = { captureId: 'bad-date', checkedOn: '2024-02-27', retrievedOn: '2024-02-28',
    licence: 'OGL-ON-1.0', verificationTier: 1 };
  rejected(() => receiptFromFiles(source, bad, bytes('x'), bytes('y')), 'order');
});

test('a repeated receipt batch produces the same normalized input and lists which entries were already present', () => {
  const first = receipt(source, { captureId: 'capture-r' });
  const second = notice(source, 'withdrawn', { captureId: 'capture-n' });
  const original = sampleInput();
  const result = importReceipts(original, batch(first, second));
  assert.deepEqual(result.addedCaptureIds, ['capture-n', 'capture-r']);
  assert.deepEqual(result.repeatedCaptureIds, []);
  assert.deepEqual(original.captures, []);
  const retry = importReceipts(result.input, batch(second, first));
  assert.deepEqual(retry.input, result.input);
  assert.deepEqual(retry.addedCaptureIds, []);
  assert.deepEqual(retry.repeatedCaptureIds, ['capture-n', 'capture-r']);
  assert.deepEqual(buildReview(result.input), buildReview(retry.input));
});

test('conflicting retries or invalid batch members leave the previous review completely intact', () => {
  const old = receipt(source);
  const baseline = sampleInput({ captures: [old] });
  const preserved = structuredClone(baseline);
  const early = notice(source, 'withdrawn', { captureId: 'capture-a' });
  const conflict = { ...old, verificationTier: 2 };
  rejected(() => importReceipts(baseline, batch(early, conflict)), 'duplicate');
  rejected(() => importReceipts(baseline, batch(early, { ...old, sourceId: 'source-missing' })), 'link');
  rejected(() => importReceipts(baseline, batch(early, early)), 'duplicate');
  rejected(() => importReceipts(baseline, { ...batch(early), approved: true }), 'shape');
  assert.deepEqual(baseline, preserved);
});

test('a registry-derived source supports manual byte comparison after attaching the known baseline digest', () => {
  const registry = fromRegistry({ sources: [sampleRegistry()] }, {
    asOf: '2024-03-01', validForDays: 14, leadDays: 2,
  });
  registry.sources[0].contentDigest = fileDigest(bytes('previous edition'));
  const capture = receiptFromFiles(registry.sources[0], {
    captureId: 'observed', licence: registry.sources[0].licence,
    checkedOn: '2024-02-28', retrievedOn: '2024-02-28', verificationTier: 0,
  }, bytes('next edition'), bytes('local receipt'));
  const merged = importReceipts(registry, batch(capture));
  const report = buildReview(merged.input);
  const [work] = toQueueCandidates(report);
  assert.equal(work.reason, 'content-changed');
  assert.equal(work.provenance.retrievedOn, '2024-02-22');
  assert.deepEqual(work.recordIds, []);
});

test('bilingual text reports use a single reading order and independently reveal UNKNOWN access counts', () => {
  const input = sampleInput({ asOf: '2024-03-10', records: [
    linkedRecord('demo-one', [source.source]), linkedRecord('demo-two', [source.source], [], 'NO'),
  ] });
  const report = buildReview(input);
  const en = summarizeReview(report, 'en');
  const fr = summarizeReview(report, 'fr');
  assert.match(en, /Records with unknown access: 1/u);
  assert.match(en, /Review reasons: Review overdue/u);
  assert.match(fr, /Fiches dont l’accessibilité est inconnue\u00a0: 1/u);
  assert.match(fr, /Dernier contrôle\u00a0: Inconnu/u);
  assert.match(fr, /Motifs du contrôle\u00a0: Contrôle en retard/u);
  assert.match(fr, /Licence\u00a0: CC0-1.0/u);
  assert.match(fr, /Niveau de la source\u00a0: 0/u);
  assert.match(fr, /Fiches directes\u00a0: 2/u);
  assert.match(fr, /Fiches dépendantes\u00a0: 0/u);
  assert.doesNotMatch(fr, /(?<!\u00a0):/u);
  assert.ok(fr.endsWith('\n'));
});

test('localized unknown verification tier stays unknown and OSM retains its exact contributor credit', () => {
  const osm = sampleSource({
    source: 'osm-ontario', verificationTier: 'UNKNOWN', licence: 'ODbL-1.0',
  });
  const report = buildReview(sampleInput({
    asOf: '2024-03-10', sources: [osm], records: [linkedRecord('demo', [osm.source])],
  }));
  for (const [language, credit, tier] of [
    ['en','Source credit: © OpenStreetMap contributors','Source tier: Unknown'],
    ['fr','Mention de source\u00a0: © OpenStreetMap contributors','Niveau de la source\u00a0: Inconnu'],
  ]) {
    const text = summarizeReview(report, language);
    assert.ok(text.includes(credit));
    assert.ok(text.includes(tier));
  }
  assert.equal(toQueueCandidates(report)[0].provenance.verificationTier, 'UNKNOWN');
});

test('all operational reasons have French prose including conflicts, tier and byte changes', () => {
  const unavailable = notice(source, 'unavailable', { captureId: 'offline' });
  const withdraw = notice(source, 'withdrawn', { captureId: 'notice' });
  const changes = receipt(source, {
    licence: 'Sample: version 2', verificationTier: 3, contentDigest: fingerprint('new-file'),
  });
  const current = buildReview(sampleInput({ captures: [unavailable, withdraw, changes] }));
  const text = summarizeReview(current, 'fr');
  for (const word of ['Avis de retrait', 'Justificatifs contradictoires', 'Licence modifiée',
    'Niveau de la source modifié', 'Contenu de la source modifié', 'Source indisponible']) {
    assert.ok(text.includes(word), word);
  }
  assert.ok(!text.includes('source-unavailable'));
  const unusualLicence = sampleSource({ licence: 'Test: édition' });
  const result = buildReview(sampleInput({ asOf: '2024-03-10', sources: [unusualLicence] }));
  assert.ok(summarizeReview(result, 'fr').includes('Test\u00a0: édition'));
  assert.equal(result.records[0].sources[0].licence, 'Test: édition');
});

test('a missing source or replacement baseline archives history without silently resolving open issues', () => {
  const previous = buildReview(sampleInput({
    captures: [notice(source, 'withdrawn')], asOf: '2024-03-11',
  }));
  const removed = buildReview(sampleInput({ asOf: '2024-03-12', sources: [], records: [] }));
  const [outside] = compareReviews(previous, removed).sources;
  assert.equal(outside.baselineStatus, 'outside-scope');
  assert.deepEqual(outside.archived, ['source-withdrawn', 'review-overdue']);
  assert.deepEqual(outside.cleared, []);
  assert.deepEqual(outside.removedRecordIds, ['demo-lift']);
  assert.equal(outside.currentProvenance, null);
  const replacement = buildReview(sampleInput({
    asOf: '2024-03-12', sources: [sampleSource({ retrievedOn: '2024-03-11' })],
  }));
  const [current] = compareReviews(previous, replacement).sources;
  assert.equal(current.baselineStatus, 'baseline-replaced');
  assert.deepEqual(current.archived, outside.archived);
  assert.deepEqual(current.cleared, []);
  assert.deepEqual(current.removedRecordIds, []);
  assert.equal(current.currentProvenance.retrievedOn, '2024-03-11');
});

test('calendar comparisons expose cleared schedule reasons, continuing holds and added record dependencies', () => {
  const held = notice(source, 'withdrawn');
  const previous = buildReview(sampleInput({ asOf: '2024-03-06', captures: [held] }));
  const added = linkedRecord('new-route', [], ['demo-lift']);
  const current = buildReview(sampleInput({
    asOf: '2024-03-08', captures: [held], records: [...sampleInput().records, added],
  }));
  const delta = compareReviews(previous, current);
  assert.equal(delta.previousDigest, previous.digest);
  assert.equal(delta.currentDigest, current.digest);
  const [row] = delta.sources;
  assert.equal(row.baselineStatus, 'compared');
  assert.deepEqual(row.continuing, ['source-withdrawn']);
  assert.deepEqual(row.cleared, ['review-due']);
  assert.deepEqual(row.opened, ['review-overdue']);
  assert.deepEqual(row.addedRecordIds, ['new-route']);
  assert.deepEqual(row.archived, []);
});

test('newly added sources have no earlier attribution and clear no past work', () => {
  const previous = buildReview(sampleInput({ sources: [], records: [] }));
  const current = buildReview(sampleInput({ captures: [notice(source, 'withdrawn')] }));
  const [delta] = compareReviews(previous, current).sources;
  assert.equal(delta.baselineStatus, 'added');
  assert.equal(delta.previousProvenance, null);
  assert.deepEqual(delta.opened, ['source-withdrawn']);
  assert.deepEqual(delta.addedRecordIds, ['demo-lift']);
  assert.equal(delta.currentProvenance.source, source.source);
});

test('invalid snapshots cannot enter comparison or bilingual operator summaries', () => {
  const earlier = buildReview(sampleInput());
  const later = buildReview(sampleInput({ asOf: '2024-03-05' }));
  rejected(() => compareReviews(later, earlier), 'order');
  const invalid = structuredClone(later);
  invalid.records[0].access = 'YES';
  rejected(() => compareReviews(earlier, invalid), 'report');
  rejected(() => summarizeReview(invalid, 'fr'), 'report');
  rejected(() => summarizeReview(later, 'de'), 'shape');
});
