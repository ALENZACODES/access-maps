// @ts-check
import { isDeepStrictEqual } from 'node:util';
import {
  LIMITS, baselineHash, compare, elapsedDays, expectValue, fingerprint, object, prepareReview,
} from './p15al-input.mjs';

/** @import { Calendar, Capture, Priority, Provenance, QueueCandidate, Reason, RecordImpact, RecordLink, Retrieval, ReviewInput, ReviewReport, Source, SourceReview } from './p15al-types.d.mts' */

export const REPORT_SCHEMA = 'access-maps/source-revalidation-report/1';

/** The first reason in this order is also the primary reason on a bilingual work summary.
 * @type {Readonly<Record<Reason, Priority>>} */
export const PRIORITY = Object.freeze({
  'source-withdrawn': 'urgent',
  'conflicting-captures': 'urgent',
  'licence-changed': 'high',
  'tier-changed': 'high',
  'content-changed': 'normal',
  'source-unavailable': 'normal',
  'review-overdue': 'high',
  'review-due': 'low',
});

/** @param {Source} row @returns {Provenance} */
function provenance(row) {
  return {
    source: row.source,
    licence: row.licence,
    retrievedOn: row.retrievedOn,
    verificationTier: row.verificationTier,
  };
}

/** @param {string} asOf @param {string} lastRetrievedOn @param {number} period @param {number} leadDays @returns {Calendar} */
function calendar(asOf, lastRetrievedOn, period, leadDays) {
  const dueInDays = period - elapsedDays(lastRetrievedOn, asOf);
  return {
    lastRetrievedOn,
    dueInDays,
    state: dueInDays < 0 ? 'overdue' : dueInDays <= leadDays ? 'due' : 'current',
  };
}

/** The content fingerprint deliberately excludes capture IDs, witness-file hashes and check dates.
 * Two independent reviewers can store different receipts for the same observed upstream bytes.
 * @param {Retrieval} capture */
function snapshotIdentity(capture) {
  return fingerprint([capture.licence, capture.verificationTier, capture.contentDigest]);
}

/** @param {Source} source @param {Retrieval} capture @returns {Reason[]} */
function changes(source, capture) {
  /** @type {Reason[]} */
  const result = [];
  if (source.licence !== capture.licence) result.push('licence-changed');
  if (source.verificationTier !== capture.verificationTier) result.push('tier-changed');
  if (source.contentDigest !== null && source.contentDigest !== capture.contentDigest) result.push('content-changed');
  return result;
}

/** @param {Source} source @param {Capture[]} captures @param {string} asOf @param {number} leadDays
 * @returns {SourceReview} */
function reviewSource(source, captures, asOf, leadDays) {
  const hash = baselineHash(source);
  const applicable = captures.filter(row => row.baselineHash === hash);
  const lastDay = applicable.at(-1)?.checkedOn ?? null;
  const latestChecks = applicable.filter(row => row.checkedOn === lastDay);
  const withdrawals = applicable.filter(row => row.kind === 'withdrawn');
  const receipts = applicable.filter(row => row.kind === 'retrieved');

  // Establish what was retrieved in upstream calendar order. Inspecting an old saved file
  // after a new one cannot undo a rights change or make the old file a new retrieval.
  /** @type {Map<string, Retrieval[]>} */
  const byRetrieval = new Map();
  for (const receipt of receipts) {
    const day = byRetrieval.get(receipt.retrievedOn);
    if (day) day.push(receipt);
    else byRetrieval.set(receipt.retrievedOn, [receipt]);
  }
  const retrievalDays = [...byRetrieval.keys()].sort();
  let lastMatching = source.retrievedOn;
  /** @type {Retrieval | null} */
  let latestRetrieval = null;
  /** @type {SourceReview['agreement']} */
  let agreement = 'no-retrieval';
  /** @type {Set<Reason>} */
  const reasons = new Set();
  const evidence = new Set(latestChecks.map(row => row.captureId));
  for (const day of retrievalDays) {
    const sameDay = /** @type {Retrieval[]} */ (byRetrieval.get(day));
    const first = /** @type {Retrieval} */ (sameDay[0]);
    const ambiguous = new Set(sameDay.map(snapshotIdentity)).size !== 1;
    const different = changes(source, first);
    if (!ambiguous && different.length === 0) lastMatching = day;
    if (day !== retrievalDays.at(-1)) continue;
    for (const receipt of sameDay) evidence.add(receipt.captureId);
    if (ambiguous) {
      reasons.add('conflicting-captures');
      agreement = 'ambiguous';
    } else {
      latestRetrieval = { ...first };
      for (const reason of different) reasons.add(reason);
      agreement = different.length ? 'different' : source.contentDigest === null ? 'metadata-only' : 'matches';
    }
  }
  // A withdrawal is a substantive notice. Later availability alone cannot lift it.
  for (const notice of withdrawals) {
    reasons.add('source-withdrawn');
    evidence.add(notice.captureId);
  }
  if (latestChecks.some(row => row.kind === 'unavailable')) reasons.add('source-unavailable');
  if (new Set(latestChecks.map(row => row.kind)).size > 1) reasons.add('conflicting-captures');
  const window = calendar(asOf, lastMatching, source.validForDays, leadDays);
  if (window.state === 'overdue') reasons.add('review-overdue');
  if (window.state === 'due') reasons.add('review-due');
  return {
    provenance: provenance(source),
    baselineHash: hash,
    calendar: window,
    reasons: /** @type {Reason[]} */ (Object.keys(PRIORITY)).filter(code => reasons.has(code)),
    latestCheckOn: lastDay,
    latestRetrieval,
    agreement,
    currentCaptures: applicable.length,
    supersededCaptures: captures.length - applicable.length,
    supportingCaptureIds: [...evidence].sort(),
    directRecordIds: [],
    dependentRecordIds: [],
  };
}

