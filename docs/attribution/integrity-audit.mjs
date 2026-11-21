import {parseRegister,UNKNOWN,OSM_CREDIT,METHODS,creditIsOsm} from './integrity-core.mjs';

/** Only published assets are release candidates. These are evidence gaps, not access facts. */
const priority={block:0,attention:1,information:2};
const unknown=x=>x===UNKNOWN||x===null||x===undefined||x==='';
const issue=(code,severity,assetId=UNKNOWN,sourceId=UNKNOWN,method=UNKNOWN,detail=UNKNOWN)=>({code,severity,assetId,sourceId,method,detail});
const add=(out,code,severity,assetId,sourceId,method,detail)=>out.push(issue(code,severity,assetId,sourceId,method,detail));
export const CODES=Object.freeze([
 'NO_INCLUDED_ASSETS','ASSET_WITHOUT_SOURCE','ASSET_ROUTE_UNKNOWN','ASSET_KIND_UNKNOWN',
 'ASSET_HASH_UNKNOWN','ASSET_BYTES_UNKNOWN','SOURCE_URL_UNKNOWN','LICENCE_UNKNOWN',
 'LICENCE_URL_UNKNOWN','RETRIEVAL_UNKNOWN','TIER_UNKNOWN','SOURCE_CREDIT_UNKNOWN',
 'PERMISSION_UNKNOWN','PERMISSION_DENIED','OSM_EXACT_CREDIT','CHECK_MISSING',
 'OBSERVED_ON_UNKNOWN','NOTICE_TEXT_UNKNOWN','CREDIT_NOT_PRESENT','CREDIT_UNKNOWN',
 'NOTICE_MISSING_CREDIT','LICENCE_NOT_SHOWN','LICENCE_SHOWN_UNKNOWN',
 'PLACEMENT_UNKNOWN','OSM_NOT_BESIDE_MAP','KEYBOARD_FOCUS_UNKNOWN',
 'KEYBOARD_FOCUS_ABSENT','TOUCH_TARGET_UNKNOWN','TOUCH_TARGET_SMALL',
 'EVIDENCE_UNKNOWN','MEASUREMENT_MISSING','MEASUREMENT_DATE_UNKNOWN',
 'MEASUREMENT_DIGEST_UNKNOWN','MEASUREMENT_BYTES_UNKNOWN','FILE_HASH_MISMATCH',
 'FILE_LENGTH_MISMATCH','MEASUREMENT_CONFLICT','HELD_ASSET','UNUSED_SOURCE',
 'UNUSED_CHECK','UNUSED_MEASUREMENT',
]);
export function measurementMatches(asset,measurement) {
  if(!asset||!measurement||asset.id!==measurement.assetId) return 'unrelated';
  if(unknown(asset.sha256)||unknown(asset.byteLength)||unknown(measurement.sha256)||unknown(measurement.byteLength)) return 'UNKNOWN';
  return asset.sha256===measurement.sha256&&asset.byteLength===measurement.byteLength?'match':'mismatch';
}
export function auditRegister(input) {
  const data=parseRegister(input),findings=[];
  const published=data.assets.filter(x=>x.status==='included');
  const activeIds=new Set(published.map(x=>x.id));
  const activeSourceIds=new Set(published.flatMap(x=>x.sourceIds));
  const bySource=new Map(data.sources.map(x=>[x.id,x]));
  const checksBySlot=new Map(data.checks.map(x=>[[x.assetId,x.sourceId,x.method].join('|'),x]));
  const measurementsByAsset=new Map();
  for(const measurement of data.measurements) {
    const group=measurementsByAsset.get(measurement.assetId)??[];
    group.push(measurement); measurementsByAsset.set(measurement.assetId,group);
  }
  if(!published.length) add(findings,'NO_INCLUDED_ASSETS','information');
  for(const asset of data.assets) {
    if(asset.status!=='included') {add(findings,'HELD_ASSET','information',asset.id);continue;}
    if(!asset.sourceIds.length) add(findings,'ASSET_WITHOUT_SOURCE','block',asset.id);
    if(unknown(asset.route)) add(findings,'ASSET_ROUTE_UNKNOWN','block',asset.id);
    if(unknown(asset.kind)) add(findings,'ASSET_KIND_UNKNOWN','block',asset.id);
    if(unknown(asset.sha256)) add(findings,'ASSET_HASH_UNKNOWN','block',asset.id);
    if(unknown(asset.byteLength)) add(findings,'ASSET_BYTES_UNKNOWN','block',asset.id);
    const measurements=measurementsByAsset.get(asset.id)??[];
    if(!measurements.length) add(findings,'MEASUREMENT_MISSING','block',asset.id);
    const known=new Set();
    for(const m of measurements) {
      if(unknown(m.checkedOn)) add(findings,'MEASUREMENT_DATE_UNKNOWN','block',asset.id,UNKNOWN,UNKNOWN,m.id);
      if(unknown(m.sha256)) add(findings,'MEASUREMENT_DIGEST_UNKNOWN','block',asset.id,UNKNOWN,UNKNOWN,m.id);
      if(unknown(m.byteLength)) add(findings,'MEASUREMENT_BYTES_UNKNOWN','block',asset.id,UNKNOWN,UNKNOWN,m.id);
      if(!unknown(m.sha256)&&!unknown(m.byteLength)) known.add(`${m.sha256}|${m.byteLength}`);
      if(!unknown(m.sha256)&&!unknown(asset.sha256)&&m.sha256!==asset.sha256) add(findings,'FILE_HASH_MISMATCH','block',asset.id,UNKNOWN,UNKNOWN,m.id);
      if(!unknown(m.byteLength)&&!unknown(asset.byteLength)&&m.byteLength!==asset.byteLength) add(findings,'FILE_LENGTH_MISMATCH','block',asset.id,UNKNOWN,UNKNOWN,m.id);
    }
    if(known.size>1) add(findings,'MEASUREMENT_CONFLICT','block',asset.id);
    for(const sourceId of asset.sourceIds) {
      const source=bySource.get(sourceId);
      if(unknown(source.sourceUrl)) add(findings,'SOURCE_URL_UNKNOWN','block',asset.id,sourceId);
      if(unknown(source.licence)) add(findings,'LICENCE_UNKNOWN','block',asset.id,sourceId);
      if(unknown(source.licenceUrl)) add(findings,'LICENCE_URL_UNKNOWN','block',asset.id,sourceId);
      if(unknown(source.retrievedOn)) add(findings,'RETRIEVAL_UNKNOWN','block',asset.id,sourceId);
      if(unknown(source.tier)) add(findings,'TIER_UNKNOWN','block',asset.id,sourceId);
      if(unknown(source.credit)) add(findings,'SOURCE_CREDIT_UNKNOWN','block',asset.id,sourceId);
      if(source.permission!=='yes') add(findings,source.permission==='no'?'PERMISSION_DENIED':'PERMISSION_UNKNOWN','block',asset.id,sourceId);
      const osm=creditIsOsm(source);
      if(osm&&source.credit!==OSM_CREDIT) add(findings,'OSM_EXACT_CREDIT','block',asset.id,sourceId);
      for(const method of METHODS) {
        const check=checksBySlot.get([asset.id,sourceId,method].join('|'));
        if(!check) {add(findings,'CHECK_MISSING','block',asset.id,sourceId,method);continue;}
        if(unknown(check.observedOn)) add(findings,'OBSERVED_ON_UNKNOWN','block',asset.id,sourceId,method);
        if(unknown(check.noticeText)) add(findings,'NOTICE_TEXT_UNKNOWN','block',asset.id,sourceId,method);
        else if(!unknown(source.credit)&&!check.noticeText.includes(source.credit)) add(findings,'NOTICE_MISSING_CREDIT','block',asset.id,sourceId,method);
        if(check.creditPresent!=='yes') add(findings,check.creditPresent==='no'?'CREDIT_NOT_PRESENT':'CREDIT_UNKNOWN','block',asset.id,sourceId,method);
        if(check.licenceShown!=='yes') add(findings,check.licenceShown==='no'?'LICENCE_NOT_SHOWN':'LICENCE_SHOWN_UNKNOWN','block',asset.id,sourceId,method);
        if(check.placement===UNKNOWN||check.placement==='absent') add(findings,'PLACEMENT_UNKNOWN','block',asset.id,sourceId,method);
        if(osm && ['basemap','geometry','overlay'].includes(asset.kind) && check.placement!=='beside-map') add(findings,'OSM_NOT_BESIDE_MAP','block',asset.id,sourceId,method);
        if(method==='keyboard'&&check.focusVisible!=='yes') add(findings,check.focusVisible==='no'?'KEYBOARD_FOCUS_ABSENT':'KEYBOARD_FOCUS_UNKNOWN','block',asset.id,sourceId,method);
        if(method==='touch') {
          if(check.targetPx===UNKNOWN) add(findings,'TOUCH_TARGET_UNKNOWN','block',asset.id,sourceId,method);
          else if(check.targetPx<44) add(findings,'TOUCH_TARGET_SMALL','block',asset.id,sourceId,method);
        }
        if(unknown(check.evidence)) add(findings,'EVIDENCE_UNKNOWN','attention',asset.id,sourceId,method);
      }
    }
  }
  for(const source of data.sources) if(!activeSourceIds.has(source.id)) add(findings,'UNUSED_SOURCE','information',UNKNOWN,source.id);
  for(const check of data.checks) if(!activeIds.has(check.assetId)) add(findings,'UNUSED_CHECK','information',check.assetId,check.sourceId,check.method);
  for(const m of data.measurements) if(!activeIds.has(m.assetId)) add(findings,'UNUSED_MEASUREMENT','information',m.assetId,UNKNOWN,UNKNOWN,m.id);
  findings.sort((a,b)=>priority[a.severity]-priority[b.severity]||a.assetId.localeCompare(b.assetId)||a.sourceId.localeCompare(b.sourceId)||a.method.localeCompare(b.method)||a.code.localeCompare(b.code));
  const totals={block:0,attention:0,information:0};
  for(const row of findings) totals[row.severity]++;
  return {schema:'map-source-file-integrity-audit/1',title:data.title,totals,publication:!published.length?'no-candidates':totals.block?'blocked':'review-needed',includedAssets:published.map(x=>x.id),findings};
}
export function missingSlots(input) {
  const data=parseRegister(input);
  const occupied=new Set(data.checks.map(x=>`${x.assetId}|${x.sourceId}|${x.method}`));
  const result=[];
  for(const asset of data.assets.filter(x=>x.status==='included')) for(const sourceId of asset.sourceIds) for(const method of METHODS) {
    if(!occupied.has(`${asset.id}|${sourceId}|${method}`)) result.push({assetId:asset.id,sourceId,method});
  }
  return result;
}
export function coverageRows(input) {
  const data=parseRegister(input),report=auditRegister(data);
  const sources=new Map(data.sources.map(x=>[x.id,x]));
  const checks=new Map(data.checks.map(x=>[[x.assetId,x.sourceId,x.method].join('|'),x]));
  const measurements=new Map();
  for(const m of data.measurements) {const all=measurements.get(m.assetId)??[];all.push(m);measurements.set(m.assetId,all);}
  const rows=[];
  for(const asset of data.assets) for(const sourceId of asset.sourceIds) for(const method of METHODS) {
    const source=sources.get(sourceId),check=checks.get([asset.id,sourceId,method].join('|'));
    const findings=report.findings.filter(x=>x.assetId===asset.id && (x.sourceId===sourceId||x.sourceId===UNKNOWN) && (x.method===method||x.method===UNKNOWN));
    rows.push({assetId:asset.id,asset:asset.label,status:asset.status,kind:asset.kind,route:asset.route,
      sourceId,source:source.name,licence:source.licence,retrievedOn:source.retrievedOn,tier:source.tier,
      expectedSha256:asset.sha256,expectedBytes:asset.byteLength,measurementCount:(measurements.get(asset.id)??[]).length,
      method,checkId:check?.id??UNKNOWN,notice:check?.noticeText??UNKNOWN,
      placement:check?.placement??UNKNOWN,observedOn:check?.observedOn??UNKNOWN,
      gapCount:findings.filter(x=>x.severity==='block').length,
      state:asset.status!=='included'?'held':!check?'missing':findings.some(x=>x.severity==='block')?'gap':'recorded'});
  }
  return rows;
}
export function sourceImpact(input,sourceId) {
  const state=parseRegister(input);
  if(!state.sources.some(x=>x.id===sourceId)) return {sourceId,assets:[],checks:[],measurements:[],findings:[]};
  const assets=state.assets.filter(x=>x.sourceIds.includes(sourceId));
  const ids=new Set(assets.map(x=>x.id));
  const report=auditRegister(state);
  return {sourceId,assets,checks:state.checks.filter(x=>x.sourceId===sourceId),
    measurements:state.measurements.filter(x=>ids.has(x.assetId)),
    findings:report.findings.filter(x=>x.sourceId===sourceId||ids.has(x.assetId)&&x.sourceId===UNKNOWN)};
}
export function compareRegisters(previous,candidate) {
  const before=parseRegister(previous),after=parseRegister(candidate);
  const old=auditRegister(before),next=auditRegister(after),findings=[];
  const key=x=>[x.code,x.assetId,x.sourceId,x.method,x.detail].join('|');
  const oldSet=new Set(old.findings.map(key)),nextSet=new Set(next.findings.map(key));
  const introduced=next.findings.filter(x=>!oldSet.has(key(x)));
  const resolved=old.findings.filter(x=>!nextSet.has(key(x)));
  const nextAssets=new Map(after.assets.map(x=>[x.id,x]));
  const nextSources=new Map(after.sources.map(x=>[x.id,x]));
  const nextMeasurements=new Map(after.measurements.map(x=>[x.id,x]));
  for(const asset of before.assets.filter(x=>x.status==='included')) {
    const current=nextAssets.get(asset.id);
    if(!current||current.status!=='included') findings.push(issue('INCLUDED_ASSET_REMOVED','block',asset.id));
    else {
      for(const field of ['sha256','byteLength','kind','route','fileName']) if(asset[field]!==current[field]) findings.push(issue('ASSET_EVIDENCE_CHANGED','block',asset.id,UNKNOWN,UNKNOWN,field));
      for(const id of asset.sourceIds) if(!current.sourceIds.includes(id)) findings.push(issue('ASSET_SOURCE_REMOVED','block',asset.id,id));
    }
    for(const sourceId of asset.sourceIds) {
      const oldSource=before.sources.find(x=>x.id===sourceId),newSource=nextSources.get(sourceId);
      if(!newSource) {findings.push(issue('SOURCE_REMOVED','block',asset.id,sourceId));continue;}
      for(const field of ['sourceUrl','licence','licenceUrl','retrievedOn','tier','credit','permission']) if(oldSource[field]!==newSource[field]) findings.push(issue('SOURCE_CHANGED','attention',asset.id,sourceId,UNKNOWN,field));
    }
    for(const measurement of before.measurements.filter(x=>x.assetId===asset.id)) {
      const recent=nextMeasurements.get(measurement.id);
      if(!recent) findings.push(issue('MEASUREMENT_REMOVED','block',asset.id,UNKNOWN,UNKNOWN,measurement.id));
      else for(const field of ['sha256','byteLength','checkedOn']) if(measurement[field]!==recent[field]) findings.push(issue('MEASUREMENT_CHANGED','block',asset.id,UNKNOWN,UNKNOWN,field));
    }
  }
  return {schema:'map-source-file-integrity-comparison/1',introduced,resolved,regressions:findings,
    worsened:introduced.some(x=>x.severity==='block')||findings.some(x=>x.severity==='block'),
    before:old.totals,after:next.totals};
}
