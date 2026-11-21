import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,source,record,asset,pkg,NEXT,LATER,sourceDigest} from './p15af-fixtures.mjs';
import {createImpactLedger,holdSource} from './p15af-ledger.mjs';
import {buildSourceRemediationPlan,validateRemediationPlan,remediationProgress,readyForRelease} from './p15af-impact.mjs';
import {acknowledgeImpact,recordRemediation} from './p15af-ledger.mjs';
import {ImpactError,sha256} from './p15af-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ImpactError&&error.code===code);
function heldInputs(){
 const current=catalog();
 const ledger=createImpactLedger({ledgerId:'ledger-one',catalog:current,createdOn:NEXT,createdBy:'actor-steward'});
 const held=holdSource(ledger,{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'integrity-failure',reason:'Source digest needs a human integrity review.',sourceDigest});
 return {catalog:current,ledger:held};
}
function plan(){
 const {catalog:current,ledger}=heldInputs();
 return buildSourceRemediationPlan(current,ledger,{sourceIds:['source-one'],
  planId:'plan-one',createdOn:LATER,createdBy:'actor-coordinator'});
}
test('remediation plan identifies affected record, asset and package',()=>{
 const value=plan();
 assert.equal(value.findings[0].affected.records,1);
 assert.equal(value.findings[0].affected.assets,1);
 assert.equal(value.findings[0].affected.packages,1);
});
test('remediation plan quarantines a known-state record',()=>{
 const value=plan();
 assert.ok(value.actions.some(row=>row.kind==='quarantine-record'&&row.targetId==='record-one'));
});
test('remediation plan quarantines current offline asset',()=>{
 const value=plan();
 assert.ok(value.actions.some(row=>row.kind==='quarantine-asset'&&row.targetId==='asset-one'));
});
test('remediation plan holds ready publication package',()=>{
 const value=plan();
 assert.ok(value.actions.some(row=>row.kind==='hold-package'&&row.targetId==='package-one'));
});
test('remediation plan includes source verification action',()=>{
 const value=plan();
 assert.ok(value.actions.some(row=>row.kind==='verify-source'&&row.targetId==='source-one'));
});
test('remediation actions are topologically ordered',()=>{
 const value=plan(),positions=new Map(value.actions.map((row,index)=>[row.actionId,index]));
 for(const row of value.actions)for(const dependency of row.dependsOn)
  assert.ok(positions.get(dependency)<positions.get(row.actionId));
});
test('remediation plan is deterministic for identical inputs',()=>{
 assert.deepEqual(plan(),plan());
});
test('remediation plan binds exact catalog and ledger digests',()=>{
 const {catalog:current,ledger}=heldInputs(),value=buildSourceRemediationPlan(current,ledger,
  {sourceIds:['source-one'],planId:'plan-one',createdOn:LATER,createdBy:'actor-coordinator'});
 assert.equal(value.catalogDigest,current.digest);
 assert.equal(value.ledgerDigest,ledger.digest);
});
test('remediation plan rejects source without unresolved hold',()=>{
 const current=catalog(),ledger=createImpactLedger({ledgerId:'ledger-one',catalog:current,
  createdOn:NEXT,createdBy:'actor-steward'});
 fails(()=>buildSourceRemediationPlan(current,ledger,{sourceIds:['source-one'],
  planId:'plan-one',createdOn:LATER,createdBy:'actor-coordinator'}),'SOURCE_NOT_HELD');
});
test('remediation plan rejects unknown source ID',()=>{
 const {catalog:current,ledger}=heldInputs();
 fails(()=>buildSourceRemediationPlan(current,ledger,{sourceIds:['missing-source'],
  planId:'plan-one',createdOn:LATER,createdBy:'actor-coordinator'}),'SOURCE_REF');
});
test('remediation plan rejects duplicate source IDs',()=>{
 const {catalog:current,ledger}=heldInputs();
 fails(()=>buildSourceRemediationPlan(current,ledger,{sourceIds:['source-one','source-one'],
  planId:'plan-one',createdOn:LATER,createdBy:'actor-coordinator'}),'DUPLICATE');
});
test('remediation plan rejects missing source selection',()=>{
 const {catalog:current,ledger}=heldInputs();
 fails(()=>buildSourceRemediationPlan(current,ledger,{sourceIds:[],
  planId:'plan-one',createdOn:LATER,createdBy:'actor-coordinator'}),'LIMIT');
});
test('remediation plan validator recomputes from current inputs',()=>{
 const {catalog:current,ledger}=heldInputs(),value=plan();
 assert.equal(validateRemediationPlan(value,{catalog:current,ledger}).digest,value.digest);
});
test('remediation plan validator rejects changed catalog',()=>{
 const {catalog:current,ledger}=heldInputs(),value=plan();
 const changed=catalog({records:[record({reason:'Changed record note.'})]});
 fails(()=>validateRemediationPlan(value,{catalog:changed,ledger}),'STALE_PLAN');
});
test('remediation plan validator rejects forged digest',()=>{
 const value=plan();
 fails(()=>validateRemediationPlan({...value,digest:'f'.repeat(64)},{catalog:heldInputs().catalog,ledger:heldInputs().ledger}),'HASH');
});
test('remediation progress starts with every action pending',()=>{
 const value=plan(),ledger=heldInputs().ledger,progress=remediationProgress(value,ledger);
 assert.equal(progress.pending,value.actions.length);
 assert.equal(progress.completed,0);
});
test('remediation progress counts accepted acknowledgements',()=>{
 const value=plan(),ledger=heldInputs().ledger,first=value.actions[0];
 const next=acknowledgeImpact(ledger,{planDigest:value.digest,actionId:first.actionId,
  acknowledgedState:'accepted',evidenceDigest:sha256('ack'),at:'2026-11-24',actor:'actor-coordinator'});
 const progress=remediationProgress(value,next);
 assert.equal(progress.accepted,1);
});
test('remediation progress counts deferred and rejected acknowledgements',()=>{
 const value=plan();let ledger=heldInputs().ledger;
 ledger=acknowledgeImpact(ledger,{planDigest:value.digest,actionId:value.actions[0].actionId,
  acknowledgedState:'deferred',evidenceDigest:sha256('ack-a'),at:'2026-11-24',actor:'actor-coordinator'});
 ledger=acknowledgeImpact(ledger,{planDigest:value.digest,actionId:value.actions[1].actionId,
  acknowledgedState:'rejected',evidenceDigest:sha256('ack-b'),at:'2026-11-25',actor:'actor-coordinator'});
 const progress=remediationProgress(value,ledger);
 assert.equal(progress.deferred,1);
 assert.equal(progress.rejected,1);
});
test('remediation completion requires accepted acknowledgement',()=>{
 const value=plan(),action=value.actions[0],progressLedger=heldInputs().ledger;
 const accepted=acknowledgeImpact(progressLedger,{planDigest:value.digest,actionId:action.actionId,
  acknowledgedState:'accepted',evidenceDigest:sha256('ack'),at:'2026-11-24',actor:'actor-coordinator'});
 const completed=recordRemediation(accepted,{planDigest:value.digest,actionId:action.actionId,
  resolution:'Record reviewed and quarantined.',evidenceDigest:sha256('evidence'),
  resultDigest:sha256('result'),at:'2026-11-25',actor:'actor-coordinator'});
 assert.equal(remediationProgress(value,completed).completed,1);
});
test('release readiness remains false while actions are pending',()=>{
 const value=plan(),result=readyForRelease(value,heldInputs().ledger);
 assert.equal(result.ready,false);
 assert.equal(result.automaticRelease,false);
});
test('release readiness requires completion of all actions',()=>{
 const value=plan();let ledger=heldInputs().ledger;let day=24;
 for(const action of value.actions){
  const acknowledgedOn=new Date(Date.UTC(2026,10,day)).toISOString().slice(0,10);
  const completedOn=new Date(Date.UTC(2026,10,day+1)).toISOString().slice(0,10);
  ledger=acknowledgeImpact(ledger,{planDigest:value.digest,actionId:action.actionId,
   acknowledgedState:'accepted',evidenceDigest:sha256(`${action.actionId}-ack`),
   at:acknowledgedOn,actor:'actor-coordinator'});
  ledger=recordRemediation(ledger,{planDigest:value.digest,actionId:action.actionId,
   resolution:'Action checked by a human reviewer.',evidenceDigest:sha256(`${action.actionId}-evidence`),
   resultDigest:sha256(`${action.actionId}-result`),at:completedOn,actor:'actor-coordinator'});
  day+=2;
 }
 const result=readyForRelease(value,ledger);
 assert.equal(result.ready,true);
 assert.equal(result.blocked.length,0);
 assert.equal(result.automaticRelease,false);
});
test('release readiness rejects incomplete remediation',()=>{
 const value=plan();let ledger=heldInputs().ledger;
 const action=value.actions[0];
 ledger=acknowledgeImpact(ledger,{planDigest:value.digest,actionId:action.actionId,
  acknowledgedState:'accepted',evidenceDigest:sha256('ack'),at:'2026-11-24',actor:'actor-coordinator'});
 const result=readyForRelease(value,ledger);
 assert.equal(result.ready,false);
 assert.ok(result.blocked.length>0);
});
test('plan includes findings for every selected source',()=>{
 const value=plan();
 assert.deepEqual(value.findings.map(row=>row.sourceId),['source-one']);
});
test('plan summary counts action types accurately',()=>{
 const value=plan();
 for(const [kind,count] of Object.entries(value.summary.byKind))
  assert.equal(count,value.actions.filter(row=>row.kind===kind).length);
});
test('plan output is identity minimized',()=>{
 assert.ok(!JSON.stringify(plan()).includes('actor-steward'));
 assert.ok(!JSON.stringify(plan()).includes('@'));
});
test('plan reason text remains bounded and descriptive',()=>{
 assert.ok(plan().actions.every(row=>row.reason.length>10&&row.reason.length<=500));
});
test('UNKNOWN records receive review action rather than known-state quarantine action',()=>{
 const current=catalog({records:[record({accessState:'UNKNOWN',state:'review-required'})],
  assets:[asset({state:'stale'})],packages:[pkg({state:'held'})]});
 const ledger=createImpactLedger({ledgerId:'ledger-unknown',catalog:current,createdOn:NEXT,createdBy:'actor-steward'});
 const held=holdSource(ledger,{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'provenance-gap',reason:'Source provenance needs review.',sourceDigest});
 const value=buildSourceRemediationPlan(current,held,{sourceIds:['source-one'],
  planId:'plan-unknown',createdOn:LATER,createdBy:'actor-coordinator'});
 assert.ok(value.actions.some(row=>row.kind==='review-record'));
});