/** Traverse the record graph iteratively so long route-to-leg chains cannot exhaust the JS call stack.
 * Each completed record retains one source set, deduplicating every arm of a diamond.
 * @param {RecordLink[]} links @param {Map<string, SourceReview>} reviews @returns {RecordImpact[]} */
function traceRecords(links, reviews) {
  const records = new Map(links.map(row => [row.recordId, row]));
  const pending = new Map(links.map(row => [row.recordId, row.dependsOn.length]));
  /** @type {Map<string, string[]>} */
  const consumers = new Map();
  for (const row of links) {
    for (const parent of row.dependsOn) {
      const children = consumers.get(parent);
      if (children) children.push(row.recordId);
      else consumers.set(parent, [row.recordId]);
    }
  }
  const ready = links.filter(row => row.dependsOn.length === 0).map(row => row.recordId);
  /** @type {Map<string, Set<string>>} */
  const closure = new Map();
  /** @type {RecordImpact[]} */
  const result = [];
  let pairs = 0;
  let traversed = 0;
  for (const id of ready) {
    const row = /** @type {RecordLink} */ (records.get(id));
    const direct = new Set(row.sourceIds);
    const inherited = new Set(direct);
    for (const parent of row.dependsOn) {
      const upstream = /** @type {Set<string>} */ (closure.get(parent));
      // Bound work even when many parents share exactly the same source set.
      traversed += upstream.size;
      expectValue(traversed <= 5_000_000, 'limit', 'records.dependsOn');
      for (const source of upstream) inherited.add(source);
    }
    pairs += inherited.size;
    expectValue(pairs <= LIMITS.sourceRecordPairs, 'limit', 'records.sourceIds');
    closure.set(id, inherited);
    const sources = [];
    const flaggedSourceIds = [];
    for (const key of [...inherited].sort()) {
      const review = /** @type {SourceReview} */ (reviews.get(key));
      (direct.has(key) ? review.directRecordIds : review.dependentRecordIds).push(id);
      if (review.reasons.length) flaggedSourceIds.push(key);
      sources.push({ ...review.provenance });
    }
    result.push({ recordId: id, access: row.access, sources, directSourceIds: [...row.sourceIds], flaggedSourceIds });
    for (const next of consumers.get(id) ?? []) {
      const left = /** @type {number} */ (pending.get(next)) - 1;
      pending.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  expectValue(result.length === links.length, 'cycle', 'records.dependsOn');
  for (const review of reviews.values()) {
    review.directRecordIds.sort();
    review.dependentRecordIds.sort();
  }
  return result.sort((a, b) => compare(a.recordId, b.recordId));
}

/** Recompute a review entirely from its normalized source metadata, linked records and dated receipts.
 * @param {unknown} input @returns {ReviewReport} */
export function buildReview(input) {
  const normalized = prepareReview(input);
  /** @type {Map<string, Capture[]>} */
  const captures = new Map();
  for (const capture of normalized.captures) {
    const group = captures.get(capture.sourceId);
    if (group) group.push(capture);
    else captures.set(capture.sourceId, [capture]);
  }
  const sourceReviews = normalized.sources.map(source =>
    reviewSource(source, captures.get(source.source) ?? [], normalized.asOf, normalized.leadDays));
  const records = traceRecords(normalized.records, new Map(sourceReviews.map(row => [row.provenance.source, row])));
  /** @type {Omit<ReviewReport, "digest">} */
  const content = { schema: REPORT_SCHEMA, input: normalized, sourceReviews, records };
  return { ...content, digest: fingerprint(content) };
}

/** An imported report can contain stale projections even if someone recalculated its checksum.
 * Replay the evidence and compare all fields, including graph closure and recorded access values.
 * @param {unknown} value @returns {ReviewReport} */
export function replayReview(value) {
  const row = object(value, 'report');
  expectValue(row.schema === REPORT_SCHEMA, 'report', 'report.schema');
  const rebuilt = buildReview(row.input);
  expectValue(isDeepStrictEqual(row, rebuilt), 'report', 'report');
  return rebuilt;
}

/** An overdue proposal remains the same proposal on successive days. Updated evidence, baseline,
 * affected record IDs, or a changed review interval distinguish a new proposal from an old decision.
 * @param {unknown} report @returns {QueueCandidate[]} */
export function toQueueCandidates(report) {
  const replayed = replayReview(report);
  const captureById = new Map(replayed.input.captures.map(row => [row.captureId, row]));
  const periods = new Map(replayed.input.sources.map(row => [row.source, row.validForDays]));
  let totalPairs = 0;
  /** @type {QueueCandidate[]} */
  const rows = [];
  for (const source of replayed.sourceReviews) {
    if (!source.reasons.length) continue;
    const id = source.provenance.source;
    const records = [...source.directRecordIds, ...source.dependentRecordIds].sort();
    totalPairs += records.length * source.reasons.length;
    expectValue(totalPairs <= LIMITS.candidateRecordPairs, 'limit', 'proposals.recordIds');
    const support = source.supportingCaptureIds.map(key => captureById.get(key));
    for (const reason of source.reasons) {
      const basis = reason === 'review-due' || reason === 'review-overdue'
        ? [source.calendar.lastRetrievedOn, periods.get(id)] : support;
      const identity = ['access-maps/source-review-proposal/1', source.baselineHash, reason, records, basis];
      rows.push({
        proposalId: 'proposal-' + fingerprint(identity),
        sourceId: id,
        recordIds: [...records],
        priority: PRIORITY[reason],
        reason,
        provenance: { ...source.provenance },
      });
    }
  }
  return rows;
}
