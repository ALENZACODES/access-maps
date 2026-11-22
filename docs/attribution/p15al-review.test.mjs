import assert from 'node:assert/strict';
import test from 'node:test';
import { baselineHash, fingerprint, SourceReviewError } from './p15al-input.mjs';
import { buildReview, replayReview, toQueueCandidates } from './p15al-review.mjs';
import { linkedRecord, notice, receipt, sampleInput, sampleSource } from './p15al-fixtures.mjs';

const source = sampleSource();
const base = () => sampleInput();
const sourceResult = patch => buildReview(sampleInput(patch)).sourceReviews[0];

function rejects(fn, code) {
  assert.throws(fn, err => err instanceof SourceReviewError && err.code === code);
}

test('an empty catalogue has valid replayable evidence and yields an empty work queue', () => {
  const report = buildReview(sampleInput({ sources: [], records: [] }));
  assert.deepEqual(report.sourceReviews, []);
  assert.deepEqual(report.records, []);
  assert.deepEqual(toQueueCandidates(report), []);
  assert.deepEqual(replayReview(JSON.parse(JSON.stringify(report))), report);
});

test('without receipts, the clock starts at the registry retrieval and the review makes no availability claim', () => {
  const report = buildReview(base());
  const row = report.sourceReviews[0];
  assert.deepEqual(row.calendar, { lastRetrievedOn: '2024-02-22', dueInDays: 6, state: 'current' });
  assert.equal(row.latestCheckOn, null);
  assert.equal(row.latestRetrieval, null);
  assert.equal(row.agreement, 'no-retrieval');
  assert.equal(row.currentCaptures, 0);
  assert.equal(row.supersededCaptures, 0);
  assert.deepEqual(row.reasons, []);
  assert.deepEqual(report.records[0], {
    recordId: 'demo-lift', access: 'UNKNOWN', sources: [{
      source: 'sample-survey', licence: 'CC0-1.0', retrievedOn: '2024-02-22', verificationTier: 0,
    }], directSourceIds: ['sample-survey'], flaggedSourceIds: [],
  });
});

test('due dates use inclusive lead and due-day boundaries and switch to overdue on the following day', () => {
  const schedule = [
    ['2024-03-04', 3, 'current', []],
    ['2024-03-05', 2, 'due', ['review-due']],
    ['2024-03-07', 0, 'due', ['review-due']],
    ['2024-03-08', -1, 'overdue', ['review-overdue']],
  ];
  for (const [asOf, days, state, reasons] of schedule) {
    const row = sourceResult({ asOf });
    assert.equal(row.calendar.dueInDays, days);
    assert.equal(row.calendar.state, state);
    assert.deepEqual(row.reasons, reasons);
  }
});

test('metadata-only comparison explicitly distinguishes an unknown baseline byte digest', () => {
  const input = sampleSource({ contentDigest: null });
  const row = sourceResult({ sources: [input], captures: [receipt(input)] });
  assert.equal(row.agreement, 'metadata-only');
  assert.equal(row.latestRetrieval.retrievedOn, '2024-02-28');
  assert.equal(row.calendar.lastRetrievedOn, '2024-02-28');
  assert.deepEqual(row.reasons, []);
  assert.equal(row.provenance.retrievedOn, input.retrievedOn);
});

test('a changed digest under the same licence is a review proposal and never alters the record’s access', () => {
  const captures = [receipt(source, { contentDigest: fingerprint('edition-b') })];
  const report = buildReview(sampleInput({ captures }));
  assert.equal(report.records[0].access, 'UNKNOWN');
  assert.deepEqual(report.sourceReviews[0].reasons, ['content-changed']);
  assert.equal(report.sourceReviews[0].agreement, 'different');
  assert.equal(report.sourceReviews[0].calendar.lastRetrievedOn, source.retrievedOn);
  const [candidate] = toQueueCandidates(report);
  assert.deepEqual(candidate.recordIds, ['demo-lift']);
  assert.equal(candidate.sourceId, source.source);
  assert.equal(candidate.reason, 'content-changed');
  assert.equal(candidate.priority, 'normal');
  assert.deepEqual(candidate.provenance, report.sourceReviews[0].provenance);
  assert.match(candidate.proposalId, /^proposal-[a-f0-9]{64}$/u);
  assert.ok(!Object.hasOwn(candidate, 'access'));
});

