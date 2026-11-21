import { parseBundle, UNKNOWN, OSM_CREDIT, METHODS } from './bundle-core.mjs';

/** Conservative audit of recorded evidence. Does not certify accessibility or redistribution rights. */
export const SEVERITY = Object.freeze(['block','attention','information']);
export const FINDING_CODES = Object.freeze([
  'NO_INCLUDED_VIEWS','VIEW_UNKNOWN','VIEW_ROUTE_UNKNOWN','VIEW_TITLE_UNKNOWN','VIEW_NO_ASSETS',
  'ASSET_UNKNOWN','ASSET_NO_SOURCES','ASSET_NO_USES','USE_UNKNOWN','USE_MISSING',
  'SOURCE_NAME_UNKNOWN','SOURCE_URL_UNKNOWN','LICENCE_UNKNOWN','LICENCE_URL_UNKNOWN',
  'LICENCE_FAMILY_UNKNOWN','RETRIEVAL_UNKNOWN','TIER_UNKNOWN','PERMISSION_UNKNOWN',
  'PERMISSION_NO','SOURCE_CREDIT_UNKNOWN','OSM_CREDIT_MISMATCH','NOTICE_MISSING',
  'NOTICE_TEXT_UNKNOWN','NOTICE_CREDIT_MISMATCH','NOTICE_NOT_VISIBLE','NOTICE_KEYBOARD',
  'NOTICE_SCREEN_READER','NOTICE_PLACEMENT_UNKNOWN','OSM_NEAR_MAP_MISSING',
  'NOTICE_DATE_UNKNOWN','OBSERVATION_MISSING','OBSERVATION_UNKNOWN','OBSERVATION_NO',
  'OBSERVATION_DATE_UNKNOWN','OBSERVATION_EVIDENCE_UNKNOWN','TARGET_UNKNOWN','TARGET_TOO_SMALL',
  'MIXED_LICENCE_FAMILIES','DATASET_DATE_UNKNOWN','UNUSED_SOURCE','HELD_ASSET',
]);
const ORDER = {block:0,attention:1,information:2};
function f(code,severity,viewId=UNKNOWN,assetId=UNKNOWN,sourceId=UNKNOWN,locale=UNKNOWN,detail=UNKNOWN) {
  return {code,severity,viewId,assetId,sourceId,locale,detail};
}
function maybe(out,condition,code,severity,viewId,assetId,sourceId,locale,detail) {
  if(condition)out.push(f(code,severity,viewId,assetId,sourceId,locale,detail));
}
function unknown(value) { return value === UNKNOWN || value === '' || value === null || value === undefined; }
export function isOsmSource(row) { return row.family === 'ODbL'; }
export function needsNearMap(bundle,asset,source) {
  const view = bundle.views.find(x=>x.id===asset.viewId);
  return Boolean(view && view.delivery === 'map' && asset.geometrySourceIds.includes(source.id) && isOsmSource(source));
}
function sourceFindings(source, viewId, assetId) {
  const issues=[];
  for(const [key,code] of [['name','SOURCE_NAME_UNKNOWN'],['sourceUrl','SOURCE_URL_UNKNOWN'],
    ['licence','LICENCE_UNKNOWN'],['licenceUrl','LICENCE_URL_UNKNOWN'],['family','LICENCE_FAMILY_UNKNOWN'],
    ['retrievedOn','RETRIEVAL_UNKNOWN'],['tier','TIER_UNKNOWN'],['credit','SOURCE_CREDIT_UNKNOWN']]) {
    maybe(issues,unknown(source[key]),code,'block',viewId,assetId,source.id);
  }
  maybe(issues,source.permission===UNKNOWN,'PERMISSION_UNKNOWN','block',viewId,assetId,source.id);
  maybe(issues,source.permission==='no','PERMISSION_NO','block',viewId,assetId,source.id);
  maybe(issues,isOsmSource(source)&&source.credit!==OSM_CREDIT,'OSM_CREDIT_MISMATCH','block',viewId,assetId,source.id);
  maybe(issues,source.datasetAsOf===UNKNOWN,'DATASET_DATE_UNKNOWN','information',viewId,assetId,source.id);
  return issues;
}
function noticeFindings(bundle,use,asset,source,locale,notice) {
  const issues=[];
  const common=[use.viewId,asset.id,source.id,locale];
  if(!notice){issues.push(f('NOTICE_MISSING','block',...common));return issues;}
  maybe(issues,unknown(notice.text),'NOTICE_TEXT_UNKNOWN','block',...common);
  maybe(issues,!unknown(notice.text) && !unknown(source.credit) && !notice.text.includes(source.credit),
    'NOTICE_CREDIT_MISMATCH','block',...common);
  maybe(issues,notice.visible!=='yes','NOTICE_NOT_VISIBLE','block',...common,notice.visible);
  maybe(issues,notice.keyboard!=='yes','NOTICE_KEYBOARD','block',...common,notice.keyboard);
  maybe(issues,notice.screenReader!=='yes','NOTICE_SCREEN_READER','block',...common,notice.screenReader);
  maybe(issues,notice.placement===UNKNOWN || notice.placement==='missing','NOTICE_PLACEMENT_UNKNOWN','block',...common,notice.placement);
  maybe(issues,needsNearMap(bundle,asset,source)&&notice.placement!=='near-map',
    'OSM_NEAR_MAP_MISSING','block',...common,notice.placement);
  maybe(issues,notice.observedOn===UNKNOWN,'NOTICE_DATE_UNKNOWN','block',...common);
  return issues;
}
function observationFindings(view,observation) {
  const issues=[];
  if(!observation){issues.push(f('OBSERVATION_MISSING','block',view.id,UNKNOWN,UNKNOWN,UNKNOWN,'unknown method'));return issues;}
  maybe(issues,observation.result===UNKNOWN,'OBSERVATION_UNKNOWN','block',view.id,UNKNOWN,UNKNOWN,UNKNOWN,observation.method);
  maybe(issues,observation.result==='no','OBSERVATION_NO','block',view.id,UNKNOWN,UNKNOWN,UNKNOWN,observation.method);
  maybe(issues,observation.observedOn===UNKNOWN,'OBSERVATION_DATE_UNKNOWN','block',view.id,UNKNOWN,UNKNOWN,UNKNOWN,observation.method);
  maybe(issues,unknown(observation.evidence),'OBSERVATION_EVIDENCE_UNKNOWN','block',view.id,UNKNOWN,UNKNOWN,UNKNOWN,observation.method);
  if(observation.method==='touch') {
    maybe(issues,observation.minimumTargetPx===UNKNOWN,'TARGET_UNKNOWN','block',view.id);
    maybe(issues,typeof observation.minimumTargetPx==='number' && observation.minimumTargetPx<44,'TARGET_TOO_SMALL','block',view.id,UNKNOWN,UNKNOWN,UNKNOWN,String(observation.minimumTargetPx));
  }
  return issues;
}
export function auditBundle(input) {
  const bundle=parseBundle(input);
  const issues=[];
  const sources=new Map(bundle.sources.map(x=>[x.id,x]));
  const assets=bundle.assets.filter(a=>a.included==='yes');
  const included=bundle.views.filter(v=>v.included==='yes');
  const usedSourceIds=new Set();
  maybe(issues,included.length===0,'NO_INCLUDED_VIEWS','information');
  for(const view of bundle.views) {
    if(view.included===UNKNOWN)issues.push(f('VIEW_UNKNOWN','block',view.id));
    if(view.included!=='yes')continue;
    maybe(issues,view.route===UNKNOWN,'VIEW_ROUTE_UNKNOWN','block',view.id);
    maybe(issues,view.titleEn===UNKNOWN || view.titleFr===UNKNOWN,'VIEW_TITLE_UNKNOWN','block',view.id);
    const viewAssets=assets.filter(a=>a.viewId===view.id);
    maybe(issues,viewAssets.length===0,'VIEW_NO_ASSETS','block',view.id);
    for(const method of METHODS) {
      const observation=bundle.observations.find(o=>o.viewId===view.id&&o.method===method);
      if(!observation)issues.push(f('OBSERVATION_MISSING','block',view.id,UNKNOWN,UNKNOWN,UNKNOWN,method));
      else issues.push(...observationFindings(view,observation));
    }
    for(const asset of bundle.assets.filter(a=>a.viewId===view.id)) {
      if(asset.included===UNKNOWN)issues.push(f('ASSET_UNKNOWN','block',view.id,asset.id));
      if(asset.included==='no') {issues.push(f('HELD_ASSET','information',view.id,asset.id));continue;}
      if(asset.included!=='yes')continue;
      maybe(issues,asset.sourceIds.length===0,'ASSET_NO_SOURCES','block',view.id,asset.id);
      const assetUses=bundle.uses.filter(u=>u.assetId===asset.id);
      maybe(issues,assetUses.length===0,'ASSET_NO_USES','block',view.id,asset.id);
      const families=new Set(asset.sourceIds.map(id=>sources.get(id)?.family).filter(Boolean));
      maybe(issues,families.has('ODbL')&&families.size>1,'MIXED_LICENCE_FAMILIES','attention',view.id,asset.id);
      for(const sourceId of asset.sourceIds) {
        usedSourceIds.add(sourceId);
        const source=sources.get(sourceId);
        const use=assetUses.find(u=>u.sourceId===sourceId);
        if(!use){issues.push(f('USE_MISSING','block',view.id,asset.id,sourceId));continue;}
        maybe(issues,use.required===UNKNOWN,'USE_UNKNOWN','block',view.id,asset.id,sourceId);
        if(use.required==='no')continue;
        issues.push(...sourceFindings(source,view.id,asset.id));
        for(const locale of ['en','fr'])issues.push(...noticeFindings(bundle,use,asset,source,locale,
          bundle.notices.find(n=>n.useId===use.id&&n.locale===locale)));
      }
    }
  }
  for(const source of bundle.sources)if(!usedSourceIds.has(source.id))issues.push(f('UNUSED_SOURCE','information',UNKNOWN,UNKNOWN,source.id));
  issues.sort((a,b)=>ORDER[a.severity]-ORDER[b.severity]||a.viewId.localeCompare(b.viewId)||a.assetId.localeCompare(b.assetId)||a.sourceId.localeCompare(b.sourceId)||a.locale.localeCompare(b.locale)||a.code.localeCompare(b.code));
  const totals={block:issues.filter(x=>x.severity==='block').length,attention:issues.filter(x=>x.severity==='attention').length,information:issues.filter(x=>x.severity==='information').length,
    includedViews:included.length,includedAssets:assets.filter(a=>included.some(v=>v.id===a.viewId)).length};
  return {schema:'map-notice-bundle-audit/1',title:bundle.title,totals,status:totals.block?'blocked':included.length?'manual-review':'no-candidates',findings:issues};
}
export function missingNoticeSlots(input) {
  const bundle=parseBundle(input);
  const ids=new Set(bundle.notices.map(n=>`${n.useId}/${n.locale}`));
  const views=new Map(bundle.views.map(x=>[x.id,x]));
  const assets=new Map(bundle.assets.map(x=>[x.id,x]));
  const rows=[];
  for(const use of bundle.uses) {
    const view=views.get(use.viewId),asset=assets.get(use.assetId);
    if(view.included!=='yes'||asset.included!=='yes'||use.required!=='yes')continue;
    for(const locale of ['en','fr'])if(!ids.has(`${use.id}/${locale}`))rows.push({useId:use.id,viewId:use.viewId,assetId:use.assetId,sourceId:use.sourceId,locale});
  }
  return rows.sort((a,b)=>a.useId.localeCompare(b.useId)||a.locale.localeCompare(b.locale));
}
export function viewCoverage(input) {
  const bundle=parseBundle(input),report=auditBundle(bundle);
  return bundle.views.map(view=>{
    const assets=bundle.assets.filter(x=>x.viewId===view.id&&x.included==='yes');
    const uses=bundle.uses.filter(x=>assets.some(a=>a.id===x.assetId)&&x.required==='yes');
    return {viewId:view.id,titleEn:view.titleEn,titleFr:view.titleFr,route:view.route,included:view.included,
      assetCount:assets.length,sourceCount:new Set(uses.map(x=>x.sourceId)).size,
      expectedNotices:uses.length*2,recordedNotices:bundle.notices.filter(n=>uses.some(u=>u.id===n.useId)).length,
      blockingGaps:report.findings.filter(f=>f.viewId===view.id&&f.severity==='block').length};
  });
}
export function compareBundles(previous,candidate) {
  const before=parseBundle(previous),after=parseBundle(candidate);
  const old=auditBundle(before),next=auditBundle(after);
  const key=f=>[f.code,f.viewId,f.assetId,f.sourceId,f.locale,f.detail].join('|');
  const oldSet=new Set(old.findings.map(key)),nextSet=new Set(next.findings.map(key));
  const added=next.findings.filter(f=>!oldSet.has(key(f)));
  const resolved=old.findings.filter(f=>!nextSet.has(key(f)));
  const includedRemoved=before.views.filter(v=>v.included==='yes'&&!after.views.some(x=>x.id===v.id&&x.included==='yes')).map(x=>x.id);
  const creditChanged=before.sources.filter(s=>after.sources.some(x=>x.id===s.id&&x.credit!==s.credit)).map(x=>x.id);
  const licenceChanged=before.sources.filter(s=>after.sources.some(x=>x.id===s.id&&(x.licence!==s.licence||x.licenceUrl!==s.licenceUrl))).map(x=>x.id);
  return {schema:'map-notice-bundle-comparison/1',added,resolved,includedRemoved,creditChanged,licenceChanged,
    blocking:added.some(f=>f.severity==='block')||includedRemoved.length>0||creditChanged.length>0||licenceChanged.length>0,
    before:old.totals,after:next.totals};
}
