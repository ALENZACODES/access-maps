import {fail,exact,id,date,hash,token,safeText,copy,sorted,unique,bodyDigest,noIdentity} from './p15af-contract.mjs';
import {validateImpactCatalog} from './p15af-catalog.mjs';
import {sourceImpact} from './p15af-graph.mjs';
import {validateImpactLedger} from './p15af-ledger.mjs';
export const PLAN_SCHEMA='access-maps-source-remediation-plan/1';
export const ACTIONS=Object.freeze(['review-record','quarantine-record','quarantine-asset','hold-package','withdraw-package','verify-source']);
const ACTION_PRIORITY={'withdraw-package':0,'hold-package':1,'quarantine-asset':2,'quarantine-record':4,'review-record':5,'verify-source':6};
function actionId(sourceId,kind,targetId){return `action-${kind}-${sourceId}-${targetId}`.slice(0,96);}
function action(kind,sourceId,targetId,reason,dependsOn=[]){
 return {actionId:actionId(sourceId,kind,targetId),kind,sourceId,targetId,reason,dependsOn:[...dependsOn].sort()};
}
function activeHold(ledger,sourceId){
 let held=null;
 for(const row of ledger.events){
  if(row.payload.sourceId!==sourceId)continue;
  if(row.type==='source-held')held=row;
  if(['source-released','source-retired','source-superseded'].includes(row.type))held=null;
 }
 return held;
}
export function buildSourceRemediationPlan(catalogInput,ledgerInput,{sourceIds,planId,createdOn,createdBy}={}){
 const catalog=validateImpactCatalog(catalogInput),ledger=validateImpactLedger(ledgerInput,{catalog});
 id(planId);date(createdOn);token(createdBy);
 fail(createdOn>=catalog.asOf&&createdOn>=ledger.createdOn,'DATE_ORDER','Plan predates its inputs.');
 fail(Array.isArray(sourceIds)&&sourceIds.length>0&&sourceIds.length<=1000,'LIMIT','Source selection invalid.');
 sourceIds.forEach(id);unique(sourceIds,'source IDs');
 const sources=new Map(catalog.sources.map(row=>[row.sourceId,row]));
 const records=new Map(catalog.records.map(row=>[row.recordId,row]));
 const assets=new Map(catalog.assets.map(row=>[row.assetId,row]));
 const packages=new Map(catalog.packages.map(row=>[row.packageId,row]));
 const actions=[],findings=[];
 for(const sourceId of sourceIds){
  const source=sources.get(sourceId);fail(source,'SOURCE_REF',`Unknown source: ${sourceId}`);
  const hold=activeHold(ledger,sourceId);
  fail(hold||source.status!=='active','SOURCE_NOT_HELD',`Source ${sourceId} has no unresolved hold.`);
  fail(createdOn>=hold.at,'DATE_ORDER','Remediation plan predates source hold.');
  const affected=sourceImpact(catalog,[sourceId]).affected;
  const recordActions=new Map();
  for(const recordId of affected.records){
   const row=records.get(recordId);
   const kind=row.accessState==='UNKNOWN'?'review-record':'quarantine-record';
   const next=action(kind,sourceId,recordId,`Source ${sourceId} is held; review record evidence before reuse.`);
   actions.push(next);recordActions.set(recordId,next.actionId);
  }
  const assetActions=new Map();
  for(const assetId of affected.assets){
   const row=assets.get(assetId);
   const kind='quarantine-asset';
   const deps=row.recordIds.map(value=>recordActions.get(value)).filter(Boolean);
   const next=action(kind,sourceId,assetId,`Asset ${assetId} carries held source ${sourceId}.`,deps);
   actions.push(next);assetActions.set(assetId,next.actionId);
  }
  for(const packageId of affected.packages){
   const row=packages.get(packageId);
   const deps=row.assetIds.map(value=>assetActions.get(value)).filter(Boolean);
   actions.push(action(row.state==='ready'?'hold-package':'withdraw-package',sourceId,packageId,
    `Package ${packageId} depends on held source ${sourceId}.`,deps));
  }
  actions.push(action('verify-source',sourceId,sourceId,
   `Review source ${sourceId} status, licence, dates and source snapshot digest.`));
  findings.push({sourceId,holdEventHash:hold.hash,reasonCode:hold.payload.reasonCode,
   sourceDigest:source.sourceDigest,affected:{records:affected.records.length,assets:affected.assets.length,
    packages:affected.packages.length}});
 }
 const byId=new Map(actions.map(row=>[row.actionId,row]));
 for(const row of actions)for(const dependency of row.dependsOn)
  fail(byId.has(dependency),'DEPENDENCY','Action dependency does not exist.');
 const ordered=topological(actions);
 const result={schema:PLAN_SCHEMA,planId,createdOn,createdBy,catalogDigest:catalog.digest,
  ledgerDigest:ledger.digest,sourceIds:[...sourceIds].sort(),findings:sorted(findings,row=>row.sourceId),
  actions:ordered,summary:{sources:sourceIds.length,actions:actions.length,
   byKind:Object.fromEntries(ACTIONS.map(kind=>[kind,actions.filter(row=>row.kind===kind).length]))},digest:''};
 result.digest=bodyDigest(result);noIdentity(result);return result;
}
function topological(actions){
 const rows=new Map(actions.map(row=>[row.actionId,row])),visited=new Set(),visiting=new Set(),result=[];
 function visit(idValue){
  fail(!visiting.has(idValue),'DEPENDENCY_CYCLE','Action dependencies contain a cycle.');
  if(visited.has(idValue))return;
  const row=rows.get(idValue);fail(row,'DEPENDENCY','Unknown dependency.');
  visiting.add(idValue);
  for(const dep of row.dependsOn)visit(dep);
  visiting.delete(idValue);visited.add(idValue);result.push(row);
 }
 for(const row of [...actions].sort((a,b)=>ACTION_PRIORITY[a.kind]-ACTION_PRIORITY[b.kind]||a.actionId.localeCompare(b.actionId)))
  visit(row.actionId);
 return result;
}
export function validateRemediationPlan(input,{catalog,ledger}={}){
 exact(input,['schema','planId','createdOn','createdBy','catalogDigest','ledgerDigest','sourceIds','findings','actions','summary','digest']);
 fail(input.schema===PLAN_SCHEMA,'SCHEMA','Unsupported remediation plan.');
 const currentCatalog=validateImpactCatalog(catalog),currentLedger=validateImpactLedger(ledger);
 id(input.planId);date(input.createdOn);token(input.createdBy);hash(input.catalogDigest);hash(input.ledgerDigest);hash(input.digest);
 fail(input.catalogDigest===currentCatalog.digest,'STALE_PLAN','Plan catalog snapshot changed.');
 fail(Array.isArray(input.sourceIds)&&input.sourceIds.length>0,'PLAN','Plan source selection invalid.');
 unique(input.sourceIds,'plan source IDs');
 fail(Array.isArray(input.findings)&&input.findings.length===input.sourceIds.length,'PLAN','Plan findings incomplete.');
 const findingMap=new Map(input.findings.map(row=>[row.sourceId,row]));
 for(const sourceId of input.sourceIds){
  const finding=findingMap.get(sourceId);fail(finding,'PLAN','Plan finding is missing.');
  const hold=currentLedger.events.find(row=>row.type==='source-held'&&row.hash===finding.holdEventHash&&row.payload.sourceId===sourceId);
  fail(hold,'HOLD_REF','Plan hold event is absent from ledger history.');
 }
 fail(Array.isArray(input.actions)&&input.actions.length<=100000,'LIMIT','Plan action list invalid.');
 unique(input.actions.map(row=>row.actionId),'plan action IDs');
 const known=new Set(input.actions.map(row=>row.actionId));
 for(const row of input.actions){
  exact(row,['actionId','kind','sourceId','targetId','reason','dependsOn']);
  id(row.actionId);fail(ACTIONS.includes(row.kind),'ACTION','Action kind invalid.');
  id(row.sourceId);id(row.targetId);safeText(row.reason,'action reason',500);
  fail(Array.isArray(row.dependsOn),'DEPENDENCY','Dependencies must be an array.');
  unique(row.dependsOn,'action dependencies');
  fail(input.sourceIds.includes(row.sourceId),'SOURCE_REF','Action source is outside plan selection.');
  for(const dep of row.dependsOn)fail(known.has(dep)&&dep!==row.actionId,'DEPENDENCY','Dependency reference invalid.');
 }
 const ordered=topological(input.actions);
 fail(ordered.map(row=>row.actionId).join('|')===input.actions.map(row=>row.actionId).join('|'),
  'ACTION_ORDER','Plan actions are not in dependency order.');
 const expectedSummary={sources:input.sourceIds.length,actions:input.actions.length,
  byKind:Object.fromEntries(ACTIONS.map(kind=>[kind,input.actions.filter(row=>row.kind===kind).length]))};
 fail(JSON.stringify(input.summary)===JSON.stringify(expectedSummary),'SUMMARY','Plan summary does not match actions.');
 fail(input.digest===bodyDigest(input),'HASH','Plan digest invalid.');
 noIdentity(input);return copy(input);
}
function topologicalActions(actions){return topological(actions);}
export function remediationProgress(planInput,ledgerInput){
 hash(planInput.digest);const ledger=validateImpactLedger(ledgerInput);
 const acknowledged=new Map(),completed=new Map();
 for(const row of ledger.events){
  if(row.type==='impact-acknowledged'&&row.payload.planDigest===planInput.digest)
   acknowledged.set(row.payload.actionId,row.payload.acknowledgedState);
  if(row.type==='remediation-recorded'&&row.payload.planDigest===planInput.digest)
   completed.set(row.payload.actionId,row.payload.resultDigest);
 }
 const actions=planInput.actions.map(row=>({actionId:row.actionId,kind:row.kind,
  acknowledged:acknowledged.get(row.actionId)??'pending',
  completed:completed.has(row.actionId),resultDigest:completed.get(row.actionId)??null}));
 return {planDigest:planInput.digest,total:actions.length,
  accepted:actions.filter(row=>row.acknowledged==='accepted').length,
  deferred:actions.filter(row=>row.acknowledged==='deferred').length,
  rejected:actions.filter(row=>row.acknowledged==='rejected').length,
  completed:actions.filter(row=>row.completed).length,
  pending:actions.filter(row=>row.acknowledged==='pending').length,
  actions,digest:bodyDigest({planDigest:planInput.digest,actions})};
}
export function readyForRelease(planInput,ledgerInput){
 const progress=remediationProgress(planInput,ledgerInput);
 const blocked=progress.actions.filter(row=>row.acknowledged!=='accepted'||!row.completed);
 return {ready:blocked.length===0,planDigest:planInput.digest,blocked:blocked.map(row=>row.actionId),
  automaticRelease:false,digest:bodyDigest({ready:blocked.length===0,planDigest:planInput.digest,
   blocked:blocked.map(row=>row.actionId),automaticRelease:false})};
}
