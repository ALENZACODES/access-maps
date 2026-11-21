import {fail,id,hash,bodyDigest,copy,sorted} from './p15af-contract.mjs';
import {validateImpactCatalog} from './p15af-catalog.mjs';
import {validateImpactLedger} from './p15af-ledger.mjs';
import {validateRemediationPlan,remediationProgress,readyForRelease} from './p15af-impact.mjs';
export const RECONCILIATION_SCHEMA='access-maps-source-impact-reconciliation/1';
function latestSourceEvent(ledger,sourceId){
 return [...ledger.events].reverse().find(row=>row.payload.sourceId===sourceId&&
  ['source-held','source-released','source-retired','source-superseded'].includes(row.type))??null;
}
function actionCompletion(ledger,planDigest,actionId){
 const ack=[...ledger.events].reverse().find(row=>row.type==='impact-acknowledged'&&
  row.payload.planDigest===planDigest&&row.payload.actionId===actionId);
 const done=[...ledger.events].reverse().find(row=>row.type==='remediation-recorded'&&
  row.payload.planDigest===planDigest&&row.payload.actionId===actionId);
 return {acknowledged:ack?.payload.acknowledgedState??'pending',completed:Boolean(done),
  resultDigest:done?.payload.resultDigest??null};
}
export function reconcileSourceImpact(previousInput,candidateInput,ledgerInput,planInput){
 const previous=validateImpactCatalog(previousInput),candidate=validateImpactCatalog(candidateInput);
 const ledger=validateImpactLedger(ledgerInput,{catalog:previous});
 const plan=validateRemediationPlan(planInput,{catalog:previous,ledger});
 const progress=remediationProgress(plan,ledger),release=readyForRelease(plan,ledger);
 const issues=[],actions=[];
 const add=(code,path,detail)=>issues.push({code,path,detail});
 for(const sourceId of plan.sourceIds){
  const before=previous.sources.find(row=>row.sourceId===sourceId);
  const after=candidate.sources.find(row=>row.sourceId===sourceId);
  const event=latestSourceEvent(ledger,sourceId);
  if(!after){add('SOURCE_MISSING',`sources.${sourceId}`,'Candidate catalog removed a source still under review.');continue;}
  if(!event||event.type==='source-held')add('SOURCE_UNRESOLVED',`sources.${sourceId}`,'Source hold has no release or retirement decision.');
  if(event?.type==='source-released'){
   if(after.status!=='active')add('SOURCE_NOT_ACTIVE',`sources.${sourceId}`,'Released source is not active in candidate catalog.');
   if(after.sourceDigest!==event.payload.sourceDigest)add('SOURCE_DIGEST',`sources.${sourceId}`,'Candidate source digest differs from release event.');
   if(event.payload.sourceDigest!==before.sourceDigest)add('SOURCE_REVIEW_REQUIRED',`sources.${sourceId}`,'Changed source snapshot requires a new review.');
  }
  if(['source-retired','source-superseded'].includes(event?.type)&&after.status!=='retired'&&after.status!=='superseded')
   add('SOURCE_NOT_RETIRED',`sources.${sourceId}`,'Terminal source event does not match candidate source state.');
 }
 const records=new Map(candidate.records.map(row=>[row.recordId,row]));
 const assets=new Map(candidate.assets.map(row=>[row.assetId,row]));

 const packages=new Map(candidate.packages.map(row=>[row.packageId,row]));
 for(const action of plan.actions){
  const completion=actionCompletion(ledger,plan.digest,action.actionId);
  let valid=completion.acknowledged==='accepted'&&completion.completed;
  if(action.kind==='quarantine-record'||action.kind==='review-record'){
   const row=records.get(action.targetId);
   valid=valid&&Boolean(row)&&(action.kind==='quarantine-record'?['quarantined','retired'].includes(row.state):['review-required','quarantined','retired'].includes(row.state));
   if(!row)add('RECORD_MISSING',`records.${action.targetId}`,'Affected record is missing.');
   else if(row.state==='usable'||(action.kind==='quarantine-record'&&!['quarantined','retired'].includes(row.state)))add('RECORD_STILL_USABLE',`records.${action.targetId}`,'Affected record has not reached the required review state.');
  }else if(action.kind==='quarantine-asset'){
   const row=assets.get(action.targetId);
   valid=valid&&Boolean(row)&&(['quarantined','removed'].includes(row.state));
   if(!row)add('ASSET_MISSING',`assets.${action.targetId}`,'Affected asset is missing.');
   else if(!['quarantined','removed'].includes(row.state))add('ASSET_STILL_CURRENT',`assets.${action.targetId}`,'Affected asset has not been quarantined.');
  }else if(action.kind==='hold-package'||action.kind==='withdraw-package'){
   const row=packages.get(action.targetId);
   valid=valid&&Boolean(row)&&(action.kind==='hold-package'?row.state==='held':row.state==='withdrawn');
   if(!row)add('PACKAGE_MISSING',`packages.${action.targetId}`,'Affected package is missing.');
   else if(action.kind==='hold-package'&&row.state!=='held')add('PACKAGE_STILL_READY',`packages.${action.targetId}`,'Affected package is not held.');
   else if(action.kind==='withdraw-package'&&row.state!=='withdrawn')add('PACKAGE_NOT_WITHDRAWN',`packages.${action.targetId}`,'Affected package is not withdrawn.');
  }else if(action.kind==='verify-source'){
   const source= candidate.sources.find(row=>row.sourceId===action.targetId);
   valid=valid&&Boolean(source)&&source.status!=='held';
   if(!source)add('SOURCE_MISSING',`sources.${action.targetId}`,'Source missing from candidate.');
   else if(source.status==='held')add('SOURCE_STILL_HELD',`sources.${action.targetId}`,'Source remains held.');
  }
  actions.push({actionId:action.actionId,kind:action.kind,targetId:action.targetId,
   acknowledged:completion.acknowledged,completed:completion.completed,candidateState:
    records.get(action.targetId)?.state??assets.get(action.targetId)?.state??packages.get(action.targetId)?.state??
    candidate.sources.find(row=>row.sourceId===action.targetId)?.status??null,valid});
 }
 const ordered=sorted(issues,row=>`${row.code}:${row.path}`);
 const result={schema:RECONCILIATION_SCHEMA,previousCatalogDigest:previous.digest,
  candidateCatalogDigest:candidate.digest,ledgerDigest:ledger.digest,planDigest:plan.digest,
  progress,release,issues:ordered,actions,
  summary:{valid:ordered.length===0&&actions.every(row=>row.valid),
   issues:ordered.length,actions:actions.length,completed:actions.filter(row=>row.completed).length,
   accepted:actions.filter(row=>row.acknowledged==='accepted').length},
  automaticPublication:false,digest:''};
 result.digest=bodyDigest(result);return result;
}
export function validateReconciliation(input){
 fail(input?.schema===RECONCILIATION_SCHEMA,'SCHEMA','Unsupported reconciliation schema.');
 hash(input.previousCatalogDigest);hash(input.candidateCatalogDigest);hash(input.ledgerDigest);
 hash(input.planDigest);hash(input.digest);fail(input.digest===bodyDigest(input),'HASH','Reconciliation digest invalid.');
 fail(input.automaticPublication===false,'AUTOMATION','Reconciliation cannot publish automatically.');
 return copy(input);
}
