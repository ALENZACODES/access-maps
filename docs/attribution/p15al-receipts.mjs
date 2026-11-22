// @ts-check
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { LIMITS, baselineHash, expectValue, list, object, prepareReview } from './p15al-input.mjs';

/** @import { Capture, ReviewInput, Source } from './p15al-types.d.mts' */

export const RECEIPT_SCHEMA = 'access-maps/source-review-receipts/1';

/** @param {unknown} bytes @param {string} field */
export function fileDigest(bytes, field = 'file') {
  expectValue(bytes instanceof Uint8Array, 'shape', field);
  expectValue(bytes.byteLength > 0 && bytes.byteLength <= LIMITS.bytes, 'limit', field);
  return createHash('sha256').update(bytes).digest('hex');
}

/** Build the same source snapshot schema that prepareReview validates. Both files are supplied
 * by the caller locally. The witness digest identifies the receipt; the content digest identifies
 * the upstream bytes. A filename, URL, reviewer identity or free-text note is never needed.
 * @param {Source} baseline
 * @param {{captureId:string,checkedOn:string,retrievedOn:string,licence:string,verificationTier:number|'UNKNOWN'}} observation
 * @param {Uint8Array} upstreamBytes @param {Uint8Array} witnessBytes */
export function receiptFromFiles(baseline, observation, upstreamBytes, witnessBytes) {
  const capture = {
    captureId: observation.captureId, kind: 'retrieved', sourceId: baseline.source,
    checkedOn: observation.checkedOn, retrievedOn: observation.retrievedOn,
    licence: observation.licence, verificationTier: observation.verificationTier,
    baselineHash: baselineHash(baseline),
    contentDigest: fileDigest(upstreamBytes, 'upstreamBytes'),
    evidenceDigest: fileDigest(witnessBytes, 'witnessBytes'),
  };
  const checked = prepareReview({
    schema: 'access-maps/source-revalidation-input/1', asOf: observation.checkedOn,
    leadDays: 0, sources: [baseline], records: [], captures: [capture],
  });
  return /** @type {Capture} */ (checked.captures[0]);
}

/** Import one local batch atomically. An identical capture is an idempotent retry.
 * Reusing the same capture ID for different evidence blocks the entire batch.
 * @param {unknown} input @param {unknown} batch */
export function importReceipts(input, batch) {
  const checked = prepareReview(input);
  const bundle = object(batch, 'receipts');
  expectValue(bundle.schema === RECEIPT_SCHEMA && Object.keys(bundle).length === 2 &&
    Object.hasOwn(bundle, 'captures'), 'shape', 'receipts');
  const incoming = list(bundle.captures, LIMITS.captures, 'receipts.captures');
  // Validate the batch on this review date and against this source list before touching the index.
  const newCaptures = prepareReview({ ...checked, records: [], captures: incoming }).captures;
  const merged = new Map(checked.captures.map(row => [row.captureId, row]));
  const added = [];
  const repeated = [];
  for (const capture of newCaptures) {
    const previous = merged.get(capture.captureId);
    if (previous) {
      expectValue(isDeepStrictEqual(previous, capture), 'duplicate', 'receipts.captures');
      repeated.push(capture.captureId);
    } else {
      merged.set(capture.captureId, capture);
      added.push(capture.captureId);
    }
  }
  expectValue(merged.size <= LIMITS.captures, 'limit', 'receipts.captures');
  return {
    input: prepareReview({ ...checked, captures: [...merged.values()] }),
    addedCaptureIds: added.sort(),
    repeatedCaptureIds: repeated.sort(),
  };
}
