import { parseInputs, prospectivePairs } from './parity-core.mjs';
import { OSM_CREDIT, UNKNOWN } from './trace-core.mjs';

export const PARITY_REPORT_SCHEMA='attribution-locale-parity-report/1';
const UNKNOWNISH = value => value===UNKNOWN || value==='' || value===null || value===undefined;
function keysForNotices(trace) {
  const map=new Map();
  for(const item of trace.notices) map.set(`${item.layerId}|${item.surfaceId}|${item.sourceId}`,item);
  return map;
}
function considered(trace,surfaceId) {
  const slots=[];
  for(const layer of trace.layers.filter(l=>l.status==='included'&&l.surfaceIds.includes(surfaceId))) {
    for(const sourceId of layer.sourceIds) slots.push({layer,sourceId});
  }
  return slots.sort((a,b)=>a.layer.id.localeCompare(b.layer.id)||a.sourceId.localeCompare(b.sourceId));
}
function sourceMap(trace) {return new Map(trace.sources.map(x=>[x.id,x]));}
function pairFindings(trace,pair) {
  const issues=[];
  const surfaces=new Map(trace.surfaces.map(x=>[x.id,x]));
  const notices=keysForNotices(trace),sources=sourceMap(trace);
  const en=surfaces.get(pair.enSurfaceId),fr=surfaces.get(pair.frSurfaceId);
  const left=considered(trace,en.id),right=considered(trace,fr.id);
  function add(code,severity='block',side='pair',layerId=UNKNOWN,sourceId=UNKNOWN) {
    issues.push({pairId:pair.id,code,severity,side,layerId,sourceId});
  }
  if(pair.state==='included') {
    if(pair.reviewedOn===UNKNOWN)add('REVIEW_DATE_UNKNOWN');
    if(pair.reviewTier===UNKNOWN)add('REVIEW_TIER_UNKNOWN');
    if(pair.evidenceUrl===UNKNOWN)add('REVIEW_EVIDENCE_UNKNOWN');
    if(pair.parityObserved!=='yes')add(pair.parityObserved==='no'?'PARITY_RECORDED_NO':'PARITY_OBSERVATION_UNKNOWN');
  }
  if(en.route===UNKNOWN)add('EN_ROUTE_UNKNOWN','block','en');
  if(fr.route===UNKNOWN)add('FR_ROUTE_UNKNOWN','block','fr');
  const pairs=[{surface:en,slots:left,side:'en'},{surface:fr,slots:right,side:'fr'}];
  for(const {surface,slots,side} of pairs) {
    for(const field of ['keyboard','screenReader','focusVisible']) if(surface[field]!=='yes')add('ACCESS_EVIDENCE_MISSING','block',side,UNKNOWN,field);
    if(surface.minimumTargetPx===UNKNOWN||surface.minimumTargetPx<44)add('TARGET_BELOW_44_OR_UNKNOWN','block',side);
    if(surface.mapShown===UNKNOWN)add('MAP_STATUS_UNKNOWN','block',side);
    for(const {layer,sourceId} of slots) {
      const source=sources.get(sourceId);
      const notice=notices.get(`${layer.id}|${surface.id}|${sourceId}`);
      if(UNKNOWNISH(source.licence)||UNKNOWNISH(source.licenceUrl))add('LICENCE_UNKNOWN','block',side,layer.id,sourceId);
      if(UNKNOWNISH(source.sourceUrl))add('SOURCE_URL_UNKNOWN','block',side,layer.id,sourceId);
      if(UNKNOWNISH(source.retrievedOn))add('RETRIEVAL_UNKNOWN','block',side,layer.id,sourceId);
      if(UNKNOWNISH(source.tier))add('TIER_UNKNOWN','block',side,layer.id,sourceId);
      if(source.permission!=='yes')add('PERMISSION_NOT_RECORDED','block',side,layer.id,sourceId);
      if(!notice) {add('NOTICE_MISSING','block',side,layer.id,sourceId);continue;}
      if(UNKNOWNISH(notice.text)||UNKNOWNISH(source.credit)||!notice.text.includes(source.credit))add('CREDIT_TEXT_MISSING','block',side,layer.id,sourceId);
      if(notice.visible!=='yes'||notice.readable!=='yes'||notice.focusable!=='yes')add('NOTICE_ACCESS_INCOMPLETE','block',side,layer.id,sourceId);
      if(notice.observedOn===UNKNOWN)add('NOTICE_DATE_UNKNOWN','block',side,layer.id,sourceId);
      if(notice.placement===UNKNOWN||notice.placement==='not-shown')add('NOTICE_PLACEMENT_UNKNOWN','block',side,layer.id,sourceId);
      const osm = source.credit===OSM_CREDIT || /\bODbL\b/iu.test(source.licence);
      if(osm && source.credit!==OSM_CREDIT)add('OSM_EXACT_CREDIT','block',side,layer.id,sourceId);
      if(osm && (surface.mapShown==='yes') && layer.geometrySourceIds.includes(sourceId) && notice.placement!=='adjacent')add('OSM_NEAR_MAP','block',side,layer.id,sourceId);
    }
  }
  // Pairing does not imply identical layer IDs: compare the set of actual source IDs.
  const enSources=new Set(left.map(x=>x.sourceId)),frSources=new Set(right.map(x=>x.sourceId));
  for(const sourceId of enSources)if(!frSources.has(sourceId))add('SOURCE_ABSENT_IN_FR','block','fr',UNKNOWN,sourceId);
  for(const sourceId of frSources)if(!enSources.has(sourceId))add('SOURCE_ABSENT_IN_EN','block','en',UNKNOWN,sourceId);
  if(!left.length&&!right.length)add('NO_INCLUDED_LAYERS','attention');
  if(!left.length&&right.length)add('EN_HAS_NO_INCLUDED_LAYERS');
  if(!right.length&&left.length)add('FR_HAS_NO_INCLUDED_LAYERS');
  // Different credits for the same shared source are not inferred: the single source record owns the credit.
  const severities={block:0,attention:1,information:2};
  issues.sort((a,b)=>severities[a.severity]-severities[b.severity]||a.code.localeCompare(b.code)||a.side.localeCompare(b.side)||a.sourceId.localeCompare(b.sourceId)||a.layerId.localeCompare(b.layerId));
  return {pairId:pair.id,enSurfaceId:en.id,frSurfaceId:fr.id,status:pair.state,
    sources:{en:[...enSources].sort(),fr:[...frSources].sort()},
    includedLayerCount:{en:left.length,fr:right.length},findings:issues,blocked:issues.some(x=>x.severity==='block')};
}
export function auditParity(trace,register) {
  const state=parseInputs(trace,register);
  const results=state.register.pairs.map(x=>pairFindings(state.trace,x));
  const findings=results.flatMap(x=>x.findings);
  const included=results.filter(x=>x.status==='included');
  const loose=prospectivePairs(state.trace,state.register);
  // Never publish a misleading green result for an empty pairing register.
  if(!included.length)findings.push({pairId:UNKNOWN,code:'NO_INCLUDED_PAIRS',severity:'block',side:'pair',layerId:UNKNOWN,sourceId:UNKNOWN});
  for(const surface of [...loose.en,...loose.fr]) {
    const used=state.trace.layers.some(layer=>layer.status==='included'&&layer.surfaceIds.includes(surface.id));
    if(used)findings.push({pairId:UNKNOWN,code:'UNPAIRED_INCLUDED_VIEW',severity:'block',side:surface.id,layerId:UNKNOWN,sourceId:UNKNOWN});
  }
  return {schema:PARITY_REPORT_SCHEMA,title:state.register.title,
    paired:results.length,includedPairs:included.length,missingEnglishViews:loose.en.length,missingFrenchViews:loose.fr.length,
    counts:{blocking:findings.filter(f=>f.severity==='block').length,attention:findings.filter(f=>f.severity==='attention').length},
    blocked:findings.some(f=>f.severity==='block'),pairs:results,findings};
}
function findingKey(x) {return [x.pairId,x.code,x.side,x.layerId,x.sourceId].join('|');}
export function compareParity(oldTrace,oldPairs,newTrace,newPairs) {
  const before=auditParity(oldTrace,oldPairs),after=auditParity(newTrace,newPairs);
  const old=new Set(before.findings.map(findingKey)),next=new Set(after.findings.map(findingKey));
  const introduced=after.findings.filter(f=>!old.has(findingKey(f)));
  const resolved=before.findings.filter(f=>!next.has(findingKey(f)));
  const removed=before.pairs.filter(p=>p.status==='included'&&!after.pairs.some(n=>n.pairId===p.pairId&&n.status==='included')).map(p=>p.pairId);
  return {schema:'attribution-locale-parity-comparison/1',before:before.counts,after:after.counts,
    introduced,resolved,removedIncludedPairs:removed,worsened:introduced.some(x=>x.severity==='block')||removed.length>0};
}
