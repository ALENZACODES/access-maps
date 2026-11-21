import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,source,record,asset,pkg,NEXT,LATER,sourceDigest} from './p15af-fixtures.mjs';
import {createImpactLedger,holdSource,releaseSource,acknowledgeImpact,recordRemediation} from './p15af-ledger.mjs';
import {buildSourceRemediationPlan} from './p15af-impact.mjs';
import {reconcileSourceImpact,validateReconciliation} from './p15af-reconcile.mjs';
import {ImpactError,sha256} from './p15af-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ImpactError&&error.code===code);
function setup(){
 const previous=catalog();
 let ledger=createImpactLedger({ledgerId:'ledger-reconcile',catalog:previous,
  createdOn:NEXT,createdBy:'actor-steward'});
 ledger=holdSource(ledger,{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'licence-review',reason:'Review source licence before further publication.',
  sourceDigest});
 const initialLedger=ledger;
 const plan=buildSourceRemediationPlan(previous,ledger,{sourceIds:['source-one'],
  planId:'plan-reconcile',createdOn:LATER,createdBy:'actor-coordinator'});
 const hold=ledger.events[0];
 ledger=releaseSource(ledger,{sourceId:'source-one',at:'2026-11-24',actor:'actor-steward',
  holdEventHash:hold.hash,reviewDigest:sha256('source review'),sourceDigest});
 let day=0;
 const eventDate=offset=>new Date(Date.UTC(2026,10,24+offset)).toISOString().slice(0,10);
 for(const action of plan.actions){
  ledger=acknowledgeImpact(ledger,{planDigest:plan.digest,actionId:action.actionId,
   acknowledgedState:'accepted',evidenceDigest:sha256(`${action.actionId}-ack`),
   at:eventDate(day),actor:'actor-coordinator'});
  day++;
  ledger=recordRemediation(ledger,{planDigest:plan.digest,actionId:action.actionId,
   resolution:'Human reviewer checked the affected item and retained the hold state.',
   evidenceDigest:sha256(`${action.actionId}-evidence`),
   resultDigest:sha256(`${action.actionId}-result`),
   at:eventDate(day),actor:'actor-coordinator'});
  day++;
 }
 const candidate=catalog({
  sources:[source()],
  records:[record({state:'quarantined',updatedOn:'2026-12-10'})],
  assets:[asset({state:'quarantined',builtOn:'2026-12-10'})],
  packages:[pkg({state:'held',builtOn:'2026-12-10'})],
 });
 return {previous,candidate,ledger,initialLedger,plan};
}
test('reconciliation validates a fully remediated source-impact change',()=>{
 const value=setup(),result=reconcileSourceImpact(value.previous,value.candidate,value.ledger,value.plan);
 assert.equal(result.summary.valid,true);
 assert.equal(result.automaticPublication,false);
});
test('reconciliation binds previous and candidate catalog digests',()=>{
 const value=setup(),result=reconcileSourceImpact(value.previous,value.candidate,value.ledger,value.plan);
 assert.equal(result.previousCatalogDigest,value.previous.digest);
 assert.equal(result.candidateCatalogDigest,value.candidate.digest);
});
test('reconciliation requires the source to have a release or retirement decision',()=>{
 const value=setup();
 const unresolved=createImpactLedger({ledgerId:'ledger-new',catalog:value.previous,
  createdOn:NEXT,createdBy:'actor-steward'});
 const held=holdSource(unresolved,{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'other',reason:'Unresolved hold.',sourceDigest});
 const plan=buildSourceRemediationPlan(value.previous,held,{sourceIds:['source-one'],
  planId:'plan-unresolved',createdOn:LATER,createdBy:'actor-coordinator'});
 const result=reconcileSourceImpact(value.previous,value.candidate,held,plan);
 assert.ok(result.issues.some(row=>row.code==='SOURCE_UNRESOLVED'));
});
test('reconciliation detects a released source that is not active in candidate',()=>{
 const value=setup();
 const candidate=catalog({sources:[source({status:'held'})],
  records:[record({state:'review-required'})],assets:[asset({state:'quarantined'})],
  packages:[pkg({state:'held'})]});
 const result=reconcileSourceImpact(value.previous,candidate,value.ledger,value.plan);
 assert.ok(result.issues.some(row=>row.code==='SOURCE_NOT_ACTIVE'));
});
test('reconciliation detects source digest different from release event',()=>{
 const value=setup();
 const candidate=catalog({sources:[source({sourceDigest:sha256('new-digest')})],
  records:[record({state:'review-required',evidence:[{...record().evidence[0],digest:sha256('new-digest')} ]})],
  assets:[asset({state:'quarantined'})],packages:[pkg({state:'held'})]});
 const result=reconcileSourceImpact(value.previous,candidate,value.ledger,value.plan);
 assert.ok(result.issues.some(row=>row.code==='SOURCE_DIGEST'));
});
test('reconciliation detects source still held in candidate catalog',()=>{
 const value=setup();
 const candidate=catalog({sources:[source({status:'held'})],
  records:[record({state:'review-required'})],assets:[asset({state:'quarantined'})],
  packages:[pkg({state:'held'})]});
 const result=reconcileSourceImpact(value.previous,candidate,value.ledger,value.plan);
 assert.ok(result.issues.some(row=>row.code==='SOURCE_NOT_ACTIVE'));
});
test('reconciliation requires impacted record to be non-usable',()=>{
 const value=setup();
 const candidate=catalog({records:[record()],assets:[asset({state:'quarantined'})],
  packages:[pkg({state:'held'})]});
 const result=reconcileSourceImpact(value.previous,candidate,value.ledger,value.plan);
 assert.ok(result.issues.some(row=>row.code==='RECORD_STILL_USABLE'));
});
test('reconciliation requires impacted asset to be non-current',()=>{
 const value=setup();
 const candidate=catalog({records:[record({state:'review-required'})],assets:[asset()],
  packages:[pkg({state:'held'})]});
 const result=reconcileSourceImpact(value.previous,candidate,value.ledger,value.plan);
 assert.ok(result.issues.some(row=>row.code==='ASSET_STILL_CURRENT'));
});
test('reconciliation requires impacted package to be non-ready',()=>{
 const value=setup();
 const candidate=catalog({records:[record()],assets:[asset()],packages:[pkg()]});
 const result=reconcileSourceImpact(value.previous,candidate,value.ledger,value.plan);
 assert.ok(result.issues.some(row=>row.code==='PACKAGE_STILL_READY'));
});
test('reconciliation requires accepted acknowledgement and completion for every action',()=>{
 const value=setup();
 const empty=value.initialLedger;
 const result=reconcileSourceImpact(value.previous,value.candidate,empty,value.plan);
 assert.equal(result.summary.valid,false);
 assert.ok(result.actions.some(row=>row.acknowledged==='pending'));
});
test('reconciliation report validator accepts generated report',()=>{
 const value=setup(),result=reconcileSourceImpact(value.previous,value.candidate,value.ledger,value.plan);
 assert.equal(validateReconciliation(result).digest,result.digest);
});
test('reconciliation report validator detects digest tampering',()=>{
 const value=setup(),result=reconcileSourceImpact(value.previous,value.candidate,value.ledger,value.plan);
 const changed={...result,summary:{...result.summary,valid:false}};
 fails(()=>validateReconciliation(changed),'HASH');
});
test('reconciliation report refuses automatic publication',()=>{
 const value=setup(),result=reconcileSourceImpact(value.previous,value.candidate,value.ledger,value.plan);
 const changed={...result,automaticPublication:true};
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>validateReconciliation(changed),'AUTOMATION');
});
test('reconciliation remains a review report and not an access assertion',()=>{
 const value=setup(),result=reconcileSourceImpact(value.previous,value.candidate,value.ledger,value.plan);
 assert.equal(Object.hasOwn(result,'accessState'),false);
 assert.equal(Object.hasOwn(result,'accessible'),false);
});
test('reconciliation action result digest remains linked to plan action IDs',()=>{
 const value=setup(),result=reconcileSourceImpact(value.previous,value.candidate,value.ledger,value.plan);
 assert.deepEqual(result.actions.map(row=>row.actionId).sort(),value.plan.actions.map(row=>row.actionId).sort());
});
test('reconciliation exposes completion count separately from action validity',()=>{
 const value=setup(),result=reconcileSourceImpact(value.previous,value.candidate,value.ledger,value.plan);
 assert.equal(result.summary.completed,value.plan.actions.length);
 assert.equal(result.summary.accepted,value.plan.actions.length);
});
test('reconciliation is deterministic for identical source inputs',()=>{
 const value=setup();
 assert.deepEqual(reconcileSourceImpact(value.previous,value.candidate,value.ledger,value.plan),
  reconcileSourceImpact(value.previous,value.candidate,value.ledger,value.plan));
});
