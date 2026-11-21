import test from 'node:test';
import assert from 'node:assert/strict';
import {
 SCHEMA,UNKNOWN,MAX_JSON_BYTES,MAX_SOURCES,MAX_ASSETS,MAX_CHECKS,MAX_MEASUREMENTS,
 STATES,TIERS,METHODS,PLACEMENTS,STATUSES,KINDS,IntegrityInputError,
 parseRegister,parseSource,parseAsset,parseCheck,parseMeasurement,
 blankRegister,newSource,newAsset,newCheck,newMeasurement,
 replaceRecord,removeRecord,serializeRegister,isValidDate,safeHttps,localeFromSearch,creditIsOsm
} from './integrity-core.mjs';
import {fixture,twoAssets,withUnknownFields,clone,HASH_A,HASH_B} from './integrity-fixture.mjs';

const invalid=(value,code)=>assert.throws(()=>parseRegister(value),e=>e instanceof IntegrityInputError&&(!code||e.code===code));

test('a minimal register keeps an explicit version',()=>{
  const input=blankRegister();
  assert.equal(input.schema,SCHEMA);
  assert.deepEqual(input.sources,[]);
  assert.deepEqual(input.assets,[]);
  assert.deepEqual(input.checks,[]);
  assert.deepEqual(input.measurements,[]);
  assert.equal(parseRegister(input).title,input.title);
});
test('the synthetic register round trips without a hidden timestamp',()=>{
  const sample=fixture();
  assert.deepEqual(parseRegister(JSON.stringify(sample)),sample);
  assert.deepEqual(parseRegister(serializeRegister(sample)),sample);
  assert.ok(!serializeRegister(sample).includes('createdAt'));
});
test('two independent included assets retain separate sources',()=>{
  const parsed=parseRegister(twoAssets());
  assert.equal(parsed.sources.length,2);
  assert.equal(parsed.assets.length,2);
  assert.equal(parsed.checks.length,8);
  assert.equal(parsed.measurements.length,2);
});
test('UNKNOWN is preserved exactly instead of invented defaults',()=>{
  const parsed=parseRegister(withUnknownFields());
  assert.equal(parsed.sources[0].retrievedOn,UNKNOWN);
  assert.equal(parsed.sources[0].tier,UNKNOWN);
  assert.equal(parsed.assets[0].sha256,UNKNOWN);
  assert.equal(parsed.assets[0].byteLength,UNKNOWN);
});
test('source records provide source, licence, retrieval and tier',()=>{
  const source=parseSource(fixture().sources[0]);
  assert.equal(source.licence,'ODbL');
  assert.equal(source.retrievedOn,'2026-11-19');
  assert.equal(source.tier,'imported');
  assert.equal(source.permission,'yes');
});
test('included asset retains no actual bytes',()=>{
  const asset=parseAsset(fixture().assets[0]);
  assert.equal(asset.byteLength,150);
  assert.equal(asset.sha256,HASH_A);
  assert.equal(Object.hasOwn(asset,'fileBytes'),false);
});
test('observation carries explicit method and notice evidence',()=>{
  const row=parseCheck(fixture().checks[0]);
  assert.equal(row.method,'visual');
  assert.equal(row.targetPx,44);
  assert.equal(row.observedOn,'2026-11-19');
});
test('measurement carries manually supplied date',()=>{
  const row=parseMeasurement(fixture().measurements[0]);
  assert.equal(row.sha256,HASH_A);
  assert.equal(row.checkedOn,'2026-11-19');
});
test('only the recognised fields are retained by a parser',()=>{
  const parsed=parseRegister(fixture());
  assert.deepEqual(Object.keys(parsed).sort(),['schema','title','sources','assets','checks','measurements'].sort());
});

