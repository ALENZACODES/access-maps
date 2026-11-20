import {parseConflicts,UNKNOWN,OSM_CREDIT,duplicatesByScope} from './conflict-core.mjs';
/** A recorded choice is not evidence of rights or accessibility. */
export function auditConflicts(input) {
  const model=parseConflicts(input);
  const findings=[];
  const add=(row,code,field,severity='blocking')=>findings.push({id:row.id,code,field,severity});
  for(const row of model.conflicts) {
    if(row.surfaceId===UNKNOWN) add(row,'SURFACE_UNKNOWN','surfaceId');
    if(row.layerId===UNKNOWN) add(row,'LAYER_UNKNOWN','layerId');
    if(row.sourceId===UNKNOWN) add(row,'SOURCE_UNKNOWN','sourceId');
    if(row.source===UNKNOWN) add(row,'LINK_UNKNOWN','source');
    if(row.licence===UNKNOWN || row.licence.trim()==='') add(row,'LICENCE_UNKNOWN','licence');
    if(row.retrievedOn===UNKNOWN) add(row,'RETRIEVAL_UNKNOWN','retrievedOn');
    if(row.tier===UNKNOWN) add(row,'TIER_UNKNOWN','tier');
    if(row.current===UNKNOWN) add(row,'CURRENT_UNKNOWN','current');
    if(row.proposed===UNKNOWN) add(row,'PROPOSED_UNKNOWN','proposed');
    if(row.reason===UNKNOWN || !row.reason.trim()) add(row,'REASON_UNKNOWN','reason');
    if(row.decision==='resolved' && row.reviewedOn===UNKNOWN) add(row,'REVIEW_DATE_UNKNOWN','reviewedOn');
    if(row.decision==='resolved' && row.severity==='blocking' && row.note===UNKNOWN) add(row,'RESOLUTION_NOTE_UNKNOWN','note');
    if(row.decision==='resolved' && row.current===row.proposed) add(row,'NO_RECORDED_CHANGE','proposed','information');
    if(row.decision!=='resolved') add(row,'UNRESOLVED','decision',row.severity==='blocking'?'blocking':'review');
    if(row.sourceId==='osm' && row.category==='credit' && row.proposed!==UNKNOWN && !row.proposed.includes(OSM_CREDIT)) add(row,'OSM_CREDIT_MISSING','proposed');
    if(row.sourceId==='osm' && row.category==='placement' && row.proposed==='details-only') add(row,'OSM_CREDIT_NOT_NEAR_MAP','proposed');
    if(row.category==='permission' && row.proposed==='yes' && row.reason===UNKNOWN) add(row,'PERMISSION_EVIDENCE_UNKNOWN','reason');
  }
  for(const [first,second] of duplicatesByScope(model)) findings.push({id:second,code:'DUPLICATE_SCOPE',field:'id',severity:'blocking',related:first});
  findings.sort((a,b)=>a.id.localeCompare(b.id)||a.code.localeCompare(b.code));
  return {schema:'map-attribution-conflict-audit/1',total:model.conflicts.length,open:model.conflicts.filter(r=>r.decision==='open').length,held:model.conflicts.filter(r=>r.decision==='hold').length,resolved:model.conflicts.filter(r=>r.decision==='resolved').length,blocking:findings.filter(r=>r.severity==='blocking').length,findings};
}
export function gateConflicts(input) {
  const audit=auditConflicts(input);
  return {allowed:audit.blocking===0 && audit.open===0 && audit.held===0 && audit.total>0, audit};
}
export function summarizeBySource(input) {
  const rows=parseConflicts(input).conflicts;
  const map=new Map();
  for(const r of rows) {
    const x=map.get(r.sourceId)??{sourceId:r.sourceId,total:0,open:0,hold:0,resolved:0,blocking:0};
    x.total++;x[r.decision]++;if(r.severity==='blocking')x.blocking++;
    map.set(r.sourceId,x);
  }
  return [...map.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
}
export function reconcileAgainstBaseline(previous,current) {
  const old=parseConflicts(previous);const next=parseConflicts(current);
  const oldRows=new Map(old.conflicts.map(r=>[r.id,r]));
  const nextRows=new Map(next.conflicts.map(r=>[r.id,r]));
  const changes=[];
  for(const id of new Set([...oldRows.keys(),...nextRows.keys()])) {
    const a=oldRows.get(id),b=nextRows.get(id);
    if(!a)changes.push({id,kind:'added',field:'id',before:UNKNOWN,after:id});
    else if(!b)changes.push({id,kind:'removed',field:'id',before:id,after:UNKNOWN});
    else for(const k of Object.keys(a)) if(JSON.stringify(a[k])!==JSON.stringify(b[k]))changes.push({id,kind:'changed',field:k,before:a[k],after:b[k]});
  }
  changes.sort((a,b)=>a.id.localeCompare(b.id)||a.field.localeCompare(b.field));
  const regressions=changes.filter(c=>c.kind==='removed' || c.field==='decision' && c.before==='resolved' && c.after!=='resolved' || c.kind==='changed' && c.after===UNKNOWN && c.before!==UNKNOWN);
  return {schema:'map-attribution-conflict-changes/1',changes,regressions,blocked:regressions.length>0||gateConflicts(next).allowed===false};
}
