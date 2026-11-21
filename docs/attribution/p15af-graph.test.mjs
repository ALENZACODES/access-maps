import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,source,record,asset,pkg} from './p15af-fixtures.mjs';
import {buildImpactGraph,validateImpactGraph,walkImpact,sourceImpact} from './p15af-graph.mjs';
import {ImpactError,sha256} from './p15af-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ImpactError&&error.code===code);
test('impact graph contains source, record, asset and package nodes',()=>{const graph=buildImpactGraph(catalog());assert.deepEqual(new Set(graph.nodes.map(x=>x.kind)),new Set(['source','record','asset','package']));});
test('impact graph contains lineage and materialization edges',()=>{const graph=buildImpactGraph(catalog());assert.ok(graph.edges.some(x=>x.kind==='supports'));assert.ok(graph.edges.some(x=>x.kind==='materializes'));assert.ok(graph.edges.some(x=>x.kind==='bundles'));});
test('impact graph is deterministically sorted',()=>{const row=catalog();assert.deepEqual(buildImpactGraph(row),buildImpactGraph(row));});
test('impact graph validates against catalog digest',()=>{const row=catalog(),graph=buildImpactGraph(row);assert.equal(validateImpactGraph(graph,row).digest,graph.digest);});
test('impact graph rejects forged graph digest',()=>{const row=catalog(),graph=buildImpactGraph(row);fails(()=>validateImpactGraph({...graph,digest:'f'.repeat(64)},row),'HASH');});
test('impact graph rejects stale catalog lineage',()=>{const row=catalog(),graph=buildImpactGraph(row),changed=catalog({records:[record({reason:'Updated evidence note.'})]});fails(()=>validateImpactGraph(graph,changed),'STALE_GRAPH');});
test('walkImpact traverses from source through downstream dependencies',()=>{const graph=buildImpactGraph(catalog()),result=walkImpact(graph,['source:source-one']);assert.equal(result.visited,4);assert.ok(result.nodes.some(x=>x.kind==='package'));});
test('walkImpact returns distance from source node',()=>{const graph=buildImpactGraph(catalog()),result=walkImpact(graph,['source:source-one']);assert.equal(result.nodes.find(x=>x.kind==='package').distance,1);});
test('walkImpact can traverse backwards from package',()=>{const graph=buildImpactGraph(catalog()),result=walkImpact(graph,['package:package-one'],{direction:'in'});assert.equal(result.visited,4);});
test('walkImpact rejects unknown start node',()=>fails(()=>walkImpact(buildImpactGraph(catalog()),['source:missing']),'NODE_REF'));
test('walkImpact rejects invalid direction',()=>fails(()=>walkImpact(buildImpactGraph(catalog()),['source:source-one'],{direction:'sideways'}),'DIRECTION'));
test('walkImpact enforces maximum node bound',()=>fails(()=>walkImpact(buildImpactGraph(catalog()),['source:source-one'],{maximumNodes:2}),'LIMIT'));
test('walkImpact rejects duplicate start nodes',()=>fails(()=>walkImpact(buildImpactGraph(catalog()),['source:source-one','source:source-one']),'DUPLICATE'));
test('source impact returns all downstream entity IDs',()=>{const result=sourceImpact(catalog(),['source-one']);assert.deepEqual(result.affected,{records:['record-one'],assets:['asset-one'],packages:['package-one']});});
test('source impact supports multiple independent source roots',()=>{const row=catalog({sources:[source(),source({sourceId:'source-two',sourceDigest:sha256('two'),reference:'sources/two.json'})],records:[record(),record({recordId:'record-two',recordDigest:sha256('r2'),sourceIds:['source-two'],evidence:[{...record().evidence[0],sourceId:'source-two',digest:sha256('two')}]})],assets:[asset(),asset({assetId:'asset-two',recordIds:['record-two'],sourceIds:['source-two'],digest:sha256('a2')})],packages:[pkg(),pkg({packageId:'package-two',assetIds:['asset-two'],recordIds:['record-two'],sourceIds:['source-two'],digest:sha256('p2')})]});const result=sourceImpact(row,['source-one','source-two']);assert.equal(result.affected.records.length,2);});
test('source impact rejects unknown source ID',()=>fails(()=>sourceImpact(catalog(),['source-missing']),'NODE_REF'));
test('source impact rejects duplicate source IDs',()=>fails(()=>sourceImpact(catalog(),['source-one','source-one']),'DUPLICATE'));
test('graph nodes retain source and record digests',()=>{const graph=buildImpactGraph(catalog());assert.ok(graph.nodes.every(row=>row.digest.length===64));});
test('graph edge identifiers are unique',()=>{const graph=buildImpactGraph(catalog());assert.equal(new Set(graph.edges.map(row=>`${row.from}>${row.to}:${row.kind}`)).size,graph.edges.length);});
test('graph digest is a SHA-256 value',()=>assert.match(buildImpactGraph(catalog()).digest,/^[a-f0-9]{64}$/u));
test('graph node kinds are limited to the declared entity types',()=>{const graph=buildImpactGraph(catalog());assert.ok(graph.nodes.every(row=>['source','record','asset','package'].includes(row.kind)));});
test('source impact includes graph and catalog provenance digests',()=>{const row=catalog(),impact=sourceImpact(row,['source-one']);assert.equal(impact.catalogDigest,row.digest);assert.equal(impact.graphDigest.length,64);});
test('walkImpact traversal does not mutate graph nodes',()=>{const graph=buildImpactGraph(catalog()),before=JSON.stringify(graph);walkImpact(graph,['source:source-one']);assert.equal(JSON.stringify(graph),before);});
test('graph builder rejects malformed catalog before graph creation',()=>{const row=catalog();row.digest='bad';fails(()=>buildImpactGraph(row),'HASH');});

