import test from 'node:test';
import assert from 'node:assert/strict';
import {CustodyError,bodyHash} from './p15-custody-contract.mjs';
import {rejectedException,DAY,NEXT,FIFTH,SIXTH,AT,FOURTH_AT,FIFTH_AT,NEXT_AT,
 appealRegister,filedAppeal,acceptedAppeal} from './p15ak-appeal-fixtures.mjs';
import {requestedException,exceptionRegister} from './p15ak-fixtures.mjs';
import {
 APPEAL_STATES,createAppealRegister,validateAppealRegister,fileExceptionAppeal,
 reviewExceptionAppeal,withdrawExceptionAppeal,canReconsiderException,appealSummary
} from './p15ak-appeals.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
test('appeal register opens with genesis event',()=>{
 const row=appealRegister();assert.equal(row.events[0].type,'appeal-register-opened');
});
test('appeal register has no records at creation',()=>{
 assert.equal(appealRegister().appeals.length,0);
});
test('appeal register validates at creation',()=>{
 const row=appealRegister();assert.equal(validateAppealRegister(row,rejectedException()).digest,row.digest);
});
test('appeal register rejects unknown schema',()=>{
 fails(()=>validateAppealRegister({...appealRegister(),schema:'other'},rejectedException()),'SCHEMA');
});
test('appeal register rejects unknown root fields',()=>{
 fails(()=>validateAppealRegister({...appealRegister(),email:'x@y.example'},rejectedException()),'SHAPE');
});
test('appeal register rejects malformed register ID',()=>{
 fails(()=>createAppealRegister({registerId:'Bad ID',createdOn:DAY,createdAt:AT,
  createdBy:'actor-appeal-coordinator'}),'ID');
});
test('appeal register rejects identity-bearing creator token',()=>{
 fails(()=>createAppealRegister({registerId:'appeal-two',createdOn:DAY,createdAt:AT,
  createdBy:'person-alex'}),'PRIVATE');
});
test('appeal register rejects invalid creation date',()=>{
 fails(()=>createAppealRegister({registerId:'appeal-two',createdOn:'bad',createdAt:AT,
  createdBy:'actor-appeal-coordinator'}),'DATE');
});
test('appeal register rejects timestamp date mismatch',()=>{
 fails(()=>createAppealRegister({registerId:'appeal-two',createdOn:DAY,createdAt:FIFTH_AT,
  createdBy:'actor-appeal-coordinator'}),'TIMESTAMP');
});
test('appeal register rejects changed genesis payload',()=>{
 const row=appealRegister(),changed=structuredClone(row);changed.events[0].payload.registerId='other';
 fails(()=>validateAppealRegister(changed,rejectedException()),'EVENT_HASH');
});
test('appeal register rejects broken event previous hash',()=>{
 const row=appealRegister(),changed=structuredClone(row);changed.events[0].previousHash='f'.repeat(64);
 fails(()=>validateAppealRegister(changed,rejectedException()),'EVENT_HASH');
});
test('appeal register rejects noncontiguous event sequence',()=>{
 const row=appealRegister(),changed=structuredClone(row);changed.events[0].sequence=2;
 fails(()=>validateAppealRegister(changed,rejectedException()),'SEQUENCE');
});
test('appeal register rejects a changed digest',()=>{
 const row=appealRegister(),changed={...row,createdBy:'actor-other'};
 fails(()=>validateAppealRegister(changed,rejectedException()),'HASH');
});
test('appeal register is deterministic',()=>{
 assert.deepEqual(appealRegister(),appealRegister());
});
test('appeal state vocabulary is controlled',()=>{
 assert.deepEqual(APPEAL_STATES,['filed','accepted-for-reconsideration','rejected','withdrawn']);
});
test('filing creates one appeal record',()=>{
 assert.equal(filedAppeal().appeals.length,1);
});
test('filing references the rejected exception ID',()=>{
 assert.equal(filedAppeal().appeals[0].exceptionId,'exception-one');
});
test('filing binds original exception digest',()=>{
 assert.equal(filedAppeal().appeals[0].exceptionOriginDigest,rejectedException().exceptions[0].originDigest);
});
test('filing begins in filed state',()=>{
 assert.equal(filedAppeal().appeals[0].state,'filed');
});
test('filing records the appeal event',()=>{
 assert.equal(filedAppeal().events.at(-1).type,'appeal-filed');
});
test('filing event binds appeal origin digest',()=>{
 const row=filedAppeal();assert.equal(row.events.at(-1).payload.originDigest,row.appeals[0].originDigest);
});
test('filing actor matches appellant token',()=>{
 assert.equal(filedAppeal().events.at(-1).actorToken,'actor-appellant');
});
test('filing rejects missing exception',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),exceptionRegister(),{
  appealId:'appeal-two',exceptionId:'missing',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:FIFTH_AT}),'EXCEPTION_REF');
});
test('filing rejects exception that is still requested',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),requestedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:FIFTH_AT}),'APPEAL_STATE');
});
test('filing rejects malformed appeal ID',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'Bad ID',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:FIFTH_AT}),'ID');
});
test('filing rejects malformed exception ID',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'Bad ID',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:FIFTH_AT}),'ID');
});
test('filing rejects appellant who made original request',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'actor-requester',
  reason:'Appeal.',rationale:'Rationale.',at:FIFTH_AT}),'SEPARATION');
});
test('filing rejects identity-bearing appellant token',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'person-alex',
  reason:'Appeal.',rationale:'Rationale.',at:FIFTH_AT}),'PRIVATE');
});
test('filing rejects empty reason',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'',rationale:'Rationale.',at:FIFTH_AT}),'TEXT');
});
test('filing rejects empty rationale',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'',at:FIFTH_AT}),'TEXT');
});
test('filing rejects email in rationale',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Email x@y.example',at:FIFTH_AT}),'PRIVATE');
});
test('filing rejects invalid event timestamp',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:'tomorrow'}),'TIMESTAMP');
});
test('filing rejects event date mismatch',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:FOURTH_AT}),'TIMESTAMP');
});
test('filing rejects event before appeal register head',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:DAY,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:'2026-11-21T09:00:00.000Z'}),'EVENT_ORDER');
});
test('filing rejects date before appeal register creation',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:'2026-11-20',filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:'2026-11-20T10:00:00.000Z'}),'EVENT_ORDER');
});
test('filing rejects appeal outside 30-day window',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:'2026-12-26',filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:'2026-12-26T10:00:00.000Z'}),'APPEAL_WINDOW');
});
test('filing permits appeal at 30-day boundary',()=>{
 const row=fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-boundary',exceptionId:'exception-one',filedOn:'2026-12-24',
  filedBy:'actor-appellant',reason:'Appeal.',rationale:'Within appeal window.',
  at:'2026-12-24T10:00:00.000Z'});
 assert.equal(row.appeals.length,1);
});
test('filing rejects appeal before rejection date',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:NEXT,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:NEXT_AT}),'APPEAL_WINDOW');
});
test('filing rejects duplicate appeal for same exception',()=>{
 const row=filedAppeal();
 fails(()=>fileExceptionAppeal(row,rejectedException(),{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:SIXTH,filedBy:'actor-other-appellant',
  reason:'Second appeal.',rationale:'Second rationale.',at:'2026-11-26T11:00:00.000Z'}),'DUPLICATE_APPEAL');
});
test('filing supports only one appeal per rejected exception',()=>{
 assert.equal(filedAppeal().appeals.length,1);
});
test('filing rejects exception whose origin digest changed',()=>{
 const row=rejectedException(),changed=structuredClone(row);
 changed.exceptions[0].originDigest='a'.repeat(64);changed.digest=bodyHash(changed);
 fails(()=>fileExceptionAppeal(appealRegister(),changed,{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:FIFTH_AT}),'ORIGIN_DIGEST');
});
test('filing validates rejected exception register before filing',()=>{
 fails(()=>fileExceptionAppeal(appealRegister(),{schema:'bad'},{
  appealId:'appeal-two',exceptionId:'exception-one',filedOn:FIFTH,filedBy:'actor-appellant',
  reason:'Appeal.',rationale:'Rationale.',at:FIFTH_AT}),'SHAPE');
});
test('appeal register validator accepts filed appeal',()=>{
 const row=filedAppeal();assert.equal(validateAppealRegister(row,rejectedException()).digest,row.digest);
});
test('appeal validator rejects modified appeal rationale',()=>{
 const row=filedAppeal(),changed=structuredClone(row);
 changed.appeals[0].rationale='Tampered';changed.digest=bodyHash(changed);
 fails(()=>validateAppealRegister(changed,rejectedException()),'ORIGIN_DIGEST');
});
test('appeal validator rejects changed target exception digest',()=>{
 const row=filedAppeal(),changed=structuredClone(row);
 changed.appeals[0].exceptionOriginDigest='a'.repeat(64);changed.digest=bodyHash(changed);
 fails(()=>validateAppealRegister(changed,rejectedException()),'ORIGIN_DIGEST');
});
test('appeal validator rejects missing filing event',()=>{
 const row=filedAppeal(),changed=structuredClone(row);
 changed.events=changed.events.slice(0,1);changed.digest=bodyHash(changed);
 fails(()=>validateAppealRegister(changed,rejectedException()),'APPEAL_HISTORY');
});
test('appeal validator rejects duplicate appeal IDs',()=>{
 const row=filedAppeal(),changed=structuredClone(row);
 changed.appeals.push(changed.appeals[0]);changed.digest=bodyHash(changed);
 fails(()=>validateAppealRegister(changed,rejectedException()),'DUPLICATE');
});
test('appeal validator rejects extra row fields',()=>{
 const row=filedAppeal(),changed=structuredClone(row);changed.appeals[0].email='x';
 changed.digest=bodyHash(changed);fails(()=>validateAppealRegister(changed,rejectedException()),'SHAPE');
});
test('appeal validator rejects a changed filing event',()=>{
 const row=filedAppeal(),changed=structuredClone(row);changed.events.at(-1).payload.appealId='other';
 fails(()=>validateAppealRegister(changed,rejectedException()),'EVENT_HASH');
});
test('appeal validator rejects an appeal target that is no longer rejected',()=>{
 const row=filedAppeal();
 fails(()=>validateAppealRegister(row,requestedException()),'EXCEPTION_REF');
});
test('appeal validator rejects changed appeal register digest',()=>{
 const row=filedAppeal();fails(()=>validateAppealRegister({...row,digest:'0'.repeat(64)},rejectedException()),'HASH');
});
test('appeal validator rejects unknown appeal state',()=>{
 const row=filedAppeal(),changed=structuredClone(row);changed.appeals[0].state='approved';
 changed.digest=bodyHash(changed);fails(()=>validateAppealRegister(changed,rejectedException()),'ENUM');
});
test('appeal validator preserves the original rejected exception',()=>{
 const before=rejectedException();filedAppeal();
 assert.equal(before.exceptions[0].state,'rejected');
});
test('appeal filing does not reopen the exception request',()=>{
 const before=rejectedException();filedAppeal();
 assert.equal(before.exceptions[0].state,'rejected');
});

