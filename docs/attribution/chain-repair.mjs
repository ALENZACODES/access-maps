/** Explicit repair planning. Never auto-assert a source right or notice fact. */
import {parseChain,UNKNOWN,validDay} from './chain-core.mjs';
import {auditChain,missingReceiptQueue,missingNoticeQueue} from './chain-audit.mjs';
const STATUSES=['open','assigned','in-progress','blocked','resolved','dismissed'];
const PRIORITIES=['critical','high','normal','low'];
const DATE_ORDER=(a,b)=>a.dueOn.localeCompare(b.dueOn)||a.id.localeCompare(b.id);
export function emptyRepairPlan(){return {schema:'map-evidence-chain-repair/1',id:'evidence-repair',items:[]};}
export function parseRepairPlan(input){
  if(typeof input==='string'){if(input.length>1_000_000)throw new TypeError('Plan too large');input=JSON.parse(input);}
  if(!input||input.schema!=='map-evidence-chain-repair/1'||typeof input.id!=='string'||!Array.isArray(input.items)||input.items.length>2500)throw new TypeError('Invalid repair plan');
  const seen=new Set();
  const items=input.items.map((x,index)=>{
    if(!x||typeof x!=='object'||Array.isArray(x))throw new TypeError('Invalid repair item');
    const keys=['id','code','path','priority','status','ownerRef','createdOn','dueOn','resolvedOn','evidenceRef','note'];
    for(const key of keys)if(!Object.hasOwn(x,key))throw new TypeError(`Missing ${key} in repair ${index}`);
    for(const key of Object.keys(x))if(!keys.includes(key))throw new TypeError(`Unexpected repair field ${key}`);
    if(typeof x.id!=='string'||!/^[a-z][a-z0-9._-]{1,79}$/u.test(x.id)||seen.has(x.id))throw new TypeError('Duplicate or invalid repair ID');
    seen.add(x.id);
    if(!PRIORITIES.includes(x.priority)||!STATUSES.includes(x.status))throw new TypeError('Invalid repair priority or status');
    for(const k of ['code','path','ownerRef','evidenceRef','note'])if(typeof x[k]!=='string'||x[k].length>2000)throw new TypeError(`Invalid repair ${k}`);
    for(const k of ['createdOn','dueOn','resolvedOn'])if(x[k]!==UNKNOWN&&!validDay(x[k]))throw new TypeError(`Invalid repair ${k}`);
    return {...x};
  });
  return {schema:input.schema,id:input.id,items};
}
export function planFromAudit(input,{createdOn=UNKNOWN}={}){
  const chain=parseChain(input),audit=auditChain(chain),items=[];
  for(const finding of audit.findings.filter(x=>x.severity==='block'||x.severity==='caution')){
    const id=`repair-${items.length+1}`;
    items.push({id,code:finding.code,path:finding.path,priority:finding.severity==='block'?'high':'normal',
      status:'open',ownerRef:UNKNOWN,createdOn,dueOn:UNKNOWN,resolvedOn:UNKNOWN,evidenceRef:UNKNOWN,
      note:'A person must inspect the original record; no evidence is filled in automatically.'});
  }
  return parseRepairPlan({schema:'map-evidence-chain-repair/1',id:'evidence-repair',items});
}
export function updateRepair(plan,id,patch){
  const p=parseRepairPlan(plan),item=p.items.find(x=>x.id===id);
  if(!item)throw new TypeError('Repair item not found');
  return parseRepairPlan({...p,items:p.items.map(x=>x.id===id?{...x,...patch}:x)});
}
export function resolveRepair(plan,id,{resolvedOn,evidenceRef,note}={}){
  if(!validDay(resolvedOn)||typeof evidenceRef!=='string'||evidenceRef===UNKNOWN||!evidenceRef.startsWith('https://'))throw new TypeError('Resolution requires date and evidence link');
  return updateRepair(plan,id,{status:'resolved',resolvedOn,evidenceRef,note:note??'Resolution recorded for human review'});
}
export function reopenRepair(plan,id){return updateRepair(plan,id,{status:'open',resolvedOn:UNKNOWN});}
export function repairQueue(plan,{status,priority,asOf}={}){
  const p=parseRepairPlan(plan);
  let items=p.items;
  if(status)items=items.filter(x=>x.status===status);
  if(priority)items=items.filter(x=>x.priority===priority);
  if(asOf){if(!validDay(asOf))throw new TypeError('Invalid review date');items=items.filter(x=>x.dueOn!==UNKNOWN&&x.dueOn<asOf&&!['resolved','dismissed'].includes(x.status));}
  return [...items].sort((a,b)=>PRIORITIES.indexOf(a.priority)-PRIORITIES.indexOf(b.priority)||DATE_ORDER(a,b));
}
export function repairMetrics(plan){
  const p=parseRepairPlan(plan);
  return {total:p.items.length,open:p.items.filter(x=>x.status==='open').length,
    active:p.items.filter(x=>['assigned','in-progress','blocked'].includes(x.status)).length,
    resolved:p.items.filter(x=>x.status==='resolved').length,
    unassigned:p.items.filter(x=>x.ownerRef===UNKNOWN&&!['resolved','dismissed'].includes(x.status)).length};
}
export function reconcileRepairs(plan,chain){
  const p=parseRepairPlan(plan),audit=auditChain(chain),existing=new Set(audit.findings.map(f=>`${f.code}|${f.path}`));
  const tracked=new Set(p.items.map(x=>`${x.code}|${x.path}`));
  return {stale:p.items.filter(x=>!existing.has(`${x.code}|${x.path}`)),
    untracked:audit.findings.filter(x=>x.severity==='block'&&!tracked.has(`${x.code}|${x.path}`)),
    unresolved:p.items.filter(x=>!['resolved','dismissed'].includes(x.status))};
}
export function repairsToText(plan,locale='en'){
  const p=parseRepairPlan(plan),fr=locale==='fr',label=fr?'Plan de correction':'Evidence repair plan';
  return [label,`${p.items.length} ${fr?'éléments':'items'}`,...repairQueue(p).map(x=>`${x.priority.toUpperCase()} ${x.code} — ${x.path} (${x.status})`)].join('\n')+'\n';
}
