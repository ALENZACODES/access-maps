import {
 fail,exact,date,hash,array,unique,bodyHash,copy,sorted,noIdentity,LEGACY_PACK_SCHEMA
} from './p15-custody-contract.mjs';
import {validateCustodyLedger} from './p15-custody-ledger.mjs';
import {validateRedactionManifest} from './p15-custody-redaction.mjs';
import {createCustodyPack,validateCustodyPack} from './p15-custody-pack.mjs';

export function verifyCustodyLedger(input){
 const ledger=validateCustodyLedger(input);
 const events=ledger.events.map(row=>({sequence:row.sequence,hash:row.hash,previousHash:row.previousHash}));
 const items=ledger.items.map(row=>({itemId:row.itemId,digest:bodyHash(row),state:row.state}));
 return {valid:true,ledgerId:ledger.ledgerId,eventCount:events.length,itemCount:items.length,
  headHash:events.at(-1).hash,items:sorted(items,row=>row.itemId),
  digest:bodyHash({ledgerId:ledger.ledgerId,events,items})};
}
export function auditCustodyReferences(ledgerInput,{expectedSourceDigests={},
 requiredAccessPurpose=null,asOf=null}={}){
 const ledger=validateCustodyLedger(ledgerInput);
 if(asOf!==null)date(asOf);
 const issues=[];
 for(const item of ledger.items){
  if(expectedSourceDigests[item.sourceId]!==undefined&&expectedSourceDigests[item.sourceId]!==item.sourceDigest)
   issues.push({code:'SOURCE_DIGEST_MISMATCH',itemId:item.itemId});
  if(item.licence==='UNKNOWN')issues.push({code:'LICENCE_UNKNOWN',itemId:item.itemId});
  if(item.state==='held'&&item.supersedes!==null)issues.push({code:'SUPERSESSION_REVIEW',itemId:item.itemId});
  if(asOf!==null&&item.retrievedOn>asOf)issues.push({code:'FUTURE_RETRIEVAL',itemId:item.itemId});
 }
 if(requiredAccessPurpose!==null){
  for(const item of ledger.items){
   const accessed=ledger.accessRecords.some(row=>row.itemId===item.itemId&&row.purpose===requiredAccessPurpose);
   if(!accessed)issues.push({code:'ACCESS_NOT_RECORDED',itemId:item.itemId});
  }
 }
 const ordered=sorted(issues,row=>`${row.code}:${row.itemId}`);
 return {ledgerId:ledger.ledgerId,ledgerDigest:ledger.digest,asOf,
  issueCount:ordered.length,issues:ordered,digest:bodyHash({ledgerId:ledger.ledgerId,
   ledgerDigest:ledger.digest,asOf,issueCount:ordered.length,issues:ordered})};
}
export function compareCustodyLedgers(previousInput,currentInput){
 const previous=validateCustodyLedger(previousInput),current=validateCustodyLedger(currentInput);
 const oldMap=new Map(previous.items.map(row=>[row.itemId,row])),newMap=new Map(current.items.map(row=>[row.itemId,row]));
 const ids=[...new Set([...oldMap.keys(),...newMap.keys()])].sort();
 const changes=ids.map(itemId=>{
  const before=oldMap.get(itemId)??null,after=newMap.get(itemId)??null;
  return {itemId,change:!before?'added':!after?'removed':
   bodyHash(before)===bodyHash(after)?'unchanged':'changed',
   previousDigest:before?bodyHash(before):null,currentDigest:after?bodyHash(after):null,
   previousState:before?.state??null,currentState:after?.state??null};
 });
 const summary={added:changes.filter(row=>row.change==='added').length,
  removed:changes.filter(row=>row.change==='removed').length,
  changed:changes.filter(row=>row.change==='changed').length,
  unchanged:changes.filter(row=>row.change==='unchanged').length};
 const result={previousLedgerDigest:previous.digest,currentLedgerDigest:current.digest,
  changes,summary,digest:''};result.digest=bodyHash(result);return result;
}
export function validateCustodyComparison(input){
 exact(input,['previousLedgerDigest','currentLedgerDigest','changes','summary','digest']);
 hash(input.previousLedgerDigest);hash(input.currentLedgerDigest);array(input.changes,'changes');
 unique(input.changes.map(row=>row.itemId),'comparison item IDs');
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Comparison digest invalid.');
 return copy(input);
}
export function auditPackAgainstLedger(packInput,ledgerInput,manifestInput=null){
 const pack=validateCustodyPack(packInput),ledger=validateCustodyLedger(ledgerInput);
 fail(pack.ledgerId===ledger.ledgerId&&pack.ledgerDigest===ledger.digest,
  'STALE_PACK','Pack references another ledger revision.');
 if(manifestInput!==null){
  const manifest=validateRedactionManifest(manifestInput,ledger);
  fail(pack.redactionManifestDigest===manifest.digest,'STALE_MANIFEST','Pack redaction manifest differs.');
 }
 fail(pack.redactionManifestDigest === (manifestInput?.digest ?? null), 'STALE_MANIFEST',
  'Provide the manifest identified by this pack.');
 const expected = createCustodyPack(ledger, {
  packId: pack.packId, createdOn: pack.createdOn, createdBy: pack.createdBy,
  itemIds: pack.items.map(item => item.itemId),
  includeAccess: pack.access !== null, includeEventHistory: pack.events !== null,
  manifest: manifestInput,
 });
 if (pack.schema === LEGACY_PACK_SCHEMA) {
  expected.schema = LEGACY_PACK_SCHEMA;
  for (const row of expected.items) delete row.tier;
 }
 fail(bodyHash(expected) === pack.digest, 'PACK_CONTENT',
  'Pack contents differ from the referenced ledger or redaction history.');
 return {valid:true,packId:pack.packId,ledgerId:ledger.ledgerId,
  itemsChecked:pack.items.length,ledgerDigest:ledger.digest,packDigest:pack.digest,
  digest:bodyHash({packId:pack.packId,ledgerId:ledger.ledgerId,
   itemsChecked:pack.items.length,ledgerDigest:ledger.digest,packDigest:pack.digest})};
}
export function auditNoIdentityExports(input){
 noIdentity(input);
 const serialized=JSON.stringify(input);
 const patterns=[/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/u];
 fail(patterns.every(pattern=>!pattern.test(serialized)),'PRIVATE','Potential contact detail in export.');
 return {valid:true,digest:bodyHash({exportDigest:bodyHash(input),valid:true})};
}
