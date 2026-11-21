import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA, UNKNOWN, OSM_CREDIT, parseInventory, parseSource, parseAsset, parseSurface,
  parseNotice, safeHttps, safePath, isValidDate, emptyInventory, serializeInventory, makeSource,
  makeAsset, makeSurface, makeNotice, updateRecord, removeRecord, DependencyInputError,
  MAX_INPUT_BYTES, LIMITS} from './dependency-core.mjs';
import {fixture, cloneFixture} from './dependency-fixture.mjs';

const parsed=()=>parseInventory(cloneFixture());
const throws=(change,code)=>{
  const model=cloneFixture();
  change(model);
  assert.throws(()=>parseInventory(model),error=>error instanceof DependencyInputError && error.code===code);
};
test('round-trips a complete fictional inventory without creating values',()=>{
  const original=fixture();
  assert.deepEqual(parseInventory(original),original);
  assert.deepEqual(parseInventory(serializeInventory(original)),original);
});
test('empty inventory is well formed and has no source assumptions',()=>{
  const empty=emptyInventory();
  assert.equal(empty.schema,SCHEMA);
  assert.equal(empty.sources.length,0);
  assert.equal(empty.assets.length,0);
  assert.equal(empty.surfaces.length,0);
  assert.deepEqual(parseInventory(empty),empty);
});
test('source defaults explicitly remain UNKNOWN',()=>{
  const source=makeSource('source2');
  assert.equal(source.name,UNKNOWN);
  assert.equal(source.licence,UNKNOWN);
  assert.equal(source.retrievedOn,UNKNOWN);
  assert.equal(source.tier,UNKNOWN);
  assert.equal(source.permission,UNKNOWN);
  assert.equal(source.credit,UNKNOWN);
});
test('asset defaults do not suggest an external source',()=>{
  const asset=makeAsset('asset2');
  assert.deepEqual(asset.sourceIds,[]);
  assert.deepEqual(asset.dependsOn,[]);
  assert.equal(asset.path,UNKNOWN);
  assert.equal(asset.mode,'held');
});
test('surface defaults explicitly require missing evidence',()=>{
  const surface=makeSurface('view2','fr');
  assert.equal(surface.locale,'fr');
  assert.equal(surface.route,UNKNOWN);
  assert.equal(surface.keyboard,UNKNOWN);
  assert.equal(surface.minimumTargetPx,UNKNOWN);
  assert.deepEqual(surface.notices,[]);
});
test('notice defaults do not invent observation data',()=>{
  const row=makeNotice('osm-data');
  assert.equal(row.text,UNKNOWN);
  assert.equal(row.position,UNKNOWN);
  assert.equal(row.visible,UNKNOWN);
  assert.equal(row.observedOn,UNKNOWN);
});
test('exact OSM source credit is preserved verbatim',()=>{
  assert.equal(parsed().sources[0].credit,OSM_CREDIT);
});
test('string import accepts the same values as object input',()=>{
  assert.deepEqual(parseInventory(JSON.stringify(fixture())),parsed());
});
test('source dates remain data dates and are not system-clock derived',()=>{
  const model=cloneFixture();
  model.sources[0].retrievedOn=UNKNOWN;
  assert.equal(parseInventory(model).sources[0].retrievedOn,UNKNOWN);
});
test('source tier remains UNKNOWN when explicitly set',()=>{
  const model=cloneFixture();model.sources[0].tier=UNKNOWN;
  assert.equal(parseInventory(model).sources[0].tier,UNKNOWN);
});
test('licence remains UNKNOWN when explicitly set',()=>{
  const model=cloneFixture();model.sources[0].licence=UNKNOWN;
  assert.equal(parseInventory(model).sources[0].licence,UNKNOWN);
});
test('permission can be UNKNOWN but is never inferred from publisher',()=>{
  const model=cloneFixture();model.sources[0].permission=UNKNOWN;
  assert.equal(parseInventory(model).sources[0].permission,UNKNOWN);
});
for(const bad of [null,[],false,9,{},'hello',JSON.stringify({schema:'other'})]) {
  test(`malformed root is rejected: ${String(bad).slice(0,25)}`,()=>assert.throws(()=>parseInventory(bad),DependencyInputError));
}
for(const field of ['sources','assets','surfaces']) {
  test(`${field} must be an array`,()=>throws(model=>{model[field]={};},'ARRAY'));
  test(`${field} cannot be omitted`,()=>throws(model=>{delete model[field];},'MISSING_FIELD'));
  test(`${field} cannot contain null`,()=>throws(model=>{model[field].push(null);},'SHAPE'));
  test(`${field} cannot contain unknown fields`,()=>throws(model=>{model[field][0].unexpected=true;},'EXTRA_FIELD'));
  test(`${field} rejects duplicate identifiers`,()=>throws(model=>{model[field].push({...model[field][0]});},'DUPLICATE'));
}
for(const field of ['sourceUrl','licenceUrl']) {
  test(`source ${field} cannot point to HTTP`,()=>throws(model=>{model.sources[0][field]='http://example.org';},'URL'));
  test(`source ${field} cannot include credentials`,()=>throws(model=>{model.sources[0][field]='https://user:pw@example.org/a';},'URL'));
  test(`source ${field} cannot be a local host`,()=>throws(model=>{model.sources[0][field]='https://localhost/a';},'URL'));
}
const invalidUrls=['https://127.0.0.1/a','https://10.0.0.7/a','https://192.168.4.9/a',
  'https://172.16.1.4/a','https://169.254.0.1/a','https://host.local/a',
  'https://host.internal/a','ftp://example.org/a','javascript:alert(1)','/relative',
  'https://example.org:8443/a','https://example.org/a#piece','https://a:b@example.org/a'];