test('rights, source tier and content changes are separate work items that retain baseline provenance', () => {
  const report = buildReview(sampleInput({ captures: [receipt(source, {
    licence: 'CC-BY-4.0', verificationTier: 2, contentDigest: fingerprint('edition-c'),
  })] }));
  assert.deepEqual(report.sourceReviews[0].reasons, ['licence-changed', 'tier-changed', 'content-changed']);
  const queue = toQueueCandidates(report);
  assert.deepEqual(queue.map(row => row.priority), ['high', 'high', 'normal']);
  assert.equal(new Set(queue.map(row => row.proposalId)).size, queue.length);
  for (const candidate of queue) {
    assert.equal(candidate.provenance.licence, 'CC0-1.0');
    assert.equal(candidate.provenance.verificationTier, 0);
    assert.deepEqual(candidate.recordIds, ['demo-lift']);
  }
  assert.equal(report.sourceReviews[0].latestRetrieval.licence, 'CC-BY-4.0');
});

test('independent receipts for identical upstream bytes are retained without a false conflict', () => {
  const captured = receipt(source);
  const corroboration = { ...captured, captureId: 'receipt-two', evidenceDigest: fingerprint('second-file') };
  const row = sourceResult({ captures: [corroboration, captured] });
  assert.equal(row.agreement, 'matches');
  assert.deepEqual(row.supportingCaptureIds, ['receipt-one', 'receipt-two']);
  assert.equal(row.currentCaptures, 2);
  assert.equal(row.latestRetrieval.captureId, 'receipt-one');
  assert.deepEqual(row.reasons, []);
  assert.equal(row.calendar.lastRetrievedOn, captured.retrievedOn);
});

test('conflicting versions for the same retrieval date require review, even if checked on different dates', () => {
  const older = receipt(source, { captureId: 'receipt-a', checkedOn: '2024-02-28' });
  const later = receipt(source, {
    captureId: 'receipt-b', checkedOn: '2024-02-29', contentDigest: fingerprint('another-version'),
  });
  const report = buildReview(sampleInput({ captures: [older, later] }));
  const row = report.sourceReviews[0];
  assert.equal(row.agreement, 'ambiguous');
  assert.equal(row.latestRetrieval, null);
  assert.deepEqual(row.reasons, ['conflicting-captures']);
  assert.deepEqual(row.supportingCaptureIds, ['receipt-a', 'receipt-b']);
  assert.equal(row.calendar.lastRetrievedOn, source.retrievedOn);
  assert.equal(toQueueCandidates(report)[0].priority, 'urgent');
});

test('an independent newer retrieval resolves an older fork but does not rewrite its receipts', () => {
  const fork = [
    receipt(source, { captureId: 'fork-a' }),
    receipt(source, { captureId: 'fork-b', licence: 'other-licence' }),
  ];
  const next = receipt(source, {
    captureId: 'next-version', checkedOn: '2024-03-01', retrievedOn: '2024-03-01',
  });
  const row = sourceResult({ captures: [next, ...fork] });
  assert.equal(row.agreement, 'matches');
  assert.deepEqual(row.reasons, []);
  assert.equal(row.currentCaptures, 3);
  assert.deepEqual(row.supportingCaptureIds, ['next-version']);
  assert.equal(row.calendar.lastRetrievedOn, next.retrievedOn);
});

