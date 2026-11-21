import test from 'node:test';
import assert from 'node:assert/strict';
import {roster,conflicts,tasks,DAY,NEXT,LATER,HASH} from './p15ab-fixtures.mjs';
import {buildAssignmentPlan} from './p15ab-assign.mjs';
import {createBlindPackets,submitBlindResponse} from './p15ab-blind-review.mjs';
import {createAssignmentLedger,validateAssignmentLedger,issuePacket,receiveResponse,recuseBlindReviewer,
 openAdjudication,closeAdjudication,reopenAssignment,checkpointAssignmentLedger} from './p15ab-ledger.mjs';
import {ReviewAssignmentError,sha256} from './p15ab-contract.mjs';
const policy={balanceWeight:30,specialtyWeight:5,maxAssignmentsPerGroup:10,allowPartial:true};
const plan=()=>buildAssignmentPlan({planId:'plan-one',roster:roster(),conflicts:conflicts(),
 taskSet:tasks({count:1}),asOf:DAY,seed:'seed-one',policy});
const packets=()=>createBlindPackets(plan(),{roster:roster(),conflicts:conflicts(),taskSet:tasks({count:1}),
 issuedOn:DAY,expiresOn:LATER});
const ledger=()=>createAssignmentLedger({ledgerId:'ledger-one',plan:plan(),createdOn:DAY,createdBy:'coordinator'});
const response=packet=>submitBlindResponse(packet,{responseId:`response-${packet.blindReviewerId}`,
 decision:'supported',observedAccess:'YES',rationale:'Evidence supports the stated value.',
 sourceIds:['source-one'],reviewedOn:NEXT,evidenceDigest:HASH});
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ReviewAssignmentError&&error.code===code);

