import {sha} from './p15ai-contract.mjs';
import {createCustodyLedger,registerEvidence,recordAccess,recordRedaction} from './p15ai-ledger.mjs';
export const DAY='2026-11-21',NEXT='2026-11-22',LATER='2026-11-23';
export const AT='2026-11-21T10:00:00.000Z',NEXT_AT='2026-11-22T10:00:00.000Z',
 LATER_AT='2026-11-23T10:00:00.000Z';
export function item(itemId='evidence-one',patch={}){
 return {itemId,kind:'source-capture',label:`Fictional evidence ${itemId}`,
  reference:`catalogue/${itemId}`,contentDigest:sha(`content-${itemId}`),
  sourceId:'source-one',sourceDigest:sha('source-one'),licence:'CC-BY-4.0',
  licenceReference:'licence-record-1',retrievedOn:DAY,capturedOn:DAY,
  custodianToken:'actor-custodian',state:'held',supersedes:null,
  notes:'Fictional reference only; no source bytes are stored.',...patch};
}
export function ledger(){
 return createCustodyLedger({ledgerId:'ledger-one',openedOn:DAY,openedAt:AT,openedBy:'actor-coordinator'});
}
export function withItem(input=ledger(),row=item(),patch={}){
 return registerEvidence(input,{...row,...patch},{at:AT,actorToken:'actor-coordinator'});
}
export function access(itemId='evidence-one',patch={}){
 return {accessId:`access-${itemId}`,itemId,purpose:'review',actorToken:'actor-reviewer',
  accessedAt:NEXT_AT,reason:'Review of evidence metadata.',result:'allowed',exportDigest:null,...patch};
}
export function withAccess(input=withItem()){
 return recordAccess(input,access());
}
export function redaction(itemId='evidence-one',patch={}){
 return {redactionId:`redaction-${itemId}`,itemId,fieldPath:'notes',
  reason:'Remove unnecessary free text from an export.',
  appliedOn:NEXT,appliedBy:'actor-redactor',replacement:'[redacted]',
  originalDigest:sha(`original-${itemId}`),...patch};
}
export function withRedaction(input=withItem()){
 return recordRedaction(input,redaction(),{at:NEXT_AT,actorToken:'actor-redactor'});
}
