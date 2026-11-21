/** Bounded, deterministic view-specific handoffs. Never infer absent rights. */
import {parseChain,UNKNOWN} from './chain-core.mjs';
import {auditChain} from './chain-audit.mjs';
import {surfaceDependencies} from './chain-graph.mjs';
function filterByIds(records,ids){const accepted=new Set(ids);return records.filter(row=>accepted.has(row.id));}
export function buildHandoff(input,{surfaceIds=[],includeHeld=false}={}){
  const chain=parseChain(input);
  if(!Array.isArray(surfaceIds)||surfaceIds.length>100)throw new TypeError('Select at most 100 publication views');
  const ids=new Set(surfaceIds);
  if(ids.size!==surfaceIds.length||surfaceIds.some(id=>typeof id!=='string'))throw new TypeError('Repeated or invalid surface identifier');
  for(const id of ids)if(!chain.surfaces.some(s=>s.id===id))throw new TypeError(`Unknown selected surface ${id}`);
  const selectedSurfaces=chain.surfaces.filter(s=>ids.has(s.id));
  const notices=chain.notices.filter(n=>ids.has(n.surfaceId)&&(
    includeHeld||chain.assets.find(a=>a.id===n.assetId).state==='included'));
  const assetIds=new Set(notices.map(n=>n.assetId));
  // Carry parent artifacts transitively so the handoff does not break recorded ancestry.
  let changed=true;
  while(changed){
    changed=false;
    for(const asset of chain.assets)if(assetIds.has(asset.id))for(const parentId of asset.parentIds){
      if(!assetIds.has(parentId)){assetIds.add(parentId);changed=true;}
    }
  }
  const assets=chain.assets.filter(a=>assetIds.has(a.id));
  const sourceIds=new Set(assets.flatMap(a=>a.sourceIds));
  const sources=chain.sources.filter(s=>sourceIds.has(s.id));
  const receipts=chain.receipts.filter(r=>assetIds.has(r.assetId)&&sourceIds.has(r.sourceId));
  const audit=auditChain(chain,{includeDrafts:includeHeld});
  const findings=audit.findings.filter(f=>{
    if(f.path.startsWith('surfaces.'))return ids.has(f.path.split('.')[1]);
    if(f.path.startsWith('notices.'))return notices.some(n=>n.id===f.path.split('.')[1]);
    if(f.path.startsWith('assets.'))return assets.some(a=>a.id===f.path.split('.')[1]);
    if(f.path.startsWith('sources.'))return sources.some(s=>s.id===f.path.split('.')[1]);
    if(f.path.startsWith('receipts.'))return receipts.some(r=>r.id===f.path.split('.')[1]);
    return false;
  });
  return {schema:'map-attribution-evidence-handoff/1',chainId:chain.id,reviewedOn:chain.reviewedOn,
    selectedSurfaceIds:[...ids].sort(),includesHeld:includeHeld,
    sourceCount:sources.length,assetCount:assets.length,noticeCount:notices.length,receiptCount:receipts.length,
    sources,assets,surfaces:selectedSurfaces,notices,receipts,
    findings,blocking:findings.filter(f=>f.severity==='block').length,
    caution:findings.filter(f=>f.severity==='caution').length,
    explanation:'Records supplied locally to the App; this packet does not establish source authenticity, redistribution permission or accessibility of a real place.'};
}
export function handoffText(input,options={},locale='en'){
  const packet=buildHandoff(input,options),fr=locale==='fr',sep=fr?'\u00a0: ':': ';
  const lines=[fr?'Dossier de transmission des preuves':'Evidence handoff packet',
    `${fr?'Chaîne':'Chain'}${sep}${packet.chainId}`,
    `${fr?'Vues choisies':'Selected views'}${sep}${packet.selectedSurfaceIds.join(', ')||UNKNOWN}`,
    `${fr?'Constats bloquants':'Blocking findings'}${sep}${packet.blocking}`,packet.explanation,''];
  for(const source of packet.sources){lines.push(`${fr?'Source':'Source'}${sep}${source.label}`,
    `${fr?'Licence':'Licence'}${sep}${source.licence}`,
    `${fr?'Date de récupération':'Retrieved on'}${sep}${source.retrievedOn}`,
    `${fr?'Mention':'Credit'}${sep}${source.credit}`,'');}
  for(const asset of packet.assets)lines.push(`${fr?'Fichier':'Asset'}${sep}${asset.id}`,`SHA-256${sep}${asset.sha256}`,'');
  for(const notice of packet.notices)lines.push(`${fr?'Mention affichée':'Displayed notice'}${sep}${notice.text}`,
    `${fr?'Emplacement':'Placement'}${sep}${notice.placement}`,'');
  for(const issue of packet.findings)lines.push(`${issue.severity.toUpperCase()} ${issue.code} — ${issue.path}`);
  return `${lines.join('\n')}\n`;
}
export function handoffJson(input,options={}){return `${JSON.stringify(buildHandoff(input,options),null,2)}\n`;}
export function handoffCoverage(input,options={}){
  const packet=buildHandoff(input,options),rows=[];
  for(const surface of packet.surfaces){
    const deps=surfaceDependencies(input,surface.id);
    const notices=packet.notices.filter(n=>n.surfaceId===surface.id);
    rows.push({surfaceId:surface.id,locale:surface.locale,route:surface.route,included:surface.included,
      noticeIds:notices.map(n=>n.id),sourceIds:deps?.sourceIds.filter(id=>packet.sources.some(s=>s.id===id))??[],
      receipts:packet.receipts.filter(r=>notices.some(n=>n.assetId===r.assetId&&n.sourceId===r.sourceId)).map(r=>r.id),
      recorded:surface.keyboard==='yes'&&surface.screenReader==='yes'&&surface.focusVisible==='yes'&&
        surface.minimumTargetPx!==UNKNOWN&&surface.minimumTargetPx>=44});
  }
  return rows;
}
export function compareHandoffs(previous,current){
  if(!previous||!current||previous.schema!=='map-attribution-evidence-handoff/1'||current.schema!=='map-attribution-evidence-handoff/1')throw new TypeError('Expected evidence handoff packets');
  const old=new Map(previous.sources.map(x=>[x.id,x])),now=new Map(current.sources.map(x=>[x.id,x]));
  const removedSources=[...old.keys()].filter(id=>!now.has(id));
  const addedSources=[...now.keys()].filter(id=>!old.has(id));
  const changedSources=[...old.keys()].filter(id=>now.has(id)&&JSON.stringify(old.get(id))!==JSON.stringify(now.get(id)));
  const priorNotices=new Set(previous.notices.map(x=>x.id)),currentNotices=new Set(current.notices.map(x=>x.id));
  return {removedSources,addedSources,changedSources,
    removedNotices:[...priorNotices].filter(id=>!currentNotices.has(id)),
    addedNotices:[...currentNotices].filter(id=>!priorNotices.has(id)),
    blockingIncrease:Math.max(0,current.blocking-previous.blocking)};
}