test('first appeal acceptance remains filed pending second reviewer',()=>{
 const row=reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'accept',reason:'First independent review.',at:FIFTH_AT});
 assert.equal(row.appeals[0].state,'filed');
});
test('two independent appeal acceptances reach accepted-for-reconsideration',()=>{
 assert.equal(acceptedAppeal().appeals[0].state,'accepted-for-reconsideration');
});
test('appeal approval requires two distinct reviewers',()=>{
 const row=acceptedAppeal();assert.equal(row.appeals[0].reviews.length,2);
 assert.notEqual(row.appeals[0].reviews[0].reviewerToken,row.appeals[0].reviews[1].reviewerToken);
});
test('appeal approval appends two review events',()=>{
 const row=acceptedAppeal();
 assert.equal(row.events.filter(event=>event.type==='appeal-reviewed').length,2);
});
test('appeal review event binds review digest',()=>{
 const row=reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'accept',reason:'First review.',at:FIFTH_AT});
 assert.equal(row.events.at(-1).payload.reviewDigest,bodyHash(row.appeals[0].reviews[0]));
});
test('appeal review rejects missing appeal',()=>{
 fails(()=>reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'missing',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'accept',reason:'Review.',at:FIFTH_AT}),'APPEAL_REF');
});
test('appeal review rejects appellant reviewing own appeal',()=>{
 fails(()=>reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-appellant',
  reviewedOn:FIFTH,decision:'accept',reason:'Review.',at:FIFTH_AT}),'SEPARATION');
});
test('appeal review rejects duplicate reviewer',()=>{
 const first=reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'accept',reason:'Review.',at:FIFTH_AT});
 fails(()=>reviewExceptionAppeal(first,rejectedException(),{
  appealId:'appeal-one',reviewId:'review-two',reviewerToken:'actor-reviewer-one',
  reviewedOn:SIXTH,decision:'accept',reason:'Second review.',at:'2026-11-26T10:00:00.000Z'}),'DUPLICATE_REVIEWER');
});
test('appeal review rejects malformed reviewer token',()=>{
 fails(()=>reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'person-alex',
  reviewedOn:FIFTH,decision:'accept',reason:'Review.',at:FIFTH_AT}),'PRIVATE');
});
test('appeal review rejects malformed review ID',()=>{
 fails(()=>reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'Bad ID',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'accept',reason:'Review.',at:FIFTH_AT}),'ID');
});
test('appeal review rejects unsupported decision',()=>{
 fails(()=>reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'maybe',reason:'Review.',at:FIFTH_AT}),'ENUM');
});
test('appeal review rejects empty reason',()=>{
 fails(()=>reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'accept',reason:'',at:FIFTH_AT}),'TEXT');
});
test('appeal review rejects mismatched event date',()=>{
 fails(()=>reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'accept',reason:'Review.',at:'2026-11-26T10:00:00.000Z'}),'TIMESTAMP');
});
test('appeal review rejects event earlier than register head',()=>{
 fails(()=>reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'accept',reason:'Review.',at:'2026-11-25T09:00:00.000Z'}),'EVENT_ORDER');
});
test('appeal review rejects a third reviewer after two acceptances',()=>{
 fails(()=>reviewExceptionAppeal(acceptedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-three',reviewerToken:'actor-reviewer-three',
  reviewedOn:'2026-11-27',decision:'accept',reason:'Third review.',
  at:'2026-11-27T10:00:00.000Z'}),'APPEAL_TERMINAL');
});
test('appeal review rejects second reviewer after first rejection',()=>{
 const first=reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'reject',reason:'Appeal declined.',at:FIFTH_AT});
 assert.equal(first.appeals[0].state,'rejected');
 fails(()=>reviewExceptionAppeal(first,rejectedException(),{
  appealId:'appeal-one',reviewId:'review-two',reviewerToken:'actor-reviewer-two',
  reviewedOn:SIXTH,decision:'accept',reason:'Try again.',at:'2026-11-26T10:00:00.000Z'}),'APPEAL_TERMINAL');
});
test('appeal rejection remains in register history',()=>{
 const row=reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'reject',reason:'Appeal declined.',at:FIFTH_AT});
 assert.equal(row.appeals.length,1);
});
test('appeal validator accepts two-person approval',()=>{
 const row=acceptedAppeal();assert.equal(validateAppealRegister(row,rejectedException()).digest,row.digest);
});
test('appeal validator detects changed review reason',()=>{
 const row=acceptedAppeal(),changed=structuredClone(row);
 changed.appeals[0].reviews[0].reason='Tampered';changed.digest=bodyHash(changed);
 fails(()=>validateAppealRegister(changed,rejectedException()),'REVIEW_HISTORY');
});
test('appeal validator rejects accepted state with one approval',()=>{
 const row=reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'accept',reason:'Review.',at:FIFTH_AT});
 const changed=structuredClone(row);changed.appeals[0].state='accepted-for-reconsideration';
 changed.digest=bodyHash(changed);
 fails(()=>validateAppealRegister(changed,rejectedException()),'REVIEW_COUNT');
});
test('appeal validator rejects withdrawn state without details',()=>{
 const row=filedAppeal(),changed=structuredClone(row);changed.appeals[0].state='withdrawn';
 changed.digest=bodyHash(changed);fails(()=>validateAppealRegister(changed,rejectedException()),'WITHDRAWAL_DETAILS');
});
test('appeal validator rejects malformed review row',()=>{
 const row=acceptedAppeal(),changed=structuredClone(row);changed.appeals[0].reviews[0].extra=true;
 changed.digest=bodyHash(changed);fails(()=>validateAppealRegister(changed,rejectedException()),'SHAPE');
});
test('appeal validator rejects duplicate review IDs',()=>{
 const row=acceptedAppeal(),changed=structuredClone(row);
 changed.appeals[0].reviews[1].reviewId=changed.appeals[0].reviews[0].reviewId;
 changed.digest=bodyHash(changed);fails(()=>validateAppealRegister(changed,rejectedException()),'DUPLICATE');
});
test('appeal validator rejects duplicate reviewers',()=>{
 const row=acceptedAppeal(),changed=structuredClone(row);
 changed.appeals[0].reviews[1].reviewerToken=changed.appeals[0].reviews[0].reviewerToken;
 changed.digest=bodyHash(changed);fails(()=>validateAppealRegister(changed,rejectedException()),'DUPLICATE');
});
test('appeal validator rejects a changed review event',()=>{
 const row=acceptedAppeal(),changed=structuredClone(row);changed.events.at(-1).payload.decision='reject';
 fails(()=>validateAppealRegister(changed,rejectedException()),'EVENT_HASH');
});
test('appeal validator rejects a missing review event',()=>{
 const row=acceptedAppeal(),changed=structuredClone(row);
 changed.events=changed.events.filter(event=>event.type!=='appeal-reviewed');
 fails(()=>validateAppealRegister(changed,rejectedException()),'REVIEW_HISTORY');
});
test('appeal validator preserves exception decision state',()=>{
 const original=rejectedException();acceptedAppeal();
 assert.equal(original.exceptions[0].state,'rejected');
});
test('accepted appeal does not automatically approve exception',()=>{
 const exception=rejectedException();acceptedAppeal();
 assert.equal(exception.exceptions[0].state,'rejected');
});
test('accepted appeal is only a permission to request reconsideration',()=>{
 assert.equal(canReconsiderException(acceptedAppeal(),rejectedException(),'appeal-one'),true);
});
test('filed appeal cannot be reconsidered yet',()=>{
 assert.equal(canReconsiderException(filedAppeal(),rejectedException(),'appeal-one'),false);
});
test('rejected appeal cannot be reconsidered',()=>{
 const row=reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'reject',reason:'Appeal declined.',at:FIFTH_AT});
 assert.equal(canReconsiderException(row,rejectedException(),'appeal-one'),false);
});
test('can reconsider rejects missing appeal',()=>{
 fails(()=>canReconsiderException(filedAppeal(),rejectedException(),'missing'),'APPEAL_REF');
});
test('appeal summary counts filed status',()=>{
 assert.equal(appealSummary(filedAppeal(),rejectedException()).filed,1);
});
test('appeal summary counts accepted status',()=>{
 assert.equal(appealSummary(acceptedAppeal(),rejectedException()).accepted,1);
});
test('appeal summary states that a new exception request is required',()=>{
 assert.equal(appealSummary(acceptedAppeal(),rejectedException()).newExceptionRequired,true);
});
test('appeal summary has deterministic digest',()=>{
 const row=acceptedAppeal();
 assert.deepEqual(appealSummary(row,rejectedException()),appealSummary(row,rejectedException()));
});