test('assignment ledger opens with a plan-bound genesis event',()=>{
 const row=ledger();assert.equal(row.events[0].type,'plan-opened');
 assert.equal(validateAssignmentLedger(row).digest,row.digest);
});
test('assignment ledger refuses packet issue from another plan',()=>{
 const [packet]=packets(),row=ledger(),changed={...packet,planId:'plan-two'};
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>issuePacket(row,changed,{at:DAY,actor:'coordinator'}),'PLAN_MISMATCH');
});
test('assignment ledger records an issued blind packet',()=>{
 const [packet]=packets(),row=issuePacket(ledger(),packet,{at:DAY,actor:'coordinator'});
 assert.equal(row.events.at(-1).type,'packet-issued');
});
test('assignment ledger requires packet issue before response receipt',()=>{
 const [packet]=packets();fails(()=>receiveResponse(ledger(),response(packet),packet,{at:NEXT,actor:'coordinator'}),'PACKET_REF');
});
test('assignment ledger receives response after packet issue',()=>{
 const [packet]=packets();let row=issuePacket(ledger(),packet,{at:DAY,actor:'coordinator'});
 row=receiveResponse(row,response(packet),packet,{at:NEXT,actor:'coordinator'});
 assert.equal(row.events.at(-1).type,'response-received');
});
test('assignment ledger prevents duplicate response receipt',()=>{
 const [packet]=packets();let row=issuePacket(ledger(),packet,{at:DAY,actor:'coordinator'});
 row=receiveResponse(row,response(packet),packet,{at:NEXT,actor:'coordinator'});
 fails(()=>receiveResponse(row,response(packet),packet,{at:NEXT,actor:'coordinator'}),'DUPLICATE');
});
test('assignment ledger rejects a response with changed packet digest',()=>{
 const [packet]=packets();let row=issuePacket(ledger(),packet,{at:DAY,actor:'coordinator'});
 const changed=response(packet);changed.evidenceDigest='b'.repeat(64);
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>receiveResponse(row,changed,packet,{at:NEXT,actor:'coordinator'}),'STALE_EVIDENCE');
});
test('assignment ledger records reviewer recusal',()=>{
 const row=recuseBlindReviewer(ledger(),{blindReviewerId:'blind-12345678901234567890',
  at:NEXT,actor:'coordinator',reason:'Reviewer declared a conflict'});
 assert.equal(row.events.at(-1).type,'reviewer-recused');
});
test('assignment ledger prevents duplicate recusal records',()=>{
 const input={blindReviewerId:'blind-12345678901234567890',at:NEXT,actor:'coordinator',reason:'Conflict'};
 const row=recuseBlindReviewer(ledger(),input);fails(()=>recuseBlindReviewer(row,input),'DUPLICATE');
});
test('assignment ledger opens adjudication only for received responses',()=>{
 const [one,two]=packets();let row=ledger();
 for(const packet of [one,two])row=issuePacket(row,packet,{at:DAY,actor:'coordinator'});
 for(const packet of [one,two])row=receiveResponse(row,response(packet),packet,{at:NEXT,actor:'coordinator'});
 row=openAdjudication(row,{taskId:'task-1',adjudicationId:'adjudication-one',
  responseIds:[`response-${one.blindReviewerId}`,`response-${two.blindReviewerId}`],
  at:NEXT,actor:'coordinator',reason:'Responses disagree'});
 assert.equal(row.events.at(-1).type,'adjudication-opened');
});
test('assignment ledger refuses adjudication referencing unreceived responses',()=>{
 fails(()=>openAdjudication(ledger(),{taskId:'task-1',adjudicationId:'adjudication-one',
  responseIds:['response-one','response-two'],at:NEXT,actor:'coordinator',reason:'Review'}),'RESPONSE_REF');
});
test('assignment ledger closes an opened adjudication with evidence digest',()=>{
 const [one,two]=packets();let row=ledger();
 for(const packet of [one,two])row=issuePacket(row,packet,{at:DAY,actor:'coordinator'});
 for(const packet of [one,two])row=receiveResponse(row,response(packet),packet,{at:NEXT,actor:'coordinator'});
 row=openAdjudication(row,{taskId:'task-1',adjudicationId:'adjudication-one',
  responseIds:[`response-${one.blindReviewerId}`,`response-${two.blindReviewerId}`],
  at:NEXT,actor:'coordinator',reason:'Review disagreement'});
 row=closeAdjudication(row,{adjudicationId:'adjudication-one',decision:'UNKNOWN',
  reason:'Evidence remains inconclusive',evidenceDigest:HASH,at:LATER,actor:'adjudicator'});
 assert.equal(row.events.at(-1).type,'adjudication-closed');
});
test('assignment ledger refuses closing an unopened adjudication',()=>{
 fails(()=>closeAdjudication(ledger(),{adjudicationId:'adjudication-missing',decision:'YES',
  reason:'Reason',evidenceDigest:HASH,at:NEXT,actor:'adjudicator'}),'ADJUDICATION_REF');
});
test('assignment ledger refuses duplicate adjudication closure',()=>{
 const [one,two]=packets();let row=ledger();
 for(const packet of [one,two])row=issuePacket(row,packet,{at:DAY,actor:'coordinator'});
 for(const packet of [one,two])row=receiveResponse(row,response(packet),packet,{at:NEXT,actor:'coordinator'});
 row=openAdjudication(row,{taskId:'task-1',adjudicationId:'adjudication-one',
  responseIds:[`response-${one.blindReviewerId}`,`response-${two.blindReviewerId}`],
  at:NEXT,actor:'coordinator',reason:'Review disagreement'});
 const input={adjudicationId:'adjudication-one',decision:'UNKNOWN',reason:'No conclusion',
  evidenceDigest:HASH,at:LATER,actor:'adjudicator'};
 row=closeAdjudication(row,input);fails(()=>closeAdjudication(row,input),'ADJUDICATION_CLOSED');
});
test('assignment ledger can reopen a task after new evidence',()=>{
 const row=reopenAssignment(ledger(),{taskId:'task-1',at:NEXT,actor:'coordinator',
  reason:'Evidence revision requires another review'});
 assert.equal(row.events.at(-1).type,'assignment-reopened');
});
test('assignment ledger checkpoint binds the current event head',()=>{
 const row=checkpointAssignmentLedger(ledger(),{checkpointId:'checkpoint-one',at:NEXT,actor:'coordinator'});
 assert.equal(row.checkpoints[0].headHash,row.events.at(-2).hash);
 assert.equal(row.events.at(-1).type,'checkpoint');
});
test('assignment ledger prevents checkpoint identifier reuse',()=>{
 const input={checkpointId:'checkpoint-one',at:NEXT,actor:'coordinator'};
 const row=checkpointAssignmentLedger(ledger(),input);
 fails(()=>checkpointAssignmentLedger(row,input),'DUPLICATE');
});
test('assignment ledger detects event payload tampering',()=>{
 const row=ledger(),copy=structuredClone(row);copy.events[0].actor='intruder';
 fails(()=>validateAssignmentLedger(copy),'EVENT_HASH');
});
test('assignment ledger detects a broken hash link',()=>{
 const row=ledger(),copy=structuredClone(row);copy.events[0].previousHash='f'.repeat(64);
 fails(()=>validateAssignmentLedger(copy),'EVENT_HASH');
});
test('assignment ledger detects root digest tampering',()=>{
 const row=ledger(),copy=structuredClone(row);copy.createdBy='another-coordinator';
 fails(()=>validateAssignmentLedger(copy),'LEDGER_DIGEST');
});

test('assignment ledger refuses response from a recused blind reviewer',()=>{
 const [packet]=packets();let row=issuePacket(ledger(),packet,{at:DAY,actor:'coordinator'});
 row=recuseBlindReviewer(row,{blindReviewerId:packet.blindReviewerId,at:NEXT,
  actor:'coordinator',reason:'Conflict declared after packet issue'});
 fails(()=>receiveResponse(row,response(packet),packet,{at:LATER,actor:'coordinator'}),'RECUSAL');
});
test('assignment ledger rejects an event dated before its previous event',()=>{
 const row=ledger(),copy=structuredClone(row);
 copy.events[0].at='2026-11-20';
 fails(()=>validateAssignmentLedger(copy),'EVENT_ORDER');
});
test('assignment ledger checkpoint event points to its preceding hash',()=>{
 const row=checkpointAssignmentLedger(ledger(),{checkpointId:'checkpoint-two',at:NEXT,actor:'coordinator'});
 assert.equal(row.events.at(-1).payload.headHash,row.events.at(-1).previousHash);
});
