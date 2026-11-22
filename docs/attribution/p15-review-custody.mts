import { isDeepStrictEqual } from 'node:util';
import { bodyHash } from './p15-custody-contract.mjs';
import { validateCustodyLedger } from './p15-custody-ledger.mjs';
import { baselineHash, prepareReview } from './p15al-input.mjs';
import { buildReview, toQueueCandidates } from './p15al-review.mjs';
import type { Retrieval } from './p15al-types.d.mts';
import { openReviewQueue, validateReviewQueue } from './p15am-queue.mts';
import { fields, checksum, list, publicId, instant } from './p15am-model.mts';

interface EvidenceItem {
 itemId: string;
 kind: string;
 state: string;
 sourceId: string;
 sourceDigest: string;
 contentDigest: string;
 retrievedOn: string;
 licence: string;
 tier?: number | 'UNKNOWN';
}
interface CustodyLedger {
 ledgerId: string;
 digest: string;
 items: EvidenceItem[];
 events: { at: string }[];
 redactions: { itemId: string; fieldPath: string }[];
}
interface Binding {
 captureId: string;
 itemId: string;
 itemDigest: string;
}

const reasons = {
 STALE: ['The selected custody revision has changed.', 'La version du registre de conservation a changé.'],
 SELECTION: ['Select distinct evidence items.', 'Sélectionnez des éléments de preuve distincts.'],
 MISSING: ['The selected item is absent from the ledger.', 'L’élément sélectionné est absent du registre.'],
 KIND: ['Select a source capture.', 'Sélectionnez une capture de source.'],
 STATE: ['This capture was withdrawn or superseded.', 'Cette capture a été retirée ou remplacée.'],
 REDACTED: ['A required fingerprint is withheld.', 'Une empreinte requise est masquée.'],
 SOURCE: ['The capture refers to another source revision.', 'La capture renvoie à une autre version de la source.'],
 DATE: ['The revision falls after the review date.', 'La version est postérieure à la date du contrôle.'],
 REPLAY: ['The evidence differs from the recorded review.', 'Les preuves diffèrent du contrôle consigné.'],
 QUEUE: ['The queue belongs to another review.', 'La file appartient à un autre contrôle.'],
} as const;

export class CustodyReviewError extends Error {
 readonly code: keyof typeof reasons;
 constructor(code: keyof typeof reasons) {
  super(reasons[code][0]);
  this.name = 'CustodyReviewError';
  this.code = code;
 }
 localize(lang: 'en' | 'fr') {
  return reasons[this.code][lang === 'fr' ? 1 : 0];
 }
}

function requireBinding(condition: unknown, code: keyof typeof reasons): asserts condition {
 if (!condition) throw new CustodyReviewError(code);
}

/** Only source captures carry observed bytes. A custody state change is never a source withdrawal. */
export function buildCustodyReview(input: unknown) {
 const request = fields(input, ['review', 'ledger', 'selection']);
 const review = prepareReview(request.review);
 const ledger: CustodyLedger = validateCustodyLedger(request.ledger);
 const selection = fields(request.selection, ['ledgerDigest', 'itemIds']);
 requireBinding(checksum(selection.ledgerDigest) === ledger.digest, 'STALE');
 const itemIds = list(selection.itemIds, 20000).map(publicId).sort();
 requireBinding(itemIds.length > 0 && new Set(itemIds).size === itemIds.length, 'SELECTION');
 const lastEvent = ledger.events.at(-1);
 requireBinding(lastEvent && lastEvent.at.slice(0, 10) <= review.asOf, 'DATE');

 const items = new Map(ledger.items.map(row => [row.itemId, row]));
 const sources = new Map(review.sources.map(row => [row.source, row]));
 const restrictedDigests = new Set(ledger.redactions
  .filter(row => ['sourceDigest', 'contentDigest'].includes(row.fieldPath.split('.')[0] ?? ''))
  .map(row => row.itemId));
 const captures: Retrieval[] = [];
 const bindings: Binding[] = [];
 for (const itemId of itemIds) {
  const item = items.get(itemId);
  requireBinding(item, 'MISSING');
  requireBinding(item.kind === 'source-capture', 'KIND');
  requireBinding(item.state === 'held' || item.state === 'released', 'STATE');
  requireBinding(!restrictedDigests.has(itemId), 'REDACTED');
  const source = sources.get(item.sourceId);
  requireBinding(source && baselineHash(source) === item.sourceDigest, 'SOURCE');
  // Bind to the exact local revision. Neither an item label nor a file path
  // can be used to substitute evidence from another catalogue or capture.
  const itemDigest: string = bodyHash(item);
  const captureId = 'custody-' + bodyHash({ ledgerId: ledger.ledgerId, itemId, itemDigest, checkedOn: review.asOf });
  bindings.push({ captureId, itemId, itemDigest });
  captures.push({
   captureId, kind: 'retrieved', sourceId: item.sourceId, baselineHash: item.sourceDigest,
   checkedOn: review.asOf, retrievedOn: item.retrievedOn, evidenceDigest: itemDigest,
   licence: item.licence, verificationTier: item.tier ?? 'UNKNOWN', contentDigest: item.contentDigest,
  });
 }

 const report = buildReview({ ...review, captures: [...review.captures, ...captures] });
 const custody = {
  schema: 'access-maps/review-custody-selection/1' as const,
  ledgerId: ledger.ledgerId,
  ledgerDigest: ledger.digest,
  headAt: lastEvent.at,
  asOf: review.asOf,
  bindings,
  reviewDigest: report.digest,
 };
 return { custody: { ...custody, digest: bodyHash(custody) as string }, report };
}

/** Rebuild the review using the recipient's independently supplied source and ledger revisions. */
export function verifyCustodyReview(input: unknown, bundle: unknown) {
 const expected = buildCustodyReview(input);
 requireBinding(isDeepStrictEqual(expected, bundle), 'REPLAY');
 return expected;
}

function queueFor(bundle: ReturnType<typeof buildCustodyReview>, setup: unknown) {
 const settings = fields(setup, ['queueId', 'openedAt', 'desks']);
 const openedAt = instant(settings.openedAt);
 requireBinding(openedAt >= bundle.custody.headAt && openedAt.slice(0, 10) >= bundle.report.input.asOf, 'DATE');
 // Two reports can legitimately have identical pending proposals or no
 // proposals at all. Their queues must still identify the exact intake.
 const alias = publicId(settings.queueId);
 const queueId = 'review-' + bodyHash({ alias, custodyDigest: bundle.custody.digest });
 return openReviewQueue({ ...settings, queueId, candidates: toQueueCandidates(bundle.report) });
}

export function openCustodyReviewSession(input: unknown, setup: unknown) {
 const bundle = buildCustodyReview(input);
 return { ...bundle, queue: queueFor(bundle, setup) };
}

/** Validate the entire queue history and compare its seed to the independently rebuilt review. */
export function resumeCustodyReviewSession(input: unknown, setup: unknown, session: unknown) {
 const parts = fields(session, ['custody', 'report', 'queue']);
 const bundle = verifyCustodyReview(input, { custody: parts.custody, report: parts.report });
 const queue = validateReviewQueue(parts.queue);
 const initial = queueFor(bundle, setup);
 requireBinding(initial.genesis === queue.genesis, 'QUEUE');
 return { ...bundle, queue };
}
