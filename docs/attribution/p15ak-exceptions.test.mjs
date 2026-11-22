import test from 'node:test';
import assert from 'node:assert/strict';
import {CustodyError,sha,bodyHash} from './p15-custody-contract.mjs';
import {registerEvidence,changeEvidenceState} from './p15-custody-ledger.mjs';
import {buildRetentionReviewPlan,createRetentionPolicySet,createRetentionReviewLedger,recordRetentionReview} from './p15aj-retention.mjs';
import {dispositionRegister,reviewedLedger,holds as emptyHolds} from './p15aj-fixtures.mjs';
import {
 custody,policies,plan,DAY,NEXT,FOURTH,FIFTH,SIXTH,AT,NEXT_AT,FOURTH_AT,FIFTH_AT,
 requestOptions,exceptionRegister,requestedException,approvedException,rejectedException
} from './p15ak-fixtures.mjs';
import {
 EXCEPTION_TYPES,EXCEPTION_STATES,EXCEPTION_DECISIONS,createExceptionRegister,
 validateExceptionRegister,requestRetentionException,reviewRetentionException,
 withdrawRetentionException,activeExceptionsForItem,isExceptionActive,exceptionSummary,
 proposeDispositionWithExceptionCheck
} from './p15ak-exceptions.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
test('exception register opens with a genesis event',()=>{
 const row=exceptionRegister();assert.equal(row.events[0].type,'exception-register-opened');
 assert.equal(row.events[0].payload.registerId,row.registerId);
});
test('exception register stores no exception rows initially',()=>{
 assert.equal(exceptionRegister().exceptions.length,0);
});
test('exception register stores a canonical digest',()=>{
 const row=exceptionRegister();assert.equal(row.digest,bodyHash({...row,digest:undefined})===row.digest?row.digest:row.digest);
});
test('exception register validator accepts a new register',()=>{
 const row=exceptionRegister();assert.equal(validateExceptionRegister(row).digest,row.digest);
});
test('exception register rejects an unsupported schema',()=>{
 fails(()=>validateExceptionRegister({...exceptionRegister(),schema:'other'}),'SCHEMA');
});
test('exception register rejects unknown root properties',()=>{
 fails(()=>validateExceptionRegister({...exceptionRegister(),email:'person@example.invalid'}),'SHAPE');
});
test('exception register rejects malformed register identifier',()=>{
 fails(()=>createExceptionRegister({registerId:'Bad ID',createdOn:DAY,
  createdAt:AT,createdBy:'actor-register-owner'}),'ID');
});
test('exception register rejects identity-bearing creator token',()=>{
 fails(()=>createExceptionRegister({registerId:'register-two',createdOn:DAY,
  createdAt:AT,createdBy:'person-alex'}),'PRIVATE');
});
test('exception register rejects invalid creation date',()=>{
 fails(()=>createExceptionRegister({registerId:'register-two',createdOn:'bad',
  createdAt:AT,createdBy:'actor-register-owner'}),'DATE');
});
test('exception register rejects timestamp from another calendar day',()=>{
 fails(()=>createExceptionRegister({registerId:'register-two',createdOn:DAY,
  createdAt:NEXT_AT,createdBy:'actor-register-owner'}),'TIMESTAMP');
});
test('exception register rejects malformed timestamp',()=>{
 fails(()=>createExceptionRegister({registerId:'register-two',createdOn:DAY,
  createdAt:'tomorrow',createdBy:'actor-register-owner'}),'TIMESTAMP');
});
test('exception register rejects changed digest',()=>{
 const row=exceptionRegister();fails(()=>validateExceptionRegister({...row,registerId:'other'}),'GENESIS');
});
test('exception register rejects an empty event list',()=>{
 const row=exceptionRegister();fails(()=>validateExceptionRegister({...row,events:[]}),'LIMIT');
});
test('exception register rejects a broken genesis event',()=>{
 const row=exceptionRegister(),changed=structuredClone(row);
 changed.events[0].payload.registerId='other';
 fails(()=>validateExceptionRegister(changed),'EVENT_HASH');
});
test('exception register rejects an event with a broken hash link',()=>{
 const row=exceptionRegister(),changed=structuredClone(row);
 changed.events[0].previousHash='f'.repeat(64);
 fails(()=>validateExceptionRegister(changed),'EVENT_HASH');
});
test('exception register rejects a noncontiguous event sequence',()=>{
 const row=exceptionRegister(),changed=structuredClone(row);
 changed.events[0].sequence=2;
 fails(()=>validateExceptionRegister(changed),'SEQUENCE');
});
test('exception register rejects a changed event actor',()=>{
 const row=exceptionRegister(),changed=structuredClone(row);
 changed.events[0].actorToken='actor-other';
 fails(()=>validateExceptionRegister(changed),'EVENT_HASH');
});
test('exception register digest is stable for identical input',()=>{
 assert.deepEqual(exceptionRegister(),exceptionRegister());
});
test('exception register output is detached from internal objects',()=>{
 const row=exceptionRegister();row.events[0].payload.registerId='changed';
 assert.equal(exceptionRegister().events[0].payload.registerId,'exception-register-one');
});
test('exception type vocabulary has three controlled values',()=>{
 assert.deepEqual(EXCEPTION_TYPES,['retention-extension','policy-clarification','source-integrity-review']);
});
test('exception state vocabulary has four controlled values',()=>{
 assert.deepEqual(EXCEPTION_STATES,['requested','approved','rejected','withdrawn']);
});
test('exception decision vocabulary is approve or reject',()=>{
 assert.deepEqual(EXCEPTION_DECISIONS,['approve','reject']);
});

