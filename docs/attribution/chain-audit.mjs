/** Publication checks are evidence checks, not certification or permission grants. */
import {parseChain,UNKNOWN,OSM_CREDIT} from './chain-core.mjs';
import {cycles,sourceReach,disclosurePaths} from './chain-graph.mjs';
const SORT={block:0,caution:1,info:2};
const issue=(severity,code,path,detail=UNKNOWN)=>({severity,code,path,detail});
export function auditChain(input,{includeDrafts=false}={}){
  const chain=parseChain(input),findings=[];
  const record=(severity,code,path,detail)=>findings.push(issue(severity,code,path,detail));
  const usedSources=new Set(chain.assets.filter(a=>includeDrafts||a.state==='included').flatMap(a=>a.sourceIds));
  const usedAssets=new Set(chain.assets.filter(a=>includeDrafts||a.state==='included').map(a=>a.id));
  const includedSurfaces=chain.surfaces.filter(x=>x.included==='yes');
  const activeAssets=chain.assets.filter(x=>usedAssets.has(x.id));
  for(const source of chain.sources){
    const path=`sources.${source.id}`;
    if(!usedSources.has(source.id)){record('info','UNUSED_SOURCE',path);continue;}
    for(const field of ['url','licence','licenceUrl','retrievedOn','credit','tier'])if(source[field]===UNKNOWN)record('block',`SOURCE_${field.toUpperCase()}_UNKNOWN`,`${path}.${field}`);
    if(source.permission!=='yes')record('block','SOURCE_PERMISSION_NOT_ESTABLISHED',`${path}.permission`,source.permission);
    if(source.licence==='ODbL'&&source.credit!==OSM_CREDIT)record('block','OSM_CREDIT_NOT_EXACT',`${path}.credit`,source.credit);
  }
  for(const asset of activeAssets){
    const path=`assets.${asset.id}`;
    if(!asset.sourceIds.length)record('block','ASSET_WITHOUT_SOURCE',`${path}.sourceIds`);
    if(asset.sha256===UNKNOWN)record('block','ASSET_HASH_UNKNOWN',`${path}.sha256`);
    if(asset.bytes===UNKNOWN)record('caution','ASSET_SIZE_UNKNOWN',`${path}.bytes`);
    if(asset.retrievedOn===UNKNOWN)record('block','ASSET_RETRIEVAL_UNKNOWN',`${path}.retrievedOn`);
    for(const parentId of asset.parentIds){
      const parent=chain.assets.find(x=>x.id===parentId);
      if(parent&&parent.retrievedOn!==UNKNOWN&&asset.retrievedOn!==UNKNOWN&&parent.retrievedOn>asset.retrievedOn)record('block','PARENT_NEWER_THAN_DERIVATIVE',`${path}.parentIds`,parentId);
      if(parent&&parent.state==='withdrawn')record('block','WITHDRAWN_PARENT',`${path}.parentIds`,parentId);
    }
    if(asset.state==='withdrawn')record('block','WITHDRAWN_ASSET',path);
  }
  for(const kind of ['asset','receipt'])for(const cycle of cycles(chain,kind))record('block','PROVENANCE_CYCLE',`${kind}s.${cycle[0]}`,cycle.join(' -> '));
  for(const surface of includedSurfaces){
    const path=`surfaces.${surface.id}`;
    if(surface.route===UNKNOWN)record('block','SURFACE_ROUTE_UNKNOWN',`${path}.route`);
    for(const field of ['keyboard','screenReader','focusVisible'])if(surface[field]!=='yes')record('block',`SURFACE_${field.toUpperCase()}_UNKNOWN`,`${path}.${field}`,surface[field]);
    if(surface.minimumTargetPx===UNKNOWN||surface.minimumTargetPx<44)record('block','TARGET_BELOW_44_OR_UNKNOWN',`${path}.minimumTargetPx`,String(surface.minimumTargetPx));
    if(!chain.notices.some(n=>n.surfaceId===surface.id&&usedAssets.has(n.assetId)))record('block','INCLUDED_SURFACE_WITHOUT_NOTICE',path);
  }
  for(const notice of chain.notices){
    if(!usedAssets.has(notice.assetId))continue;
    const surface=chain.surfaces.find(x=>x.id===notice.surfaceId);
    if(surface.included!=='yes')continue;
    const source=chain.sources.find(x=>x.id===notice.sourceId);
    const path=`notices.${notice.id}`;
    if(notice.text===UNKNOWN||!notice.text.includes(source.credit)||source.credit===UNKNOWN)record('block','NOTICE_CREDIT_MISSING',`${path}.text`,notice.sourceId);
    if(notice.placement===UNKNOWN||notice.placement==='missing')record('block','NOTICE_LOCATION_UNKNOWN',`${path}.placement`);
    if(source.licence==='ODbL'&&surface.kind==='map'&&surface.mapShown==='yes'&&notice.placement!=='near-map')record('block','OSM_NEAR_MAP_REQUIRED',`${path}.placement`);
    if(source.licence==='ODbL'&&!notice.text.includes(OSM_CREDIT))record('block','OSM_NOTICE_EXACT_CREDIT_MISSING',`${path}.text`);
    for(const field of ['visible','readable','keyboard'])if(notice[field]!=='yes')record('block',`NOTICE_${field.toUpperCase()}_UNKNOWN`,`${path}.${field}`,notice[field]);
    if(notice.observedOn===UNKNOWN)record('block','NOTICE_OBSERVATION_DATE_UNKNOWN',`${path}.observedOn`);
    if(notice.evidenceRef===UNKNOWN)record('caution','NOTICE_EVIDENCE_REFERENCE_UNKNOWN',`${path}.evidenceRef`);
  }
  const receiptPairs=new Map();
  for(const receipt of chain.receipts){
    const asset=chain.assets.find(a=>a.id===receipt.assetId);
    if(!usedAssets.has(asset.id))continue;
    const path=`receipts.${receipt.id}`;
    const key=`${receipt.assetId}|${receipt.sourceId}`;
    receiptPairs.set(key,[...(receiptPairs.get(key)??[]),receipt]);
    if(receipt.contentHash===UNKNOWN)record('block','RECEIPT_HASH_UNKNOWN',`${path}.contentHash`);
    else if(asset.sha256!==UNKNOWN&&receipt.contentHash!==asset.sha256)record('block','RECEIPT_ASSET_DIGEST_MISMATCH',`${path}.contentHash`,asset.id);
    if(receipt.status==='held')record('block','RECEIPT_HELD',`${path}.status`);
    if(receipt.tier===UNKNOWN)record('block','RECEIPT_EVIDENCE_TIER_UNKNOWN',`${path}.tier`);
    if(receipt.issuedOn===UNKNOWN)record('block','RECEIPT_DATE_UNKNOWN',`${path}.issuedOn`);
    if(receipt.evidenceRef===UNKNOWN)record('caution','RECEIPT_EVIDENCE_REFERENCE_UNKNOWN',`${path}.evidenceRef`);
    if(receipt.issuedOn!==UNKNOWN&&asset.retrievedOn!==UNKNOWN&&receipt.issuedOn<asset.retrievedOn)record('block','RECEIPT_BEFORE_ASSET',`${path}.issuedOn`);
    for(const priorId of receipt.parentIds){
      const parent=chain.receipts.find(x=>x.id===priorId);
      if(parent&&parent.issuedOn!==UNKNOWN&&receipt.issuedOn!==UNKNOWN&&parent.issuedOn>receipt.issuedOn)record('block','RECEIPT_BEFORE_PARENT',`${path}.parentIds`,priorId);
    }
  }
  for(const asset of activeAssets){
    for(const sourceId of asset.sourceIds){
      if(!receiptPairs.get(`${asset.id}|${sourceId}`)?.length)record('block','ASSET_SOURCE_RECEIPT_MISSING',`assets.${asset.id}.${sourceId}`);
    }
  }
  for(const asset of activeAssets)for(const sourceId of asset.sourceIds){
    const uses=chain.notices.filter(n=>n.assetId===asset.id&&n.sourceId===sourceId&&chain.surfaces.some(s=>s.id===n.surfaceId&&s.included==='yes'));
    if(!uses.length)record('block','ASSET_SOURCE_WITHOUT_PUBLIC_CREDIT',`assets.${asset.id}.${sourceId}`);
  }
  findings.sort((a,b)=>SORT[a.severity]-SORT[b.severity]||a.path.localeCompare(b.path)||a.code.localeCompare(b.code));
  const counts={block:0,caution:0,info:0};for(const finding of findings)counts[finding.severity]++;
  return {schema:'map-attribution-evidence-chain-audit/1',id:chain.id,title:chain.title,
    candidateAssets:activeAssets.length,includedSurfaces:includedSurfaces.length,
    status:counts.block?'blocked':counts.caution?'human-review-required':'recorded-evidence-only',counts,findings};
}
export function missingNoticeQueue(input){
  const chain=parseChain(input),expected=[];
  for(const asset of chain.assets.filter(a=>a.state==='included')){
    for(const sourceId of asset.sourceIds){
      const matches=chain.notices.filter(n=>n.assetId===asset.id&&n.sourceId===sourceId);
      if(!matches.some(n=>chain.surfaces.some(s=>s.id===n.surfaceId&&s.included==='yes')))expected.push({assetId:asset.id,sourceId,reason:'No notice on included surface'});
    }
  }
  return expected.sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.sourceId.localeCompare(b.sourceId));
}
export function missingReceiptQueue(input){
  const chain=parseChain(input),out=[];
  for(const asset of chain.assets.filter(a=>a.state==='included'))for(const sourceId of asset.sourceIds){
    if(!chain.receipts.some(r=>r.assetId===asset.id&&r.sourceId===sourceId))out.push({assetId:asset.id,sourceId,reason:'No receipt for asset/source pair'});
  }
  return out.sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.sourceId.localeCompare(b.sourceId));
}
export function assessSource(input,sourceId){
  const chain=parseChain(input),source=chain.sources.find(x=>x.id===sourceId);
  if(!source)return null;
  const reach=sourceReach(chain,sourceId),audit=auditChain(chain);
  return {sourceId,source,affected:reach,findings:audit.findings.filter(x=>x.path.startsWith(`sources.${sourceId}`)||x.path.includes(sourceId))};
}
export function reviewBySurface(input){
  const chain=parseChain(input),result=auditChain(chain),rows=[];
  for(const surface of chain.surfaces){
    const uses=disclosurePaths(chain,{surfaceId:surface.id});
    const issues=result.findings.filter(x=>x.path.startsWith(`surfaces.${surface.id}`)||uses.some(u=>x.path.startsWith(`notices.${u.noticeId}`)));
    rows.push({surfaceId:surface.id,locale:surface.locale,included:surface.included,route:surface.route,
      sourceCount:new Set(uses.map(u=>u.sourceId)).size,assetCount:new Set(uses.map(u=>u.assetId)).size,
      noticeCount:uses.length,issues:issues.length,blocking:issues.filter(x=>x.severity==='block').length});
  }
  return rows.sort((a,b)=>a.surfaceId.localeCompare(b.surfaceId));
}