test('graph traversal includes direct source-to-package lineage edge',()=>{
 const graph=buildImpactGraph(catalog());
 assert.ok(graph.edges.some(row=>row.from==='source:source-one'&&row.to==='package:package-one'&&row.kind==='lineage'));
});
test('graph traversal from record includes its asset and package',()=>{
 const graph=buildImpactGraph(catalog()),result=walkImpact(graph,['record:record-one']);
 assert.ok(result.nodes.some(row=>row.kind==='asset'));
 assert.ok(result.nodes.some(row=>row.kind==='package'));
});
test('graph reverse traversal from asset includes source and record',()=>{
 const graph=buildImpactGraph(catalog()),result=walkImpact(graph,['asset:asset-one'],{direction:'in'});
 assert.ok(result.nodes.some(row=>row.kind==='source'));
 assert.ok(result.nodes.some(row=>row.kind==='record'));
});
test('graph traversal records zero distance for its root',()=>{
 const graph=buildImpactGraph(catalog()),result=walkImpact(graph,['source:source-one']);
 assert.equal(result.nodes[0].distance,0);
});
test('graph validator refuses a catalog with malformed digest',()=>{
 const row=catalog();row.digest='bad';
 fails(()=>buildImpactGraph(row),'HASH');
});
test('source impact report has stable affected entity ordering',()=>{
 const result=sourceImpact(catalog(),['source-one']);
 for(const values of Object.values(result.affected))
  assert.deepEqual(values,[...values].sort());
});
test('source impact report digest is deterministic',()=>{
 const row=catalog();
 assert.equal(sourceImpact(row,['source-one']).digest,sourceImpact(row,['source-one']).digest);
});
test('source impact traversal includes no unrelated entity kinds',()=>{
 const result=sourceImpact(catalog(),['source-one']);
 assert.deepEqual(Object.keys(result.affected).sort(),['assets','packages','records']);
});
test('graph edges have known relationship labels only',()=>{
 const graph=buildImpactGraph(catalog());
 assert.ok(graph.edges.every(row=>['supports','materializes','lineage','bundles','includes'].includes(row.kind)));
});
test('graph validator rejects a stale source digest',()=>{
 const row=catalog(),graph=buildImpactGraph(row);
 const changed=catalog({sources:[source({sourceDigest:sha256('changed')})],
  records:[record({evidence:[{...record().evidence[0],digest:sha256('changed')} ]})]});
 fails(()=>validateImpactGraph(graph,changed),'STALE_GRAPH');
});
