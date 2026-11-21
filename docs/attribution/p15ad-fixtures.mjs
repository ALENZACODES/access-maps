import {createReferenceSet,createResponseSet} from './p15ad-reference.mjs';
import {sha} from './p15ad-contract.mjs';
export const DAY='2026-11-21';
export const NEXT='2026-11-22';
export const LATER='2026-11-23';
export const POLICY={
 minimumScored:3,
 minimumCoverage:0.6,
 minimumAccuracy:0.75,
 minimumUnknownRecall:0.7,
 maximumAbstention:0.25,
 watchAccuracyDrop:0.1,
};
export function reference({count=12,patch={}}={}){
 const states=['YES','NO','UNKNOWN'];
 return createReferenceSet({
  referenceSetId:'reference-one',
  version:1,
  createdOn:DAY,
  items:Array.from({length:count},(_,index)=>{
   const referenceState=states[index%3];
   const item={
    itemId:`item-${String(index+1).padStart(3,'0')}`,
    recordDigest:sha(`record-${index+1}`),
    evidenceDigest:sha(`evidence-${index+1}`),
    field:'entrance',
    feature:index%2?'washroom':'entrance',
    tier:2,
    referenceState,
    adjudication:referenceState,
    adjudicatedOn:DAY,
    adjudicatorToken:'blind-adjudicator-01',
    rationale:'Reference decision was recorded from the supplied evidence.',
    sourceDigests:[sha(`source-${index+1}`)],
   };
   return {...item,...(patch[index]??{})};
  }),
 });
}
export function responseSet({referenceSet=reference(),reviewers=['blind-alpha','blind-bravo'],
 accuracy=1,abstainEvery=0,unknownHandling='correct',reviewedOn=NEXT,patch={}}={}){
 const responses=[];
 let serial=0;
 for(const reviewerToken of reviewers){
  let knownIndex=0;
  for(const item of referenceSet.items){
   serial++;
   if(item.referenceState!=='UNKNOWN')knownIndex++;
   let observedState=item.referenceState;
   let decision=observedState==='UNKNOWN'?'insufficient':'supported';
   if(item.referenceState!=='UNKNOWN'&&accuracy<1&&serial%Math.max(2,Math.round(1/(1-accuracy)))===0){
    observedState=item.referenceState==='YES'?'NO':'YES';
    decision='contradicted';
   }
   if(item.referenceState==='UNKNOWN'&&unknownHandling==='overclaim'){
    observedState='YES';decision='supported';
   }
   if(abstainEvery&&item.referenceState!=='UNKNOWN'&&knownIndex%abstainEvery===0){
    observedState='UNKNOWN';decision='abstain';
   }
   const row={
    responseId:`response-${String(serial).padStart(5,'0')}`,
    itemId:item.itemId,
    reviewerToken,
    decision,
    observedState,
    reviewedOn,
    evidenceDigest:item.evidenceDigest,
    sourceDigests:item.sourceDigests,
    rationale:'Review response records the observed state and evidence digest.',
   };
   responses.push({...row,...(patch[serial]??{})});
  }
 }
 return createResponseSet({responseSetId:'responses-one',createdOn:reviewedOn,responses});
}
export function responseFor(referenceSet,{reviewerToken='blind-alpha',itemIndex=0,
 observedState,decision,rationale='Evidence reviewed against the supplied reference.',reviewedOn=NEXT}={}){
 const item=referenceSet.items[itemIndex];
 const state=observedState??item.referenceState;
 const kind=decision??(state==='UNKNOWN'?'insufficient':state===item.referenceState?'supported':'contradicted');
 return {
  responseId:`response-${reviewerToken}-${item.itemId}`,
  itemId:item.itemId,reviewerToken,decision:kind,observedState:state,
  reviewedOn,evidenceDigest:item.evidenceDigest,sourceDigests:item.sourceDigests,rationale,
 };
}
export function calibrationInputs(options={}){
 const referenceSet=reference(options.referenceOptions);
 const responses=responseSet({referenceSet,...options.responseOptions});
 return {reference:referenceSet,responseSet:responses,policy:options.policy??POLICY};
}
