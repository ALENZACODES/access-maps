import test from 'node:test';
import assert from 'node:assert/strict';
import {
  graphIndex, reverseDependencies, assetClosure, sourceClosure,
  distributionMatrix, dependencyCycles, impactedViews, upstreamPaths,
} from './distribution-graph.mjs';
import {manifest, asset, source, view, withDependencies, deepCopy} from './distribution-fixtures.mjs';

test('graph index addresses sources by stable ID', () => {
  const index = graphIndex(manifest());
  assert.equal(index.sources.get('source-osm').provider,'osm');
});
test('graph index addresses assets by stable ID', () => {
  const index = graphIndex(manifest());
  assert.equal(index.assets.get('data-asset').path,'assets/data.json');
});
test('graph index addresses views by stable ID', () => {
  const index = graphIndex(manifest());
  assert.equal(index.views.get('map-en').path,'pages/map-en.html');
});
test('reverse dependency map includes zero-dependency assets', () => {
  const reverse = reverseDependencies([asset()]);
  assert.equal(reverse.get('data-asset').size,0);
});
test('reverse dependency map records direct children', () => {
  const reverse = reverseDependencies([asset(),asset({id:'child',path:'assets/child.js',dependencyIds:['data-asset']})]);
  assert.deepEqual([...reverse.get('data-asset')],['child']);
});
test('reverse dependency map records several direct children', () => {
  const assets=[asset(),asset({id:'child-a',path:'assets/a.js',dependencyIds:['data-asset']}),asset({id:'child-b',path:'assets/b.js',dependencyIds:['data-asset']})];
  assert.deepEqual([...reverseDependencies(assets).get('data-asset')].sort(),['child-a','child-b']);
});
test('reverse dependency map retains missing edge identities', () => {
  const result=reverseDependencies([asset({dependencyIds:['missing']})]);
  assert.ok(result.get('missing').has('data-asset'));
});
test('closure includes start asset', () => {
  const result=assetClosure(['data-asset'],graphIndex(manifest()));
  assert.deepEqual(result.ids,['data-asset']);
});
test('closure excludes unrelated assets', () => {
  const m=manifest({assets:[asset(),asset({id:'orphan',path:'assets/orphan.json'})]});
  assert.deepEqual(assetClosure(['data-asset'],graphIndex(m)).ids,['data-asset']);
});
test('closure includes transitive dependencies', () => {
  const m=withDependencies(6);
  const result=assetClosure(['asset-5'],graphIndex(m));
  assert.equal(result.ids.length,6);
});
test('closure sorts results independently of traversal order', () => {
  const m=withDependencies(5);
  const result=assetClosure(['asset-4','data-asset'],graphIndex(m));
  assert.deepEqual(result.ids,[...result.ids].sort());
});
test('closure deduplicates diamond dependencies', () => {
  const assets=[asset(),asset({id:'left',path:'assets/left.js',dependencyIds:['data-asset']}),asset({id:'right',path:'assets/right.js',dependencyIds:['data-asset']}),asset({id:'root',path:'assets/root.js',dependencyIds:['left','right']})];
  const m=manifest({assets});
  assert.deepEqual(assetClosure(['root'],graphIndex(m)).ids,['data-asset','left','right','root']);
});
test('closure records a missing dependency separately', () => {
  const m=manifest({assets:[asset({dependencyIds:['missing']})]});
  assert.deepEqual(assetClosure(['data-asset'],graphIndex(m)).missing,['missing']);
});
test('closure records missing entry assets', () => {
  const result=assetClosure(['not-present'],graphIndex(manifest()));
  assert.deepEqual(result.missing,['not-present']);
});
test('closure terminates on direct cycle', () => {
  const m=manifest({assets:[asset({dependencyIds:['data-asset']})]});
  const result=assetClosure(['data-asset'],graphIndex(m));
  assert.deepEqual(result.ids,['data-asset']);
});
test('closure terminates on two-node cycle', () => {
  const m=manifest({assets:[asset({dependencyIds:['child']}),asset({id:'child',path:'assets/child.js',dependencyIds:['data-asset']})]});
  assert.equal(assetClosure(['data-asset'],graphIndex(m)).ids.length,2);
});
test('closure caps traversal breadth', () => {
  const m=withDependencies(7);
  assert.throws(()=>assetClosure(['asset-6'],graphIndex(m),3),/exceeds limit/u);
});
test('source closure derives source IDs from reachable asset', () => {
  const m=manifest();
  assert.deepEqual(sourceClosure(m.views[0],graphIndex(m)).sources,['source-osm']);
});
test('source closure omits sources on unrelated assets', () => {
  const m=manifest({sources:[source(),source({id:'other'})],assets:[asset(),asset({id:'unreachable',path:'assets/unused.json',sourceIds:['other']})]});
  assert.deepEqual(sourceClosure(m.views[0],graphIndex(m)).sources,['source-osm']);
});
test('source closure follows source on dependency rather than root', () => {
  const m=withDependencies(4);
  assert.deepEqual(sourceClosure(m.views[0],graphIndex(m)).sources,['source-osm']);
});
test('source closure collects sources across multiple assets', () => {
  const m=manifest({sources:[source(),source({id:'other'})],assets:[asset(),asset({id:'second',path:'assets/second.json',sourceIds:['other']})],views:[view({assetIds:['data-asset','second'],sourceIds:['source-osm','other']})]});
  assert.deepEqual(sourceClosure(m.views[0],graphIndex(m)).sources,['other','source-osm']);
});
test('distribution matrix retains published view ID', () => {
  assert.equal(distributionMatrix(manifest())[0].viewId,'map-en');
});
test('distribution matrix retains language and route path', () => {
  const row=distributionMatrix(manifest())[0];
  assert.equal(row.locale,'en');
  assert.equal(row.path,'pages/map-en.html');
});
test('distribution matrix marks source both declared and used', () => {
  const entry=distributionMatrix(manifest())[0].sources[0];
  assert.equal(entry.declared,true);
  assert.equal(entry.usedByAssets,true);
});
test('distribution matrix attributes asset ID to source', () => {
  assert.deepEqual(distributionMatrix(manifest())[0].sources[0].assetIds,['data-asset']);
});
test('distribution matrix finds undeclared source used by asset', () => {
  const m=manifest({views:[view({sourceIds:[]})]});
  assert.deepEqual(distributionMatrix(m)[0].missingDeclarations,['source-osm']);
});
test('distribution matrix finds declared source with no reachable asset', () => {
  const m=manifest({views:[view({sourceIds:['source-osm','other']})]});
  assert.deepEqual(distributionMatrix(m)[0].unusedDeclarations,['other']);
});
test('distribution matrix records an absent asset', () => {
  const m=manifest({views:[view({assetIds:['missing']})]});
  assert.deepEqual(distributionMatrix(m)[0].missingAssetIds,['missing']);
});
test('distribution matrix records missing source definition', () => {
  const m=manifest({sources:[]});
  assert.equal(distributionMatrix(m)[0].sources[0].recorded,false);
});
test('distribution matrix sorts view rows by ID', () => {
  const m=manifest({views:[view({id:'z',path:'pages/z.html'}),view({id:'a',path:'pages/a.html'})]});
  assert.deepEqual(distributionMatrix(m).map(x=>x.viewId),['a','z']);
});
test('distribution matrix does not mutate the manifest', () => {
  const m=withDependencies(5), before=deepCopy(m);
  distributionMatrix(m);
  assert.deepEqual(m,before);
});
test('empty asset graph has no cycles', () => assert.deepEqual(dependencyCycles([]),[]));
test('single acyclic asset has no cycles', () => assert.deepEqual(dependencyCycles([asset()]),[]));
test('direct self-edge is a cycle', () => assert.deepEqual(dependencyCycles([asset({dependencyIds:['data-asset']})]),[['data-asset']]));
test('two-node cycle is reported once', () => {
  const assets=[asset({dependencyIds:['child']}),asset({id:'child',path:'assets/child.js',dependencyIds:['data-asset']})];
  assert.deepEqual(dependencyCycles(assets),[['child','data-asset']]);
});
test('separate cycles produce separate components', () => {
  const assets=[asset({dependencyIds:['data-asset']}),asset({id:'other',path:'assets/other.js',dependencyIds:['other']})];
  assert.deepEqual(dependencyCycles(assets),[['data-asset'],['other']]);
});
test('diamond without a back edge has no cycles', () => {
  const assets=[asset(),asset({id:'left',path:'assets/left.js',dependencyIds:['data-asset']}),asset({id:'right',path:'assets/right.js',dependencyIds:['data-asset']}),asset({id:'root',path:'assets/root.js',dependencyIds:['left','right']})];
  assert.deepEqual(dependencyCycles(assets),[]);
});
test('nonexistent dependency does not create cycle', () => assert.deepEqual(dependencyCycles([asset({dependencyIds:['missing']})]),[]));
test('three-node cycle reports all members', () => {
  const assets=[asset({dependencyIds:['mid']}),asset({id:'mid',path:'assets/mid.js',dependencyIds:['end']}),asset({id:'end',path:'assets/end.js',dependencyIds:['data-asset']})];
  assert.deepEqual(dependencyCycles(assets),[['data-asset','end','mid']]);
});
test('impacted views includes directly sourced view', () => assert.deepEqual(impactedViews(manifest(),['source-osm']),['map-en']));
test('impacted views excludes unrelated source ID', () => assert.deepEqual(impactedViews(manifest(),['another']),[]));
test('impacted views includes directly referenced asset', () => assert.deepEqual(impactedViews(manifest(),[],['data-asset']),['map-en']));
test('impacted views includes transitive asset dependency', () => {
  const m=withDependencies(5);
  assert.deepEqual(impactedViews(m,[],['data-asset']),['map-en']);
});
test('impacted views includes all views sharing a source', () => {
  const m=manifest({views:[view(),view({id:'map-fr',path:'pages/map-fr.html',locale:'fr'})]});
  assert.deepEqual(impactedViews(m,['source-osm']),['map-en','map-fr']);
});
test('upstream paths connect a view to a direct source', () => assert.deepEqual(upstreamPaths(manifest(),'map-en','source-osm'),[['data-asset']]));
test('upstream paths connect through all ancestors', () => {
  const m=withDependencies(4);
  assert.deepEqual(upstreamPaths(m,'map-en','source-osm'),[['asset-3','asset-2','asset-1','data-asset']]);
});
test('upstream paths omit unknown source', () => assert.deepEqual(upstreamPaths(manifest(),'map-en','other'),[]));
test('upstream paths omit unknown view', () => assert.deepEqual(upstreamPaths(manifest(),'other','source-osm'),[]));
test('upstream paths terminate on a self-cycle', () => {
  const m=manifest({assets:[asset({dependencyIds:['data-asset']})]});
  assert.deepEqual(upstreamPaths(m,'map-en','source-osm'),[['data-asset']]);
});
test('upstream paths include both diamond paths to one source', () => {
  const assets=[asset(),asset({id:'left',path:'assets/left.js',sourceIds:[],dependencyIds:['data-asset']}),asset({id:'right',path:'assets/right.js',sourceIds:[],dependencyIds:['data-asset']}),asset({id:'root',path:'assets/root.js',sourceIds:[],dependencyIds:['left','right']})];
  const m=manifest({assets,views:[view({assetIds:['root']})]});
  assert.deepEqual(upstreamPaths(m,'map-en','source-osm'),[['root','left','data-asset'],['root','right','data-asset']]);
});