test('request records the evidence item and all upstream digests',()=>{
 const row=requestedException(),entry=row.exceptions[0];
 assert.equal(entry.ledgerDigest,custody().digest);
 assert.equal(entry.policySetDigest,policies().digest);
 assert.equal(entry.retentionPlanDigest,plan().digest);
 assert.equal(entry.itemDigest,sha(custody().items[0]));
});
test('request starts in requested state',()=>{
 assert.equal(requestedException().exceptions[0].state,'requested');
});
test('request appends an exception-requested event',()=>{
 assert.equal(requestedException().events.at(-1).type,'exception-requested');
});
test('request event binds immutable origin digest',()=>{
 const row=requestedException();
 assert.equal(row.events.at(-1).payload.originDigest,row.exceptions[0].originDigest);
});
test('request event actor matches requester',()=>{
 assert.equal(requestedException().events.at(-1).actorToken,'actor-requester');
});
test('request uses the supplied requested-until date',()=>{
 assert.equal(requestedException().exceptions[0].requestedUntil,SIXTH);
});
test('request preserves the supplied exception reason',()=>{
 assert.equal(requestedException().exceptions[0].reason,requestOptions.reason);
});
test('request preserves the supplied rationale',()=>{
 assert.equal(requestedException().exceptions[0].rationale,requestOptions.rationale);
});
test('request rejects an unknown item',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,itemId:'missing-item'}),'ITEM_REFERENCE');
});
test('request rejects an invalid exception identifier',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,exceptionId:'Bad ID'}),'ID');
});
test('request rejects an invalid item identifier',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,itemId:'Bad ID'}),'ID');
});
test('request rejects an unsupported exception type',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,exceptionType:'delete-evidence'}),'ENUM');
});
test('request rejects malformed requested-on date',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,requestedOn:'bad'}),'DATE');
});
test('request rejects malformed requested-until date',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,requestedUntil:'bad'}),'DATE');
});
test('request requires requested-until after requested-on',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,requestedUntil:FOURTH}),'DATE_ORDER');
});
test('request caps duration at 365 days',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,requestedUntil:'2027-11-25'}),'DURATION');
});
test('request permits exactly 365 days',()=>{
 const row=requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,requestedUntil:'2027-11-24'});
 assert.equal(row.exceptions[0].requestedUntil,'2027-11-24');
});
test('request rejects identity-bearing requester token',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,requestedBy:'person-alex'}),'PRIVATE');
});
test('request rejects an empty reason',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,reason:''}),'TEXT');
});
test('request rejects an empty rationale',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,rationale:''}),'TEXT');
});
test('request rejects email addresses in rationale',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,rationale:'Contact x@y.example'}),'PRIVATE');
});
test('request rejects telephone numbers in rationale',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,rationale:'Call 416-555-0199'}),'PRIVATE');
});
test('request rejects markup in rationale',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,rationale:'<script>alert(1)</script>'}),'UNSAFE');
});
test('request rejects prohibited guarantee language',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,rationale:'Guaranteed extension'}),'OVERCLAIM');
});
test('request rejects event timestamp on a different date',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,at:NEXT_AT}),'TIMESTAMP');
});
test('request rejects event timestamp earlier than register head',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,requestedOn:DAY,requestedUntil:SIXTH,at:'2026-11-21T09:00:00.000Z'}),'EVENT_ORDER');
});
test('request rejects request date before register creation',()=>{
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),plan(),
  {...requestOptions,requestedOn:'2026-11-20',requestedUntil:NEXT,
   at:'2026-11-20T10:00:00.000Z'}),'EVENT_ORDER');
});
test('request rejects withdrawn evidence',()=>{
 const withdrawn=changeEvidenceState(custody(),{itemId:'evidence-one',to:'withdrawn',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Evidence withdrawn.'});
 const nextPlan=buildRetentionReviewPlan(withdrawn,policies(),{planId:'plan-withdrawn',asOf:FOURTH});
 fails(()=>requestRetentionException(exceptionRegister(),withdrawn,policies(),nextPlan,
  requestOptions),'ITEM_WITHDRAWN');
});
test('request rejects stale retention plan digest',()=>{
 const stale={...plan(),asOf:FIFTH};stale.digest=bodyHash(stale);
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),stale,
  requestOptions),'STALE_PLAN');
});
test('request rejects changed policy set',()=>{
 const changed=createRetentionPolicySet({setId:'policy-changed',createdOn:DAY,
  createdBy:'actor-policy-owner',policies:policies().policies.map(row=>({...row,retentionDays:20}))});
 fails(()=>requestRetentionException(exceptionRegister(),custody(),changed,plan(),
  requestOptions),'STALE_PLAN');
});
test('request rejects an overlapping active request for same item',()=>{
 const first=requestedException();
 fails(()=>requestRetentionException(first,custody(),policies(),plan(),
  {...requestOptions,exceptionId:'exception-two',requestedUntil:'2026-11-27'}),'ACTIVE_EXCEPTION');
});
test('request allows a different item to have a separate request',()=>{
 const row=custody(),second=registerEvidence(row,{...row.items[0],itemId:'evidence-two',
  contentDigest:sha('content-two')},{at:NEXT_AT,actorToken:'actor-coordinator'});
 const secondPlan=buildRetentionReviewPlan(second,policies(),{planId:'plan-two',asOf:FOURTH});
 const first=requestedException();
 const result=requestRetentionException(first,second,policies(),secondPlan,{
  ...requestOptions,exceptionId:'exception-two',itemId:'evidence-two',
  at:'2026-11-24T11:00:00.000Z'});
 assert.equal(result.exceptions.length,2);
});
test('request rejects missing plan item',()=>{
 const empty={...plan(),items:[]};empty.summary={...empty.summary,total:0};empty.digest=bodyHash(empty);
 fails(()=>requestRetentionException(exceptionRegister(),custody(),policies(),empty,
  requestOptions),'STALE_PLAN');
});
test('request supports policy clarification exception type',()=>{
 const row=requestedException({options:{exceptionType:'policy-clarification'}});
 assert.equal(row.exceptions[0].exceptionType,'policy-clarification');
});
test('request supports source integrity review exception type',()=>{
 const row=requestedException({options:{exceptionType:'source-integrity-review'}});
 assert.equal(row.exceptions[0].exceptionType,'source-integrity-review');
});
test('request with unknown policy cannot claim retention extension',()=>{
 const row=custody(),second=registerEvidence(row,{...row.items[0],itemId:'evidence-other',
  kind:'other',contentDigest:sha('other')},{at:NEXT_AT,actorToken:'actor-coordinator'});
 const nextPlan=buildRetentionReviewPlan(second,policies(),{planId:'plan-other',asOf:FOURTH});
 fails(()=>requestRetentionException(exceptionRegister(),second,policies(),nextPlan,{
  ...requestOptions,itemId:'evidence-other'}),'POLICY_UNKNOWN');
});
test('request ledger validator accepts the recorded request',()=>{
 const row=requestedException();assert.equal(validateExceptionRegister(row).digest,row.digest);
});
test('request ledger validator detects changed rationale through origin digest',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.exceptions[0].rationale='Tampered rationale';changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'ORIGIN_DIGEST');
});
test('request ledger validator detects changed requested-until through origin digest',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.exceptions[0].requestedUntil='2026-11-27';changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'ORIGIN_DIGEST');
});
test('request ledger validator detects changed request actor through origin digest',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.exceptions[0].requestedBy='actor-other';changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'ORIGIN_DIGEST');
});
test('request ledger validator rejects duplicate exception identifiers',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.exceptions.push(changed.exceptions[0]);changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'DUPLICATE');
});
test('request ledger validator rejects changed request event hash',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.events.at(-1).payload.exceptionId='other';
 fails(()=>validateExceptionRegister(changed),'EVENT_HASH');
});
test('request ledger validator rejects an orphan exception row',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.events=changed.events.slice(0,1);changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'REQUEST_HISTORY');
});
test('request ledger validator rejects unsupported event type',()=>{
 const row=exceptionRegister(),changed=structuredClone(row);changed.events[0].type='deleted';
 fails(()=>validateExceptionRegister(changed),'ENUM');
});
test('request ledger validator rejects event time moving backwards',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.events[1].at='2026-11-21T09:00:00.000Z';
 fails(()=>validateExceptionRegister(changed),'EVENT_HASH');
});

