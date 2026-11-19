import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR, METROLINX_OGL_NOTICE } from './attribution-utils.mjs';
import { parseCoverageRegister } from './coverage-core.mjs';
import { auditCoverage } from './coverage-audit.mjs';

export function source(overrides = {}) {
  return {
    id:'osm-base', provider:'osm',title:'Map source', sourceUrl:SOURCES.osm.sourceUrl,
    licenceUrl:SOURCES.osm.licenceUrl,licenceKind:'odbl',licenceName:'Open Database License (ODbL) 1.0',
    permission:'YES',evidenceTier:'primary',acquiredOn:'2026-11-01',datasetAsOf:'UNKNOWN',
    termsReviewedOn:'2026-11-01',attribution:'© OpenStreetMap contributors', notes:'',state:'included',
    ...overrides,
  };
}
export function view(overrides = {}) {
  return {id:'map-en',title:'Map view',kind:'map',language:'en',sourceIds:['osm-base'],
    state:'included',offline:'YES',keyboard:'YES',screenReader:'YES',mapCredit:'YES',
    minimumTargetPx:44,publishedOn:'2026-11-10',notes:'',...overrides};
}
export function register(overrides = {}) {
  return {schema:'attribution-coverage/1',releaseId:'release-one',sources:[source()],views:[view()],...overrides};
}
export function metrolinxAua(overrides = {}) {
  return source({id:'go-feed',provider:'metrolinx',licenceKind:'metrolinx-aua',
    title:'GTFS',licenceName:'Metrolinx Access and Use Agreement',sourceUrl:SOURCES.metrolinx.sourceUrl,
    licenceUrl:SOURCES.metrolinx.sourceUrl,
    attribution:[METROLINX_AUA_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join('\n'),...overrides});
}
export function metrolinxOgl(overrides = {}) {
  return source({id:'ogl-feed',provider:'metrolinx',licenceKind:'metrolinx-ogl',title:'Open data',
    licenceName:'Open Government Licence - Ontario - Metrolinx',sourceUrl:SOURCES.metrolinx.sourceUrl,
    licenceUrl:SOURCES.metrolinx.licenceUrl,attribution:METROLINX_OGL_NOTICE,...overrides});
}
export function ltc(overrides = {}) {
  return source({id:'ltc-feed',provider:'ltc',licenceKind:'ltc-terms',title:'Transit feed',
    licenceName:'LTC Open Data Terms of Use',sourceUrl:SOURCES.ltc.sourceUrl,
    licenceUrl:SOURCES.ltc.licenceUrl,attribution:'Data provided by the London Transit Commission (LTC) under its Open Data Terms of Use.',...overrides});
}

test('fixture represents a passing record without inventing a dataset date', () => {
  const parsed = parseCoverageRegister(register());
  const audit = auditCoverage(parsed);
  assert.equal(parsed.sources[0].datasetAsOf,'UNKNOWN');
  assert.equal(audit.blocked,false,JSON.stringify(audit.findings));
  assert.ok(audit.findings.some((finding)=>finding.code==='DATASET_DATE_UNKNOWN'));
});
