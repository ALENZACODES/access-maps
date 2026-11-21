import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA,UNKNOWN,OSM_CREDIT,MAX_INPUT_BYTES,REQUIRED,TIERS,RIGHTS,FAMILIES,
  METHODS,DELIVERY,PLACEMENTS,ID_PATTERN,BundleInputError,parseBundle,emptyBundle,
  serializeBundle,validDay,safeHttps,boundedText,identifier,sourceRecord,viewRecord,
  assetRecord,useRecord,noticeRecord,observationRecord,defaultSource,defaultView,
  defaultAsset,defaultUse,defaultNotice,defaultObservation,putRecord,deleteRecord,nextId,
} from './bundle-core.mjs';
import {fixture,changedFixture,secondSourceFixture} from './bundle-fixture.mjs';

const clone=x=>structuredClone(x);
const shouldReject=(input,code)=>assert.throws(()=>parseBundle(input),error=>{
  assert.ok(error instanceof BundleInputError);
  if(code)assert.equal(error.code,code);
  assert.equal(typeof error.path,'string');
  return true;
});

test('fixture passes strict input parsing',()=>{
  const parsed=parseBundle(fixture());
  assert.equal(parsed.schema,SCHEMA);
  assert.equal(parsed.sources.length,1);
  assert.equal(parsed.assets.length,1);
  assert.equal(parsed.uses.length,1);
  assert.equal(parsed.notices.length,2);
  assert.equal(parsed.observations.length,4);
});
test('empty bundle is valid and makes no source claims',()=>{
  const b=parseBundle(emptyBundle());
  assert.deepEqual(b.sources,[]);
  assert.deepEqual(b.views,[]);
  assert.deepEqual(b.notices,[]);
});
test('serialization is deterministic and round-trips',()=>{
  const value=fixture();
  const text=serializeBundle(value);
  assert.ok(text.endsWith('\n'));
  assert.deepEqual(parseBundle(text),parseBundle(value));
  assert.equal(serializeBundle(value),serializeBundle(parseBundle(value)));
});
test('OpenStreetMap credit remains exact and independent of terms',()=>{
  assert.equal(fixture().sources[0].credit,OSM_CREDIT);
  assert.equal(OSM_CREDIT,'© OpenStreetMap contributors');
  assert.ok(!OSM_CREDIT.includes('ODbL'));
});
test('source date UNKNOWN is not replaced',()=>{
  const parsed=parseBundle(fixture());
  assert.equal(parsed.sources[0].datasetAsOf,UNKNOWN);
  assert.equal(serializeBundle(parsed).includes('"datasetAsOf": "UNKNOWN"'),true);
});
test('source provenance fields are explicit',()=>{
  const source=parseBundle(fixture()).sources[0];
  for(const key of ['sourceUrl','licence','licenceUrl','retrievedOn','tier','permission','credit'])assert.ok(Object.hasOwn(source,key),key);
});
test('bundle field order is stable',()=>{
  assert.deepEqual(Object.keys(parseBundle(fixture())),REQUIRED.root);
});
test('all source fields are required',()=>{
  const s=fixture().sources[0];
  assert.deepEqual(Object.keys(s),REQUIRED.source);
});
test('all view fields are required',()=>{
  assert.deepEqual(Object.keys(fixture().views[0]),REQUIRED.view);
});
test('all asset fields are required',()=>{
  assert.deepEqual(Object.keys(fixture().assets[0]),REQUIRED.asset);
});
test('all join fields are required',()=>{
  assert.deepEqual(Object.keys(fixture().uses[0]),REQUIRED.use);
});
test('all notice fields are required',()=>{
  assert.deepEqual(Object.keys(fixture().notices[0]),REQUIRED.notice);
});
test('all observation fields are required',()=>{
  assert.deepEqual(Object.keys(fixture().observations[0]),REQUIRED.observation);
});
for(const input of [null,undefined,[],7,true,'not json']) {
  test(`non-object input rejected: ${String(input)}`,()=>shouldReject(input));
}
for(const key of REQUIRED.root) {
  test(`root rejects missing ${key}`,()=>{
    const b=fixture();delete b[key];shouldReject(b,'FIELD');
  });
}
for(const field of ['sources','views','assets','uses','notices','observations']) {
  test(`collection ${field} must be an array`,()=>{
    const b=fixture();b[field]={};shouldReject(b,'ARRAY');
  });
  test(`collection ${field} rejects duplicate IDs`,()=>{
    const b=fixture();b[field].push(clone(b[field][0]));shouldReject(b,'DUPLICATE');
  });
  test(`collection ${field} rejects primitive row`,()=>{
    const b=fixture();b[field][0]=null;shouldReject(b,'SHAPE');
  });
  test(`collection ${field} rejects unknown fields`,()=>{
    const b=fixture();b[field][0].surprise='wrong';shouldReject(b,'FIELD');
  });
}
for(const [collection,fields] of Object.entries(REQUIRED).filter(([key])=>key!=='root')) {
  const property={source:'sources',view:'views',asset:'assets',use:'uses',notice:'notices',observation:'observations'}[collection];
  for(const field of fields) {
    test(`${collection} rejects absent ${field}`,()=>{
      const b=fixture();delete b[property][0][field];shouldReject(b,'FIELD');
    });
  }
}
test('extra root property is rejected',()=>{
  const b=fixture();b.extra='unsafe';shouldReject(b,'FIELD');
});
test('schema revision must match exactly',()=>{
  const b=fixture();b.schema='map-notice-bundle/2';shouldReject(b,'SCHEMA');
});
test('oversize JSON string fails closed',()=>{
  shouldReject(' '.repeat(MAX_INPUT_BYTES+1),'LIMIT');
});
test('malformed JSON fails closed',()=>shouldReject('{"schema":','JSON'));
test('prototype-created objects do not pass strict parsing',()=>{
  const b=Object.create({schema:SCHEMA});Object.assign(b,fixture());shouldReject(b,'SHAPE');
});
for(const id of ['A','_x','1x','a','a b','a/b','a:b','a?','a'.repeat(81),'☃']) {
  test(`invalid ID rejected: ${id.slice(0,15)}`,()=>assert.throws(()=>identifier(id),BundleInputError));
}
for(const id of ['ab','abc-def','abc_def','abc.def','a9','a'.repeat(80)]) {
  test(`safe identifier accepted: ${id.slice(0,15)}`,()=>assert.equal(identifier(id),id));
}
test('identifier pattern is stable',()=>assert.ok(ID_PATTERN.test('source-1')));
for(const date of ['1900-01-01','2024-02-29','2026-11-20','9999-12-31',UNKNOWN]) {
  test(`valid date accepted: ${date}`,()=>assert.equal(validDay(date),true));
}
for(const date of ['1899-12-31','2023-02-29','2026-00-01','2026-13-01','2026-04-31','2026-02-30','0000-01-01','2026/01/01','tomorrow',null,123]) {
  test(`invalid calendar date rejected: ${String(date)}`,()=>assert.equal(validDay(date),false));
}
for(const value of ['http://example.org','javascript:alert(1)','file:///tmp/a','data:text/html,hi','https://user:secret@example.org','https://localhost/example','https://127.0.0.1/','https://192.168.1.1','https://10.1.1.1','https://172.17.0.1','https://host.local/x','https://example.org/x#frag','https://example.org:8443/x','not-a-url',null]) {
  test(`unsafe source URL is rejected: ${String(value)}`,()=>assert.equal(safeHttps(value),null));
}
for(const value of ['https://example.org','https://www.openstreetmap.org/copyright','https://example.org/path?q=a',UNKNOWN]) {
  test(`safe HTTPS reference retained: ${value}`,()=>assert.notEqual(safeHttps(value),null));
}
for(const value of ['/path','//other','/path?q=1','/path#id','/a/../b','/a/./b','/back\\slash']) {
  test(`local route is evaluated safely: ${value}`,()=>{
    const b=fixture();b.views[0].route=value;
    if(value==='/path')assert.equal(parseBundle(b).views[0].route,value);
    else shouldReject(b,'ROUTE');
  });
}
for(const field of ['sourceUrl','licenceUrl']) {
  test(`unknown ${field} remains valid`,()=>{
    const b=fixture();b.sources[0][field]=UNKNOWN;
    assert.equal(parseBundle(b).sources[0][field],UNKNOWN);
  });
  test(`unsafe ${field} blocks import`,()=>{
    const b=fixture();b.sources[0][field]='javascript:alert(1)';
    shouldReject(b,'URL');
  });
}
for(const [field,options] of [['family',FAMILIES],['tier',TIERS],['permission',RIGHTS]]) {
  for(const option of options) {
    test(`source ${field} accepts ${option}`,()=>{
      const b=fixture();b.sources[0][field]=option;
      assert.equal(parseBundle(b).sources[0][field],option);
    });
  }
  test(`source ${field} rejects unsupported string`,()=>{
    const b=fixture();b.sources[0][field]='not-in-enum';shouldReject(b,'ENUM');
  });
}
for(const option of DELIVERY) {
  test(`delivery accepts ${option}`,()=>{
    const b=fixture();b.views[0].delivery=option;
    assert.equal(parseBundle(b).views[0].delivery,option);
  });
}
for(const option of PLACEMENTS) {
  test(`placement accepts ${option}`,()=>{
    const b=fixture();b.notices[0].placement=option;
    assert.equal(parseBundle(b).notices[0].placement,option);
  });
}
for(const option of METHODS) {
  test(`observation method ${option} is part of contract`,()=>assert.ok(METHODS.includes(option)));
}
for(const size of [UNKNOWN,0,24,44,48,4096]) {
  test(`target size ${size} parses`,()=>{
    const b=fixture();b.observations[3].minimumTargetPx=size;
    assert.equal(parseBundle(b).observations[3].minimumTargetPx,size);
  });
}
for(const size of [-1,4097,44.5,'44','-1',null,NaN]) {
  test(`unsafe target ${String(size)} fails`,()=>{
    const b=fixture();b.observations[3].minimumTargetPx=size;shouldReject(b,'SIZE');
  });
}
test('source record missing reference is rejected',()=>{
  const b=fixture();b.assets[0].sourceIds=['missing'];shouldReject(b,'REFERENCE');
});
test('geometry source must also be an ordinary source',()=>{
  const b=secondSourceFixture();b.assets[0].sourceIds=['osm-source'];shouldReject(b,'REFERENCE');
});
test('asset references an existing view',()=>{
  const b=fixture();b.assets[0].viewId='missing';shouldReject(b,'REFERENCE');
});
test('source use references an existing source',()=>{
  const b=fixture();b.uses[0].sourceId='missing';shouldReject(b,'REFERENCE');
});
test('source use references an existing asset',()=>{
  const b=fixture();b.uses[0].assetId='missing';shouldReject(b,'REFERENCE');
});
test('source use must refer to the asset view',()=>{
  const b=fixture();b.views.push({...b.views[0],id:'another-view'});
  b.uses[0].viewId='another-view';shouldReject(b,'REFERENCE');
});
test('source use must be listed in asset source set',()=>{
  const b=secondSourceFixture();b.assets[0].sourceIds=['osm-source'];
  b.assets[0].geometrySourceIds=['osm-source'];shouldReject(b,'REFERENCE');
});
test('multiple uses for one source and asset are rejected',()=>{
  const b=fixture();b.uses.push({...b.uses[0],id:'different-use'});shouldReject(b,'DUPLICATE');
});
test('notice must reference an existing source use',()=>{
  const b=fixture();b.notices[0].useId='missing';shouldReject(b,'REFERENCE');
});
test('duplicate notice language for source use is rejected',()=>{
  const b=fixture();b.notices[1].locale='en';shouldReject(b,'DUPLICATE');
});
test('observation must reference a view',()=>{
  const b=fixture();b.observations[0].viewId='missing';shouldReject(b,'REFERENCE');
});
test('duplicate observation method for a view is rejected',()=>{
  const b=fixture();b.observations[1].method='visual';shouldReject(b,'DUPLICATE');
});
test('deleting used sources is blocked by references',()=>{
  assert.throws(()=>deleteRecord(fixture(),'sources','osm-source'),BundleInputError);
});
test('deleting used assets is blocked by references',()=>{
  assert.throws(()=>deleteRecord(fixture(),'assets','fictional-path'),BundleInputError);
});
test('deleting referenced views is blocked by references',()=>{
  assert.throws(()=>deleteRecord(fixture(),'views','fictional-map'),BundleInputError);
});
test('deleting a source use with notices is blocked',()=>{
  assert.throws(()=>deleteRecord(fixture(),'uses','fictional-source-use'),BundleInputError);
});
test('deleting one notice does not delete the second locale',()=>{
  const next=deleteRecord(fixture(),'notices','notice-en');
  assert.equal(next.notices.length,1);
  assert.equal(next.notices[0].locale,'fr');
});
test('deleting one observation leaves other methods',()=>{
  const next=deleteRecord(fixture(),'observations','observation-visual');
  assert.equal(next.observations.length,3);
  assert.ok(next.observations.some(x=>x.method==='touch'));
});
test('deleting a nonexistent record is rejected',()=>{
  assert.throws(()=>deleteRecord(fixture(),'notices','missing'),BundleInputError);
});
test('putRecord updates existing notice without duplicate',()=>{
  const b=fixture(),record={...b.notices[0],text:'Modified fictional displayed credit'};
  const next=putRecord(b,'notices',record);
  assert.equal(next.notices.length,2);
  assert.equal(next.notices[0].text,record.text);
  assert.equal(b.notices[0].text,OSM_CREDIT);
});
test('putRecord can add a new unreferenced source',()=>{
  const b=fixture(),next=putRecord(b,'sources',defaultSource('new-source'));
  assert.equal(next.sources.length,2);
  assert.equal(next.sources[1].retrievedOn,UNKNOWN);
});
test('putRecord rejects an invalid reference atomically',()=>{
  const b=fixture();
  assert.throws(()=>putRecord(b,'uses',{...b.uses[0],id:'bad-use',assetId:'missing'}),BundleInputError);
  assert.equal(b.uses.length,1);
});
test('nextId skips occupied identifiers',()=>{
  const b=fixture();
  assert.equal(nextId(b,'sources','source'),'source1');
  b.sources.push(defaultSource('source1'));
  assert.equal(nextId(b,'sources','source'),'source2');
});
test('nextId rejects unknown collection',()=>{
  assert.throws(()=>nextId(fixture(),'bad','source'),BundleInputError);
});
test('default records never infer a licence',()=>{
  const source=defaultSource('source2');
  assert.equal(source.licence,UNKNOWN);
  assert.equal(source.sourceUrl,UNKNOWN);
  assert.equal(source.permission,UNKNOWN);
});
test('default view does not claim publication',()=>{
  assert.equal(defaultView('view2').included,UNKNOWN);
});
test('default asset does not claim inclusion',()=>{
  assert.equal(defaultAsset('asset2','fictional-map').included,UNKNOWN);
});
test('default use starts without asserted rights',()=>{
  assert.equal(defaultUse('use2','fictional-map','fictional-path','osm-source').required,UNKNOWN);
});
test('default notice never supplies invented observation date',()=>{
  assert.equal(defaultNotice('notice2','fictional-source-use','en').observedOn,UNKNOWN);
});
test('default observation starts unknown and unmeasured',()=>{
  const value=defaultObservation('obs2','fictional-map','touch');
  assert.equal(value.result,UNKNOWN);
  assert.equal(value.minimumTargetPx,UNKNOWN);
});
test('freeform text blocks controls',()=>{
  assert.throws(()=>boundedText('line\u0000bad','text'),BundleInputError);
});
test('freeform text can retain meaningful punctuation',()=>{
  assert.equal(boundedText('L’App\u00a0: renseignements','fr'),'L’App\u00a0: renseignements');
});
test('dataset remains unchanged by failed validation',()=>{
  const b=fixture();
  const bad=clone(b);bad.sources[0].retrievedOn='2026-02-30';
  shouldReject(bad,'DATE');
  assert.equal(b.sources[0].retrievedOn,'2026-11-19');
});
test('second source fixture is valid and does not assert redistribution permission',()=>{
  const b=parseBundle(secondSourceFixture());
  assert.equal(b.sources[1].permission,UNKNOWN);
  assert.equal(b.sources[1].datasetAsOf,UNKNOWN);
});
test('unchanged source IDs are never inferred from names',()=>{
  const b=changedFixture(x=>{x.sources[0].name='Different fictional label';});
  assert.equal(parseBundle(b).sources[0].id,'osm-source');
});
