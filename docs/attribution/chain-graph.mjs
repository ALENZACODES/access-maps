/** Directed provenance graphs and deterministic explainable paths. */
import {parseChain,UNKNOWN} from './chain-core.mjs';
function toNode(kind,record){return {id:`${kind}:${record.id}`,kind,recordId:record.id,label:record.label??record.id};}
export function buildGraph(input){
  const chain=parseChain(input);
  const nodes=[...chain.sources.map(x=>toNode('source',x)),...chain.assets.map(x=>toNode('asset',x)),
    ...chain.surfaces.map(x=>toNode('surface',x)),...chain.notices.map(x=>toNode('notice',x)),
    ...chain.receipts.map(x=>toNode('receipt',x))];
  const edges=[];
  for(const asset of chain.assets){
    for(const sourceId of asset.sourceIds)edges.push({from:`source:${sourceId}`,to:`asset:${asset.id}`,kind:'source-used'});
    for(const parentId of asset.parentIds)edges.push({from:`asset:${parentId}`,to:`asset:${asset.id}`,kind:'derived-from'});
  }
  for(const notice of chain.notices){
    edges.push({from:`source:${notice.sourceId}`,to:`notice:${notice.id}`,kind:'credit-for-source'});
    edges.push({from:`asset:${notice.assetId}`,to:`notice:${notice.id}`,kind:'credit-for-asset'});
    edges.push({from:`notice:${notice.id}`,to:`surface:${notice.surfaceId}`,kind:'displayed-on'});
  }
  for(const receipt of chain.receipts){
    edges.push({from:`source:${receipt.sourceId}`,to:`receipt:${receipt.id}`,kind:'receipt-for-source'});
    edges.push({from:`asset:${receipt.assetId}`,to:`receipt:${receipt.id}`,kind:'receipt-for-asset'});
    for(const parentId of receipt.parentIds)edges.push({from:`receipt:${parentId}`,to:`receipt:${receipt.id}`,kind:'follows-receipt'});
  }
  nodes.sort((a,b)=>a.id.localeCompare(b.id));
  edges.sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)||a.kind.localeCompare(b.kind));
  return {nodes,edges};
}
function adjacency(graph,reverse=false){
  const result=new Map(graph.nodes.map(node=>[node.id,[]]));
  for(const edge of graph.edges)result.get(reverse?edge.to:edge.from).push(reverse?edge.from:edge.to);
  for(const row of result.values())row.sort();
  return result;
}
function walk(input,start,reverse=false){
  const graph=buildGraph(input);
  if(!graph.nodes.some(node=>node.id===start))return [];
  const neighbors=adjacency(graph,reverse),visited=new Set([start]),queue=[start];
  const ordered=[];
  for(let i=0;i<queue.length;i++){
    for(const next of neighbors.get(queue[i])??[]){
      if(visited.has(next))continue;
      visited.add(next);ordered.push(next);queue.push(next);
    }
  }
  return ordered;
}
export function ancestors(input,nodeId){return walk(input,nodeId,true);}
export function descendants(input,nodeId){return walk(input,nodeId);}
export function shortestPath(input,from,to){
  const graph=buildGraph(input);
  const vertices=new Set(graph.nodes.map(x=>x.id));
  if(!vertices.has(from)||!vertices.has(to))return null;
  const neighbors=adjacency(graph),queue=[[from]],visited=new Set([from]);
  for(let i=0;i<queue.length;i++){
    const path=queue[i],last=path[path.length-1];
    if(last===to)return path;
    for(const next of neighbors.get(last)??[]){if(visited.has(next))continue;visited.add(next);queue.push([...path,next]);}
  }
  return null;
}
export function cycles(input,kind='asset'){
  if(!['asset','receipt'].includes(kind))throw new TypeError('Expected asset or receipt');
  const chain=parseChain(input),rows=kind==='asset'?chain.assets:chain.receipts;
  const dependencies=new Map(rows.map(row=>[row.id,row.parentIds]));
  const active=new Set(),complete=new Set(),found=new Set(),out=[];
  function visit(id,path){
    if(active.has(id)){
      const offset=path.indexOf(id),cycle=[...path.slice(offset),id],key=[...new Set(cycle)].sort().join('|');
      if(!found.has(key)){found.add(key);out.push(cycle);}
      return;
    }
    if(complete.has(id))return;
    active.add(id);
    for(const other of dependencies.get(id)??[])visit(other,[...path,id]);
    active.delete(id);complete.add(id);
  }
  for(const id of dependencies.keys())visit(id,[]);
  return out.sort((a,b)=>a.join('|').localeCompare(b.join('|')));
}
export function sourceReach(input,sourceId){
  const chain=parseChain(input);
  if(!chain.sources.some(x=>x.id===sourceId))return null;
  const reach=descendants(chain,`source:${sourceId}`);
  const assetIds=reach.filter(x=>x.startsWith('asset:')).map(x=>x.slice(6));
  const noticeIds=reach.filter(x=>x.startsWith('notice:')).map(x=>x.slice(7));
  const surfaceIds=reach.filter(x=>x.startsWith('surface:')).map(x=>x.slice(8));
  const receiptIds=reach.filter(x=>x.startsWith('receipt:')).map(x=>x.slice(8));
  return {sourceId,assetIds,noticeIds,surfaceIds,receiptIds};
}
export function surfaceDependencies(input,surfaceId){
  const chain=parseChain(input);
  if(!chain.surfaces.some(x=>x.id===surfaceId))return null;
  const paths=ancestors(chain,`surface:${surfaceId}`);
  return {surfaceId,sourceIds:paths.filter(x=>x.startsWith('source:')).map(x=>x.slice(7)),
    assetIds:paths.filter(x=>x.startsWith('asset:')).map(x=>x.slice(6)),
    noticeIds:paths.filter(x=>x.startsWith('notice:')).map(x=>x.slice(7))};
}
export function graphMetrics(input){
  const graph=buildGraph(input),incoming=new Map(graph.nodes.map(x=>[x.id,0])),outgoing=new Map(graph.nodes.map(x=>[x.id,0]));
  for(const edge of graph.edges){incoming.set(edge.to,incoming.get(edge.to)+1);outgoing.set(edge.from,outgoing.get(edge.from)+1);}
  return {nodes:graph.nodes.length,edges:graph.edges.length,
    orphans:graph.nodes.filter(x=>!incoming.get(x.id)&&!outgoing.get(x.id)).map(x=>x.id),
    maxOutDegree:Math.max(0,...outgoing.values()),maxInDegree:Math.max(0,...incoming.values()),
    assetCycles:cycles(input,'asset').length,receiptCycles:cycles(input,'receipt').length};
}
/** Enumerate individual source to surface paths for a reviewer. */
export function disclosurePaths(input,{sourceId,surfaceId}={}){
  const chain=parseChain(input),paths=[];
  for(const notice of chain.notices){
    if(sourceId&&notice.sourceId!==sourceId)continue;
    if(surfaceId&&notice.surfaceId!==surfaceId)continue;
    const source=chain.sources.find(x=>x.id===notice.sourceId),asset=chain.assets.find(x=>x.id===notice.assetId),surface=chain.surfaces.find(x=>x.id===notice.surfaceId);
    paths.push({sourceId:source.id,sourceLabel:source.label,licence:source.licence,assetId:asset.id,
      assetState:asset.state,assetHash:asset.sha256,noticeId:notice.id,noticeText:notice.text,
      placement:notice.placement,surfaceId:surface.id,surfaceLocale:surface.locale,surfaceIncluded:surface.included,
      evidenceRef:notice.evidenceRef,observedOn:notice.observedOn});
  }
  return paths.sort((a,b)=>a.surfaceId.localeCompare(b.surfaceId)||a.sourceId.localeCompare(b.sourceId)||a.assetId.localeCompare(b.assetId));
}
export function explainPath(input,from,to){
  const path=shortestPath(input,from,to);
  if(!path)return {status:UNKNOWN,steps:[]};
  const {edges}=buildGraph(input),steps=[];
  for(let i=1;i<path.length;i++){
    const match=edges.find(e=>e.from===path[i-1]&&e.to===path[i]);
    steps.push({from:path[i-1],relation:match?.kind??UNKNOWN,to:path[i]});
  }
  return {status:'recorded',steps};
}