test('a later inspection of older evidence cannot clear a newer rights change or refresh the old capture', () => {
  const newest = receipt(source, {
    captureId: 'recent', checkedOn: '2024-02-29', retrievedOn: '2024-02-29', licence: 'other-licence',
  });
  const old = receipt(source, {
    captureId: 'older', checkedOn: '2024-03-01', retrievedOn: '2024-02-24',
  });
  const row = sourceResult({ captures: [old, newest] });
  assert.equal(row.latestCheckOn, '2024-03-01');
  assert.equal(row.latestRetrieval.captureId, 'recent');
  assert.equal(row.calendar.lastRetrievedOn, '2024-02-24');
  assert.deepEqual(row.reasons, ['licence-changed']);
});

test('a temporary failure does not remove a prior substantive content change', () => {
  const changed = receipt(source, { contentDigest: fingerprint('changed') });
  const missing = notice(source, 'unavailable', { checkedOn: '2024-03-01' });
  const row = sourceResult({ captures: [missing, changed] });
  assert.deepEqual(row.reasons, ['content-changed', 'source-unavailable']);
  assert.equal(row.latestRetrieval.captureId, changed.captureId);
  assert.equal(row.latestCheckOn, '2024-03-01');
  assert.equal(row.calendar.lastRetrievedOn, source.retrievedOn);
});

test('a later successful check can clear temporary unavailability', () => {
  const unavailable = notice(source, 'unavailable');
  const retrieved = receipt(source, {
    captureId: 'receipt-a', checkedOn: '2024-02-29', retrievedOn: '2024-02-29',
  });
  const row = sourceResult({ captures: [unavailable, retrieved] });
  assert.deepEqual(row.reasons, []);
  assert.equal(row.latestCheckOn, '2024-02-29');
  assert.deepEqual(row.supportingCaptureIds, ['receipt-a']);
});

test('a withdrawal continues to flag the original baseline after a successful later check', () => {
  const withdrawn = notice(source, 'withdrawn');
  const retrieved = receipt(source, { checkedOn: '2024-02-29', retrievedOn: '2024-02-29' });
  const report = buildReview(sampleInput({ captures: [withdrawn, retrieved] }));
  assert.deepEqual(report.sourceReviews[0].reasons, ['source-withdrawn']);
  assert.deepEqual(report.sourceReviews[0].supportingCaptureIds, ['notice-one', 'receipt-one']);
  assert.equal(toQueueCandidates(report)[0].priority, 'urgent');
  assert.deepEqual(report.records[0].flaggedSourceIds, [source.source]);
  assert.equal(report.records[0].access, 'UNKNOWN');
});

test('mixed outcomes on the latest check day expose disagreement to a reviewer', () => {
  const row = sourceResult({ captures: [notice(source, 'unavailable'), receipt(source)] });
  assert.deepEqual(row.reasons, ['conflicting-captures', 'source-unavailable']);
  assert.equal(row.latestCheckOn, '2024-02-28');
  assert.deepEqual(row.supportingCaptureIds, ['notice-one', 'receipt-one']);
});

test('a capture bound to a retired revision remains counted separately and cannot affect live review', () => {
  const next = sampleSource({ licence: 'CC-BY-4.0', retrievedOn: '2024-02-29' });
  const old = notice(source, 'withdrawn', { checkedOn: '2024-03-01' });
  const row = sourceResult({ sources: [next], captures: [old] });
  assert.equal(row.currentCaptures, 0);
  assert.equal(row.supersededCaptures, 1);
  assert.deepEqual(row.reasons, []);
  assert.equal(row.latestCheckOn, null);
  assert.equal(row.calendar.lastRetrievedOn, '2024-02-29');
  assert.equal(row.baselineHash, baselineHash(next));
});

test('UNKNOWN source tier stays attached to every linked record and proposal during a requested tier change', () => {
  const unknown = sampleSource({ verificationTier: 'UNKNOWN' });
  const report = buildReview(sampleInput({
    sources: [unknown], captures: [receipt(unknown, { verificationTier: 1 })],
  }));
  assert.deepEqual(report.sourceReviews[0].reasons, ['tier-changed']);
  assert.equal(report.records[0].sources[0].verificationTier, 'UNKNOWN');
  assert.equal(toQueueCandidates(report)[0].provenance.verificationTier, 'UNKNOWN');
});

