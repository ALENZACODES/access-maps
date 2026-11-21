import {fail,id,hash,sorted,bodyDigest,copy,unique} from './p15af-contract.mjs';
import {validateImpactCatalog,catalogIndexes} from './p15af-catalog.mjs';
export const GRAPH_SCHEMA='access-maps-source-impact-graph/1';
export const NODE_KINDS=Object.freeze(['source','record','asset','package']);
function key(kind,value){return `${kind}:${value}`;}
export function buildImpactGraph(input){
 const catalog=validateImpactCatalog(input),idx=catalogIndexes(catalog),nodes=[],edges=[];
 for(const row of catalog.sources)nodes.push({nodeId:key('source',row.sourceId),kind:'source',entityId:row.sourceId,state:row.status,digest:row.sourceDigest});
 for(const row of catalog.records)nodes.push({nodeId:key('record',row.recordId),kind:'record',entityId:row.recordId,state:row.state,digest:row.recordDigest});
 for(const row of catalog.assets)nodes.push({nodeId:key('asset',row.assetId),kind:'asset',entityId:row.assetId,state:row.state,digest:row.digest});
 for(const row of catalog.packages)nodes.push({nodeId:key('package',row.packageId),kind:'package',entityId:row.packageId,state:row.state,digest:row.digest});
 for(const record of catalog.records)for(const sourceId of record.sourceIds)
  edges.push({from:key('source',sourceId),to:key('record',record.recordId),kind:'supports'});
 for(const asset of catalog.assets){
  for(const recordId of asset.recordIds)edges.push({from:key('record',recordId),to:key('asset',asset.assetId),kind:'materializes'});
  for(const sourceId of asset.sourceIds)edges.push({from:key('source',sourceId),to:key('asset',asset.assetId),kind:'lineage'});
 }
 for(const pkg of catalog.packages){
  for(const assetId of pkg.assetIds)edges.push({from:key('asset',assetId),to:key('package',pkg.packageId),kind:'bundles'});
  for(const recordId of pkg.recordIds)edges.push({from:key('record',recordId),to:key('package',pkg.packageId),kind:'includes'});
  for(const sourceId of pkg.sourceIds)edges.push({from:key('source',sourceId),to:key('package',pkg.packageId),kind:'lineage'});
 }
 unique(edges.map(row=>`${row.from}>${row.to}:${row.kind}`),'graph edges');
 const result={schema:GRAPH_SCHEMA,catalogDigest:catalog.digest,nodes:sorted(nodes,row=>row.nodeId),
  edges:sorted(edges,row=>`${row.from}>${row.to}:${row.kind}`),digest:''};
 result.digest=bodyDigest(result);return result;
}
export function validateImpactGraph(input,catalogInput){
 const expected=buildImpactGraph(catalogInput);
 fail(input?.schema===GRAPH_SCHEMA,'SCHEMA','Unsupported graph schema.');
 hash(input.digest);fail(input.digest===bodyDigest(input),'HASH','Graph digest invalid.');
 fail(input.digest===expected.digest,'STALE_GRAPH','Graph does not match catalog lineage.');
 return copy(input);
}
function adjacency(graph,direction='out'){
 const result=new Map(graph.nodes.map(row=>[row.nodeId,[]]));
 for(const edge of graph.edges){
  if(direction==='out')result.get(edge.from).push(edge.to);
  else result.get(edge.to).push(edge.from);
 }
 for(const values of result.values())values.sort();
 return result;
}
export function walkImpact(graphInput,startNodeIds,{maximumNodes=50000,direction='out'}={}){
 hash(graphInput.digest);fail(Array.isArray(startNodeIds)&&startNodeIds.length>0&&startNodeIds.every(value=>typeof value==='string'&&value.length<=200),'START','Start nodes invalid.');
 fail(['out','in'].includes(direction),'DIRECTION','Traversal direction invalid.');
 fail(Number.isSafeInteger(maximumNodes)&&maximumNodes>=1&&maximumNodes<=100000,'LIMIT','Traversal limit invalid.');
 unique(startNodeIds,'start nodes');
 const nodes=new Map(graphInput.nodes.map(row=>[row.nodeId,row]));
 const links=adjacency(graphInput,direction),visited=new Set(),queue=[];
 for(const nodeId of startNodeIds){fail(nodes.has(nodeId),'NODE_REF','Start node does not exist.');visited.add(nodeId);queue.push(nodeId);}
 const order=[];
 while(queue.length){
  const current=queue.shift();order.push(current);
  for(const next of links.get(current)??[]){
   if(visited.has(next))continue;
   fail(visited.size<maximumNodes,'LIMIT','Impact traversal exceeded node limit.');
   visited.add(next);queue.push(next);
  }
 }
 const rows=order.map(nodeId=>({nodeId,kind:nodes.get(nodeId).kind,entityId:nodes.get(nodeId).entityId,
  state:nodes.get(nodeId).state,digest:nodes.get(nodeId).digest,distance:distanceTo(nodeId,order,links,startNodeIds)}));
 return {direction,starts:[...startNodeIds].sort(),visited:rows.length,nodes:rows,digest:bodyDigest({direction,starts:[...startNodeIds].sort(),nodes:rows})};
}
function distanceTo(target,order,links,starts){
 const distances=new Map(starts.map(value=>[value,0]));
 for(const node of order){
  for(const next of links.get(node)??[])if(!distances.has(next))distances.set(next,distances.get(node)+1);
 }
 return distances.get(target)??-1;
}
export function sourceImpact(input,sourceIds){
 const graph=buildImpactGraph(input);sourceIds.forEach(id);unique(sourceIds,'source IDs');
 const starts=sourceIds.map(value=>key('source',value));
 const traversal=walkImpact(graph,starts);
 const groups={records:[],assets:[],packages:[]};
 for(const row of traversal.nodes){
  if(row.kind==='record')groups.records.push(row.entityId);
  if(row.kind==='asset')groups.assets.push(row.entityId);
  if(row.kind==='package')groups.packages.push(row.entityId);
 }
 return {catalogDigest:input.digest,graphDigest:graph.digest,sourceIds:[...sourceIds].sort(),
  affected:{records:groups.records,assets:groups.assets,packages:groups.packages},traversalDigest:traversal.digest,
  digest:bodyDigest({catalogDigest:input.digest,graphDigest:graph.digest,sourceIds:[...sourceIds].sort(),
   affected:groups,traversalDigest:traversal.digest})};
}