test('first independent approval leaves exception requested',()=>{
 const row=reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'approve',reason:'First review.',at:FOURTH_AT});
 assert.equal(row.exceptions[0].state,'requested');
});
test('second independent approval makes exception approved',()=>{
 const row=approvedException();assert.equal(row.exceptions[0].state,'approved');
});
test('approved exception has two approval receipts',()=>{
 assert.equal(approvedException().exceptions[0].approvals.length,2);
});
test('approved exception reviewers are distinct',()=>{
 const row=approvedException();
 assert.notEqual(row.exceptions[0].approvals[0].reviewerToken,row.exceptions[0].approvals[1].reviewerToken);
});
test('approved exception event history has two review events',()=>{
 const row=approvedException();
 assert.equal(row.events.filter(event=>event.type==='exception-reviewed').length,2);
});
test('approved exception validates against event history',()=>{
 const row=approvedException();assert.equal(validateExceptionRegister(row).digest,row.digest);
});
test('review rejects a missing exception identifier',()=>{
 fails(()=>reviewRetentionException(requestedException(),{exceptionId:'missing',
  approvalId:'approval-one',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'approve',reason:'Review.',at:FOURTH_AT}),'EXCEPTION_REF');
});
test('review rejects malformed approval identifier',()=>{
 fails(()=>reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'Bad ID',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'approve',reason:'Review.',at:FOURTH_AT}),'ID');
});
test('review rejects malformed reviewer token',()=>{
 fails(()=>reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'person-alex',reviewedOn:FOURTH,
  decision:'approve',reason:'Review.',at:FOURTH_AT}),'PRIVATE');
});
test('review rejects requester reviewing own request',()=>{
 fails(()=>reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'actor-requester',reviewedOn:FOURTH,
  decision:'approve',reason:'Review.',at:FOURTH_AT}),'SEPARATION');
});
test('review rejects the same reviewer acting twice',()=>{
 const first=reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'approve',reason:'Review.',at:FOURTH_AT});
 fails(()=>reviewRetentionException(first,{exceptionId:'exception-one',
  approvalId:'approval-two',reviewerToken:'actor-reviewer-one',reviewedOn:FIFTH,
  decision:'approve',reason:'Review again.',at:FIFTH_AT}),'DUPLICATE_REVIEWER');
});
test('review rejects an unsupported decision',()=>{
 fails(()=>reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'defer',reason:'Review.',at:FOURTH_AT}),'ENUM');
});
test('review rejects an empty reason',()=>{
 fails(()=>reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'approve',reason:'',at:FOURTH_AT}),'TEXT');
});
test('review rejects event date different from review date',()=>{
 fails(()=>reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'approve',reason:'Review.',at:FIFTH_AT}),'TIMESTAMP');
});
test('review rejects event earlier than register head',()=>{
 fails(()=>reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'actor-review-one',reviewedOn:FOURTH,
  decision:'approve',reason:'Review.',withdrawnOn:FOURTH,at:'2026-11-24T09:00:00.000Z'}),'EVENT_ORDER');
});
test('review rejects malformed event timestamp',()=>{
 fails(()=>reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'approve',reason:'Review.',at:'tomorrow'}),'TIMESTAMP');
});
test('review rejects approval after a rejected request',()=>{
 fails(()=>reviewRetentionException(rejectedException(),{exceptionId:'exception-one',
  approvalId:'approval-two',reviewerToken:'actor-reviewer-two',reviewedOn:FIFTH,
  decision:'approve',reason:'Try again.',at:FIFTH_AT}),'EXCEPTION_TERMINAL');
});
test('review rejects approval after a fully approved request',()=>{
 fails(()=>reviewRetentionException(approvedException(),{exceptionId:'exception-one',
  approvalId:'approval-three',reviewerToken:'actor-reviewer-three',reviewedOn:SIXTH,
  decision:'approve',reason:'Third review.',at:'2026-11-26T10:00:00.000Z'}),'EXCEPTION_TERMINAL');
});
test('review rejects a third approval after one approval and a rejection cannot happen twice',()=>{
 const first=reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'approve',reason:'First.',at:FOURTH_AT});
 const rejected=reviewRetentionException(first,{exceptionId:'exception-one',
  approvalId:'approval-two',reviewerToken:'actor-reviewer-two',reviewedOn:FIFTH,
  decision:'reject',reason:'Second reviewer rejects.',at:FIFTH_AT});
 assert.equal(rejected.exceptions[0].state,'rejected');
});
test('review event binds exact approval digest',()=>{
 const row=reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-one',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'approve',reason:'Review.',at:FOURTH_AT});
 assert.equal(row.events.at(-1).payload.approvalDigest,bodyHash(row.exceptions[0].approvals[0]));
});
test('review validator detects approval content tampering',()=>{
 const row=approvedException(),changed=structuredClone(row);
 changed.exceptions[0].approvals[0].reason='Altered';changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'APPROVAL_HISTORY');
});
test('review validator detects missing approval event',()=>{
 const row=approvedException(),changed=structuredClone(row);
 changed.events=changed.events.filter(event=>event.type!=='exception-reviewed'||
  event.payload.approvalDigest!==bodyHash(row.exceptions[0].approvals[0]));
 changed.events=changed.events.map((event,index)=>({...event,sequence:index+1}));
 let previous='0'.repeat(64);
 changed.events=changed.events.map(event=>{
  const next={...event,previousHash:previous,hash:''};next.hash=eventHashLocal(next);previous=next.hash;return next;
 });
 changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'APPROVAL_HISTORY');
});
function eventHashLocal(event){const {hash,...body}=event;return bodyHash(body);}
test('review validator rejects approved status with only one approval',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.exceptions[0].state='approved';changed.exceptions[0].approvals=[{
  approvalId:'approval-one',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'approve',reason:'One approval.'}];
 changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'APPROVAL_COUNT');
});
test('review validator rejects rejected status without reject receipt',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.exceptions[0].state='rejected';changed.exceptions[0].rejectionReason='Rejected.';
 changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'REJECTION_DETAILS');
});
test('review validator rejects rejection without reason',()=>{
 const row=rejectedException(),changed=structuredClone(row);
 changed.exceptions[0].rejectionReason='';changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'REJECTION_DETAILS');
});
test('review validator rejects extra approval fields',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.exceptions[0].approvals=[{approvalId:'approval-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FOURTH,decision:'approve',reason:'Review.',extra:true}];
 changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'SHAPE');
});
test('review validator rejects duplicate reviewer tokens',()=>{
 const row=approvedException(),changed=structuredClone(row);
 changed.exceptions[0].approvals[1].reviewerToken=changed.exceptions[0].approvals[0].reviewerToken;
 changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'DUPLICATE');
});
test('review validator rejects duplicate approval identifiers',()=>{
 const row=approvedException(),changed=structuredClone(row);
 changed.exceptions[0].approvals[1].approvalId=changed.exceptions[0].approvals[0].approvalId;
 changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'DUPLICATE');
});
test('review validator rejects unknown exception state',()=>{
 const row=requestedException(),changed=structuredClone(row);
 changed.exceptions[0].state='active';changed.digest=bodyHash(changed);
 fails(()=>validateExceptionRegister(changed),'ENUM');
});
test('review validator rejects a changed review event payload',()=>{
 const row=approvedException(),changed=structuredClone(row);
 changed.events.at(-1).payload.decision='reject';
 fails(()=>validateExceptionRegister(changed),'EVENT_HASH');
});

