import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,source,record,asset,pkg,NEXT,LATER,sourceDigest} from './p15af-fixtures.mjs';
import {createImpactLedger,holdSource,releaseSource,acknowledgeImpact,recordRemediation} from './p15af-ledger.mjs';
import {buildSourceRemediationPlan} from './p15af-impact.mjs';
import {createImpactReport,validateImpactReport,renderImpactReport,reportSummary} from './p15af-report.mjs';
import {ImpactError,sha256} from './p15af-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ImpactError&&error.code===code);
function setup(){
 const previous=catalog();
 let ledger=createImpactLedger({ledgerId:'ledger-report',catalog:previous,createdOn:NEXT,createdBy:'actor-steward'});
 ledger=holdSource(ledger,{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'integrity-failure',reason:'Source snapshot requires a review.',sourceDigest});
 const plan=buildSourceRemediationPlan(previous,ledger,{sourceIds:['source-one'],
  planId:'plan-report',createdOn:LATER,createdBy:'actor-coordinator'});
 const hold=ledger.events[0];
 ledger=releaseSource(ledger,{sourceId:'source-one',at:'2026-11-24',actor:'actor-steward',
  holdEventHash:hold.hash,reviewDigest:sha256('review'),sourceDigest});
 let day=24;
 for(const action of plan.actions){
  const a=new Date(Date.UTC(2026,10,day)).toISOString().slice(0,10);
  const b=new Date(Date.UTC(2026,10,day+1)).toISOString().slice(0,10);
  ledger=acknowledgeImpact(ledger,{planDigest:plan.digest,actionId:action.actionId,
   acknowledgedState:'accepted',evidenceDigest:sha256(`${action.actionId}-ack`),at:a,actor:'actor-coordinator'});
  ledger=recordRemediation(ledger,{planDigest:plan.digest,actionId:action.actionId,
   resolution:'Human review recorded.',evidenceDigest:sha256(`${action.actionId}-evidence`),
   resultDigest:sha256(`${action.actionId}-result`),at:b,actor:'actor-coordinator'});
  day+=2;
 }
 const candidate=catalog({records:[record({state:'review-required'})],
  assets:[asset({state:'quarantined'})],packages:[pkg({state:'held'})]});
 return {previous,ledger,plan,candidate};
}
function report(lang='en'){
 const value=setup();
 return createImpactReport(value.previous,value.ledger,value.plan,value.candidate,
  {reportId:'report-one',createdOn:'2026-12-10',lang});
}
test('impact report validates digest and source references',()=>{
 const value=report();assert.equal(validateImpactReport(value).digest,value.digest);
});
test('impact report binds all four catalog and governance digests',()=>{
 const value=report();
 for(const key of ['catalogDigest','ledgerDigest','planDigest','candidateCatalogDigest'])
  assert.equal(value[key].length,64);
});
test('impact report aggregates affected record, asset and package counts',()=>{
 const value=report();
 assert.deepEqual(value.affected,{records:1,assets:1,packages:1});
});
test('impact report aggregates accepted and completed action counts',()=>{
 const value=report();
 assert.equal(value.progress.accepted,value.progress.total);
 assert.equal(value.progress.completed,value.progress.total);
});
test('impact report marks human release review readiness separately',()=>{
 const value=report();
 assert.equal(value.releaseReviewReady,true);
 assert.equal(value.automaticPublication,false);
});
test('impact report renders English headings and safety notes',()=>{
 const output=renderImpactReport(report('en'));
 assert.match(output,/Offline source impact review/u);
 assert.match(output,/No automatic publication/u);
 assert.match(output,/UNKNOWN/u);
});
test('impact report renders French headings and safety notes',()=>{
 const output=renderImpactReport(report('fr'));
 assert.match(output,/Examen hors ligne/u);
 assert.match(output,/Aucune diffusion/u);
});
test('impact report rejects unsupported language',()=>{
 const value=setup();
 fails(()=>createImpactReport(value.previous,value.ledger,value.plan,value.candidate,
  {reportId:'report-bad',createdOn:'2026-12-10',lang:'de'}),'LANGUAGE');
});
test('impact report rejects malformed report ID',()=>{
 const value=setup();
 fails(()=>createImpactReport(value.previous,value.ledger,value.plan,value.candidate,
  {reportId:'Bad ID',createdOn:'2026-12-10',lang:'en'}),'ID');
});
test('impact report rejects a forged digest',()=>{
 const value=report(),changed={...value,sourceCount:999};
 fails(()=>validateImpactReport(changed),'HASH');
});
test('impact report refuses automatic publication',()=>{
 const value=report(),changed={...value,automaticPublication:true};
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>validateImpactReport(changed),'AUTOMATION');
});
test('impact report summary exposes compact progress',()=>{
 const result=reportSummary(report());
 assert.equal(result.reportId,'report-one');
 assert.equal(result.releaseReviewReady,true);
});
test('impact report summary rejects malformed digest',()=>{
 const value=report();value.digest='bad';fails(()=>reportSummary(value),'HASH');
});
test('impact report contains no personal identity or direct contact details',()=>{
 const value=report(),serialized=JSON.stringify(value);
 assert.ok(!serialized.includes('@'));
 assert.ok(!serialized.includes('actor-steward'));
});
test('impact report is deterministic for identical source inputs',()=>{
 assert.deepEqual(report(),report());
});
test('impact report carries exact creation date',()=>{
 assert.equal(report().createdOn,'2026-12-10');
});

test('impact report exposes candidate catalog digest separately',()=>{
 const value=report();
 assert.notEqual(value.catalogDigest,value.candidateCatalogDigest);
});
test('impact report counts every source once',()=>{
 const value=report();
 assert.equal(value.sourceCount,1);
});
test('impact report labels are localized without changing source digests',()=>{
 const en=report('en'),fr=report('fr');
 assert.equal(en.catalogDigest,fr.catalogDigest);
 assert.notEqual(en.labels.title,fr.labels.title);
});
test('impact report validator rejects unknown language',()=>{
 const value=report(),changed={...value,lang:'es'};
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>validateImpactReport(changed),'LANGUAGE');
});
test('impact report summary retains the report digest',()=>{
 const value=report();
 assert.equal(reportSummary(value).digest,value.digest);
});
test('impact report renderer terminates with a newline',()=>{
 assert.ok(renderImpactReport(report()).endsWith('\n'));
});
