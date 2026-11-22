import { bodyHash, fail, hash, id, role, text } from './p15-custody-contract.mjs';

export const itemTransitions = Object.freeze({
 held: Object.freeze(['released', 'withdrawn', 'superseded']),
 released: Object.freeze(['held', 'withdrawn', 'superseded']),
 withdrawn: Object.freeze([]),
 superseded: Object.freeze([]),
});

// validateCustodyLedger has already validated the event envelope, hash chain,
// unique snapshot keys and row shapes. Replay must also bind both directions:
// every receipt describes a row and each row has exactly one receipt.
export function checkCustodyHistory(ledger) {
 const [opening] = ledger.events;
 fail(opening.type === 'ledger-opened' &&
  opening.payload.ledgerId === ledger.ledgerId &&
  opening.actorToken === ledger.openedBy &&
  opening.at.slice(0, 10) === ledger.openedOn, 'GENESIS', 'Invalid opening receipt.');

 const items = new Map();
 const access = new Map(ledger.accessRecords.map(row => [row.accessId, row]));
 const redactions = new Map(ledger.redactions.map(row => [row.redactionId, row]));
 const checkpoints = new Set();

 for (let index = 1; index < ledger.events.length; index++) {
  const event = ledger.events[index];
  const payload = event.payload;
  fail(event.type !== 'ledger-opened', 'GENESIS', 'Ledger opened more than once.');

  if (event.type === 'checkpoint-added') {
   id(payload.checkpointId);
   const previous = ledger.events[index - 1];
   fail(payload.headHash === previous.hash && payload.sequence === previous.sequence,
    'CHECKPOINT', 'Checkpoint does not identify the previous receipt.');
   fail(!checkpoints.has(payload.checkpointId), 'DUPLICATE', 'Duplicate checkpoint.');
   checkpoints.add(payload.checkpointId);
   continue;
  }

  id(payload.itemId);
  if (event.type === 'item-registered') {
   fail(!items.has(payload.itemId), 'ITEM_HISTORY', 'Repeated evidence registration.');
   items.set(payload.itemId, {
    digest: hash(payload.itemDigest),
    custodian: role(payload.custodianToken),
    state: 'held',
    registeredAt: index,
   });
   continue;
  }

  const history = items.get(payload.itemId);
  fail(history, 'ITEM_HISTORY', 'Receipt precedes evidence registration.');
  if (event.type === 'access-recorded') {
   const row = access.get(payload.accessId);
   fail(row && row.itemId === payload.itemId && row.actorToken === event.actorToken &&
    row.accessedAt === event.at && payload.accessDigest === bodyHash(row),
    'ACCESS_HISTORY', 'Access receipt does not match the corresponding record.');
   fail(history.state !== 'withdrawn', 'ACCESS_WITHDRAWN', 'Access after withdrawal.');
   access.delete(payload.accessId);
   continue;
  }
  if (event.type === 'redaction-recorded') {
   const row = redactions.get(payload.redactionId);
   fail(row && row.itemId === payload.itemId && row.appliedBy === event.actorToken &&
    row.appliedOn === event.at.slice(0, 10) && payload.redactionDigest === bodyHash(row),
    'REDACTION_HISTORY', 'Redaction receipt does not match the corresponding record.');
   redactions.delete(payload.redactionId);
   continue;
  }

  text(payload.reason, 'reason', { max: 500 });
  fail(hash(payload.previousDigest) === history.digest, 'ITEM_DIGEST_CHAIN',
   'Evidence changes do not continue the recorded revision.');
  history.digest = hash(payload.nextDigest);
  if (event.type === 'item-state-changed') {
   fail(payload.from === history.state && itemTransitions[history.state].includes(payload.to),
    'STATE_HISTORY', 'State change conflicts with item history.');
   history.state = payload.to;
  } else if (event.type === 'custody-transferred') {
   fail(history.state !== 'withdrawn' && payload.fromCustodian === history.custodian &&
    payload.toCustodian !== history.custodian, 'CUSTODIAN_HISTORY', 'Invalid custody transfer.');
   history.custodian = role(payload.toCustodian);
  }
 }

 fail(items.size === ledger.items.length, 'ITEM_HISTORY', 'Registered item count differs from snapshot.');
 for (const row of ledger.items) {
  const history = items.get(row.itemId);
  fail(history, 'ITEM_HISTORY', 'Missing registration receipt.');
  fail(history.state === row.state, 'STATE_HISTORY', 'Snapshot state differs from history.');
  fail(history.custodian === row.custodianToken, 'CUSTODIAN_HISTORY', 'Snapshot custodian differs from history.');
  fail(history.digest === bodyHash(row), 'ITEM_DIGEST_CHAIN', 'Snapshot evidence differs from history.');
  if (row.supersedes !== null) {
   fail(items.get(row.supersedes)?.registeredAt < history.registeredAt, 'ITEM_REFERENCE',
    'Superseded evidence must have been registered first.');
  }
 }
 fail(access.size === 0, 'ACCESS_HISTORY', 'Missing access receipt.');
 fail(redactions.size === 0, 'REDACTION_HISTORY', 'Missing redaction receipt.');
}