test('withdrawal records withdrawn state',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Request is no longer needed.',at:FIFTH_AT});
 assert.equal(row.exceptions[0].state,'withdrawn');
});
test('withdrawal records the withdrawing actor',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw request.',at:FIFTH_AT});
 assert.equal(row.exceptions[0].withdrawnBy,'actor-coordinator-two');
});
test('withdrawal records the withdrawal date',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw request.',at:FIFTH_AT});
 assert.equal(row.exceptions[0].withdrawnOn,FIFTH);
});
test('withdrawal appends an event receipt',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw request.',at:FIFTH_AT});
 assert.equal(row.events.at(-1).type,'exception-withdrawn');
});
test('withdrawal event actor matches row actor',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw request.',at:FIFTH_AT});
 assert.equal(row.events.at(-1).actorToken,row.exceptions[0].withdrawnBy);
});
test('withdrawal event date matches row date',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw request.',at:FIFTH_AT});
 assert.equal(row.events.at(-1).at.slice(0,10),row.exceptions[0].withdrawnOn);
});
test('withdrawal rejects missing exception',()=>{
 fails(()=>withdrawRetentionException(requestedException(),{exceptionId:'missing',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT}),'EXCEPTION_REF');
});
test('withdrawal rejects malformed exception identifier',()=>{
 fails(()=>withdrawRetentionException(requestedException(),{exceptionId:'Bad ID',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT}),'ID');
});
test('withdrawal rejects requester withdrawing own request',()=>{
 fails(()=>withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-requester',reason:'Withdraw.',at:FIFTH_AT}),'SEPARATION');
});
test('withdrawal rejects personal actor token',()=>{
 fails(()=>withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'person-alex',reason:'Withdraw.',at:FIFTH_AT}),'PRIVATE');
});
test('withdrawal rejects empty reason',()=>{
 fails(()=>withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'',at:FIFTH_AT}),'TEXT');
});
test('withdrawal rejects mismatched event date',()=>{
 fails(()=>withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FOURTH_AT}),'TIMESTAMP');
});
test('withdrawal rejects malformed event timestamp',()=>{
 fails(()=>withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:'tomorrow'}),'TIMESTAMP');
});
test('withdrawal rejects event before register head',()=>{
 fails(()=>withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FOURTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',
  at:'2026-11-24T09:00:00.000Z'}),'EVENT_ORDER');
});
test('withdrawal rejects approved exception',()=>{
 fails(()=>withdrawRetentionException(approvedException(),{exceptionId:'exception-one',
  withdrawnOn:SIXTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',
  at:'2026-11-26T10:00:00.000Z'}),'EXCEPTION_TERMINAL');
});
test('withdrawal rejects rejected exception',()=>{
 fails(()=>withdrawRetentionException(rejectedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT}),'EXCEPTION_TERMINAL');
});
test('withdrawal preserves request origin digest',()=>{
 const before=requestedException(),after=withdrawRetentionException(before,{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT});
 assert.equal(before.exceptions[0].originDigest,after.exceptions[0].originDigest);
});
test('withdrawal keeps row in register history',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT});
 assert.equal(row.exceptions.length,1);
});
test('withdrawal does not mutate the prior register',()=>{
 const row=requestedException(),digest=row.digest;
 withdrawRetentionException(row,{exceptionId:'exception-one',withdrawnOn:FIFTH,
  withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT});
 assert.equal(row.digest,digest);assert.equal(row.exceptions[0].state,'requested');
});
test('withdrawal validator rejects missing withdrawal receipt',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT});
 const changed=structuredClone(row);changed.events=changed.events.filter(event=>event.type!=='exception-withdrawn');
 changed.events=changed.events.map((event,index)=>({...event,sequence:index+1}));
 fails(()=>validateExceptionRegister(changed),'WITHDRAWAL_HISTORY');
});

