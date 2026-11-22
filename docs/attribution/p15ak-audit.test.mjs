import test from 'node:test';
import assert from 'node:assert/strict';
import {CustodyError,bodyHash,sha} from './p15-custody-contract.mjs';
import {custody,policies,plan,DAY,FOURTH,FIFTH,approvedException,requestedException} from './p15ak-fixtures.mjs';
import {registerEvidence,updateEvidenceMetadata} from './p15-custody-ledger.mjs';
import {createRetentionPolicySet,buildRetentionReviewPlan} from './p15aj-retention.mjs';
import {auditRetentionExceptions,validateExceptionAudit} from './p15ak-audit.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
test('exception audit validates an unchanged approved exception',()=>{
 const result=auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH});
 assert.equal(result.findings.length,0);
});
test('exception audit binds register digest',()=>{
 const row=approvedException(),result=auditRetentionExceptions(row,custody(),policies(),plan(),{asOf:FOURTH});
 assert.equal(result.registerDigest,row.digest);
});
test('exception audit binds custody digest',()=>{
 const result=auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH});
 assert.equal(result.ledgerDigest,custody().digest);
});
test('exception audit binds policy digest',()=>{
 const result=auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH});
 assert.equal(result.policySetDigest,policies().digest);
});
test('exception audit binds retention plan digest',()=>{
 const result=auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH});
 assert.equal(result.retentionPlanDigest,plan().digest);
});
test('exception audit flags expired approved exception',()=>{
 const result=auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:'2026-11-27'});
 assert.ok(result.findings.some(row=>row.code==='APPROVED_EXCEPTION_EXPIRED'));
});
test('exception audit counts current active exception',()=>{
 const result=auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH});
 assert.equal(result.summary.active,1);
});
test('exception audit does not count pending request as active',()=>{
 const result=auditRetentionExceptions(requestedException(),custody(),policies(),plan(),{asOf:FOURTH});
 assert.equal(result.summary.active,0);
});
test('exception audit flags stale custody digest',()=>{
 const row=approvedException();
 const changedLedger=registerEvidence(custody(),{...custody().items[0],itemId:'evidence-two',
  contentDigest:sha('other')},{at:'2026-11-24T11:00:00.000Z',actorToken:'actor-coordinator'});
 const changedPlan=buildRetentionReviewPlan(changedLedger,policies(),{planId:'plan-two',asOf:FOURTH});
 const result=auditRetentionExceptions(row,changedLedger,policies(),changedPlan,{asOf:FOURTH});
 assert.ok(result.findings.some(item=>item.code==='CUSTODY_REVISION_CHANGED'));
});
test('exception audit flags stale item digest',()=>{
 const row=approvedException(),changedLedger=updateEvidenceMetadata(custody(),'evidence-one',
  {notes:'Updated evidence metadata.'},{at:'2026-11-24T11:00:00.000Z',
  actorToken:'actor-custodian',reason:'Correct evidence note.'});
 const changedPlan=buildRetentionReviewPlan(changedLedger,policies(),{planId:'plan-two',asOf:FOURTH});
 const result=auditRetentionExceptions(row,changedLedger,policies(),changedPlan,{asOf:FOURTH});
 assert.ok(result.findings.some(item=>item.code==='CUSTODY_REVISION_CHANGED'));
});
test('exception audit flags stale policy digest',()=>{
 const row=approvedException(),changedPolicies=createRetentionPolicySet({setId:'policy-set-new',
  createdOn:DAY,createdBy:'actor-policy-owner',policies:policies().policies.map(policy=>({
   ...policy,retentionDays:10}))});
 const changedPlan=buildRetentionReviewPlan(custody(),changedPolicies,{planId:'plan-new',asOf:FOURTH});
 const result=auditRetentionExceptions(row,custody(),changedPolicies,changedPlan,{asOf:FOURTH});
 assert.ok(result.findings.some(item=>item.code==='POLICY_REVISION_CHANGED'));
});
test('exception audit flags stale plan digest',()=>{
 const row=approvedException(),changedPlan=buildRetentionReviewPlan(custody(),policies(),
  {planId:'plan-other-date',asOf:FIFTH});
 const result=auditRetentionExceptions(row,custody(),policies(),changedPlan,{asOf:FIFTH});
 assert.ok(result.findings.some(item=>item.code==='RETENTION_PLAN_CHANGED'));
});
test('exception audit flags a request that has passed its end date',()=>{
 const result=auditRetentionExceptions(requestedException(),custody(),policies(),plan(),{asOf:'2026-11-27'});
 assert.ok(result.findings.some(row=>row.code==='PENDING_REQUEST_PAST_END'));
});
test('exception audit rejects malformed as-of date',()=>{
 fails(()=>auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:'bad'}),'DATE');
});
test('exception audit is deterministic',()=>{
 assert.deepEqual(auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH}),
  auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH}));
});
test('exception audit sorts findings by code and identifier',()=>{
 const result=auditRetentionExceptions(requestedException(),custody(),policies(),plan(),{asOf:'2026-11-27'});
 const keys=result.findings.map(row=>`${row.code}:${row.exceptionId}`);
 assert.deepEqual(keys,[...keys].sort());
});
test('exception audit validates generated audit digest',()=>{
 const result=auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH});
 assert.equal(validateExceptionAudit(result).digest,result.digest);
});
test('exception audit validator rejects digest tampering',()=>{
 const result=auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH});
 fails(()=>validateExceptionAudit({...result,asOf:FIFTH}),'HASH');
});
test('exception audit validator rejects malformed source digest',()=>{
 const result=auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH});
 fails(()=>validateExceptionAudit({...result,ledgerDigest:'bad'}),'HASH');
});
test('exception audit validator rejects unsupported finding code',()=>{
 const result=auditRetentionExceptions(approvedException(),custody(),policies(),plan(),{asOf:FOURTH});
 const changed=structuredClone(result);changed.findings=[{code:'DELETE_NOW',exceptionId:'exception-one'}];
 changed.summary.findings=1;changed.digest=bodyHash({...changed,digest:undefined});
 fails(()=>validateExceptionAudit(changed),'FINDING_CODE');
});
test('exception audit does not mutate source register',()=>{
 const row=approvedException(),digest=row.digest;
 auditRetentionExceptions(row,custody(),policies(),plan(),{asOf:FOURTH});
 assert.equal(row.digest,digest);
});
test('exception audit does not infer or change evidence state',()=>{
 const row=custody();auditRetentionExceptions(approvedException(),row,policies(),plan(),{asOf:FOURTH});
 assert.equal(row.items[0].state,'held');
});
test('exception audit does not remove expired records',()=>{
 const row=approvedException();auditRetentionExceptions(row,custody(),policies(),plan(),{asOf:'2026-11-27'});
 assert.equal(row.exceptions.length,1);
});
test('exception audit retains explicit UNKNOWN licence',()=>{
 const row=custody();auditRetentionExceptions(approvedException(),row,policies(),plan(),{asOf:FOURTH});
 assert.equal(row.items[0].licence,'UNKNOWN');
});
