import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceImpact, assetImpact, sourceImpactMatrix, sourceImpactTsv, sourceImpactText} from './dependency-impact.mjs';
import {fixture,cloneFixture} from './dependency-fixture.mjs';
import {makeAsset,makeSource,UNKNOWN,OSM_CREDIT} from './dependency-core.mjs';

test('source impact identifies inherited source through interface asset',()=>{
  const report=sourceImpact(fixture(),'osm-data');
  assert.deepEqual(report.affectedSurfaces,['map-en']);
  assert.equal(report.paths.length,1);
  assert.deepEqual(report.paths[0].chain,['map-ui','geometry']);
});
test('source impact includes the original asset path',()=>{
  const report=sourceImpact(fixture(),'osm-data');
  assert.equal(report.paths[0].assetPath,'/maps/geometry.pmtiles');
});
test('source impact preserves source licence and metadata',()=>{
  const report=sourceImpact(fixture(),'osm-data');
  assert.equal(report.source.licence,'ODbL');
  assert.equal(report.source.retrievedOn,'2026-11-19');
  assert.equal(report.source.tier,'imported');
  assert.equal(report.source.credit,OSM_CREDIT);
});
test('source impact for fictional catalogue has different ancestry',()=>{
  const report=sourceImpact(fixture(),'local-info');
  assert.deepEqual(report.paths[0].chain,['map-ui','catalogue']);
});
test('source impact with complete fictional records has no blocking findings',()=>{
  assert.equal(sourceImpact(fixture(),'osm-data').blocking,0);
});
test('source impact picks up a source-specific missing date',()=>{
  const model=cloneFixture();model.sources[0].retrievedOn=UNKNOWN;
  const report=sourceImpact(model,'osm-data');
  assert.ok(report.findings.some(item=>item.code==='RETRIEVAL_UNKNOWN'));
});
test('source impact picks up a shared view target issue',()=>{
  const model=cloneFixture();model.surfaces[0].minimumTargetPx=24;
  const report=sourceImpact(model,'osm-data');
  assert.ok(report.findings.some(item=>item.code==='TARGET_TOO_SMALL'));
});
test('source impact rejects unknown source',()=>{
  assert.throws(()=>sourceImpact(fixture(),'missing'),RangeError);
});
test('source impact does not invent surfaces for unused sources',()=>{
  const model=cloneFixture();model.sources.push(makeSource('extra'));
  const report=sourceImpact(model,'extra');
  assert.deepEqual(report.paths,[]);
  assert.deepEqual(report.affectedSurfaces,[]);
});
test('source impact for a source on multiple views tracks both',()=>{
  const model=cloneFixture();
  model.surfaces.push({...model.surfaces[0],id:'map-fr',locale:'fr',route:'/map/fr'});
  const report=sourceImpact(model,'osm-data');
  assert.deepEqual(report.affectedSurfaces,['map-en','map-fr']);
});
test('source impact path lists are deterministic',()=>{
  assert.deepEqual(sourceImpact(fixture(),'osm-data'),sourceImpact(fixture(),'osm-data'));
});
test('asset impact resolves direct publication root',()=>{
  const report=assetImpact(fixture(),'map-ui');
  assert.equal(report.used,true);
  assert.deepEqual(report.paths[0].chain,['map-ui']);
});
test('asset impact resolves inherited dependency',()=>{
  const report=assetImpact(fixture(),'geometry');
  assert.deepEqual(report.paths[0].chain,['map-ui','geometry']);
});
test('asset impact never treats held unused asset as published',()=>{
  const model=cloneFixture();model.assets.push(makeAsset('extra'));
  const report=assetImpact(model,'extra');
  assert.equal(report.used,false);
  assert.equal(report.paths.length,0);
});
test('asset impact rejects unknown identifier',()=>{
  assert.throws(()=>assetImpact(fixture(),'absent'),RangeError);
});
test('asset impact preserves byte metadata from actual record',()=>{
  assert.equal(assetImpact(fixture(),'geometry').asset.bytes,50200);
});
test('source impact matrix has one row per actual source',()=>{
  const rows=sourceImpactMatrix(fixture());
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(item=>item.sourceId),['local-info','osm-data']);
});
test('source impact matrix preserves permission evidence',()=>{
  const row=sourceImpactMatrix(fixture())[0];
  assert.equal(row.permission,'yes');
});
test('source impact matrix preserves unknown values',()=>{
  const model=cloneFixture();model.sources[0].tier=UNKNOWN;
  assert.equal(sourceImpactMatrix(model).find(item=>item.sourceId==='osm-data').tier,UNKNOWN);
});
test('source impact matrix does not claim all data is current',()=>{
  assert.ok(!JSON.stringify(sourceImpactMatrix(fixture())).includes('currentAsOf'));
});
test('impact TSV exports source and surface identities',()=>{
  const content=sourceImpactTsv(fixture());
  assert.ok(content.includes('sourceId\tsourceName'));
  assert.ok(content.includes('map-en'));
});
test('impact TSV neutralizes hostile source label',()=>{
  const model=cloneFixture();model.sources[0].name='=SUM(A1:A2)';
  const content=sourceImpactTsv(model);
  assert.ok(content.includes("'=SUM(A1:A2)"));
});
test('English impact text includes source credit context',()=>{
  const content=sourceImpactText(fixture(),'osm-data','en');
  assert.ok(content.includes('Source: Fictional map geometry source'));
  assert.ok(content.includes('ODbL'));
});
test('French impact text has nonbreaking colons',()=>{
  const content=sourceImpactText(fixture(),'osm-data','fr');
  assert.ok(content.includes('Source\u00a0:'));
  assert.ok(content.includes('Licence\u00a0:'));
  assert.ok(content.includes('Vues concernées\u00a0:'));
});
test('French impact text preserves the data date unchanged',()=>{
  assert.ok(sourceImpactText(fixture(),'osm-data','fr').includes('2026-11-19'));
});
test('impact text does not invent a licence for unknown sources',()=>{
  const model=cloneFixture();model.sources[0].licence=UNKNOWN;
  assert.ok(sourceImpactText(model,'osm-data','en').includes('Licence: UNKNOWN'));
});
test('impact source tracing handles reused asset through two parents',()=>{
  const model=cloneFixture();
  model.assets.push({...makeAsset('alternate'),mode:'included',path:'/alternate.json',
    dependsOn:['geometry'],sourceIds:[]});
  model.surfaces[0].assetIds.push('alternate');
  const report=sourceImpact(model,'osm-data');
  assert.equal(report.paths.length,2);
  assert.ok(report.paths.some(item=>item.chain.join('/')==='alternate/geometry'));
});
test('impact source tracing is scoped to actual graph',()=>{
  const model=cloneFixture();model.surfaces[0].assetIds=['catalogue'];
  assert.deepEqual(sourceImpact(model,'osm-data').affectedSurfaces,[]);
});
test('new source outside a publication view produces zero impact',()=>{
  const model=cloneFixture();model.sources.push(makeSource('not-used'));
  assert.equal(sourceImpact(model,'not-used').paths.length,0);
});
test('source impact output includes schema version',()=>{
  assert.equal(sourceImpact(fixture(),'osm-data').schema,'attribution-source-impact/1');
});
test('asset impact output includes schema version',()=>{
  assert.equal(assetImpact(fixture(),'geometry').schema,'attribution-asset-impact/1');
});