test('null or array root is rejected',()=>{
  invalid(null,'SHAPE');
  invalid([],'SHAPE');
});
for(const root of [42,'not-json',true,'', '{"schema":']) {
  test(`non-register input ${JSON.stringify(root)} is rejected`,()=>invalid(root));
}
for(const unexpected of ['secret','__proto__','metadata','downloadedAt','accessibility']) {
  test(`unexpected root field ${unexpected} fails closed`,()=>{
    const model=fixture();
    Object.defineProperty(model,unexpected,{value:'not permitted',enumerable:true});
    invalid(model,'FIELD');
  });
}
for(const required of ['schema','title','sources','assets','checks','measurements']) {
  test(`missing root field ${required} fails closed`,()=>{
    const model=fixture();
    delete model[required];
    invalid(model,'FIELD');
  });
}
for(const version of ['map-source-file-integrity/2','legacy',UNKNOWN,null,1]) {
  test(`unsupported schema ${String(version)} is refused`,()=>{
    const model=fixture();model.schema=version;invalid(model,'SCHEMA');
  });
}
test('imports are bounded by UTF-8 bytes, not character count',()=>{
  const input=' '.repeat(MAX_JSON_BYTES+1);
  invalid(input,'LIMIT');
});
test('valid JSON with an unknown schema is not silently migrated',()=>{
  const model=fixture();
  model.schema='map-source-file-integrity/0';
  invalid(JSON.stringify(model),'SCHEMA');
});
for(const field of ['sources','assets','checks','measurements']) {
  test(`${field} must be an array`,()=>{
    const model=fixture();model[field]={};invalid(model,'ARRAY');
  });
}
for(const [field,limit,make] of [
 ['sources',MAX_SOURCES,()=>clone(fixture().sources[0])],
 ['assets',MAX_ASSETS,()=>clone(fixture().assets[0])],
 ['checks',MAX_CHECKS,()=>clone(fixture().checks[0])],
 ['measurements',MAX_MEASUREMENTS,()=>clone(fixture().measurements[0])],
]) {
  test(`${field} rejects collections past ${limit}`,()=>{
    const model=fixture();model[field]=Array.from({length:limit+1},make);invalid(model,'ARRAY');
  });
}
for(const id of ['', '1bad','-bad','bad space','bad/slash','BADCAPS','a'.repeat(81),'x\nnewline']) {
  test(`illegal record identifier ${JSON.stringify(id)}`,()=>{
    const model=fixture();model.sources[0].id=id;invalid(model,'ID');
  });
}
test('duplicate source IDs cannot overwrite evidence',()=>{
  const model=fixture();model.sources.push(clone(model.sources[0]));invalid(model,'DUPLICATE');
});
test('duplicate asset IDs cannot shadow a published file',()=>{
  const model=fixture();model.assets.push(clone(model.assets[0]));invalid(model,'DUPLICATE');
});
test('duplicate check IDs cannot shadow an observation',()=>{
  const model=fixture();model.checks.push(clone(model.checks[0]));invalid(model,'DUPLICATE');
});
test('duplicate measurement IDs cannot hide a changed digest',()=>{
  const model=fixture();model.measurements.push(clone(model.measurements[0]));invalid(model,'DUPLICATE');
});
test('same asset/source/method cannot have two contradictory check slots',()=>{
  const model=fixture();model.checks.push({...model.checks[0],id:'another-check'});invalid(model,'DUPLICATE');
});
test('orphan source IDs on assets are rejected',()=>{
  const model=fixture();model.assets[0].sourceIds=['not-present'];invalid(model,'REFERENCE');
});
test('orphan asset ID on check is rejected',()=>{
  const model=fixture();model.checks[0].assetId='missing';invalid(model,'REFERENCE');
});
test('check source must belong to that asset',()=>{
  const model=twoAssets();model.checks[0].sourceId='other-source';invalid(model,'REFERENCE');
});
test('check source must exist',()=>{
  const model=fixture();model.checks[0].sourceId='missing';invalid(model,'REFERENCE');
});
test('measurement cannot point to an absent file',()=>{
  const model=fixture();model.measurements[0].assetId='missing';invalid(model,'REFERENCE');
});
test('duplicate sources inside one asset are rejected',()=>{
  const model=fixture();model.assets[0].sourceIds=['source-osm','source-osm'];invalid(model,'DUPLICATE');
});
for(const url of [
 'http://example.org/data','javascript:alert(1)','file:///tmp/a','data:text/plain,abc',
 'https://a:b@example.org/secret','https://example.org:444/feed','https://localhost/file',
 'https://127.0.0.1/a','https://192.168.1.3/a','https://10.1.2.3/a',
 'https://172.20.0.1/a','https://[::1]/a','https://example.org/data#fragment',
 '//example.org/relative','/local/path','https://','https://invalid host',
]) {
  test(`unsafe external link ${url} is not accepted`,()=>{
    assert.equal(safeHttps(url),null);
    const model=fixture();model.sources[0].sourceUrl=url;invalid(model,'URL');
  });
}
test('HTTPS source URLs without credentials remain permissible',()=>{
  assert.equal(safeHttps('https://example.org/data?x=1'),'https://example.org/data?x=1');
  assert.equal(safeHttps(UNKNOWN),UNKNOWN);
});
for(const date of ['2026-02-30','2026-13-01','2026-00-01','2025-02-29','not-a-date','2026-1-1','2026-11-31','1900-02-29','1899-12-31','0000-01-01',null]) {
  test(`invalid calendar date ${String(date)} is rejected`,()=>{
    assert.equal(isValidDate(date),false);
    const model=fixture();model.sources[0].retrievedOn=date;invalid(model,'DATE');
  });
}
for(const date of [UNKNOWN,'2024-02-29','2000-02-29','2026-11-20','1900-01-01']) {
  test(`calendar date ${date} is retained`,()=>{
    assert.equal(isValidDate(date),true);
    const model=fixture();model.sources[0].retrievedOn=date;
    assert.equal(parseRegister(model).sources[0].retrievedOn,date);
  });
}
for(const digest of ['A'.repeat(64),'a'.repeat(63),'g'.repeat(64),'SHA256:'+HASH_A,123,'',null]) {
  test(`invalid SHA-256 entry ${String(digest).slice(0,14)} is rejected`,()=>{
    const model=fixture();model.assets[0].sha256=digest;invalid(model,'SHA256');
  });
}
test('different valid digests remain different and are never normalized',()=>{
  const model=fixture();model.assets[0].sha256=HASH_B;
  assert.equal(parseRegister(model).assets[0].sha256,HASH_B);
});
for(const length of [-1,1.5,NaN,Infinity,'150',null,10_000_000_001]) {
  test(`invalid file byte length ${String(length)} is rejected`,()=>{
    const model=fixture();model.assets[0].byteLength=length;invalid(model,'SIZE');
  });
}
test('empty file size is a legitimate known measurement',()=>{
  const model=fixture();model.assets[0].byteLength=0;
  assert.equal(parseRegister(model).assets[0].byteLength,0);
});
for(const value of [-1,44.4,'44',Infinity,4097]) {
  test(`touch target ${String(value)} outside the contract is rejected`,()=>{
    const model=fixture();model.checks[3].targetPx=value;invalid(model,'TARGET');
  });
}
test('a small but known touch target is accepted as evidence and audited separately',()=>{
  const model=fixture();model.checks[3].targetPx=22;
  assert.equal(parseRegister(model).checks[3].targetPx,22);
});
for(const route of ['http://example.org','//other-site','/path/../trick','/path/./dot','/path?x=1','/path#frag','/path\\bad','path-relative']) {
  test(`unsafe publication route ${route} is rejected`,()=>{
    const model=fixture();model.assets[0].route=route;invalid(model,'ROUTE');
  });
}
for(const valid of ['/','/map','/map/subroute','/en/map-review']) {
  test(`local publication route ${valid} is retained`,()=>{
    const model=fixture();model.assets[0].route=valid;
    assert.equal(parseRegister(model).assets[0].route,valid);
  });
}
for(const field of ['permission','creditPresent','licenceShown','focusVisible']) {
  test(`${field} never accepts boolean true as recorded yes`,()=>{
    const model=fixture();const row=field==='permission'?model.sources[0]:model.checks[0];row[field]=true;invalid(model,'ENUM');
  });
}
for(const status of STATUSES) {
  test(`asset publication status ${status} is explicit`,()=>{
    const model=fixture();model.assets[0].status=status;
    assert.equal(parseRegister(model).assets[0].status,status);
  });
}
for(const kind of KINDS) {
  test(`asset kind ${kind} is accepted without inferring geometry`,()=>{
    const model=fixture();model.assets[0].kind=kind;
    assert.equal(parseRegister(model).assets[0].kind,kind);
  });
}
for(const method of METHODS) {
  test(`method ${method} is a separate evidence slot`,()=>{
    const row={...fixture().checks[0],method};
    assert.equal(parseCheck(row).method,method);
  });
}
for(const placement of PLACEMENTS) {
  test(`placement ${placement} is recorded literally`,()=>{
    const row={...fixture().checks[0],placement};
    assert.equal(parseCheck(row).placement,placement);
  });
}
for(const tier of TIERS) {
  test(`evidence tier ${tier} is recorded literally`,()=>{
    const row={...fixture().sources[0],tier};
    assert.equal(parseSource(row).tier,tier);
  });
}
for(const state of STATES) {
  test(`permission state ${state} is recorded literally`,()=>{
    const row={...fixture().sources[0],permission:state};
    assert.equal(parseSource(row).permission,state);
  });
}
test('replaceRecord adds a source but requires references to remain valid',()=>{
  const before=fixture();
  const next=replaceRecord(before,'sources',newSource('new-source'));
  assert.equal(next.sources.length,2);
  assert.equal(before.sources.length,1);
});
test('replaceRecord updates a digest without editing the input register',()=>{
  const before=fixture();
  const next=replaceRecord(before,'assets',{...before.assets[0],sha256:HASH_B});
  assert.equal(next.assets[0].sha256,HASH_B);
  assert.equal(before.assets[0].sha256,HASH_A);
});
test('replaceRecord rejects removal of required references indirectly',()=>{
  const before=fixture();
  assert.throws(()=>replaceRecord(before,'assets',{...before.assets[0],sourceIds:[]}),IntegrityInputError);
});
test('replaceRecord refuses a collection name not in the schema',()=>{
  assert.throws(()=>replaceRecord(fixture(),'credentials',{id:'secret'}),IntegrityInputError);
});
test('removeRecord permits deleting a measurement',()=>{
  const before=fixture();
  const result=removeRecord(before,'measurements','measurement-1');
  assert.deepEqual(result.measurements,[]);
  assert.equal(before.measurements.length,1);
});
test('removeRecord refuses deletion of a source still in use',()=>{
  assert.throws(()=>removeRecord(fixture(),'sources','source-osm'),IntegrityInputError);
});
test('removeRecord refuses deletion of an asset with observations',()=>{
  assert.throws(()=>removeRecord(fixture(),'assets','asset-map'),IntegrityInputError);
});
test('removeRecord refuses an unknown ID',()=>{
  assert.throws(()=>removeRecord(fixture(),'measurements','missing'),IntegrityInputError);
});
test('removeRecord refuses an unknown collection',()=>{
  assert.throws(()=>removeRecord(fixture(),'network','x'),IntegrityInputError);
});
test('new records start as unknown, not as approved evidence',()=>{
  assert.equal(newSource('new-source').permission,UNKNOWN);
  assert.equal(newSource('new-source').retrievedOn,UNKNOWN);
  assert.equal(newAsset('new-asset').sha256,UNKNOWN);
  assert.equal(newAsset('new-asset').status,'draft');
  assert.equal(newCheck('new-check','new-asset','new-source','touch').targetPx,UNKNOWN);
  assert.equal(newMeasurement('new-measure','new-asset',HASH_A,23).checkedOn,UNKNOWN);
});
test('OpenStreetMap credit recognition depends on recorded licence, not ID',()=>{
  assert.equal(creditIsOsm({id:'osm',licence:'UNKNOWN'}),false);
  assert.equal(creditIsOsm({id:'anything',licence:'ODbL'}),true);
  assert.equal(creditIsOsm({id:'anything',licence:'Open Database License'}),true);
});
test('only explicit French query switches the display language',()=>{
  assert.equal(localeFromSearch('?lang=fr'),'fr');
  assert.equal(localeFromSearch('?lang=fr-CA'),'en');
  assert.equal(localeFromSearch('?lang=en'),'en');
  assert.equal(localeFromSearch('?lang=fr&anything=1'),'fr');
  assert.equal(localeFromSearch('?other=fr'),'en');
});
test('regression: an unknown SHA never becomes a computed hash during parse',()=>{
  const model=fixture();model.assets[0].sha256=UNKNOWN;
  const result=parseRegister(model);
  assert.equal(result.assets[0].sha256,UNKNOWN);
});