test('diamond-shaped route dependencies produce one record impact per source with direct attribution preferred', () => {
  const second = sampleSource({ source: 'sample-doors', licence: 'CC-BY-4.0', verificationTier: 3 });
  const input = sampleInput({
    sources: [source, second],
    captures: [notice(second, 'withdrawn')],
    records: [
      linkedRecord('demo-leaf', [source.source]),
      linkedRecord('demo-east', [second.source], ['demo-leaf'], 'NO'),
      linkedRecord('demo-west', [source.source], ['demo-leaf'], 'YES'),
      linkedRecord('demo-route', [], ['demo-west', 'demo-east']),
    ],
  });
  const report = buildReview(input);
  const byId = Object.fromEntries(report.sourceReviews.map(row => [row.provenance.source, row]));
  assert.deepEqual(byId[source.source].directRecordIds, ['demo-leaf', 'demo-west']);
  assert.deepEqual(byId[source.source].dependentRecordIds, ['demo-east', 'demo-route']);
  assert.deepEqual(byId[second.source].directRecordIds, ['demo-east']);
  assert.deepEqual(byId[second.source].dependentRecordIds, ['demo-route']);
  const route = report.records.find(row => row.recordId === 'demo-route');
  assert.equal(route.access, 'UNKNOWN');
  assert.deepEqual(route.sources.map(row => row.licence), ['CC-BY-4.0', 'CC0-1.0']);
  assert.deepEqual(route.directSourceIds, []);
  assert.deepEqual(route.flaggedSourceIds, ['sample-doors']);
  assert.deepEqual(toQueueCandidates(report)[0].recordIds, ['demo-east', 'demo-route']);
});

test('source-only findings survive an empty record mapping', () => {
  const report = buildReview(sampleInput({ records: [], captures: [notice(source, 'withdrawn')] }));
  const [candidate] = toQueueCandidates(report);
  assert.deepEqual(candidate.recordIds, []);
  assert.equal(candidate.reason, 'source-withdrawn');
  assert.equal(candidate.sourceId, source.source);
  assert.equal(candidate.provenance.retrievedOn, source.retrievedOn);
});

test('rejects dependency cycles in disconnected graphs even if their rows carry explicit source links', () => {
  const records = [
    linkedRecord('demo-safe', [source.source]),
    linkedRecord('demo-first', [source.source], ['demo-last']),
    linkedRecord('demo-last', [source.source], ['demo-first']),
  ];
  rejects(() => buildReview(sampleInput({ records })), 'cycle');
  rejects(() => buildReview(sampleInput({
    records: [linkedRecord('demo-self', [source.source], ['demo-self'])],
  })), 'cycle');
});

test('long route chains resolve iteratively and support downstream records with no direct source list', () => {
  const n = 12_000;
  const records = [linkedRecord('link-0', [source.source])];
  for (let i = 1; i < n; i++) records.push(linkedRecord('link-' + i, [], ['link-' + (i - 1)]));
  const result = buildReview(sampleInput({ records }));
  assert.equal(result.records.length, n);
  assert.equal(result.sourceReviews[0].dependentRecordIds.length, n - 1);
  assert.equal(result.records.find(row => row.recordId === 'link-11999').sources[0].source, source.source);
});

test('limits the materialized transitive source-by-record map independently of the raw input edge count', () => {
  const sources = Array.from({ length: 101 }, (_, i) => sampleSource({ source: 'sample-' + i }));
  const records = [linkedRecord('shared', sources.map(row => row.source))];
  for (let i = 0; i < 1_000; i++) records.push(linkedRecord('consumer-' + i, [], ['shared']));
  rejects(() => buildReview(sampleInput({ sources, records })), 'limit');
});

