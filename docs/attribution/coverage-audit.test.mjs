import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoverageRegister } from './coverage-core.mjs';
import { auditCoverage, FINDINGS, coverageMatrix, coverageCountsByProvider } from './coverage-audit.mjs';
import { register,source,view,metrolinxAua,metrolinxOgl,ltc } from './coverage-fixture.test.mjs';
const check=(raw)=>auditCoverage(parseCoverageRegister(raw));
const has=(audit,code)=>audit.findings.some((item)=>item.code===code);
const sourceCase=(overrides)=>check(register({sources:[source(overrides)]}));
const viewCase=(overrides)=>check(register({views:[view(overrides)]}));

test('valid explicit evidence with unknown dataset date is not blocked',()=>{
  const result=check(register());assert.equal(result.blocked,false);assert.equal(result.blocks,0);
  assert.ok(has(result,FINDINGS.DATASET_DATE_UNKNOWN));
});
test('empty included register fails closed',()=>{
  const audit=check(register({sources:[],views:[]}));
  assert.equal(audit.blocked,true);assert.ok(has(audit,FINDINGS.NO_SOURCES));assert.ok(has(audit,FINDINGS.NO_VIEWS));
});
test('records held from release do not count as included',()=>{
  const audit=check(register({sources:[source({state:'held'})],views:[view({state:'held'})]}));
  assert.ok(has(audit,FINDINGS.NO_SOURCES));assert.ok(has(audit,FINDINGS.NO_VIEWS));
});
test('duplicate use is blocked by parser before audit',()=>assert.throws(()=>parseCoverageRegister(register({views:[view(),view()]}))));
for(const [field,value,code] of [
  ['sourceUrl','UNKNOWN',FINDINGS.SOURCE_URL_UNKNOWN],
  ['licenceUrl','UNKNOWN',FINDINGS.LICENCE_URL_UNKNOWN],
  ['licenceKind','UNKNOWN',FINDINGS.LICENCE_UNKNOWN],
  ['permission','UNKNOWN',FINDINGS.PERMISSION_UNKNOWN],
  ['permission','NO',FINDINGS.PERMISSION_DENIED],
  ['evidenceTier','UNKNOWN',FINDINGS.TIER_UNKNOWN],
  ['acquiredOn','UNKNOWN',FINDINGS.ACQUISITION_UNKNOWN],
  ['termsReviewedOn','UNKNOWN',FINDINGS.TERMS_DATE_UNKNOWN],
  ['attribution','',FINDINGS.SOURCE_NOTICE_MISSING],
]){
  test(`${field}=${value || 'empty'} blocks included source`,()=>{
    const audit=sourceCase({[field]:value});assert.equal(audit.blocked,true);assert.ok(has(audit,code),JSON.stringify(audit.findings));
  });
}
test('dataset date unknown is information, not inferred',()=>{
  const audit=sourceCase({datasetAsOf:'UNKNOWN'});
  assert.equal(audit.blocked,false);assert.ok(has(audit,FINDINGS.DATASET_DATE_UNKNOWN));
});
test('open licence evidence cannot be determined from provider alone',()=>{
  const audit=sourceCase({provider:'other',licenceKind:'other-open',licenceName:'Unknown proprietary terms'});
  assert.ok(has(audit,FINDINGS.LICENCE_NOT_OPEN));
});
test('explicit open licence name on other source still needs rights',()=>{
  const audit=sourceCase({provider:'other',licenceKind:'other-open',licenceName:'Creative Commons Attribution 4.0',permission:'UNKNOWN'});
  assert.ok(has(audit,FINDINGS.PERMISSION_UNKNOWN));
});
test('OSM credit and ODbL are separate requirements',()=>{
  assert.ok(has(sourceCase({attribution:'Open Database License (ODbL) 1.0'}),FINDINGS.OSM_CREDIT_MISSING));
  assert.ok(has(sourceCase({licenceKind:'other-open',licenceName:'Open Database License (ODbL) 1.0'}),FINDINGS.OSM_ODBL_MISSING));
});
test('correct Metrolinx AUA notices are accepted as one specific licence path',()=>{
  const audit=check(register({sources:[metrolinxAua()],views:[view({sourceIds:['go-feed'],kind:'journey',mapCredit:'UNKNOWN'})]}));
  assert.equal(audit.blocked,false,JSON.stringify(audit.findings));
});
test('correct separate OGL notice is accepted',()=>{
  const audit=check(register({sources:[metrolinxOgl()],views:[view({sourceIds:['ogl-feed'],kind:'journey',mapCredit:'UNKNOWN'})]}));
  assert.equal(audit.blocked,false,JSON.stringify(audit.findings));
});
test('AUA legend missing blocks publication',()=>{
  const audit=check(register({sources:[metrolinxAua({attribution:'Other notice'})],views:[view({sourceIds:['go-feed'],kind:'journey'})]}));
  assert.ok(has(audit,FINDINGS.AUA_LEGEND_MISSING));
  assert.ok(has(audit,FINDINGS.AUA_LAWS_MISSING));
});
test('AUA law lines are individually required',()=>{
  const original=metrolinxAua();
  for(const needle of ['Users must follow applicable laws when using the transit data.',
    'Les utilisateurs doivent respecter les lois applicables lorsqu’ils utilisent les données de transport en commun.']){
    const audit=check(register({sources:[metrolinxAua({attribution:original.attribution.replace(needle,'')})],
      views:[view({sourceIds:['go-feed'],kind:'journey'})]}));
    assert.ok(has(audit,FINDINGS.AUA_LAWS_MISSING));
  }
});
test('OGL notice and AUA legend cannot be combined as if interchangeable',()=>{
  const aua=metrolinxAua({attribution:metrolinxAua().attribution+'\nContains information licensed under the Open Government Licence - Ontario - Metrolinx.'});
  const audit=check(register({sources:[aua],views:[view({sourceIds:['go-feed'],kind:'journey'})]}));
  assert.ok(has(audit,FINDINGS.MIXED_METROLINX_TERMS));
});
test('OGL data does not get an AUA legend by assumption',()=>{
  const ogl=metrolinxOgl({attribution:metrolinxOgl().attribution+'\n'+metrolinxAua().attribution});
  const audit=check(register({sources:[ogl],views:[view({sourceIds:['ogl-feed'],kind:'journey'})]}));
  assert.ok(has(audit,FINDINGS.MIXED_METROLINX_TERMS));
});
test('missing OGL line blocks',()=>{
  const audit=check(register({sources:[metrolinxOgl({attribution:'Different notice'})],views:[view({sourceIds:['ogl-feed'],kind:'journey'})]}));
  assert.ok(has(audit,FINDINGS.OGL_NOTICE_MISSING));
});
test('LTC source remains separate',()=>{
  const audit=check(register({sources:[ltc()],views:[view({sourceIds:['ltc-feed'],kind:'journey'})]}));
  assert.equal(audit.blocked,false);
});
test('LTC omission is blocking',()=>{
  const audit=check(register({sources:[ltc({attribution:'Transit data'})],views:[view({sourceIds:['ltc-feed'],kind:'journey'})]}));
  assert.ok(has(audit,FINDINGS.LTC_NOTICE_MISSING));
});
test('provider and licence mismatch is blocking',()=>{
  const audit=sourceCase({provider:'ltc',licenceKind:'odbl'});
  assert.ok(has(audit,FINDINGS.PROVIDER_LICENCE_MISMATCH));
});
for(const [field,value,code] of [
  ['offline','UNKNOWN',FINDINGS.OFFLINE_UNKNOWN],['offline','NO',FINDINGS.OFFLINE_DENIED],
  ['keyboard','UNKNOWN',FINDINGS.KEYBOARD_UNKNOWN],['keyboard','NO',FINDINGS.KEYBOARD_DENIED],
  ['screenReader','UNKNOWN',FINDINGS.SCREEN_READER_UNKNOWN],['screenReader','NO',FINDINGS.SCREEN_READER_DENIED],
  ['minimumTargetPx','UNKNOWN',FINDINGS.TARGET_UNKNOWN],['minimumTargetPx',43,FINDINGS.TARGET_SMALL],
  ['mapCredit','UNKNOWN',FINDINGS.MAP_CREDIT_UNKNOWN],['mapCredit','NO',FINDINGS.MAP_CREDIT_DENIED],
]){
  test(`view ${field}=${value} is a blocking finding`,()=>{
    const audit=viewCase({[field]:value});assert.equal(audit.blocked,true);assert.ok(has(audit,code),JSON.stringify(audit.findings));
  });
}
test('44px target is accepted',()=>assert.equal(viewCase({minimumTargetPx:44}).blocked,false));
test('higher target is accepted',()=>assert.equal(viewCase({minimumTargetPx:48}).blocked,false));
test('custom higher minimum is respected',()=>{
  const audit=auditCoverage(parseCoverageRegister(register()),{minimumTargetPx:48});
  assert.ok(has(audit,FINDINGS.TARGET_SMALL));
});
test('an unsafe subminimum cannot weaken the policy',()=>assert.throws(()=>auditCoverage(parseCoverageRegister(register()),{minimumTargetPx:24}),RangeError));
test('offline can be explicitly optional for a release',()=>{
  const audit=auditCoverage(parseCoverageRegister(register({views:[view({offline:'NO'})]})),{requireOffline:false});
  assert.equal(audit.blocked,false);
});
test('a missing view source blocks',()=>{
  const audit=viewCase({sourceIds:['missing']});assert.ok(has(audit,FINDINGS.SOURCE_NOT_FOUND));
});
test('a held view source blocks',()=>{
  const audit=check(register({sources:[source({state:'held'})]}));assert.ok(has(audit,FINDINGS.SOURCE_NOT_INCLUDED));
});
test('a view without linked sources blocks',()=>{
  const audit=viewCase({sourceIds:[]});assert.ok(has(audit,FINDINGS.VIEW_WITHOUT_SOURCE));
});
test('included but unused source produces attention',()=>{
  const audit=check(register({sources:[source(),source({id:'unused'})]}));
  assert.ok(has(audit,FINDINGS.SOURCE_UNUSED));assert.equal(audit.blocked,false);
});
test('future acquisition is blocked only when an explicit date is supplied',()=>{
  const audit=auditCoverage(parseCoverageRegister(register()),{today:'2026-10-01'});
  assert.ok(has(audit,FINDINGS.FUTURE_ACQUISITION));
});
test('future publication is blocked by supplied date',()=>{
  const audit=auditCoverage(parseCoverageRegister(register()),{today:'2026-10-01'});
  assert.ok(has(audit,FINDINGS.FUTURE_PUBLICATION));
});
test('dataset after acquisition produces attention without guessing',()=>{
  const audit=sourceCase({datasetAsOf:'2026-11-02'});
  assert.ok(has(audit,FINDINGS.DATASET_AFTER_ACQUISITION));
});
test('view published before acquisition is blocked',()=>{
  const audit=viewCase({publishedOn:'2026-10-20'});
  assert.ok(has(audit,FINDINGS.PUBLICATION_BEFORE_ACQUISITION));
});
test('provider counts avoid duplicate views',()=>{
  const rows=coverageCountsByProvider(parseCoverageRegister(register({sources:[source(),source({id:'second'})]})));
  assert.equal(rows[0].sources,2);assert.equal(rows[0].views,1);
});
test('matrix preserves UNKNOWN for missing source without inventing provider',()=>{
  const matrix=coverageMatrix(parseCoverageRegister(register({views:[view({sourceIds:['missing']})]})));
  assert.equal(matrix[0].sources[0].permission,'UNKNOWN');
  assert.equal(matrix[0].sources[0].provider,'UNKNOWN');
});
test('findings have deterministic sorted order',()=>{
  const parsed=parseCoverageRegister(register({views:[view({sourceIds:['missing'],offline:'UNKNOWN'})]}));
  assert.deepEqual(auditCoverage(parsed).findings,auditCoverage(parsed).findings);
});
test('a vaguely named licence does not qualify as open',()=>{
  for(const licenceName of ['Open Data Licence','Not open for redistribution','open pending terms','Public Domain?']){
    const audit=sourceCase({provider:'other',licenceKind:'other-open',licenceName});
    assert.ok(has(audit,FINDINGS.LICENCE_NOT_OPEN),licenceName);
  }
});
test('explicit recognised open licence still requires recorded permission',()=>{
  for(const licenceName of ['Creative Commons Attribution 4.0','Creative Commons CC0 1.0 Universal',
    'Open Government Licence - Canada']){
    const audit=sourceCase({provider:'other',licenceKind:'other-open',licenceName,permission:'UNKNOWN'});
    assert.ok(has(audit,FINDINGS.PERMISSION_UNKNOWN));
    assert.ok(!has(audit,FINDINGS.LICENCE_NOT_OPEN));
  }
});