for(const value of invalidUrls) {
  test(`HTTPS validator rejects ${value}`,()=>assert.equal(safeHttps(value),false));
}
for(const value of ['https://example.org/terms','https://www.openstreetmap.org/copyright',UNKNOWN]) {
  test(`HTTPS validator permits ${value}`,()=>assert.equal(safeHttps(value),true));
}
const invalidPaths=['relative/file','//example.org/file','/x/../y','/a/./b','/a?x=1',
  '/a#frag','/a\\b','/percent%20encoded','/','',null,42];
for(const value of invalidPaths) {
  test(`path validator rejects ${String(value)}`,()=>assert.equal(safePath(value),false));
}
for(const value of ['/map/en','/assets/offline.pmtiles',UNKNOWN]) {
  test(`path validator accepts ${value}`,()=>assert.equal(safePath(value),true));
}
for(const date of ['2026-02-30','2026-13-01','2026-00-01','2026-01-00','2026-11-31',
  '2026-2-2','2026-01-1','1899-12-31','not-a-date',null,0]) {
  test(`calendar validator rejects ${String(date)}`,()=>assert.equal(isValidDate(date),false));
}
for(const date of ['2000-02-29','2024-02-29','2026-11-20','1900-01-01',UNKNOWN]) {
  test(`calendar validator accepts ${date}`,()=>assert.equal(isValidDate(date),true));
}
test('calendar validator rejects nonleap 1900-02-29',()=>assert.equal(isValidDate('1900-02-29'),false));
test('top-level unexpected fields are rejected',()=>throws(model=>{model.unexpected='x';},'EXTRA_FIELD'));
test('unsupported schema does not silently migrate',()=>throws(model=>{model.schema='attribution-dependency-inventory/2';},'SCHEMA'));
test('asset references must exist',()=>throws(model=>{model.assets[2].dependsOn=['absent'];},'REFERENCE'));
test('source references must exist',()=>throws(model=>{model.assets[1].sourceIds=['absent'];},'REFERENCE'));
test('surface asset references must exist',()=>throws(model=>{model.surfaces[0].assetIds=['absent'];},'REFERENCE'));
test('surface notice source references must exist',()=>throws(model=>{model.surfaces[0].notices[0].sourceId='absent';},'REFERENCE'));
test('direct cycles are rejected',()=>throws(model=>{model.assets[0].dependsOn=['geometry'];},'CYCLE'));
test('two-node cycles are rejected',()=>throws(model=>{model.assets[0].dependsOn=['map-ui'];},'CYCLE'));
test('three-node cycles are rejected',()=>throws(model=>{model.assets[0].dependsOn=['catalogue'];model.assets[1].dependsOn=['map-ui'];},'CYCLE'));
test('duplicate asset dependencies are rejected',()=>throws(model=>{model.assets[2].dependsOn=['geometry','geometry'];},'DUPLICATE'));
test('duplicate surface source notices are rejected',()=>throws(model=>{model.surfaces[0].notices.push({...model.surfaces[0].notices[0]});},'DUPLICATE'));
test('asset byte values cannot be negative',()=>throws(model=>{model.assets[0].bytes=-1;},'BYTES'));
test('asset bytes reject nonintegral values',()=>throws(model=>{model.assets[0].bytes=4.5;},'BYTES'));
test('asset bytes reject Infinity',()=>throws(model=>{model.assets[0].bytes=Infinity;},'BYTES'));
test('surface target cannot be negative',()=>throws(model=>{model.surfaces[0].minimumTargetPx=-2;},'TARGET'));
test('surface target rejects strings',()=>throws(model=>{model.surfaces[0].minimumTargetPx='44';},'TARGET'));
test('source input blocks control characters',()=>throws(model=>{model.sources[0].name='x\u0000';},'TEXT'));
test('source name cannot be empty',()=>throws(model=>{model.sources[0].name='';},'TEXT'));
test('asset labels cannot contain newlines',()=>throws(model=>{model.assets[0].label='bad\nname';},'TEXT'));
test('source identifiers must begin with a letter',()=>throws(model=>{model.sources[0].id='1bad';},'IDENTIFIER'));
test('source identifiers cannot contain spaces',()=>throws(model=>{model.sources[0].id='source bad';},'IDENTIFIER'));
test('source identifiers cannot be too long',()=>throws(model=>{model.sources[0].id='a'.repeat(100);},'IDENTIFIER'));
test('source tiers are enumerated',()=>throws(model=>{model.sources[0].tier='invented';},'ENUM'));
test('source permission is enumerated',()=>throws(model=>{model.sources[0].permission='probably';},'ENUM'));
test('asset kinds are enumerated',()=>throws(model=>{model.assets[0].kind='imaginary';},'ENUM'));
test('asset states are enumerated',()=>throws(model=>{model.assets[0].mode='published';},'ENUM'));
test('surface locale is enumerated',()=>throws(model=>{model.surfaces[0].locale='fr-CA';},'ENUM'));
test('surface notice placement is enumerated',()=>throws(model=>{model.surfaces[0].notices[0].position='around';},'ENUM'));
test('surface notice date is calendar checked',()=>throws(model=>{model.surfaces[0].notices[0].observedOn='2026-02-30';},'DATE'));
test('schema input has byte limit',()=>assert.throws(()=>parseInventory(' '.repeat(MAX_INPUT_BYTES+1)),error=>error.code==='LIMIT'));
test('collection size limits remain finite',()=>{
  assert.ok(LIMITS.sources<=200);
  assert.ok(LIMITS.assets<=1000);
  assert.ok(LIMITS.surfaces<=200);
  assert.ok(LIMITS.notices<=1500);
});
test('standalone parser validates source records',()=>{
  assert.deepEqual(parseSource(fixture().sources[0]),fixture().sources[0]);
});
test('standalone parser validates asset records',()=>{
  assert.deepEqual(parseAsset(fixture().assets[0]),fixture().assets[0]);
});
test('standalone parser validates surface records',()=>{
  assert.deepEqual(parseSurface(fixture().surfaces[0]),fixture().surfaces[0]);
});
test('standalone parser validates notice records',()=>{
  assert.deepEqual(parseNotice(fixture().surfaces[0].notices[0]),fixture().surfaces[0].notices[0]);
});
test('updateRecord replaces a source without modifying original',()=>{
  const model=fixture();
  const newSource={...model.sources[0],name:'Changed fictional source'};
  const edited=updateRecord(model,'sources',newSource);
  assert.equal(edited.sources[0].name,'Changed fictional source');
  assert.notEqual(model.sources[0].name,newSource.name);
});
test('updateRecord adds a held asset',()=>{
  const model=fixture();
  const edited=updateRecord(model,'assets',makeAsset('held-copy'));
  assert.equal(edited.assets.length,4);
  assert.equal(edited.assets[3].mode,'held');
});
test('updateRecord adds a source with UNKNOWN',()=>{
  const model=fixture();
  const edited=updateRecord(model,'sources',makeSource('extra-source'));
  assert.equal(edited.sources.length,3);
  assert.equal(edited.sources[2].retrievedOn,UNKNOWN);
});
test('removeRecord refuses removing a referenced source',()=>{
  assert.throws(()=>removeRecord(fixture(),'sources','osm-data'),error=>error.code==='REFERENCE');
});
test('removeRecord refuses removing a referenced asset',()=>{
  assert.throws(()=>removeRecord(fixture(),'assets','geometry'),error=>error.code==='REFERENCE');
});
test('removeRecord deletes an unreferenced source',()=>{
  const model=updateRecord(fixture(),'sources',makeSource('unused'));
  const edited=removeRecord(model,'sources','unused');
  assert.equal(edited.sources.length,2);
});
test('removeRecord rejects absent ids',()=>{
  assert.throws(()=>removeRecord(fixture(),'assets','not-here'),error=>error.code==='REFERENCE');
});
test('record mutation rejects unknown collections',()=>{
  assert.throws(()=>updateRecord(fixture(),'other',{}),error=>error.code==='COLLECTION');
  assert.throws(()=>removeRecord(fixture(),'other','x'),error=>error.code==='COLLECTION');
});
test('parseInventory rejects extra private data fields',()=>{
  throws(model=>{model.sources[0].email='someone@example.org';},'EXTRA_FIELD');
});
test('serialization adds a single terminal newline',()=>{
  const text=serializeInventory(fixture());
  assert.ok(text.endsWith('\n'));
  assert.ok(!text.endsWith('\n\n'));
});