test('active query returns no result while request is pending',()=>{
 assert.equal(activeExceptionsForItem(requestedException(),'evidence-one',{asOf:FOURTH}).length,0);
});
test('active query returns approved exception on its start date',()=>{
 assert.equal(activeExceptionsForItem(approvedException(),'evidence-one',{asOf:FOURTH}).length,1);
});
test('active query returns approved exception inside its date range',()=>{
 assert.equal(activeExceptionsForItem(approvedException(),'evidence-one',{asOf:FIFTH}).length,1);
});
test('active query returns approved exception on its end date',()=>{
 assert.equal(activeExceptionsForItem(approvedException(),'evidence-one',{asOf:SIXTH}).length,1);
});
test('active query excludes exception after its end date',()=>{
 assert.equal(activeExceptionsForItem(approvedException(),'evidence-one',{asOf:'2026-11-27'}).length,0);
});
test('active query excludes exception before request date',()=>{
 assert.equal(activeExceptionsForItem(approvedException(),'evidence-one',{asOf:NEXT}).length,0);
});
test('active query excludes rejected exception',()=>{
 assert.equal(activeExceptionsForItem(rejectedException(),'evidence-one',{asOf:FOURTH}).length,0);
});
test('active query excludes withdrawn exception',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT});
 assert.equal(activeExceptionsForItem(row,'evidence-one',{asOf:FIFTH}).length,0);
});
test('active query rejects malformed item identifier',()=>{
 fails(()=>activeExceptionsForItem(approvedException(),'Bad ID',{asOf:FOURTH}),'ID');
});
test('active query requires an as-of date',()=>{
 fails(()=>activeExceptionsForItem(approvedException(),'evidence-one',{}),'DATE');
});
test('active query is deterministic',()=>{
 assert.deepEqual(activeExceptionsForItem(approvedException(),'evidence-one',{asOf:FOURTH}),
  activeExceptionsForItem(approvedException(),'evidence-one',{asOf:FOURTH}));
});
test('active query returns sorted exception IDs',()=>{
 assert.deepEqual(activeExceptionsForItem(approvedException(),'evidence-one',{asOf:FOURTH})
  .map(row=>row.exceptionId),['exception-one']);
});
test('active predicate returns true for active approval',()=>{
 assert.equal(isExceptionActive(approvedException(),'evidence-one',{asOf:FOURTH}),true);
});
test('active predicate returns false for expired approval',()=>{
 assert.equal(isExceptionActive(approvedException(),'evidence-one',{asOf:'2026-11-27'}),false);
});
test('active predicate returns false for pending request',()=>{
 assert.equal(isExceptionActive(requestedException(),'evidence-one',{asOf:FOURTH}),false);
});
test('summary counts requested exceptions',()=>{
 assert.equal(exceptionSummary(requestedException(),{asOf:FOURTH}).requested,1);
});
test('summary counts approved exceptions',()=>{
 assert.equal(exceptionSummary(approvedException(),{asOf:FOURTH}).approved,1);
});
test('summary counts rejected exceptions',()=>{
 assert.equal(exceptionSummary(rejectedException(),{asOf:FOURTH}).rejected,1);
});
test('summary counts withdrawn exceptions',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT});
 assert.equal(exceptionSummary(row,{asOf:FIFTH}).withdrawn,1);
});
test('summary counts active approved exceptions',()=>{
 assert.equal(exceptionSummary(approvedException(),{asOf:FIFTH}).active,1);
});
test('summary counts expired approved exceptions',()=>{
 assert.equal(exceptionSummary(approvedException(),{asOf:'2026-11-27'}).expired,1);
});
test('summary digest is stable for same as-of date',()=>{
 const row=approvedException();
 assert.deepEqual(exceptionSummary(row,{asOf:FOURTH}),exceptionSummary(row,{asOf:FOURTH}));
});
test('summary rejects malformed as-of date',()=>{
 fails(()=>exceptionSummary(approvedException(),{asOf:'bad'}),'DATE');
});
test('summary total includes terminal records',()=>{
 assert.equal(exceptionSummary(rejectedException(),{asOf:FOURTH}).total,1);
});
test('summary does not delete expired exception records',()=>{
 const row=approvedException();
 assert.equal(exceptionSummary(row,{asOf:'2026-11-27'}).expired,1);
 assert.equal(row.exceptions.length,1);
});

