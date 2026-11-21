import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditRegister,measurementMatches,missingSlots,coverageRows,sourceImpact,compareRegisters,CODES
} from './integrity-audit.mjs';
import {UNKNOWN,METHODS,OSM_CREDIT} from './integrity-core.mjs';
import {fixture,twoAssets,clone,HASH_A,HASH_B} from './integrity-fixture.mjs';

const codes=value=>auditRegister(value).findings.map(x=>x.code);
const has=(model,code)=>assert.ok(codes(model).includes(code),`Expected ${code}; got ${codes(model).join(', ')}`);
const clear=(model,code)=>assert.ok(!codes(model).includes(code),`Unexpected ${code}`);
const modify=(edit)=>{const state=fixture();edit(state);return state;};

test('complete fictional record is free of blocking gaps',()=>{
  const result=auditRegister(fixture());
  assert.equal(result.totals.block,0);
  assert.equal(result.publication,'review-needed');
  assert.deepEqual(result.includedAssets,['asset-map']);
});
test('two complete fictional assets have no blocking gaps',()=>{
  const result=auditRegister(twoAssets());
  assert.equal(result.totals.block,0);
  assert.equal(result.includedAssets.length,2);
});
test('an empty register is not a publication approval',()=>{
  const model=fixture();
  model.assets[0].status='held';
  const report=auditRegister(model);
  assert.equal(report.publication,'no-candidates');
  assert.ok(report.findings.some(x=>x.code==='NO_INCLUDED_ASSETS'));
});
test('audit never rewrites or timestamps supplied records',()=>{
  const model=fixture(),before=JSON.stringify(model);
  auditRegister(model);
  assert.equal(JSON.stringify(model),before);
});
test('all findings have stable structured severity and evidence coordinates',()=>{
  const model=modify(m=>m.checks=[]);
  for(const row of auditRegister(model).findings) {
    assert.ok(CODES.includes(row.code));
    assert.ok(['block','attention','information'].includes(row.severity));
    assert.equal(typeof row.assetId,'string');
    assert.equal(typeof row.sourceId,'string');
    assert.equal(typeof row.method,'string');
    assert.equal(typeof row.detail,'string');
  }
});
test('findings order is deterministic for repeated audits',()=>{
  const model=twoAssets();
  model.checks=[];
  assert.deepEqual(auditRegister(model),auditRegister(model));
});
test('included asset with no sources is explicitly blocked',()=>{
  const model=modify(m=>{m.assets[0].sourceIds=[];m.checks=[];});
  has(model,'ASSET_WITHOUT_SOURCE');
});
test('an absent route blocks publication',()=>{
  has(modify(m=>m.assets[0].route=UNKNOWN),'ASSET_ROUTE_UNKNOWN');
});
test('unknown kind blocks publication',()=>{
  has(modify(m=>m.assets[0].kind=UNKNOWN),'ASSET_KIND_UNKNOWN');
});
test('missing expected digest blocks publication',()=>{
  has(modify(m=>m.assets[0].sha256=UNKNOWN),'ASSET_HASH_UNKNOWN');
});
test('missing expected byte length blocks publication',()=>{
  has(modify(m=>m.assets[0].byteLength=UNKNOWN),'ASSET_BYTES_UNKNOWN');
});
test('missing measurement blocks publication',()=>{
  has(modify(m=>m.measurements=[]),'MEASUREMENT_MISSING');
});
test('measurement with UNKNOWN date is not treated as fresh',()=>{
  has(modify(m=>m.measurements[0].checkedOn=UNKNOWN),'MEASUREMENT_DATE_UNKNOWN');
});
test('measurement with UNKNOWN hash is not treated as equal',()=>{
  has(modify(m=>m.measurements[0].sha256=UNKNOWN),'MEASUREMENT_DIGEST_UNKNOWN');
});
test('measurement with UNKNOWN byte count is not treated as equal',()=>{
  has(modify(m=>m.measurements[0].byteLength=UNKNOWN),'MEASUREMENT_BYTES_UNKNOWN');
});
test('different hash blocks release even with matching byte count',()=>{
  has(modify(m=>m.measurements[0].sha256=HASH_B),'FILE_HASH_MISMATCH');
});
test('different byte count blocks release even with matching hash',()=>{
  has(modify(m=>m.measurements[0].byteLength=151),'FILE_LENGTH_MISMATCH');
});
test('two conflicting measurements block release even if one matches',()=>{
  const model=modify(m=>m.measurements.push({...m.measurements[0],id:'measurement-2',sha256:HASH_B}));
  has(model,'MEASUREMENT_CONFLICT');
  has(model,'FILE_HASH_MISMATCH');
});
test('two identical measurements do not conflict',()=>{
  const model=modify(m=>m.measurements.push({...m.measurements[0],id:'measurement-2'}));
  clear(model,'MEASUREMENT_CONFLICT');
});
test('unknown source address is a blocking gap',()=>{
  has(modify(m=>m.sources[0].sourceUrl=UNKNOWN),'SOURCE_URL_UNKNOWN');
});
test('unknown source licence is a blocking gap',()=>{
  has(modify(m=>m.sources[0].licence=UNKNOWN),'LICENCE_UNKNOWN');
});
test('unknown licence address is a blocking gap',()=>{
  has(modify(m=>m.sources[0].licenceUrl=UNKNOWN),'LICENCE_URL_UNKNOWN');
});
test('unknown retrieval date is a blocking gap',()=>{
  has(modify(m=>m.sources[0].retrievedOn=UNKNOWN),'RETRIEVAL_UNKNOWN');
});
test('unknown evidence tier is a blocking gap',()=>{
  has(modify(m=>m.sources[0].tier=UNKNOWN),'TIER_UNKNOWN');
});
test('unknown credit is a blocking gap',()=>{
  has(modify(m=>m.sources[0].credit=UNKNOWN),'SOURCE_CREDIT_UNKNOWN');
});
test('unknown permission cannot be upgraded to yes by a licence name',()=>{
  has(modify(m=>m.sources[0].permission=UNKNOWN),'PERMISSION_UNKNOWN');
});
test('permission recorded as no explicitly blocks distribution',()=>{
  has(modify(m=>m.sources[0].permission='no'),'PERMISSION_DENIED');
});
test('incorrect OpenStreetMap credit is rejected independently',()=>{
  const model=modify(m=>m.sources[0].credit='OpenStreetMap');
  has(model,'OSM_EXACT_CREDIT');
});
test('the exact required OpenStreetMap credit is allowed',()=>{
  const model=fixture();
  assert.equal(model.sources[0].credit,OSM_CREDIT);
  clear(model,'OSM_EXACT_CREDIT');
});
for(const method of METHODS) {
  test(`${method} missing observation blocks coverage`,()=>{
    const model=modify(m=>m.checks=m.checks.filter(x=>x.method!==method));
    const report=auditRegister(model);
    assert.ok(report.findings.some(x=>x.code==='CHECK_MISSING'&&x.method===method));
  });
  test(`${method} observation date cannot remain UNKNOWN`,()=>{
    const model=modify(m=>m.checks.find(x=>x.method===method).observedOn=UNKNOWN);
    has(model,'OBSERVED_ON_UNKNOWN');
  });
  test(`${method} displayed notice cannot remain UNKNOWN`,()=>{
    const model=modify(m=>m.checks.find(x=>x.method===method).noticeText=UNKNOWN);
    has(model,'NOTICE_TEXT_UNKNOWN');
  });
  test(`${method} displayed notice must contain its source credit`,()=>{
    const model=modify(m=>m.checks.find(x=>x.method===method).noticeText='Unrelated string');
    has(model,'NOTICE_MISSING_CREDIT');
  });
  test(`${method} explicit absent source credit is blocking`,()=>{
    const model=modify(m=>m.checks.find(x=>x.method===method).creditPresent='no');
    has(model,'CREDIT_NOT_PRESENT');
  });
  test(`${method} unknown source credit observation is blocking`,()=>{
    const model=modify(m=>m.checks.find(x=>x.method===method).creditPresent=UNKNOWN);
    has(model,'CREDIT_UNKNOWN');
  });
  test(`${method} absent licence information is blocking`,()=>{
    const model=modify(m=>m.checks.find(x=>x.method===method).licenceShown='no');
    has(model,'LICENCE_NOT_SHOWN');
  });
  test(`${method} unknown licence observation is blocking`,()=>{
    const model=modify(m=>m.checks.find(x=>x.method===method).licenceShown=UNKNOWN);
    has(model,'LICENCE_SHOWN_UNKNOWN');
  });
  test(`${method} missing placement is blocking`,()=>{
    const model=modify(m=>m.checks.find(x=>x.method===method).placement=UNKNOWN);
    has(model,'PLACEMENT_UNKNOWN');
  });
  test(`${method} OSM credit must appear beside the map`,()=>{
    const model=modify(m=>m.checks.find(x=>x.method===method).placement='details-only');
    has(model,'OSM_NOT_BESIDE_MAP');
  });
  test(`${method} missing observation reference is shown as attention`,()=>{
    const model=modify(m=>m.checks.find(x=>x.method===method).evidence=UNKNOWN);
    const report=auditRegister(model);
    assert.ok(report.findings.some(x=>x.code==='EVIDENCE_UNKNOWN'&&x.method===method&&x.severity==='attention'));
  });
}
test('keyboard focus recorded as no blocks publication',()=>{
  const model=modify(m=>m.checks.find(x=>x.method==='keyboard').focusVisible='no');
  has(model,'KEYBOARD_FOCUS_ABSENT');
});
test('unknown keyboard focus blocks publication',()=>{
  const model=modify(m=>m.checks.find(x=>x.method==='keyboard').focusVisible=UNKNOWN);
  has(model,'KEYBOARD_FOCUS_UNKNOWN');
});
test('unknown touch target size is not assumed to be 44px',()=>{
  const model=modify(m=>m.checks.find(x=>x.method==='touch').targetPx=UNKNOWN);
  has(model,'TOUCH_TARGET_UNKNOWN');
});
test('43px touch target is a blocking recorded gap',()=>{
  const model=modify(m=>m.checks.find(x=>x.method==='touch').targetPx=43);
  has(model,'TOUCH_TARGET_SMALL');
});
test('44px touch target clears the size gap',()=>{
  const model=modify(m=>m.checks.find(x=>x.method==='touch').targetPx=44);
  clear(model,'TOUCH_TARGET_SMALL');
});
test('OSM adjacent credit rule is scoped to map-like geometry',()=>{
  const model=modify(m=>{m.assets[0].kind='document';m.checks[0].placement='visible-panel';});
  clear(model,'OSM_NOT_BESIDE_MAP');
});
test('held assets do not become publication candidates',()=>{
  const model=modify(m=>{m.assets[0].status='held';m.measurements=[];m.checks=[];});
  clear(model,'MEASUREMENT_MISSING');
  has(model,'HELD_ASSET');
});
test('source only used in held asset is informational',()=>{
  const model=modify(m=>m.assets[0].status='held');
  has(model,'UNUSED_SOURCE');
});
test('unused human check is reported but not treated as a published map observation',()=>{
  const model=modify(m=>m.assets[0].status='held');
  has(model,'UNUSED_CHECK');
});
test('unused file measurement is reported separately',()=>{
  const model=modify(m=>m.assets[0].status='held');
  has(model,'UNUSED_MEASUREMENT');
});
for(const asset of [null,{}, {id:'different',sha256:HASH_A,byteLength:150}]) {
  test(`unrelated measurement ${String(asset?.id)} is not compared`,()=>{
    assert.equal(measurementMatches(asset,fixture().measurements[0]),'unrelated');
  });
}
test('matching recorded digest and size produce an explicit match',()=>{
  const model=fixture();
  assert.equal(measurementMatches(model.assets[0],model.measurements[0]),'match');
});
test('nonmatching digest produces mismatch',()=>{
  const model=fixture();model.measurements[0].sha256=HASH_B;
  assert.equal(measurementMatches(model.assets[0],model.measurements[0]),'mismatch');
});
test('missing expected evidence produces UNKNOWN, not match',()=>{
  const model=fixture();model.assets[0].sha256=UNKNOWN;
  assert.equal(measurementMatches(model.assets[0],model.measurements[0]),UNKNOWN);
});
test('no observations creates all four missing method slots',()=>{
  const model=modify(m=>m.checks=[]);
  assert.deepEqual(missingSlots(model).map(x=>x.method),METHODS);
});
test('partial observations create only the absent slots',()=>{
  const model=modify(m=>m.checks=m.checks.filter(x=>x.method==='visual'));
  assert.deepEqual(missingSlots(model).map(x=>x.method),['keyboard','screen-reader','touch']);
});
test('a complete included asset has no missing method slots',()=>{
  assert.deepEqual(missingSlots(fixture()),[]);
});
test('held assets have no required observation slots',()=>{
  const model=modify(m=>{m.assets[0].status='held';m.checks=[];});
  assert.deepEqual(missingSlots(model),[]);
});
test('coverage matrix provides one row per asset/source/method',()=>{
  const matrix=coverageRows(twoAssets());
  assert.equal(matrix.length,8);
  assert.deepEqual(matrix.map(x=>x.method),[...METHODS,...METHODS]);
});
test('coverage rows carry licence, retrieval and digest without inventing evidence',()=>{
  const row=coverageRows(fixture())[0];
  assert.equal(row.licence,'ODbL');
  assert.equal(row.retrievedOn,'2026-11-19');
  assert.equal(row.expectedSha256,HASH_A);
  assert.equal(row.measurementCount,1);
});
test('coverage marks missing observations distinctly from recorded gaps',()=>{
  const model=modify(m=>m.checks=[]);
  const rows=coverageRows(model);
  assert.ok(rows.every(x=>x.state==='missing'));
  assert.ok(rows.every(x=>x.checkId===UNKNOWN));
});
test('coverage marks held sources as held',()=>{
  const model=modify(m=>m.assets[0].status='held');
  assert.ok(coverageRows(model).every(x=>x.state==='held'));
});
test('coverage marks a digest mismatch as gap for each used source',()=>{
  const model=modify(m=>m.measurements[0].sha256=HASH_B);
  assert.ok(coverageRows(model).every(x=>x.state==='gap'));
});
test('source impact is scoped to a selected source identifier',()=>{
  const impact=sourceImpact(twoAssets(),'source-osm');
  assert.deepEqual(impact.assets.map(x=>x.id),['asset-map']);
  assert.equal(impact.checks.length,4);
  assert.equal(impact.measurements.length,1);
});
test('unknown source impact never assumes a source',()=>{
  const impact=sourceImpact(fixture(),'missing');
  assert.deepEqual(impact.assets,[]);
  assert.deepEqual(impact.findings,[]);
});
test('source impact shows missing measurements for its file',()=>{
  const model=modify(m=>m.measurements=[]);
  const impact=sourceImpact(model,'source-osm');
  assert.ok(impact.findings.some(x=>x.code==='MEASUREMENT_MISSING'));
});
test('unchanged registers have no introduced or resolved gaps',()=>{
  const model=fixture(),compare=compareRegisters(model,clone(model));
  assert.equal(compare.introduced.length,0);
  assert.equal(compare.resolved.length,0);
  assert.equal(compare.regressions.length,0);
  assert.equal(compare.worsened,false);
});
test('new digest mismatch is an introduced blocking regression',()=>{
  const earlier=fixture(),later=clone(earlier);
  later.measurements[0].sha256=HASH_B;
  const diff=compareRegisters(earlier,later);
  assert.ok(diff.introduced.some(x=>x.code==='FILE_HASH_MISMATCH'));
  assert.ok(diff.regressions.some(x=>x.code==='MEASUREMENT_CHANGED'));
  assert.equal(diff.worsened,true);
});
test('restored measurement resolves missing digest gap',()=>{
  const earlier=modify(m=>m.measurements=[]),later=fixture();
  assert.ok(compareRegisters(earlier,later).resolved.some(x=>x.code==='MEASUREMENT_MISSING'));
});
test('removing an included asset is a blocking regression',()=>{
  const earlier=fixture(),later=clone(earlier);
  later.assets=[];later.checks=[];later.measurements=[];
  const diff=compareRegisters(earlier,later);
  assert.ok(diff.regressions.some(x=>x.code==='INCLUDED_ASSET_REMOVED'));
});
test('holding an included asset is a blocking regression',()=>{
  const earlier=fixture(),later=clone(earlier);later.assets[0].status='held';
  assert.ok(compareRegisters(earlier,later).regressions.some(x=>x.code==='INCLUDED_ASSET_REMOVED'));
});
test('changed expected digest is surfaced even when no measured bytes changed',()=>{
  const earlier=fixture(),later=clone(earlier);later.assets[0].sha256=HASH_B;
  assert.ok(compareRegisters(earlier,later).regressions.some(x=>x.code==='ASSET_EVIDENCE_CHANGED'&&x.detail==='sha256'));
});
test('removing an included source is a regression',()=>{
  const earlier=twoAssets(),later=clone(earlier);
  later.assets[0].sourceIds=[];
  later.checks=later.checks.filter(x=>x.assetId!=='asset-map');
  const diff=compareRegisters(earlier,later);
  assert.ok(diff.regressions.some(x=>x.code==='ASSET_SOURCE_REMOVED'));
});
test('changed licence evidence is explicitly exposed',()=>{
  const earlier=fixture(),later=clone(earlier);later.sources[0].licence='Other terms';
  assert.ok(compareRegisters(earlier,later).regressions.some(x=>x.code==='SOURCE_CHANGED'&&x.detail==='licence'));
});
test('removing a measurement is a regression even if an asset remains present',()=>{
  const earlier=fixture(),later=clone(earlier);later.measurements=[];
  assert.ok(compareRegisters(earlier,later).regressions.some(x=>x.code==='MEASUREMENT_REMOVED'));
});
test('measurement date change is not hidden',()=>{
  const earlier=fixture(),later=clone(earlier);later.measurements[0].checkedOn='2026-11-20';
  assert.ok(compareRegisters(earlier,later).regressions.some(x=>x.code==='MEASUREMENT_CHANGED'&&x.detail==='checkedOn'));
});
test('comparison never changes either input register',()=>{
  const earlier=fixture(),later=fixture();later.measurements[0].byteLength=151;
  const a=JSON.stringify(earlier),b=JSON.stringify(later);
  compareRegisters(earlier,later);
  assert.equal(JSON.stringify(earlier),a);
  assert.equal(JSON.stringify(later),b);
});
