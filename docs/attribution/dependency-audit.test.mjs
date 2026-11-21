import test from 'node:test';
import assert from 'node:assert/strict';
import {auditInventory, dependencyClosure, surfaceProjection, compareInventories} from './dependency-audit.mjs';
import {UNKNOWN, OSM_CREDIT, makeAsset, makeSource} from './dependency-core.mjs';
import {fixture, cloneFixture} from './dependency-fixture.mjs';
const report=()=>auditInventory(fixture());
const checks=(change, code, severity='block')=>{
  const model=cloneFixture();
  change(model);
  const audit=auditInventory(model);
  assert.ok(audit.findings.some(item=>item.code===code && item.severity===severity),`${code} not found`);
};
test('fully documented fictional fixture has zero blocking gaps',()=>{
  const result=report();
  assert.equal(result.counts.block,0);
  assert.equal(result.status,'manual-review');
  assert.equal(result.projections.length,1);
});
test('dependency closure includes direct and transitive assets',()=>{
  const result=dependencyClosure(fixture(),['map-ui']);
  assert.deepEqual(result.map(row=>row.id),['geometry','catalogue','map-ui']);
});
test('dependency closure deduplicates shared ancestors',()=>{
  const result=dependencyClosure(fixture(),['geometry','map-ui']);
  assert.deepEqual(result.map(row=>row.id),['geometry','catalogue','map-ui']);
});
test('dependency closure rejects missing root references',()=>{
  assert.throws(()=>dependencyClosure(fixture(),['missing']),RangeError);
});
test('dependency closure with no selected assets is empty',()=>{
  assert.deepEqual(dependencyClosure(fixture(),[]),[]);
});
test('surface projection maps inherited source references',()=>{
  const projection=surfaceProjection(fixture(),'map-en');
  assert.deepEqual(projection.sources.map(source=>source.id),['osm-data','local-info']);
});
test('surface projection exposes source notices without changes',()=>{
  const projection=surfaceProjection(fixture(),'map-en');
  assert.equal(projection.declaredNotices[0].text,OSM_CREDIT);
  assert.equal(projection.declaredNotices.length,2);
});
test('surface projection does not invent asset metadata',()=>{
  const projection=surfaceProjection(fixture(),'map-en');
  assert.equal(projection.assets[0].path,'/maps/geometry.pmtiles');
  assert.equal(projection.assets[0].bytes,50200);
});
test('surface projection rejects unknown surface',()=>{
  assert.throws(()=>surfaceProjection(fixture(),'not-a-view'),RangeError);
});
test('audit shows included asset and required source counts',()=>{
  const result=report();
  assert.equal(result.projections[0].assetIds.length,3);
  assert.equal(result.projections[0].sourceIds.length,2);
  assert.equal(result.projections[0].requiredNotices,2);
});
for(const field of ['sourceUrl','licence','licenceUrl','retrievedOn','tier','credit']) {
  const code={sourceUrl:'SOURCE_URL_UNKNOWN',licence:'LICENCE_UNKNOWN',licenceUrl:'LICENCE_URL_UNKNOWN',
    retrievedOn:'RETRIEVAL_UNKNOWN',tier:'TIER_UNKNOWN',credit:'CREDIT_UNKNOWN'}[field];
  test(`audit blocks unknown source ${field}`,()=>checks(model=>{model.sources[0][field]=UNKNOWN;},code));
}
for(const state of [UNKNOWN,'no']) {
  test(`audit blocks permission ${state}`,()=>checks(model=>{model.sources[0].permission=state;},'PERMISSION_UNSUPPORTED'));
}
test('audit rejects near-miss OSM credit',()=>checks(model=>{model.sources[0].credit='© OpenStreetMap';},'OSM_CREDIT_INEXACT'));
test('audit does not equate publisher name with OSM copyright',()=>{
  const model=cloneFixture();
  model.sources[0].name='Some organization';
  assert.equal(auditInventory(model).counts.block,0);
});
test('audit detects absent OSM notice',()=>checks(model=>{model.surfaces[0].notices.shift();},'NOTICE_MISSING'));
test('audit detects absent other-source notice',()=>checks(model=>{model.surfaces[0].notices.pop();},'NOTICE_MISSING'));
test('audit detects unknown notice text',()=>checks(model=>{model.surfaces[0].notices[0].text=UNKNOWN;},'NOTICE_TEXT_UNKNOWN'));
test('audit detects credit absent from text',()=>checks(model=>{model.surfaces[0].notices[0].text='Unrelated copyright';},'CREDIT_NOT_DISPLAYED'));
for(const state of ['no',UNKNOWN]) {
  test(`audit detects notice visible ${state}`,()=>checks(model=>{model.surfaces[0].notices[0].visible=state;},'NOTICE_NOT_VISIBLE'));
  test(`audit detects notice readable ${state}`,()=>checks(model=>{model.surfaces[0].notices[0].readable=state;},'NOTICE_NOT_READABLE'));
}
test('audit detects unknown observation date',()=>checks(model=>{model.surfaces[0].notices[0].observedOn=UNKNOWN;},'NOTICE_DATE_UNKNOWN'));
for(const position of [UNKNOWN,'absent']) {
  test(`audit blocks OSM position ${position}`,()=>checks(model=>{model.surfaces[0].notices[0].position=position;},'OSM_NOT_ADJACENT'));
  test(`audit marks missing placement ${position}`,()=>checks(model=>{model.surfaces[0].notices[0].position=position;},'NOTICE_PLACEMENT_UNKNOWN'));
}
for(const position of ['visible-panel','details-only']) {
  test(`audit blocks OSM source at ${position}`,()=>checks(model=>{model.surfaces[0].notices[0].position=position;},'OSM_NOT_ADJACENT'));
}
test('audit allows a visible-panel for non-geometry catalogue credit',()=>{
  const model=cloneFixture();
  model.surfaces[0].notices[1].position='visible-panel';
  assert.equal(auditInventory(model).counts.block,0);
});
test('audit reports a notice for a source not used on the view',()=>{
  const model=cloneFixture();
  model.sources.push({...makeSource('unused'),name:'Fictional extra'});
  model.surfaces[0].notices.push({sourceId:'unused',text:UNKNOWN,position:UNKNOWN,
    observedOn:UNKNOWN,visible:UNKNOWN,readable:UNKNOWN});
  assert.ok(auditInventory(model).findings.some(row=>row.code==='UNUSED_NOTICE' && row.severity==='attention'));
});
for(const field of ['keyboard','screenReader','focusVisible']) {
  for(const status of ['no',UNKNOWN]) {
    test(`audit blocks ${field} ${status}`,()=>checks(model=>{model.surfaces[0][field]=status;},`ACCESS_${field.toUpperCase()}`));
  }
}
test('audit blocks unknown surface target',()=>checks(model=>{model.surfaces[0].minimumTargetPx=UNKNOWN;},'TARGET_UNKNOWN'));
for(const px of [0,1,24,43]) {
  test(`audit blocks a ${px}px touch target`,()=>checks(model=>{model.surfaces[0].minimumTargetPx=px;},'TARGET_TOO_SMALL'));
}
for(const px of [44,48,72]) {
  test(`audit accepts a ${px}px recorded target`,()=>{
    const model=cloneFixture();model.surfaces[0].minimumTargetPx=px;
    assert.equal(auditInventory(model).counts.block,0);
  });
}
test('audit blocks a held transitive dependency',()=>checks(model=>{model.assets[0].mode='held';},'HELD_DEPENDENCY'));
test('audit blocks unknown asset path',()=>checks(model=>{model.assets[0].path=UNKNOWN;},'ASSET_PATH_UNKNOWN'));
test('audit keeps asset byte count UNKNOWN informational',()=>checks(model=>{model.assets[0].bytes=UNKNOWN;},'ASSET_BYTES_UNKNOWN','information'));
test('audit blocks an asset with no sources or dependencies',()=>{
  const model=cloneFixture();
  model.assets[0].sourceIds=[];
  const result=auditInventory(model);
  assert.ok(result.findings.some(item=>item.code==='ASSET_ORIGIN_UNKNOWN'));
});
test('audit reports unused included assets without making new surfaces',()=>{
  const model=cloneFixture();
  model.assets.push({...makeAsset('spare'),mode:'included',path:'/spare/file.json'});
  const result=auditInventory(model);
  assert.ok(result.findings.some(item=>item.code==='INCLUDED_ASSET_UNUSED'));
  assert.equal(result.projections.length,1);
});
test('audit reports unused source as information',()=>{
  const model=cloneFixture();model.sources.push(makeSource('extra'));
  const result=auditInventory(model);
  assert.ok(result.findings.some(item=>item.code==='SOURCE_UNUSED' && item.severity==='information'));
});
test('audit flags mixed licence family where ODbL shares a view',()=>{
  assert.ok(report().findings.some(item=>item.code==='MIXED_LICENCE_FAMILIES' && item.severity==='attention'));
});
test('no surfaces cannot be represented as a completed review',()=>{
  const model=cloneFixture();model.surfaces=[];
  const result=auditInventory(model);
  assert.equal(result.status,'no-surfaces');
  assert.deepEqual(result.projections,[]);
});
test('a new surface with zero assets is informational and blocked on missing access evidence',()=>{
  const model=cloneFixture();
  model.surfaces[0].assetIds=[];
  const result=auditInventory(model);
  assert.ok(result.findings.some(item=>item.code==='NO_ASSETS'));
});
test('audit output is deterministic',()=>assert.deepEqual(report(),report()));
test('audit is independent of input array order',()=>{
  const model=cloneFixture();model.sources.reverse();model.assets.reverse();
  const original=report();const reordered=auditInventory(model);
  assert.deepEqual(original.findings,reordered.findings);
});
test('comparison of identical inventories is unchanged',()=>{
  const result=compareInventories(fixture(),fixture());
  assert.equal(result.alerts.length,0);
  assert.equal(result.introduced.length,0);
  assert.equal(result.resolved.length,0);
  assert.equal(result.needsReview,false);
});
test('comparison detects source credit change',()=>{
  const before=fixture(),after=cloneFixture();after.sources[0].credit='Wrong OSM credit';
  const result=compareInventories(before,after);
  assert.ok(result.alerts.some(item=>item.code==='SOURCE_CHANGED' && item.field==='credit'));
  assert.ok(result.introduced.some(item=>item.code==='OSM_CREDIT_INEXACT'));
});
test('comparison detects source date changes without guessing freshness',()=>{
  const after=cloneFixture();after.sources[0].retrievedOn=UNKNOWN;
  const result=compareInventories(fixture(),after);
  assert.ok(result.alerts.some(item=>item.field==='retrievedOn'));
  assert.ok(result.introduced.some(item=>item.code==='RETRIEVAL_UNKNOWN'));
});
test('comparison detects removed asset',()=>{
  const after=cloneFixture();after.assets=after.assets.filter(item=>item.id!=='catalogue');
  after.assets[1].dependsOn=['geometry'];
  const result=compareInventories(fixture(),after);
  assert.ok(result.alerts.some(item=>item.code==='ASSET_REMOVED'));
});
test('comparison detects removed source when no longer referenced',()=>{
  const after=cloneFixture();after.assets[1].sourceIds=[];
  after.sources=after.sources.filter(item=>item.id!=='local-info');
  after.surfaces[0].notices=after.surfaces[0].notices.filter(item=>item.sourceId!=='local-info');
  const result=compareInventories(fixture(),after);
  assert.ok(result.alerts.some(item=>item.code==='SOURCE_REMOVED'));
});
test('comparison detects source newly supplied',()=>{
  const after=cloneFixture();after.sources.push(makeSource('new-source'));
  assert.ok(compareInventories(fixture(),after).alerts.some(item=>item.code==='SOURCE_ADDED'));
});
test('comparison detects new included asset',()=>{
  const after=cloneFixture();after.assets.push({...makeAsset('new-file'),mode:'included',path:'/new/file'});
  assert.ok(compareInventories(fixture(),after).alerts.some(item=>item.code==='ASSET_ADDED'));
});
test('comparison detects dependency edge removed',()=>{
  const after=cloneFixture();after.assets[2].dependsOn=['geometry'];
  assert.ok(compareInventories(fixture(),after).alerts.some(item=>item.code==='ASSET_LINKS_CHANGED'));
});
test('comparison detects changed notice text',()=>{
  const after=cloneFixture();after.surfaces[0].notices[0].text='Changed text';
  assert.ok(compareInventories(fixture(),after).alerts.some(item=>item.code==='NOTICES_CHANGED'));
});
test('comparison detects changed surface route',()=>{
  const after=cloneFixture();after.surfaces[0].route='/new/path';
  assert.ok(compareInventories(fixture(),after).alerts.some(item=>item.code==='SURFACE_CHANGED'));
});
test('comparison reports resolved blocking gaps',()=>{
  const before=cloneFixture();before.surfaces[0].minimumTargetPx=24;
  const result=compareInventories(before,fixture());
  assert.ok(result.resolved.some(item=>item.code==='TARGET_TOO_SMALL'));
});
test('comparison does not mutate inputs',()=>{
  const before=fixture(),after=cloneFixture();
  const oldText=JSON.stringify(before),newText=JSON.stringify(after);
  compareInventories(before,after);
  assert.equal(JSON.stringify(before),oldText);
  assert.equal(JSON.stringify(after),newText);
});
