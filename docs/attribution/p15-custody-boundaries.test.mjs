import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
 bodyHash, eventHash, frenchTypography, LEGACY_PACK_SCHEMA, sha,
} from './p15-custody-contract.mjs';
import {
 access, item, ledger, redaction, withItem, withAccess, AT, NEXT_AT, NEXT, LATER,
} from './p15-custody-fixtures.mjs';
import {
 addCheckpoint, changeEvidenceState, recordAccess, recordRedaction,
 registerEvidence, transferCustody, validateCustodyLedger,
} from './p15-custody-ledger.mjs';
import { createCustodyPack, renderCustodyPackSummary, validateCustodyPack } from './p15-custody-pack.mjs';
import { createRedactionManifest, validateRedactionManifest } from './p15-custody-redaction.mjs';
import { auditPackAgainstLedger } from './p15-custody-audit.mjs';

const packOptions = { packId: 'review-pack', createdOn: LATER, createdBy: 'actor-auditor' };
const manifestOptions = { manifestId: 'field-receipts', createdOn: LATER, createdBy: 'actor-redactor' };

function withDigest(object) {
 object.digest = bodyHash(object);
 return object;
}

// Re-encode changed history to exercise semantic checks even with a consistent checksum.
function rechain(document) {
 let previous = '0'.repeat(64);
 for (const [index, event] of document.events.entries()) {
  event.sequence = index + 1;
  event.previousHash = previous;
  event.hash = eventHash(event);
  previous = event.hash;
 }
 return withDigest(document);
}

function expectFailure(run, code) {
 assert.throws(run, error => error?.code === code);
}

function withFieldReceipts(fields) {
 let document = withItem();
 for (const field of fields) {
  const receipt = redaction('evidence-one', {
   redactionId: 'withdraw-' + field.toLowerCase(),
   fieldPath: field,
   originalDigest: sha(document.items[0][field]),
   reason: 'Omit this metadata from the review copy.',
  });
  document = recordRedaction(document, receipt, { at: NEXT_AT, actorToken: receipt.appliedBy });
 }
 return document;
}

describe('custody history replay', () => {
 it('ties the origin event to the declared custodian and opening date', () => {
  const original = ledger();
  const changed = structuredClone(original);
  changed.openedBy = 'actor-other';
  expectFailure(() => validateCustodyLedger(withDigest(changed)), 'GENESIS');
  changed.openedBy = original.openedBy;
  changed.openedOn = NEXT;
  expectFailure(() => validateCustodyLedger(withDigest(changed)), 'GENESIS');
 });

 it('rejects an empty snapshot that still records evidence registration', () => {
  const document = withItem();
  document.items.length = 0;
  expectFailure(() => validateCustodyLedger(withDigest(document)), 'ITEM_HISTORY');
 });

 it('checks the recorded from-custodian even when the final role agrees', () => {
  const document = transferCustody(withItem(), {
   itemId: 'evidence-one', toCustodian: 'actor-handoff', actorToken: 'actor-auditor',
   at: NEXT_AT, reason: 'Shift coverage.',
  });
  document.events.at(-1).payload.fromCustodian = 'actor-alternate';
  expectFailure(() => validateCustodyLedger(rechain(document)), 'CUSTODIAN_HISTORY');
 });

 it('requires a valid origin state on each recorded change', () => {
  const document = changeEvidenceState(withItem(), {
   itemId: 'evidence-one', to: 'released', actorToken: 'actor-auditor', at: NEXT_AT,
   reason: 'Evidence release recorded.',
  });
  document.events.at(-1).payload.from = 'withdrawn';
  expectFailure(() => validateCustodyLedger(rechain(document)), 'STATE_HISTORY');
 });

 it('checks the exact checkpoint predecessor', () => {
  const document = addCheckpoint(withItem(), {
   checkpointId: 'mid-review', at: NEXT_AT, actorToken: 'actor-auditor',
  });
  document.events.at(-1).payload.headHash = document.events[0].hash;
  expectFailure(() => validateCustodyLedger(rechain(document)), 'CHECKPOINT');
 });

 it('requires unique receipts even when two events describe the same access record', () => {
  const document = withAccess();
  document.events.push(structuredClone(document.events.at(-1)));
  expectFailure(() => validateCustodyLedger(rechain(document)), 'ACCESS_HISTORY');
 });

 it('detects orphaned redaction receipts and access after withdrawal', () => {
  const document = withFieldReceipts(['label']);
  document.redactions = [];
  expectFailure(() => validateCustodyLedger(withDigest(document)), 'REDACTION_HISTORY');
  const closed = changeEvidenceState(withItem(), {
   itemId: 'evidence-one', to: 'withdrawn', at: NEXT_AT,
   actorToken: 'actor-custodian', reason: 'Evidence withdrawn.',
  });
  const accessAfter = withAccess().events.at(-1);
  closed.events.push(accessAfter);
  closed.accessRecords = [access()];
  expectFailure(() => validateCustodyLedger(rechain(closed)), 'ACCESS_WITHDRAWN');
 });

 it('matches individual access receipts to their item, actor and timestamp', () => {
  const document = registerEvidence(withItem(), item('evidence-other'), {
   at: AT, actorToken: 'actor-custodian',
  });
  const read = recordAccess(document, access('evidence-other'));
  for (const mutate of [
   event => { event.at = NEXT + 'T13:00:00.000Z'; },
   event => { event.actorToken = 'actor-backup'; },
   event => { event.payload.itemId = 'evidence-one'; },
  ]) {
   const changed = structuredClone(read);
   mutate(changed.events.at(-1));
   expectFailure(() => validateCustodyLedger(rechain(changed)), 'ACCESS_HISTORY');
  }
 });
});