test('appellant may withdraw a filed appeal',()=>{
 const row=withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'The appellant no longer requests reconsideration.',at:'2026-11-26T10:00:00.000Z'});
 assert.equal(row.appeals[0].state,'withdrawn');
});
test('appeal withdrawal records appellant token',()=>{
 const row=withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw appeal.',at:'2026-11-26T10:00:00.000Z'});
 assert.equal(row.appeals[0].withdrawnBy,'actor-appellant');
});
test('appeal withdrawal records date',()=>{
 const row=withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw appeal.',at:'2026-11-26T10:00:00.000Z'});
 assert.equal(row.appeals[0].withdrawnOn,SIXTH);
});
test('appeal withdrawal appends event receipt',()=>{
 const row=withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw appeal.',at:'2026-11-26T10:00:00.000Z'});
 assert.equal(row.events.at(-1).type,'appeal-withdrawn');
});
test('appeal withdrawal event actor matches row actor',()=>{
 const row=withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw appeal.',at:'2026-11-26T10:00:00.000Z'});
 assert.equal(row.events.at(-1).actorToken,row.appeals[0].withdrawnBy);
});
test('appeal withdrawal event date matches row date',()=>{
 const row=withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw appeal.',at:'2026-11-26T10:00:00.000Z'});
 assert.equal(row.events.at(-1).at.slice(0,10),SIXTH);
});
test('appeal withdrawal rejects missing appeal',()=>{
 fails(()=>withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'missing',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw.',at:'2026-11-26T10:00:00.000Z'}),'APPEAL_REF');
});
test('appeal withdrawal rejects malformed appeal identifier',()=>{
 fails(()=>withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'Bad ID',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw.',at:'2026-11-26T10:00:00.000Z'}),'ID');
});
test('appeal withdrawal rejects an actor other than appellant',()=>{
 fails(()=>withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-coordinator',
  reason:'Withdraw.',at:'2026-11-26T10:00:00.000Z'}),'SEPARATION');
});
test('appeal withdrawal rejects identity-bearing actor token',()=>{
 fails(()=>withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'person-alex',
  reason:'Withdraw.',at:'2026-11-26T10:00:00.000Z'}),'PRIVATE');
});
test('appeal withdrawal rejects empty reason',()=>{
 fails(()=>withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'',at:'2026-11-26T10:00:00.000Z'}),'TEXT');
});
test('appeal withdrawal rejects mismatched event date',()=>{
 fails(()=>withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw.',at:FIFTH_AT}),'TIMESTAMP');
});
test('appeal withdrawal rejects malformed timestamp',()=>{
 fails(()=>withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw.',at:'tomorrow'}),'TIMESTAMP');
});
test('appeal withdrawal rejects event before register head',()=>{
 fails(()=>withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:FIFTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw.',at:'2026-11-25T09:00:00.000Z'}),'EVENT_ORDER');
});
test('appeal withdrawal rejects accepted appeal',()=>{
 fails(()=>withdrawExceptionAppeal(acceptedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:'2026-11-27',withdrawnBy:'actor-appellant',
  reason:'Withdraw.',at:'2026-11-27T10:00:00.000Z'}),'APPEAL_TERMINAL');
});
test('appeal withdrawal rejects rejected appeal',()=>{
 const row=reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'review-one',reviewerToken:'actor-reviewer-one',
  reviewedOn:FIFTH,decision:'reject',reason:'Declined.',at:FIFTH_AT});
 fails(()=>withdrawExceptionAppeal(row,rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw.',at:'2026-11-26T10:00:00.000Z'}),'APPEAL_TERMINAL');
});
test('appeal withdrawal preserves appeal origin digest',()=>{
 const row=filedAppeal(),digest=row.appeals[0].originDigest;
 const next=withdrawExceptionAppeal(row,rejectedException(),{appealId:'appeal-one',
  withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',reason:'Withdraw.',
  at:'2026-11-26T10:00:00.000Z'});
 assert.equal(next.appeals[0].originDigest,digest);
});
test('appeal withdrawal does not mutate the original register',()=>{
 const row=filedAppeal(),digest=row.digest;
 withdrawExceptionAppeal(row,rejectedException(),{appealId:'appeal-one',
  withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',reason:'Withdraw.',
  at:'2026-11-26T10:00:00.000Z'});
 assert.equal(row.digest,digest);assert.equal(row.appeals[0].state,'filed');
});
test('appeal withdrawal keeps the appeal in history',()=>{
 const row=withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw.',at:'2026-11-26T10:00:00.000Z'});
 assert.equal(row.appeals.length,1);
});
test('appeal withdrawal validator detects missing withdrawal receipt',()=>{
 const row=withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw.',at:'2026-11-26T10:00:00.000Z'});
 const changed=structuredClone(row);changed.events=changed.events.filter(event=>event.type!=='appeal-withdrawn');
 changed.digest=bodyHash(changed);
 fails(()=>validateAppealRegister(changed,rejectedException()),'WITHDRAWAL_HISTORY');
});
test('appeal summary counts withdrawn appeals',()=>{
 const row=withdrawExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',withdrawnOn:SIXTH,withdrawnBy:'actor-appellant',
  reason:'Withdraw.',at:'2026-11-26T10:00:00.000Z'});
 assert.equal(appealSummary(row,rejectedException()).withdrawn,1);
});
test('appeal summary retains accepted appeal history',()=>{
 assert.equal(appealSummary(acceptedAppeal(),rejectedException()).total,1);
});
test('appeal accepted state does not modify exception register digest',()=>{
 const exception=rejectedException(),digest=exception.digest;acceptedAppeal();
 assert.equal(exception.digest,digest);
});
test('appeal filing does not change the rejected exception approval count',()=>{
 const exception=rejectedException(),count=exception.exceptions[0].approvals.length;
 filedAppeal();assert.equal(exception.exceptions[0].approvals.length,count);
});
test('appeal requires a new exception request after acceptance',()=>{
 const row=acceptedAppeal();
 assert.equal(canReconsiderException(row,rejectedException(),'appeal-one'),true);
 assert.equal(rejectedException().exceptions[0].state,'rejected');
});
test('appeal register validator rejects duplicate appeal per exception',()=>{
 const row=filedAppeal(),changed=structuredClone(row);
 const duplicate={...changed.appeals[0],appealId:'appeal-two'};
 const {originDigest,...base}=duplicate;
 base.state='filed';base.reviews=[];base.withdrawnOn=null;base.withdrawnBy=null;
 duplicate.originDigest=bodyHash(base);
 changed.appeals.push(duplicate);changed.digest=bodyHash(changed);
 fails(()=>validateAppealRegister(changed,rejectedException()),'DUPLICATE');
});
