import test from 'node:test';
import assert from 'node:assert/strict';
import {roster,conflicts,tasks,DAY,NEXT,LATER,HASH} from './p15ab-fixtures.mjs';
import {buildAssignmentPlan} from './p15ab-assign.mjs';
import {createBlindPackets,validateBlindPacket,submitBlindResponse,validateBlindResponse,reconcileBlindResponses} from './p15ab-blind-review.mjs';
import {ReviewAssignmentError,sha256} from './p15ab-contract.mjs';
const policy={balanceWeight:30,specialtyWeight:5,maxAssignmentsPerGroup:10,allowPartial:true};
const plan=()=>buildAssignmentPlan({planId:'plan-one',roster:roster(),conflicts:conflicts(),
 taskSet:tasks({count:1}),asOf:DAY,seed:'seed-one',policy});
const packets=()=>createBlindPackets(plan(),{roster:roster(),conflicts:conflicts(),taskSet:tasks({count:1}),
 issuedOn:DAY,expiresOn:LATER});
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ReviewAssignmentError&&error.code===code);
function response(packet,patch={}){return submitBlindResponse(packet,{responseId:`response-${packet.blindReviewerId}`,
 decision:'supported',observedAccess:'YES',rationale:'The cited observation supports this value.',
 sourceIds:['source-one'],reviewedOn:NEXT,evidenceDigest:HASH,...patch});}

