import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha, bodyHash } from './p15-custody-contract.mjs';
import { item, ledger, withItem, DAY, AT, NEXT, NEXT_AT, LATER } from './p15-custody-fixtures.mjs';
import { changeEvidenceState, recordRedaction, transferCustody } from './p15-custody-ledger.mjs';
import { baselineHash, INPUT_SCHEMA } from './p15al-input.mjs';
import { inspectReviewQueue, applyReviewCommands } from './p15am-queue.mts';
import { exportReviewHandoff, importReviewHandoff } from './p15am-transfer.mts';
import {
 buildCustodyReview, openCustodyReviewSession, resumeCustodyReviewSession, verifyCustodyReview,
} from './p15-review-custody.mts';

function scenario(options = {}) {
 const source = {
  source: 'sample-survey', licence: 'CC0-1.0', retrievedOn: DAY,
  verificationTier: 0, contentDigest: sha('first edition'), validForDays: 7,
 };
 const capture = item('sample-capture', {
  label: 'Internal source witness', reference: 'local/retained-capture',
  notes: 'Desk working note.', sourceId: source.source,
  sourceDigest: baselineHash(source), contentDigest: sha('second edition'),
  tier: 0, licence: source.licence,
  ...options,
 });
 const book = withItem(ledger(), capture);
 return {
  review: {
   schema: INPUT_SCHEMA, asOf: NEXT, leadDays: 1, sources: [source],
   records: [
    { recordId: 'segment', access: 'UNKNOWN', sourceIds: [source.source], dependsOn: [] },
    { recordId: 'connection', access: 'UNKNOWN', sourceIds: [], dependsOn: ['segment'] },
   ], captures: [],
  },
  ledger: book, selection: { ledgerDigest: book.digest, itemIds: [capture.itemId] },
 };
}

const queueSettings = {
 queueId: 'review-session', openedAt: NEXT_AT,
 desks: ['desk-01', 'desk-02'].map(deskId => ({ deskId, capacity: 2, excludedSources: [] })),
};

function attach(input, newLedger) {
 return { ...input, ledger: newLedger, selection: { ...input.selection, ledgerDigest: newLedger.digest } };
}

function rejects(run, code) {
 assert.throws(run, error => error?.code === code, code);
}

function requestQueue(command, input, lang = 'en') {
 const cli = fileURLToPath(new URL('./p15am-cli.mts', import.meta.url));
 return spawnSync(process.execPath, [cli, command, lang], {
  input: JSON.stringify(input), encoding: 'utf8', timeout: 10000,
 });
}

describe('binding selected evidence', () => {
 it('retains source evidence without exporting custody notes or identifying a reviewer', () => {
  const input = scenario();
  const bundle = buildCustodyReview(input);
  assert.deepEqual(bundle.report.records.map(row => [row.recordId, row.access]), [
   ['connection', 'UNKNOWN'], ['segment', 'UNKNOWN'],
  ]);
  const [capture] = bundle.report.input.captures;
  assert.equal(capture.kind, 'retrieved');
  assert.equal(capture.retrievedOn, DAY);
  assert.equal(capture.checkedOn, NEXT);
  assert.equal(capture.evidenceDigest, bodyHash(input.ledger.items[0]));
  assert.equal(capture.contentDigest, input.ledger.items[0].contentDigest);
  assert.equal(capture.baselineHash, baselineHash(input.review.sources[0]));
  assert.equal(bundle.custody.bindings[0].itemId, 'sample-capture');
  assert.equal(bundle.custody.bindings[0].captureId, capture.captureId);
  assert.equal(bundle.custody.reviewDigest, bundle.report.digest);
  assert.equal(bundle.custody.ledgerDigest, input.ledger.digest);
  const serialized = JSON.stringify(bundle);
  for (const privateValue of ['Desk working note.', 'local/retained-capture', 'actor-custodian']) {
   assert.equal(serialized.includes(privateValue), false);
  }
  assert.deepEqual(verifyCustodyReview(input, JSON.parse(serialized)), bundle);
 });

 it('binds the receipt to its baseline and refuses a stale or unrelated source', () => {
  const input = scenario();
  input.review.sources[0].licence = 'CC-BY-4.0';
  rejects(() => buildCustodyReview(input), 'SOURCE');
  const other = scenario({ sourceId: 'other-source' });
  rejects(() => buildCustodyReview(other), 'SOURCE');
 });

 it('refuses to infer availability from a custody withdrawal', () => {
  const input = scenario();
  const withdrawn = changeEvidenceState(input.ledger, {
   itemId: 'sample-capture', to: 'withdrawn', at: NEXT_AT,
   actorToken: 'actor-custodian', reason: 'Local copy withdrawn.',
  });
  rejects(() => buildCustodyReview(attach(input, withdrawn)), 'STATE');
  const notice = scenario({ kind: 'change-notice' });
  rejects(() => buildCustodyReview(notice), 'KIND');
 });

 it('honours a withheld digest without requiring a separately supplied manifest', () => {
  const input = scenario();
  const redacted = recordRedaction(input.ledger, {
   redactionId: 'withhold-digest', fieldPath: 'contentDigest', itemId: 'sample-capture',
   appliedOn: NEXT, appliedBy: 'actor-redactor', originalDigest: sha('prior value'),
   reason: 'Withhold fingerprint.', replacement: '[withheld]',
  }, { actorToken: 'actor-redactor', at: NEXT_AT });
  rejects(() => buildCustodyReview(attach(input, redacted)), 'REDACTED');
 });

 it('separates a stale custody selection from a changed source baseline', () => {
  const input = scenario();
  const newer = transferCustody(input.ledger, {
   itemId: 'sample-capture', at: NEXT_AT, actorToken: 'actor-custodian',
   toCustodian: 'actor-archive', reason: 'Shift handoff.',
  });
  rejects(() => buildCustodyReview({ ...input, ledger: newer }), 'STALE');
  const bundle = buildCustodyReview(attach(input, newer));
  assert.equal(bundle.custody.ledgerDigest, newer.digest);
 });

 it('requires each selected item to exist exactly once and in the review period', () => {
  const input = scenario();
  const select = itemIds => buildCustodyReview({
   ...input, selection: { ...input.selection, itemIds },
  });
  rejects(() => select(['unknown-item']), 'MISSING');
  rejects(() => select([]), 'SELECTION');
  rejects(() => select(['sample-capture', 'sample-capture']), 'SELECTION');
  const newer = transferCustody(input.ledger, {
   at: LATER + 'T00:00:00.000Z', actorToken: 'actor-custodian',
   toCustodian: 'actor-archive', itemId: 'sample-capture', reason: 'Later handoff.',
  });
  rejects(() => buildCustodyReview(attach(input, newer)), 'DATE');
 });

 it('carries an unknown capture tier through comparison and keeps registry provenance separate', () => {
  const input = scenario({ tier: 'UNKNOWN' });
  const { report } = buildCustodyReview(input);
  assert.equal(report.input.captures[0].verificationTier, 'UNKNOWN');
  assert.equal(report.sourceReviews[0].provenance.verificationTier, 0);
  assert.ok(report.sourceReviews[0].reasons.includes('tier-changed'));
  assert.ok(report.records.every(row => row.access === 'UNKNOWN'));
 });

 it('replays independently of selection order and the caller retains ownership of inputs', () => {
  const input = scenario();
  const second = item('another-capture', {
   ...input.ledger.items[0], itemId: 'another-capture', contentDigest: sha('other edition'),
  });
  const combined = attach(input, withItem(input.ledger, second));
  combined.selection.itemIds.push(second.itemId);
  const snapshot = structuredClone(combined);
  const bundle = buildCustodyReview(combined);
  assert.deepEqual(combined, snapshot);
  snapshot.selection.itemIds.reverse();
  assert.deepEqual(buildCustodyReview(snapshot), bundle);
  assert.ok(bundle.report.sourceReviews[0].reasons.includes('conflicting-captures'));
 });

 it('rejects a modified selection receipt even when the receipt has been rehashed', () => {
  const input = scenario();
  const bundle = buildCustodyReview(input);
  bundle.custody.bindings[0].itemId = 'unlisted-item';
  bundle.custody.digest = bodyHash(bundle.custody);
  rejects(() => verifyCustodyReview(input, bundle), 'REPLAY');
 });
});

