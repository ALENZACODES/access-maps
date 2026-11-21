import {parseChecklist,UNKNOWN,OSM_CREDIT,METHODS} from './checklist-core.mjs';

/** Evidence completeness checks, not a claim about a place or access rights. */
export function auditChecklist(input) {
  const state=parseChecklist(input);
  const findings=[];
  const add=(severity,code,viewId=UNKNOWN,sourceId=UNKNOWN,method=UNKNOWN,recordId=UNKNOWN)=>{
    findings.push({severity,code,viewId,sourceId,method,recordId});
  };
  const sourceMap=new Map(state.sources.map(x=>[x.id,x]));
  const observations=new Map(state.observations.map(x=>[[x.viewId,x.sourceId,x.method].join('|'),x]));
  const included=state.views.filter(x=>x.included==='yes');
  if(!included.length)add('information','NO_INCLUDED_VIEWS');
  for(const v of state.views){
    if(v.included===UNKNOWN)add('block','INCLUSION_UNKNOWN',v.id);
    if(v.included!=='yes')continue;
    if(v.route===UNKNOWN)add('block','ROUTE_UNKNOWN',v.id);
    if(!v.sourceIds.length)add('block','SOURCE_LIST_EMPTY',v.id);
    for(const sourceId of v.sourceIds){
      const s=sourceMap.get(sourceId);
      if(s.sourceUrl===UNKNOWN)add('block','SOURCE_URL_UNKNOWN',v.id,sourceId);
      if(s.licence===UNKNOWN)add('block','LICENCE_UNKNOWN',v.id,sourceId);
      if(s.licenceUrl===UNKNOWN)add('block','LICENCE_URL_UNKNOWN',v.id,sourceId);
      if(s.retrievedOn===UNKNOWN)add('block','RETRIEVAL_UNKNOWN',v.id,sourceId);
      if(s.tier===UNKNOWN)add('block','TIER_UNKNOWN',v.id,sourceId);
      if(s.permission!=='yes')add('block','PERMISSION_NOT_RECORDED',v.id,sourceId);
      if(s.credit===UNKNOWN)add('block','SOURCE_CREDIT_UNKNOWN',v.id,sourceId);
      if(s.datasetDate===UNKNOWN)add('information','DATASET_DATE_UNKNOWN',v.id,sourceId);
      const osm=s.credit===OSM_CREDIT||/\bODbL\b/iu.test(s.licence);
      if(osm&&s.credit!==OSM_CREDIT)add('block','OSM_CREDIT_INEXACT',v.id,sourceId);
      if(osm&&v.kind==='map'&&v.mapCreditNearMap!=='yes')add('block','MAP_CREDIT_NOT_ADJACENT',v.id,sourceId);
      for(const method of METHODS){
        const o=observations.get([v.id,sourceId,method].join('|'));
        if(!o){add('block','METHOD_MISSING',v.id,sourceId,method);continue;}
        const addO=(severity,code)=>add(severity,code,v.id,sourceId,method,o.id);
        if(o.observedOn===UNKNOWN)addO('block','OBSERVED_ON_UNKNOWN');
        if(o.noticeText===UNKNOWN)addO('block','NOTICE_TEXT_UNKNOWN');
        else if(s.credit!==UNKNOWN&&!o.noticeText.includes(s.credit))addO('block','CREDIT_NOT_DISPLAYED');
        if(osm&&!o.noticeText.includes(OSM_CREDIT))addO('block','OSM_NOTICE_MISSING');
        if(o.noticePresent!=='yes')addO('block','NOTICE_NOT_PRESENT');
        if(o.licenceAvailable!=='yes')addO('block','LICENCE_NOT_AVAILABLE');
        if(o.placement===UNKNOWN||o.placement==='hidden')addO('block','PLACEMENT_UNKNOWN');
        if(osm&&v.kind==='map'&&o.placement!=='near-map')addO('block','OSM_PLACEMENT');
        if(method==='keyboard'&&o.keyboardReachable!=='yes')addO('block','KEYBOARD_NOT_RECORDED');
        if(method==='keyboard'&&o.focusVisible!=='yes')addO('block','FOCUS_NOT_RECORDED');
        if(method==='screen-reader'&&o.screenReaderReadable!=='yes')addO('block','SCREEN_READER_NOT_RECORDED');
        if(method==='touch'&&(o.targetPx===UNKNOWN||o.targetPx<44))addO('block','TOUCH_TARGET_UNKNOWN_OR_SMALL');
        if(o.evidence===UNKNOWN)addO('attention','EVIDENCE_REFERENCE_UNKNOWN');
      }
    }
  }
  findings.sort((a,b)=>a.viewId.localeCompare(b.viewId)||a.sourceId.localeCompare(b.sourceId)||a.method.localeCompare(b.method)||a.code.localeCompare(b.code));
  const totals={block:findings.filter(x=>x.severity==='block').length,attention:findings.filter(x=>x.severity==='attention').length,information:findings.filter(x=>x.severity==='information').length};
  return {schema:'notice-publication-audit/1',title:state.title,includedViews:included.length,totals,findings,status:totals.block?'needs-attention':'manual-review-needed'};
}
export function missingChecklistSlots(input) {
  const state=parseChecklist(input);const seen=new Set(state.observations.map(x=>[x.viewId,x.sourceId,x.method].join('|')));
  const slots=[];
  for(const v of state.views.filter(x=>x.included==='yes'))for(const s of v.sourceIds)for(const method of METHODS){
    const key=[v.id,s,method].join('|');if(!seen.has(key))slots.push({viewId:v.id,sourceId:s,method});
  }
  return slots;
}
export function checklistMatrix(input) {
  const state=parseChecklist(input);const audit=auditChecklist(state);
  const sources=new Map(state.sources.map(x=>[x.id,x]));
  const observations=new Map(state.observations.map(x=>[[x.viewId,x.sourceId,x.method].join('|'),x]));
  const rows=[];
  for(const v of state.views)for(const sourceId of v.sourceIds)for(const method of METHODS){
    const s=sources.get(sourceId);const o=observations.get([v.id,sourceId,method].join('|'));
    const gaps=audit.findings.filter(f=>f.viewId===v.id&&f.sourceId===sourceId&&(f.method===method||f.method===UNKNOWN));
    rows.push({viewId:v.id,viewTitle:v.title,route:v.route,locale:v.locale,included:v.included,kind:v.kind,
      sourceId,sourceName:s.name,licence:s.licence,sourceUrl:s.sourceUrl,licenceUrl:s.licenceUrl,
      retrievedOn:s.retrievedOn,datasetDate:s.datasetDate,tier:s.tier,method,
      observationId:o?.id??UNKNOWN,observationDate:o?.observedOn??UNKNOWN,
      notice:o?.noticeText??UNKNOWN,placement:o?.placement??UNKNOWN,evidence:o?.evidence??UNKNOWN,
      gapCodes:gaps.map(f=>f.code),state:v.included!=='yes'?'held':!o?'missing':gaps.some(f=>f.severity==='block')?'gap':'documented'});
  }
  return rows;
}
export function compareChecklists(before,after){
  const prior=auditChecklist(before),next=auditChecklist(after);
  const key=f=>[f.code,f.viewId,f.sourceId,f.method,f.recordId].join('|');
  const old=new Set(prior.findings.map(key)),now=new Set(next.findings.map(key));
  const introduced=next.findings.filter(f=>!old.has(key(f)));
  const resolved=prior.findings.filter(f=>!now.has(key(f)));
  const oldIncluded=parseChecklist(before).views.filter(x=>x.included==='yes').map(x=>x.id);
  const current=new Set(parseChecklist(after).views.filter(x=>x.included==='yes').map(x=>x.id));
  const droppedViews=oldIncluded.filter(x=>!current.has(x));
  return {schema:'notice-publication-comparison/1',introduced,resolved,droppedViews,blocking:introduced.some(x=>x.severity==='block')||droppedViews.length>0};
}
export const MATRIX_COLUMNS=Object.freeze(['viewId','viewTitle','route','locale','included','kind','sourceId','sourceName','licence','sourceUrl','licenceUrl','retrievedOn','datasetDate','tier','method','observationId','observationDate','notice','placement','evidence','state','gapCodes']);
export function tsvCell(value){
  let text=Array.isArray(value)?value.join('; '):String(value??UNKNOWN);
  text=text.replace(/[\u0000-\u001f\u007f]/gu,' ');
  if(/^[\s]*[=+@-]/u.test(text))text=`'${text}`;
  return `"${text.replace(/"/gu,'""')}"`;
}
export function matrixTsv(rows){return [MATRIX_COLUMNS.map(tsvCell).join('\t'),...rows.map(row=>MATRIX_COLUMNS.map(key=>tsvCell(row[key])).join('\t'))].join('\n')+'\n';}