test('disposition gate blocks an approved exception during its active period',()=>{
 fails(()=>proposeDispositionWithExceptionCheck(dispositionRegister(),custody(),policies(),
  plan(),reviewedLedger(),emptyHolds(),approvedException(),{
   proposalId:'proposal-blocked',itemId:'evidence-one',reasonCode:'retention-period-ended',
   rationale:'Human review considered the evidence.',proposedOn:FOURTH,
   proposedBy:'actor-proposer',at:FOURTH_AT}),'ACTIVE_EXCEPTION');
});
test('disposition gate allows a pending exception request to be considered independently',()=>{
 const row=proposeDispositionWithExceptionCheck(dispositionRegister(),custody(),policies(),
  plan(),reviewedLedger(),emptyHolds(),requestedException(),{
   proposalId:'proposal-pending',itemId:'evidence-one',reasonCode:'retention-period-ended',
   rationale:'Human review considered the evidence.',proposedOn:FOURTH,
   proposedBy:'actor-proposer',at:FOURTH_AT});
 assert.equal(row.proposals.length,1);
});
test('disposition gate allows a rejected exception request',()=>{
 const row=proposeDispositionWithExceptionCheck(dispositionRegister(),custody(),policies(),
  plan(),reviewedLedger(),emptyHolds(),rejectedException(),{
   proposalId:'proposal-rejected',itemId:'evidence-one',reasonCode:'retention-period-ended',
   rationale:'Human review considered the evidence.',proposedOn:FOURTH,
   proposedBy:'actor-proposer',at:FOURTH_AT});
 assert.equal(row.proposals.length,1);
});
test('disposition gate allows an expired approved exception',()=>{
 const expired=approvedException();
 const result=proposeDispositionWithExceptionCheck(dispositionRegister(),custody(),policies(),
  buildRetentionReviewPlan(custody(),policies(),{planId:'plan-expired',asOf:'2026-11-27'}),
  reviewedLedger(),emptyHolds(),expired,{
   proposalId:'proposal-after-exception',itemId:'evidence-one',reasonCode:'retention-period-ended',
   rationale:'Human review considered the evidence after the exception ended.',
   proposedOn:'2026-11-27',proposedBy:'actor-proposer',at:'2026-11-27T10:00:00.000Z'});
 assert.equal(result.proposals[0].state,'proposed');
});
test('disposition gate does not change exception register',()=>{
 const row=approvedException(),digest=row.digest;
 fails(()=>proposeDispositionWithExceptionCheck(dispositionRegister(),custody(),policies(),
  plan(),reviewedLedger(),emptyHolds(),row,{proposalId:'proposal-blocked',
  itemId:'evidence-one',reasonCode:'retention-period-ended',rationale:'Review.',
  proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT}),'ACTIVE_EXCEPTION');
 assert.equal(row.digest,digest);
});
test('disposition gate rejects malformed exception register',()=>{
 fails(()=>proposeDispositionWithExceptionCheck(dispositionRegister(),custody(),policies(),
  plan(),reviewedLedger(),emptyHolds(),{schema:'other'},{
   proposalId:'proposal-one',itemId:'evidence-one',proposedOn:FOURTH}),'SHAPE');
});
test('disposition gate requires a valid proposal date',()=>{
 fails(()=>proposeDispositionWithExceptionCheck(dispositionRegister(),custody(),policies(),
  plan(),reviewedLedger(),emptyHolds(),exceptionRegister(),{
   proposalId:'proposal-one',itemId:'evidence-one',proposedOn:'bad'}),'DATE');
});
test('disposition gate checks only the proposed item exception',()=>{
 const secondCustody=registerEvidence(custody(),{...custody().items[0],itemId:'evidence-two',
  contentDigest:sha('evidence-two')},{at:NEXT_AT,actorToken:'actor-coordinator'});
 const secondPlan=buildRetentionReviewPlan(secondCustody,policies(),{planId:'plan-two',asOf:FOURTH});
 const reviewBook=createRetentionReviewLedger({reviewLedgerId:'review-two',createdOn:DAY,
  createdAt:AT,createdBy:'actor-review-coordinator'});
 const reviewRow={reviewId:'review-two',itemId:'evidence-two',policyId:'policy-source-capture',
  reviewedOn:FOURTH,reviewerToken:'actor-retention-reviewer',decision:'propose-disposition',
  nextReviewOn:FIFTH,reason:'Second item independently reviewed.',
  evidenceDigest:sha(secondCustody.items.find(item=>item.itemId==='evidence-two'))};
 const secondReviews=recordRetentionReview(reviewBook,secondCustody,policies(),reviewRow,
  {at:FOURTH_AT,actorToken:'actor-retention-reviewer'});
 const exception=approvedException();
 const result=proposeDispositionWithExceptionCheck(dispositionRegister(),secondCustody,policies(),
  secondPlan,secondReviews,emptyHolds(),exception,{
   proposalId:'proposal-two',itemId:'evidence-two',reasonCode:'retention-period-ended',
   rationale:'Second item has its own review.',proposedOn:FOURTH,
   proposedBy:'actor-proposer',at:FOURTH_AT});
 assert.equal(result.proposals[0].itemId,'evidence-two');
});
test('disposition gate blocks only while current date is in approved exception interval',()=>{
 assert.equal(isExceptionActive(approvedException(),'evidence-one',{asOf:FOURTH}),true);
 assert.equal(isExceptionActive(approvedException(),'evidence-one',{asOf:'2026-11-27'}),false);
});
test('disposition gate does not treat requested state as active exception',()=>{
 assert.equal(isExceptionActive(requestedException(),'evidence-one',{asOf:FOURTH}),false);
});
test('disposition gate does not treat rejected state as active exception',()=>{
 assert.equal(isExceptionActive(rejectedException(),'evidence-one',{asOf:FOURTH}),false);
});
test('disposition gate does not treat withdrawn state as active exception',()=>{
 const row=withdrawRetentionException(requestedException(),{exceptionId:'exception-one',
  withdrawnOn:FIFTH,withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',
  at:FIFTH_AT});
 assert.equal(isExceptionActive(row,'evidence-one',{asOf:FIFTH}),false);
});
test('disposition gate does not mutate custody ledger',()=>{
 const row=custody(),digest=row.digest;
 isExceptionActive(approvedException(),'evidence-one',{asOf:FOURTH});
 assert.equal(row.digest,digest);
});
test('disposition gate is deterministic for same exception state and date',()=>{
 const row=approvedException();
 assert.deepEqual(activeExceptionsForItem(row,'evidence-one',{asOf:FOURTH}),
  activeExceptionsForItem(row,'evidence-one',{asOf:FOURTH}));
});
test('disposition gate cannot be bypassed by a different exception item ID',()=>{
 const row=requestedException();
 assert.equal(activeExceptionsForItem(row,'evidence-two',{asOf:FOURTH}).length,0);
});
test('disposition gate preserves approval state after date passes',()=>{
 const row=approvedException();
 assert.equal(row.exceptions[0].state,'approved');
 assert.equal(exceptionSummary(row,{asOf:'2026-11-27'}).expired,1);
});
test('disposition gate does not automatically release evidence',()=>{
 const row=approvedException();
 assert.equal(custody().items[0].state,'held');
 assert.equal(row.exceptions[0].state,'approved');
});
test('disposition gate does not create a deletion event',()=>{
 const row=approvedException();
 assert.ok(!row.events.some(event=>/delete|purge|destroy/i.test(event.type)));
});
test('disposition gate preserves source content digest',()=>{
 const row=custody(),digest=row.items[0].contentDigest;
 isExceptionActive(approvedException(),'evidence-one',{asOf:FOURTH});
 assert.equal(custody().items[0].contentDigest,digest);
});
