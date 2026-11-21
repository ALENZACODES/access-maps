/** Semantic history comparisons without mutating either evidence package. */
import {parseChain,UNKNOWN} from './chain-core.mjs';
import {auditChain,reviewBySurface} from './chain-audit.mjs';
const ORDER={block:0,review:1,info:2};
function change(severity,kind,collection,id,field,before=UNKNOWN,after=UNKNOWN){
  return {severity,kind,collection,id,field,before,after};
}
const sourceFields=['label','url','licence','licenceUrl','credit','permission','retrievedOn','tier'];
const assetFields=['label','kind','state','sourceIds','parentIds','sha256','bytes','retrievedOn'];
const surfaceFields=['label','route','locale','kind','included','mapShown','keyboard','screenReader','focusVisible','minimumTargetPx'];
const noticeFields=['assetId','sourceId','surfaceId','text','placement','observedOn','visible','readable','keyboard','evidenceRef'];
const receiptFields=['assetId','sourceId','parentIds','contentHash','issuedOn','tier','status','reviewerRef','evidenceRef'];
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function compareCollection(out,collection,before,after,fields){
  const prior=new Map(before.map(x=>[x.id,x])),next=new Map(after.map(x=>[x.id,x]));
  for(const [id,old]of prior){
    const current=next.get(id);
    if(!current){out.push(change('block','removed',collection,id,UNKNOWN,old,UNKNOWN));continue;}
    for(const field of fields){
      if(same(old[field],current[field]))continue;
      const dangerous=['credit','permission','licence','sourceIds','sha256','contentHash','text','placement','included','visible','keyboard','screenReader','focusVisible','minimumTargetPx'].includes(field);
      const erased=current[field]===UNKNOWN||(Array.isArray(current[field])&&current[field].length===0);
      const severity=erased||dangerous?'block':'review';
      out.push(change(severity,'field-changed',collection,id,field,old[field],current[field]));
    }
  }
  for(const [id,current]of next)if(!prior.has(id))out.push(change('info','added',collection,id,UNKNOWN,UNKNOWN,current));
}
export function compareChains(previous,candidate){
  const before=parseChain(previous),after=parseChain(candidate),changes=[];
  compareCollection(changes,'sources',before.sources,after.sources,sourceFields);
  compareCollection(changes,'assets',before.assets,after.assets,assetFields);
  compareCollection(changes,'surfaces',before.surfaces,after.surfaces,surfaceFields);
  compareCollection(changes,'notices',before.notices,after.notices,noticeFields);
  compareCollection(changes,'receipts',before.receipts,after.receipts,receiptFields);
  changes.sort((a,b)=>ORDER[a.severity]-ORDER[b.severity]||a.collection.localeCompare(b.collection)||a.id.localeCompare(b.id)||a.field.localeCompare(b.field));
  const counts={block:0,review:0,info:0};for(const row of changes)counts[row.severity]++;
  return {schema:'map-attribution-evidence-chain-diff/1',beforeId:before.id,afterId:after.id,
    changes,counts,regression:counts.block>0,publicationAudit:auditChain(after)};
}
export function changedSurfaces(previous,candidate){
  const before=parseChain(previous),after=parseChain(candidate),diff=compareChains(before,after),ids=new Set();
  for(const entry of diff.changes){
    if(entry.collection==='surfaces')ids.add(entry.id);
    if(entry.collection==='notices'){
      const prior=before.notices.find(x=>x.id===entry.id),next=after.notices.find(x=>x.id===entry.id);
      if(prior)ids.add(prior.surfaceId);
      if(next)ids.add(next.surfaceId);
    }
    if(entry.collection==='sources'||entry.collection==='assets'||entry.collection==='receipts'){
      const related=entry.collection==='sources'?after.assets.filter(a=>a.sourceIds.includes(entry.id)).map(a=>a.id):
        entry.collection==='assets'?[entry.id]:[after.receipts.find(r=>r.id===entry.id)?.assetId].filter(Boolean);
      for(const n of after.notices)if(related.includes(n.assetId))ids.add(n.surfaceId);
      for(const n of before.notices)if(related.includes(n.assetId))ids.add(n.surfaceId);
    }
  }
  const selected=after.surfaces.filter(x=>ids.has(x.id));
  return {surfaceIds:[...ids].sort(),surfaces:selected,
    removedSurfaceIds:[...ids].filter(id=>!after.surfaces.some(s=>s.id===id)).sort()};
}
export function regressions(previous,candidate){return compareChains(previous,candidate).changes.filter(x=>x.severity==='block');}
export function compareCoverage(previous,candidate){
  const old=reviewBySurface(previous),next=reviewBySurface(candidate);
  const ids=new Set([...old,...next].map(x=>x.surfaceId));
  return [...ids].sort().map(id=>{
    const a=old.find(x=>x.surfaceId===id),b=next.find(x=>x.surfaceId===id);
    return {surfaceId:id,oldNotices:a?.noticeCount??0,newNotices:b?.noticeCount??0,
      oldBlocking:a?.blocking??0,newBlocking:b?.blocking??0,
      lostNotices:Math.max(0,(a?.noticeCount??0)-(b?.noticeCount??0)),
      newBlocking:Math.max(0,(b?.blocking??0)-(a?.blocking??0))};
  });
}
export function summarizeDiff(previous,candidate){
  const diff=compareChains(previous,candidate),surface=changedSurfaces(previous,candidate),coverage=compareCoverage(previous,candidate);
  return {changes:diff.changes.length,blockingChanges:diff.counts.block,
    affectedSurfaceCount:surface.surfaceIds.length,lostNotices:coverage.reduce((n,x)=>n+x.lostNotices,0),
    increasedSurfaceBlockers:coverage.reduce((n,x)=>n+x.newBlocking,0),
    publicationStatus:diff.publicationAudit.status};
}
export function diffChecklist(previous,candidate){
  const diff=compareChains(previous,candidate),summary=summarizeDiff(previous,candidate);
  return {schema:'map-evidence-chain-change-checklist/1',items:[
    {code:'SOURCE_CREDIT_CHANGES',count:diff.changes.filter(x=>x.collection==='sources'&&['credit','licence','permission'].includes(x.field)).length},
    {code:'ASSET_INTEGRITY_CHANGES',count:diff.changes.filter(x=>x.collection==='assets'&&['sha256','sourceIds','parentIds'].includes(x.field)).length},
    {code:'NOTICE_PLACEMENT_CHANGES',count:diff.changes.filter(x=>x.collection==='notices'&&['placement','text','visible','readable'].includes(x.field)).length},
    {code:'RECEIPT_CONTENT_CHANGES',count:diff.changes.filter(x=>x.collection==='receipts'&&['contentHash','status','parentIds'].includes(x.field)).length},
    {code:'PUBLICATION_VIEW_CHANGES',count:diff.changes.filter(x=>x.collection==='surfaces').length}
  ],summary};
}