test('remediation plan rejects malformed actor token',()=>{
 const {catalog:current,ledger}=heldInputs();
 fails(()=>buildSourceRemediationPlan(current,ledger,{sourceIds:['source-one'],
  planId:'plan-bad-actor',createdOn:LATER,createdBy:'person-alex'}),'PRIVATE');
});
test('remediation plan rejects a plan date before source hold',()=>{
 const {catalog:current,ledger}=heldInputs();
 fails(()=>buildSourceRemediationPlan(current,ledger,{sourceIds:['source-one'],
  planId:'plan-old',createdOn:NEXT,createdBy:'actor-coordinator'}),'DATE_ORDER');
});
test('remediation plan actions retain their source identifiers',()=>{
 const value=plan();
 assert.ok(value.actions.every(row=>row.sourceId==='source-one'));
});
test('remediation plan action identifiers are unique',()=>{
 const value=plan();
 assert.equal(new Set(value.actions.map(row=>row.actionId)).size,value.actions.length);
});
test('remediation plan dependency arrays are unique',()=>{
 const value=plan();
 assert.ok(value.actions.every(row=>new Set(row.dependsOn).size===row.dependsOn.length));
});
test('remediation progress rejects malformed ledger digest',()=>{
 const value=plan(),ledger=heldInputs().ledger;
 const changed={...ledger,digest:'bad'};
 fails(()=>remediationProgress(value,changed),'HASH');
});
test('remediation progress does not count a deferred action as complete',()=>{
 const value=plan(),action=value.actions[0];
 const ledger=acknowledgeImpact(heldInputs().ledger,{planDigest:value.digest,
  actionId:action.actionId,acknowledgedState:'deferred',evidenceDigest:sha256('deferred'),
  at:'2026-11-24',actor:'actor-coordinator'});
 const progress=remediationProgress(value,ledger);
 assert.equal(progress.completed,0);
});
test('release readiness is false if one action is rejected',()=>{
 const value=plan(),action=value.actions[0];
 const ledger=acknowledgeImpact(heldInputs().ledger,{planDigest:value.digest,
  actionId:action.actionId,acknowledgedState:'rejected',evidenceDigest:sha256('reject'),
  at:'2026-11-24',actor:'actor-coordinator'});
 assert.equal(readyForRelease(value,ledger).ready,false);
});
test('plan source findings include hold event hash',()=>{
 const value=plan();
 assert.equal(value.findings[0].holdEventHash.length,64);
});
test('plan source findings include source snapshot digest',()=>{
 const value=plan();
 assert.equal(value.findings[0].sourceDigest,sourceDigest);
});
test('plan source findings classify hold reason code',()=>{
 const value=plan();
 assert.equal(value.findings[0].reasonCode,'integrity-failure');
});
test('release readiness includes every unfinished action ID',()=>{
 const value=plan(),result=readyForRelease(value,heldInputs().ledger);
 assert.deepEqual(result.blocked,value.actions.map(row=>row.actionId));
});

test('stale offline assets are quarantined before any rebuild workflow',()=>{
 const current=catalog({assets:[asset({state:'stale'})],packages:[pkg({state:'held'})]});
 const ledger=createImpactLedger({ledgerId:'ledger-stale-asset',catalog:current,
  createdOn:NEXT,createdBy:'actor-steward'});
 const held=holdSource(ledger,{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'integrity-failure',reason:'Source evidence requires review.',sourceDigest});
 const value=buildSourceRemediationPlan(current,held,{sourceIds:['source-one'],
  planId:'plan-stale-asset',createdOn:LATER,createdBy:'actor-coordinator'});
 const assetAction=value.actions.find(row=>row.targetId==='asset-one');
 assert.equal(assetAction.kind,'quarantine-asset');
});
