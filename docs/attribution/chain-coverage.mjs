/** Coverage reconciliation across receipts, source rights and recorded notices. */
import {parseChain,UNKNOWN,OSM_CREDIT} from './chain-core.mjs';
import {auditChain,reviewBySurface} from './chain-audit.mjs';
import {disclosurePaths,sourceReach} from './chain-graph.mjs';
/** Coverage is recorded observation density, not a physical access rating. */
export function sourceCoverage(input){
  const chain=parseChain(input),rows=[];
  for(const source of chain.sources){
    const receipts=chain.receipts.filter(x=>x.sourceId===source.id);
    const notices=chain.notices.filter(x=>x.sourceId===source.id);
    const assets=chain.assets.filter(x=>x.sourceIds.includes(source.id));
    const included=assets.filter(x=>x.state==='included');
    const linkedNotices=notices.filter(x=>chain.surfaces.some(s=>s.id===x.surfaceId&&s.included==='yes'));
    rows.push({sourceId:source.id,label:source.label,licence:source.licence,retrievedOn:source.retrievedOn,tier:source.tier,
      permission:source.permission,assets:assets.length,includedAssets:included.length,receipts:receipts.length,
      recordedNotices:notices.length,includedNotices:linkedNotices.length,
      coveredIncludedAssets:included.filter(a=>receipts.some(r=>r.assetId===a.id)&&linkedNotices.some(n=>n.assetId===a.id)).length,
      observedLocales:[...new Set(linkedNotices.map(n=>chain.surfaces.find(s=>s.id===n.surfaceId).locale))].sort()});
  }
  return rows.sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
}
export function assetCoverage(input){
  const chain=parseChain(input),rows=[];
  for(const asset of chain.assets){
    for(const sourceId of asset.sourceIds){
      const notices=chain.notices.filter(x=>x.assetId===asset.id&&x.sourceId===sourceId);
      const receipts=chain.receipts.filter(x=>x.assetId===asset.id&&x.sourceId===sourceId);
      const included=notices.filter(n=>chain.surfaces.some(s=>s.id===n.surfaceId&&s.included==='yes'));
      rows.push({assetId:asset.id,state:asset.state,sourceId,hash:asset.sha256,
        noticeCount:notices.length,includedNoticeCount:included.length,receiptCount:receipts.length,
        hashesAgree:asset.sha256===UNKNOWN?UNKNOWN:receipts.every(r=>r.contentHash===asset.sha256)?'yes':'no',
        observationsComplete:included.length&&included.every(n=>n.visible==='yes'&&n.readable==='yes'&&n.keyboard==='yes')?'yes':'no',
        missingPublicNotice:asset.state==='included'&&!included.length,
        missingReceipt:asset.state==='included'&&!receipts.length});
    }
  }
  return rows.sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.sourceId.localeCompare(b.sourceId));
}
export function explicitLanguagePairs(input,pairs){
  const chain=parseChain(input);
  if(!Array.isArray(pairs)||pairs.length>200)throw new TypeError('Expected bounded explicit language pairs');
  const seen=new Set(),rows=[];
  for(const pair of pairs){
    if(!pair||typeof pair.enId!=='string'||typeof pair.frId!=='string')throw new TypeError('Pair must supply enId and frId');
    const id=`${pair.enId}|${pair.frId}`;
    if(seen.has(id))throw new TypeError('Repeated language pair');seen.add(id);
    const en=chain.surfaces.find(x=>x.id===pair.enId&&x.locale==='en');
    const fr=chain.surfaces.find(x=>x.id===pair.frId&&x.locale==='fr');
    if(!en||!fr)throw new TypeError('Language pair refers to missing or mismatched locale');
    const left=disclosurePaths(chain,{surfaceId:en.id});
    const right=disclosurePaths(chain,{surfaceId:fr.id});
    const leftKeys=new Set(left.map(x=>`${x.assetId}|${x.sourceId}`));
    const rightKeys=new Set(right.map(x=>`${x.assetId}|${x.sourceId}`));
    const missingInFrench=[...leftKeys].filter(x=>!rightKeys.has(x));
    const missingInEnglish=[...rightKeys].filter(x=>!leftKeys.has(x));
    const osmGap=[...left,...right].some(x=>x.licence==='ODbL'&&x.noticeText!==OSM_CREDIT);
    rows.push({enId:en.id,frId:fr.id,englishNotices:left.length,frenchNotices:right.length,
      missingInFrench,missingInEnglish,osmCreditGap:osmGap,
      status:missingInFrench.length||missingInEnglish.length||osmGap?'attention':'recorded-parity-only'});
  }
  return rows;
}
export function evidenceHealth(input){
  const chain=parseChain(input),audit=auditChain(chain),source=sourceCoverage(chain),asset=assetCoverage(chain),surface=reviewBySurface(chain);
  const published=chain.surfaces.filter(x=>x.included==='yes');
  return {chainId:chain.id,publicationStatus:audit.status,blocking:audit.counts.block,
    sourceCount:source.length,includedAssetCount:chain.assets.filter(x=>x.state==='included').length,
    includedSurfaceCount:published.length,coveredAssetSources:asset.filter(x=>x.state==='included'&&!x.missingReceipt&&!x.missingPublicNotice).length,
    receiptHashConflicts:asset.filter(x=>x.hashesAgree==='no').length,
    sourcesWithoutIncludedNotice:source.filter(x=>x.includedAssets&&!x.includedNotices).map(x=>x.sourceId),
    languageCount:{en:published.filter(x=>x.locale==='en').length,fr:published.filter(x=>x.locale==='fr').length},
    surfacesWithBlockers:surface.filter(x=>x.included==='yes'&&x.blocking>0).map(x=>x.surfaceId)};
}
export function resolveSourceCard(input,sourceId){
  const chain=parseChain(input),source=chain.sources.find(x=>x.id===sourceId);
  if(!source)return null;
  const reach=sourceReach(chain,sourceId),coverage=sourceCoverage(chain).find(x=>x.sourceId===sourceId);
  return {sourceId,label:source.label,sourceUrl:source.url,licence:source.licence,licenceUrl:source.licenceUrl,
    credit:source.credit,retrievedOn:source.retrievedOn,tier:source.tier,permission:source.permission,
    coverage,dependencies:reach,explanation:'This is only the recorded evidence supplied to the App.'};
}
export function observedMethods(input,surfaceId){
  const chain=parseChain(input),surface=chain.surfaces.find(x=>x.id===surfaceId);
  if(!surface)return null;
  const notices=chain.notices.filter(x=>x.surfaceId===surfaceId);
  return {surfaceId,locale:surface.locale,keyboard:surface.keyboard,screenReader:surface.screenReader,
    focusVisible:surface.focusVisible,minimumTargetPx:surface.minimumTargetPx,
    noticeVisible:notices.length&&notices.every(n=>n.visible==='yes')?'yes':'no',
    noticeKeyboard:notices.length&&notices.every(n=>n.keyboard==='yes')?'yes':'no',
    noticeReadable:notices.length&&notices.every(n=>n.readable==='yes')?'yes':'no',
    observationDates:notices.map(n=>n.observedOn)};
}
