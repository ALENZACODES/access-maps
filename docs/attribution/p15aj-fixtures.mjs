import {sha} from './p15-custody-contract.mjs';
import {createCustodyLedger,registerEvidence} from './p15-custody-ledger.mjs';
import {createRetentionPolicySet,createRetentionReviewLedger,recordRetentionReview,
 buildRetentionReviewPlan} from './p15aj-retention.mjs';
import {createHoldLedger,placeHold} from './p15aj-holds.mjs';
import {createDispositionRegister} from './p15aj-disposition.mjs';

export const DAY='2026-11-21',NEXT='2026-11-22',LATER='2026-11-23',
 FOURTH='2026-11-24',FIFTH='2026-11-25',SIXTH='2026-11-26';
export const AT='2026-11-21T10:00:00.000Z',NEXT_AT='2026-11-22T10:00:00.000Z',
 LATER_AT='2026-11-23T10:00:00.000Z',FOURTH_AT='2026-11-24T10:00:00.000Z',
 FIFTH_AT='2026-11-25T10:00:00.000Z',SIXTH_AT='2026-11-26T10:00:00.000Z';
export function evidence(itemId='evidence-one',patch={}){
 return {itemId,kind:'source-capture',label:`Fictional evidence ${itemId}`,
  reference:`catalogue/${itemId}`,contentDigest:sha(`content-${itemId}`),sourceId:'source-one',
  sourceDigest:sha('source-one'),licence:'UNKNOWN',licenceReference:'',
  retrievedOn:DAY,capturedOn:DAY,custodianToken:'actor-custodian',state:'held',
  supersedes:null,notes:'Fictional reference for retention governance tests.',...patch};
}
export function custody(){
 const empty=createCustodyLedger({ledgerId:'ledger-retention',openedOn:DAY,openedAt:AT,
  openedBy:'actor-coordinator'});
 return registerEvidence(empty,evidence(),{at:AT,actorToken:'actor-coordinator'});
}
export function policies(patch={}){
 return createRetentionPolicySet({setId:'policy-set-one',createdOn:DAY,createdBy:'actor-policy-owner',
  policies:[{policyId:'policy-source-capture',evidenceKind:'source-capture',
   retentionDays:1,reviewIntervalDays:1,anchorField:'capturedOn',effectiveOn:DAY,
   ownerToken:'actor-policy-owner',notes:'Fictional test retention schedule.',...patch}]});
}
export function plan({ledger=custody(),policySet=policies(),asOf=FOURTH}={}){
 return buildRetentionReviewPlan(ledger,policySet,{planId:'plan-one',asOf});
}
export function reviewLedger(){
 return createRetentionReviewLedger({reviewLedgerId:'review-ledger-one',createdOn:DAY,
  createdAt:AT,createdBy:'actor-review-coordinator'});
}
export function retentionReview({ledger=custody(),decision='propose-disposition',
 reviewId='review-one',reviewedOn=FOURTH}={}){
 const row={reviewId,itemId:'evidence-one',policyId:'policy-source-capture',reviewedOn,
  reviewerToken:'actor-retention-reviewer',decision,nextReviewOn:FIFTH,
  reason:'Human review of the recorded retention period.',evidenceDigest:sha(ledger.items[0])};
 return row;
}
export function reviewedLedger({ledger=custody(),policySet=policies(),decision='propose-disposition'}={}){
 const input=reviewLedger();
 return recordRetentionReview(input,ledger,policySet,retentionReview({ledger,policySet,decision}),
  {at:FOURTH_AT,actorToken:'actor-retention-reviewer'});
}
export function holds(){
 return createHoldLedger({holdLedgerId:'hold-ledger-one',createdOn:DAY,
  createdAt:AT,createdBy:'actor-hold-coordinator'});
}
export function heldLedger({ledger=custody()}={}){
 return placeHold(holds(),ledger,{holdId:'hold-one',itemIds:['evidence-one'],
  scope:'Preserve source capture during internal review.',reason:'A review request is pending.',
  placedOn:NEXT,placedBy:'actor-hold-placer',reviewOn:FOURTH,at:NEXT_AT});
}
export function dispositionRegister(){
 return createDispositionRegister({registerId:'disposition-register-one',createdOn:DAY,
  createdAt:AT,createdBy:'actor-disposition-coordinator'});
}