describe('source review desk handoff', () => {
 it('reopens a returned queue against the independent ledger and source review', () => {
  const input = scenario();
  const session = openCustodyReviewSession(input, queueSettings);
  const [work] = session.queue.seed.candidates;
  assert.deepEqual(work.recordIds, ['connection', 'segment']);
  assert.equal(work.reason, 'content-changed');
  const claimed = applyReviewCommands(session.queue, [{
   commandId: 'op-0123456789abcdef', proposalId: work.proposalId, actor: 'desk-01',
   expected: session.queue.cursor, at: NEXT_AT, action: { kind: 'claim' },
  }]);
  const handoff = exportReviewHandoff(claimed, session.queue.cursor);
  const received = importReviewHandoff(session.queue, JSON.parse(JSON.stringify(handoff)));
  const restored = resumeCustodyReviewSession(input, queueSettings, { ...session, queue: received });
  assert.equal(restored.queue.cursor.revision, 1);
  assert.deepEqual(restored.report, session.report);
  assert.deepEqual(restored.queue, claimed);
 });

 it('detects a swapped queue even when that queue independently passes replay', () => {
  const firstInput = scenario();
  const first = openCustodyReviewSession(firstInput, queueSettings);
  const second = openCustodyReviewSession(scenario({ licence: 'UNKNOWN' }), queueSettings);
  assert.doesNotThrow(() => inspectReviewQueue(second.queue));
  rejects(() => resumeCustodyReviewSession(firstInput, queueSettings, {
   ...first, queue: second.queue,
  }), 'QUEUE');
  rejects(() => openCustodyReviewSession(firstInput, { ...queueSettings, openedAt: AT }), 'DATE');
 });

 it('keeps two evidence revisions distinct even when both dispatch exactly the same work', () => {
  const firstInput = scenario();
  const first = openCustodyReviewSession(firstInput, queueSettings);
  const extra = item('unselected-reference', { kind: 'document-reference' });
  const revisedInput = attach(firstInput, withItem(firstInput.ledger, extra));
  const revised = openCustodyReviewSession(revisedInput, queueSettings);
  assert.deepEqual(first.queue.seed.candidates, revised.queue.seed.candidates);
  assert.notEqual(first.queue.genesis, revised.queue.genesis);
  rejects(() => resumeCustodyReviewSession(revisedInput, queueSettings, {
   ...revised, queue: first.queue,
  }), 'QUEUE');
 });

 it('opens and resumes the same verified session through the executable entry point', () => {
  const input = scenario();
  const opened = requestQueue('open-custody', { input, setup: queueSettings });
  assert.equal(opened.status, 0, opened.stderr);
  const session = JSON.parse(opened.stdout);
  const resumed = requestQueue('resume-custody', { input, setup: queueSettings, session }, 'fr');
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.deepEqual(JSON.parse(resumed.stdout), session);
  input.selection.ledgerDigest = '0'.repeat(64);
  const stale = requestQueue('resume-custody', { input, setup: queueSettings, session }, 'fr');
  assert.notEqual(stale.status, 0);
  assert.equal(stale.stdout, '');
  assert.match(stale.stderr, /registre de conservation/u);
 });
});