describe('custody pack data minimization', () => {
 it('withholds every restricted scalar while retaining the provenance context', () => {
  const fields = ['label', 'reference', 'licenceReference', 'sourceDigest', 'contentDigest'];
  const document = withFieldReceipts(fields);
  const pack = createCustodyPack(document, packOptions);
  assert.equal(auditPackAgainstLedger(pack, document).valid, true);
  const [record] = pack.items;
  for (const field of fields) assert.equal(record[field], null, field);
  assert.equal(record.redactions.length, fields.length);
  assert.equal(record.sourceId, 'source-one');
  assert.equal(record.licence, 'CC-BY-4.0');
  assert.equal(record.retrievedOn, document.items[0].retrievedOn);
  assert.equal(record.tier, 'UNKNOWN');
  assert.equal(document.items[0].reference, 'catalogue/evidence-one');
 });

 it('applies all recorded field restrictions when a supplied manifest lists only a subset', () => {
  const document = withFieldReceipts(['label', 'reference']);
  const manifest = createRedactionManifest(document, {
   ...manifestOptions, entries: document.redactions.filter(row => row.fieldPath === 'label'),
  });
  const pack = createCustodyPack(document, { ...packOptions, manifest });
  assert.equal(pack.redactionManifestDigest, manifest.digest);
  assert.equal(pack.items[0].reference, null);
  expectFailure(() => auditPackAgainstLedger(pack, document), 'STALE_MANIFEST');
  assert.equal(auditPackAgainstLedger(pack, document, manifest).valid, true);
 });

 it('refuses a field that has been restored behind its redaction receipt', () => {
  const document = withFieldReceipts(['reference']);
  const pack = createCustodyPack(document, packOptions);
  pack.items[0].reference = document.items[0].reference;
  expectFailure(() => validateCustodyPack(withDigest(pack)), 'REDACTION');
 });

 it('requires all manifest fields to match the recorded receipt', () => {
  const document = withFieldReceipts(['label']);
  const manifest = createRedactionManifest(document, { ...manifestOptions, entries: document.redactions });
  for (const patch of [
   { replacement: 'other' }, { fieldPath: 'notes' }, { reason: 'Other reason.' },
   { appliedBy: 'actor-other' }, { appliedOn: LATER },
  ]) {
   const altered = structuredClone(manifest);
   Object.assign(altered.entries[0], patch);
   expectFailure(() => validateRedactionManifest(withDigest(altered), document), 'REDACTION_RECEIPT');
  }
 });

 it('audits disclosed values, access and summaries against the bound ledger', () => {
  const document = withAccess();
  const original = createCustodyPack(document, { ...packOptions, includeAccess: true });
  for (const mutate of [
   pack => { pack.items[0].label = 'Different evidence label'; },
   pack => { pack.items[0].tier = 4; },
   pack => { pack.access[0].reason = 'Changed purpose text.'; },
   pack => { pack.events = pack.events.slice(1); },
   pack => { pack.summaries.ledger.itemCount += 10; },
  ]) {
   const changed = structuredClone(original);
   mutate(changed);
   expectFailure(() => auditPackAgainstLedger(withDigest(changed), document), 'PACK_CONTENT');
  }
 });

 it('reads a prior ledger without rewriting its digest and declares the missing tier on export', () => {
  const historical = withItem();
  delete historical.items[0].tier;
  historical.events[1].payload.itemDigest = bodyHash(historical.items[0]);
  rechain(historical);
  assert.deepEqual(validateCustodyLedger(historical), historical);
  const pack = createCustodyPack(historical, packOptions);
  assert.equal(pack.ledgerDigest, historical.digest);
  assert.equal(pack.items[0].tier, 'UNKNOWN');
  pack.schema = LEGACY_PACK_SCHEMA;
  delete pack.items[0].tier;
  withDigest(pack);
  assert.equal(validateCustodyPack(pack).digest, pack.digest);
  assert.equal(auditPackAgainstLedger(pack, historical).valid, true);
 });

 it('preserves an explicitly supplied zero tier, and rejects out-of-contract tiers', () => {
  const document = withItem(ledger(), item('evidence-one', { tier: 0 }));
  const pack = createCustodyPack(document, packOptions);
  assert.equal(pack.items[0].tier, 0);
  for (const tier of [null, 5, '0', 0.5]) {
   expectFailure(() => withItem(ledger(), item('evidence-one', { tier })), 'ENUM');
  }
 });
});

describe('custody report language', () => {
 it('distinguishes an omitted access history from an included empty one in both languages', () => {
  const document = withItem();
  const excluded = createCustodyPack(document, packOptions);
  const empty = createCustodyPack(document, { ...packOptions, includeAccess: true });
  const fr = renderCustodyPackSummary(excluded, { lang: 'fr' });
  assert.match(fr, /Accès consignés\u00a0: non inclus/u);
  assert.match(fr, /empreintes\u202f; il/u);
  assert.ok(fr.includes('SHA-256\u00a0: ' + excluded.digest));
  assert.doesNotThrow(() => frenchTypography(fr));
  assert.match(renderCustodyPackSummary(empty, { lang: 'fr' }), /Accès consignés\u00a0: 0/u);
  assert.match(renderCustodyPackSummary(excluded), /Recorded accesses: not included/u);
  assert.match(renderCustodyPackSummary(empty), /Recorded accesses: 0/u);
 });
});
