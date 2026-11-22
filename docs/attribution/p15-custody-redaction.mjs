import {
 MANIFEST_SCHEMA,MAX_REDACTIONS,fail,exact,id,role,text,date,hash,oneOf,array,unique,
 copy,sorted,bodyHash,noIdentity
} from './p15-custody-contract.mjs';
import {validateCustodyLedger} from './p15-custody-ledger.mjs';

const MANIFEST=['schema','manifestId','ledgerId','createdOn','createdBy','entries','policyVersion','digest'];
const FIELDS=['label','reference','notes','licenceReference','custodianToken','contentDigest','sourceDigest'];
function entryRow(row){
 exact(row,['redactionId','itemId','fieldPath','reason','replacement','originalDigest','appliedOn','appliedBy']);
 id(row.redactionId);id(row.itemId);text(row.fieldPath,'fieldPath',{max:200});
 text(row.reason,'reason',{max:500});text(row.replacement,'replacement',{max:300});
 hash(row.originalDigest);date(row.appliedOn);role(row.appliedBy);
 const root=row.fieldPath.split('.')[0];oneOf(root,FIELDS,'redactable field');
 fail(!row.fieldPath.includes('..')&&!row.fieldPath.startsWith('.')&&!row.fieldPath.endsWith('.'),
  'FIELD_PATH','Redaction path is malformed.');
 return copy(row);
}
function checkManifestReceipts(entries, ledger, createdOn) {
 const items = new Set(ledger.items.map(item => item.itemId));
 const receipts = new Map(ledger.redactions.map(receipt => [receipt.redactionId, receipt]));
 for (const entry of entries) {
  const receipt = receipts.get(entry.redactionId);
  fail(items.has(entry.itemId), 'ITEM_REFERENCE', 'Manifest item is absent from ledger.');
  fail(entry.appliedOn <= createdOn, 'DATE_ORDER', 'Redaction date postdates manifest.');
  fail(receipt && bodyHash(entry) === bodyHash(receipt), 'REDACTION_RECEIPT',
   'Manifest fields must exactly match the recorded redaction.');
 }
}
export function createRedactionManifest(ledgerInput,{manifestId,createdOn,createdBy,entries,
 policyVersion='p15-custody-redaction-policy/1'}={}){
 const ledger=validateCustodyLedger(ledgerInput);id(manifestId);date(createdOn);role(createdBy);
 text(policyVersion,'policyVersion',{max:100});
 array(entries,'redaction entries',{max:MAX_REDACTIONS});
 const rows=entries.map(entryRow);unique(rows.map(row=>row.redactionId),'redaction IDs');
 checkManifestReceipts(rows, ledger, createdOn);
 const result={schema:MANIFEST_SCHEMA,manifestId,ledgerId:ledger.ledgerId,createdOn,
  createdBy,entries:sorted(rows,row=>`${row.itemId}:${row.fieldPath}:${row.redactionId}`),
  policyVersion,digest:''};
 result.digest=bodyHash(result);noIdentity(result);return result;
}
export function validateRedactionManifest(input,ledgerInput){
 const ledger=validateCustodyLedger(ledgerInput);
 exact(input,MANIFEST);fail(input.schema===MANIFEST_SCHEMA,'SCHEMA','Unsupported redaction manifest.');
 id(input.manifestId);id(input.ledgerId);date(input.createdOn);role(input.createdBy);
 array(input.entries,'entries',{max:MAX_REDACTIONS});const rows=input.entries.map(entryRow);
 unique(rows.map(row=>row.redactionId),'redaction IDs');
 fail(input.ledgerId===ledger.ledgerId,'LEDGER_REF','Manifest references another ledger.');
 text(input.policyVersion,'policyVersion',{max:100});
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Manifest digest invalid.');
 checkManifestReceipts(rows, ledger, input.createdOn);
 noIdentity(input);return copy(input);
}
export function redactionsForItem(input,itemId){
 const manifest=input;hash(manifest.digest);id(itemId);
 return sorted(manifest.entries.filter(row=>row.itemId===itemId),row=>row.fieldPath).map(copy);
}
export function redactionSummary(input){
 hash(input.digest);
 const byField={};for(const row of input.entries)byField[row.fieldPath]=(byField[row.fieldPath]??0)+1;
 return {manifestId:input.manifestId,entryCount:input.entries.length,
  affectedItems:new Set(input.entries.map(row=>row.itemId)).size,
  byField,digest:bodyHash({manifestId:input.manifestId,entryCount:input.entries.length,
   affectedItems:new Set(input.entries.map(row=>row.itemId)).size,byField})};
}