test('blind packet set covers every assigned reviewer slot',()=>{
 const result=packets();assert.equal(result.length,2);
 assert.ok(result.every(row=>row.schema==='access-maps-blind-review-packet/1'));
});
test('blind reviewer identifiers are stable for a given plan and task',()=>{
 assert.deepEqual(packets().map(row=>row.blindReviewerId),packets().map(row=>row.blindReviewerId));
});
test('blind reviewer identifiers do not reveal internal reviewer IDs',()=>{
 const ids=packets().map(row=>row.blindReviewerId);
 for(const id of ids)for(const forbidden of ['reviewer-a','reviewer-b','reviewer-c','reviewer-d'])assert.ok(!id.includes(forbidden));
});
test('blind packet excludes record IDs and conflict group metadata',()=>{
 const packet=packets()[0],serialized=JSON.stringify(packet);
 for(const forbidden of ['record-1','source-group-1','operatorGroupId','geographicCellId'])assert.ok(!serialized.includes(forbidden));
});
test('blind packet validates digest and public identity',()=>{
 const packet=packets()[0];assert.equal(validateBlindPacket(packet).digest,packet.digest);
});
test('blind packet rejects a tampered task brief',()=>{
 const packet=packets()[0],copy=structuredClone(packet);copy.brief.en='Changed';
 fails(()=>validateBlindPacket(copy),'HASH');
});
test('blind packet rejects internal reviewer metadata fields',()=>{
 const packet=packets()[0],copy={...packet,reviewerId:'reviewer-a'};
 copy.digest=sha256((({digest,...rest})=>rest)(copy));
 fails(()=>validateBlindPacket(copy),'SHAPE');
});
test('blind packet rejects an unsafe public alias',()=>{
 const packet=packets()[0],copy={...packet,blindReviewerId:'reviewer-a'};
 copy.digest=sha256((({digest,...rest})=>rest)(copy));
 fails(()=>validateBlindPacket(copy),'PRIVATE');
});
test('blind packet rejects expiry before issue date',()=>{
 const packet=packets()[0],copy={...packet,expiresOn:'2026-11-20'};
 copy.digest=sha256((({digest,...rest})=>rest)(copy));
 fails(()=>validateBlindPacket(copy),'DATE_ORDER');
});
test('blind response binds the exact evidence digest',()=>{
 const packet=packets()[0],result=response(packet);
 assert.equal(validateBlindResponse(result,packet).digest,result.digest);
});
test('blind response rejects supported UNKNOWN',()=>{
 const packet=packets()[0];fails(()=>response(packet,{observedAccess:'UNKNOWN'}),'UNKNOWN');
});
test('blind response rejects a missing decision',()=>{
 const packet=packets()[0];fails(()=>response(packet,{decision:'maybe'}),'DECISION');
});
test('blind response rejects personal information in rationale',()=>{
 const packet=packets()[0];fails(()=>response(packet,{rationale:'Contact reviewer@example.invalid'}),'PRIVATE');
});
test('blind response rejects duplicate source IDs',()=>{
 const packet=packets()[0];fails(()=>response(packet,{sourceIds:['source-one','source-one']}),'DUPLICATE');
});
test('blind response rejects a review date before packet issue',()=>{
 const packet=packets()[0];fails(()=>response(packet,{reviewedOn:'2026-11-20'}),'PACKET_WINDOW');
});
test('blind response rejects a review date after packet expiry',()=>{
 const packet=packets()[0];fails(()=>response(packet,{reviewedOn:'2026-11-25'}),'PACKET_WINDOW');
});
test('blind response rejects changed evidence digest',()=>{
 const packet=packets()[0];fails(()=>response(packet,{evidenceDigest:'b'.repeat(64)}),'STALE_EVIDENCE');
});
test('blind response digest detects tampering',()=>{
 const packet=packets()[0],row=response(packet),copy=structuredClone(row);copy.rationale='Changed rationale';
 fails(()=>validateBlindResponse(copy,packet),'HASH');
});
test('response reconciliation creates consensus for matching decisions',()=>{
 const [one,two]=packets(),result=reconcileBlindResponses([one,two],[response(one),response(two)]);
 assert.equal(result.outcomes[0].consensus,'YES');assert.equal(result.outcomes[0].needsAdjudication,false);
});
test('response reconciliation keeps contradictory values UNKNOWN',()=>{
 const [one,two]=packets(),result=reconcileBlindResponses([one,two],[
  response(one),response(two,{decision:'contradicted',observedAccess:'NO'})]);
 assert.equal(result.outcomes[0].consensus,'UNKNOWN');assert.equal(result.outcomes[0].conflict,true);
});
test('response reconciliation requires independent response quorum',()=>{
 const [one,two]=packets(),result=reconcileBlindResponses([one,two],[response(one)],{minimumAgreement:2});
 assert.equal(result.outcomes[0].quorum,false);assert.equal(result.outcomes[0].needsAdjudication,true);
});
test('response reconciliation keeps all UNKNOWN decisions unresolved',()=>{
 const [one,two]=packets(),result=reconcileBlindResponses([one,two],[
  response(one,{decision:'insufficient',observedAccess:'UNKNOWN'}),
  response(two,{decision:'insufficient',observedAccess:'UNKNOWN'})]);
 assert.equal(result.outcomes[0].consensus,'UNKNOWN');assert.equal(result.outcomes[0].needsAdjudication,true);
});
test('response reconciliation ignores abstentions when counting quorum',()=>{
 const [one,two]=packets(),result=reconcileBlindResponses([one,two],[
  response(one),response(two,{decision:'abstain',observedAccess:'UNKNOWN'})],{minimumAgreement:2});
 assert.equal(result.outcomes[0].quorum,false);
});
test('response reconciliation rejects a response for an unknown packet',()=>{
 const [one]=packets(),row=response(one);row.packetId='packet-missing';
 fails(()=>reconcileBlindResponses([one],[row]),'PACKET_REF');
});
test('response reconciliation rejects duplicate packet responses',()=>{
 const [one]=packets(),row=response(one),duplicate={...row,responseId:'response-two'};
 duplicate.digest=sha256((({digest,...rest})=>rest)(duplicate));
 fails(()=>reconcileBlindResponses([one],[row,duplicate]),'DUPLICATE');
});
test('response reconciliation binds output digest',()=>{
 const [one,two]=packets(),result=reconcileBlindResponses([one,two],[response(one),response(two)]);
 assert.equal(result.digest,sha256((({digest,...rest})=>rest)(result)));
});

test('blind packet builder blocks a review brief containing the internal record ID',()=>{
 const taskSet=tasks({count:1,patch:{0:{reviewBrief:{en:'Review record-1 evidence',fr:'Examinez les observations fournies.'}}}});
 const options={roster:roster(),conflicts:conflicts(),taskSet};
 const value=buildAssignmentPlan({planId:'plan-private',...options,asOf:DAY,seed:'private-seed',policy});
 fails(()=>createBlindPackets(value,{...options,issuedOn:DAY,expiresOn:LATER}),'BLIND_LEAK');
});
test('blind packet builder blocks a brief containing an operator conflict group',()=>{
 const taskSet=tasks({count:1,patch:{0:{reviewBrief:{en:'Review operator-group-1',fr:'Examinez les observations fournies.'},
  operatorGroupId:'operator-group-1'}}});
 const options={roster:roster(),conflicts:conflicts(),taskSet};
 const value=buildAssignmentPlan({planId:'plan-private',...options,asOf:DAY,seed:'private-seed',policy});
 fails(()=>createBlindPackets(value,{...options,issuedOn:DAY,expiresOn:LATER}),'BLIND_LEAK');
});