test('report replay detects projection edits even if all public checksums were recalculated', () => {
  const result = buildReview(sampleInput({ captures: [notice(source, 'withdrawn')] }));
  const alterAndRehash = change => {
    const copy = structuredClone(result);
    change(copy);
    const { digest: old, ...rest } = copy;
    copy.digest = fingerprint(rest);
    assert.notEqual(copy.digest, old);
    return copy;
  };
  for (const edit of [
    copy => { copy.records[0].access = 'YES'; },
    copy => { copy.sourceReviews[0].reasons = []; },
    copy => { copy.records[0].sources[0].verificationTier = 4; },
    copy => { copy.sourceReviews[0].directRecordIds = []; },
    copy => { copy.sourceReviews[0].currentCaptures = 2; },
    copy => { copy.approved = true; },
  ]) {
    const tampered = alterAndRehash(edit);
    rejects(() => replayReview(tampered), 'report');
    rejects(() => toQueueCandidates(tampered), 'report');
  }
});

test('changing object key order does not invalidate an otherwise unchanged saved report', () => {
  const normal = buildReview(base());
  const reverse = obj => Object.fromEntries(Object.entries(obj).reverse());
  const reordered = reverse(normal);
  reordered.input = reverse(normal.input);
  reordered.records = normal.records.map(reverse);
  assert.deepEqual(replayReview(reordered), normal);
});

test('the same overdue case keeps its identity day to day and reopens on a changed scope or schedule', () => {
  const prev = sampleInput({ asOf: '2024-03-09' });
  const id = input => toQueueCandidates(buildReview(input))[0].proposalId;
  assert.equal(id(prev), id({ ...prev, asOf: '2024-03-10' }));
  assert.notEqual(id(prev), id({ ...prev, sources: [sampleSource({ validForDays: 13 })] }));
  assert.notEqual(id(prev), id({ ...prev, records: [linkedRecord('demo-lift-two', [source.source])] }));
  assert.notEqual(id(prev), id({ ...prev, sources: [sampleSource({ licence: 'A-NEW' })] }));
});

test('a candidate’s identity binds the receipt rather than relying only on its human-assigned ID', () => {
  const first = notice(source, 'withdrawn');
  const changed = { ...first, evidenceDigest: fingerprint('corrected-witness') };
  const make = capture => toQueueCandidates(buildReview(sampleInput({ captures: [capture] })))[0];
  assert.notEqual(make(first).proposalId, make(changed).proposalId);
  assert.deepEqual(make(first).provenance, make(changed).provenance);
});

test('input source and record order cannot change the report, queue identities or candidate order', () => {
  const other = sampleSource({ source: 'sample-two' });
  const input = sampleInput({
    sources: [other, source],
    captures: [notice(source, 'withdrawn'), receipt(other, { captureId: 'other-receipt', verificationTier: 1 })],
    records: [linkedRecord('sample-route', [], ['sample-two', 'sample-one']),
      linkedRecord('sample-two', [other.source]), linkedRecord('sample-one', [source.source])],
  });
  const reversed = {
    ...input, sources: [...input.sources].reverse(), captures: [...input.captures].reverse(),
    records: [...input.records].reverse().map(row => ({ ...row, dependsOn: [...row.dependsOn].reverse() })),
  };
  const before = buildReview(input);
  const after = buildReview(reversed);
  assert.deepEqual(before, after);
  assert.deepEqual(toQueueCandidates(before), toQueueCandidates(after));
});

test('candidate edits never mutate the supplied report or another proposal', () => {
  const report = buildReview(sampleInput({ captures: [receipt(source, { licence: 'A', verificationTier: 2 })] }));
  const expected = structuredClone(report);
  const candidates = toQueueCandidates(report);
  candidates[0].provenance.licence = 'edited';
  candidates[0].recordIds.pop();
  assert.equal(candidates[1].provenance.licence, source.licence);
  assert.deepEqual(candidates[1].recordIds, ['demo-lift']);
  assert.deepEqual(report, expected);
});
