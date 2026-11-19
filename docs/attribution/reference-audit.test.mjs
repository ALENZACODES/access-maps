import test from 'node:test';
import assert from 'node:assert/strict';
import { fixturePack } from './reference-fixtures.mjs';
import { parseReferencePack } from './reference-core.mjs';
import { auditReferencePack, compareReferencePacks, BLOCKING_CODES } from './reference-audit.mjs';
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
function audit(change=()=>{}){const p=fixturePack();change(p);return auditReferencePack(parseReferencePack(p));}
function has(code,change){assert.ok(audit(change).findings.some(f=>f.code===code),`Expected ${code}`);}
function block(code,change){const a=audit(change);assert.equal(a.blocked,true);assert.ok(a.findings.some(f=>f.code===code&&f.level==='block'),`Expected ${code}`);}
test('valid source and surface pass',()=>{const result=audit();assert.equal(result.blocked,false,JSON.stringify(result.findings));assert.equal(result.blockingCount,0);});
test('source dataset date remains UNKNOWN and produces information only',()=>{const a=audit();assert.equal(a.blocked,false);assert.ok(a.findings.some(f=>f.code==='DATASET_DATE_UNKNOWN'&&f.level==='info'));});
test('findings are sorted deterministically',()=>{const a=audit(p=>{p.sources[0].permission='NO';p.surfaces[0].offline='NO';});assert.deepEqual(a.findings.map(f=>[f.path,f.code]),[...a.findings].sort((x,y)=>x.path.localeCompare(y.path)||x.code.localeCompare(y.code)||x.subject.localeCompare(y.subject)).map(f=>[f.path,f.code]));});
test('blocking codes are distinct',()=>assert.equal(new Set(BLOCKING_CODES).size,BLOCKING_CODES.length));
const mutations=[
 ['NO_INCLUDED_SOURCES',p=>p.sources[0].state='held'],
 ['NO_SURFACES',p=>p.surfaces=[]],
 ['SOURCE_UNKNOWN',p=>p.sources[0].provider='UNKNOWN'],
 ['SOURCE_URL_UNKNOWN',p=>p.sources[0].sourceUrl='UNKNOWN'],
 ['LICENCE_UNKNOWN',p=>p.sources[0].licence='UNKNOWN'],
 ['LICENCE_URL_UNKNOWN',p=>p.sources[0].licenceUrl='UNKNOWN'],
 ['PERMISSION_UNKNOWN',p=>p.sources[0].permission='UNKNOWN'],
 ['PERMISSION_NO',p=>p.sources[0].permission='NO'],
 ['TIER_UNKNOWN',p=>p.sources[0].tier='UNKNOWN'],
 ['ACQUIRED_DATE_UNKNOWN',p=>p.sources[0].acquiredDate='UNKNOWN'],
 ['TERMS_DATE_UNKNOWN',p=>p.sources[0].termsDate='UNKNOWN'],
 ['SOURCE_NOTICE_MISSING',p=>p.sources[0].notice=''],
 ['SOURCE_MISSING_LICENCE',p=>p.sources[0].licence='LTC-Open-Data-Terms'],
 ['SOURCE_NO_REFERENCES',p=>p.sources[0].referenceIds=[]],
 ['REFERENCE_NOT_FOUND',p=>p.sources[0].referenceIds=['missing']],
 ['REFERENCE_SOURCE_MISMATCH',p=>p.references[0].sourceId='not-map-source'],
 ['REFERENCE_NOT_LINKED',p=>p.sources[0].referenceIds=[]],
 ['REFERENCE_URL_UNKNOWN',p=>p.references[0].url='UNKNOWN'],
 ['REFERENCE_LICENCE_UNKNOWN',p=>p.references[0].licenceUrl='UNKNOWN'],
 ['REFERENCE_DATE_UNKNOWN',p=>p.references[0].collectedDate='UNKNOWN'],
 ['REFERENCE_TIER_UNKNOWN',p=>p.references[0].tier='UNKNOWN'],
 ['REFERENCE_LICENCE_MISMATCH',p=>p.references[0].licenceUrl='https://example.com/other'],
 ['SOURCE_NOT_FOUND',p=>p.surfaces[0].sourceIds=['missing']],
 ['SOURCE_NOT_INCLUDED',p=>p.sources[0].state='excluded'],
 ['SURFACE_EMPTY',p=>p.surfaces[0].sourceIds=[]],
 ['OFFLINE_NO',p=>p.surfaces[0].offline='NO'],
 ['OFFLINE_UNKNOWN',p=>p.surfaces[0].offline='UNKNOWN'],
 ['KEYBOARD_NO',p=>p.surfaces[0].keyboard='NO'],
 ['KEYBOARD_UNKNOWN',p=>p.surfaces[0].keyboard='UNKNOWN'],
 ['SCREEN_READER_NO',p=>p.surfaces[0].screenReader='NO'],
 ['SCREEN_READER_UNKNOWN',p=>p.surfaces[0].screenReader='UNKNOWN'],
 ['TARGET_TOO_SMALL',p=>p.surfaces[0].targetPx=43],
 ['TARGET_UNKNOWN',p=>p.surfaces[0].targetPx='UNKNOWN'],
 ['MAP_CREDIT_MISSING',p=>p.surfaces[0].mapCredit='NO'],
 ['MAP_CREDIT_UNKNOWN',p=>p.surfaces[0].mapCredit='UNKNOWN'],
];
for(const [code,mutation] of mutations)test(`audit blocks ${code}`,()=>block(code,mutation));
for(const target of [44,45,48,64,100])test(`${target}px targets do not fail the size rule`,()=>{const a=audit(p=>p.surfaces[0].targetPx=target);assert.equal(a.findings.some(f=>f.code==='TARGET_TOO_SMALL'),false);});
for(const target of [0,1,24,32,42,43])test(`${target}px targets block`,()=>block('TARGET_TOO_SMALL',p=>p.surfaces[0].targetPx=target));
test('non-map references do not require nearby-map credit',()=>{
 const a=audit(p=>{p.sources[0].provider='other';p.sources[0].licence='OTHER-OPEN';p.surfaces[0].mapCredit='NO';});
 assert.equal(a.findings.some(f=>f.code.startsWith('MAP_CREDIT')),false);
});
test('AUA needs its exact legend and both applicable-law lines',()=>{
 const p=fixturePack();const s=p.sources[0];s.provider='metrolinx';s.licence='Metrolinx-AUA';s.notice=[METROLINX_AUA_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join('\n');p.surfaces[0].mapCredit='NO';
 assert.equal(auditReferencePack(parseReferencePack(p)).findings.some(f=>f.code==='NOTICE_MISSING'),false);
 for(const phrase of [METROLINX_AUA_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR]){
  const broken=structuredClone(p);broken.sources[0].notice=broken.sources[0].notice.replace(phrase,'');
  assert.ok(auditReferencePack(parseReferencePack(broken)).findings.some(f=>f.code==='NOTICE_MISSING'));
 }
});
test('OGL notice is separate and not interchangeable with AUA',()=>{
 const p=fixturePack();const s=p.sources[0];s.provider='metrolinx';s.licence='OGL-Ontario-Metrolinx';s.notice=METROLINX_OGL_NOTICE;
 assert.equal(auditReferencePack(parseReferencePack(p)).findings.some(f=>f.code==='NOTICE_MISSING'),false);
 s.notice=METROLINX_AUA_LEGEND;
 const codes=auditReferencePack(parseReferencePack(p)).findings.map(f=>f.code);
 assert.ok(codes.includes('NOTICE_MISSING'));assert.ok(codes.includes('NOTICE_INCOMPATIBLE'));
});
test('AUA forbids incorporating the separate OGL line in the same asserted record',()=>{
 const p=fixturePack();p.sources[0].provider='metrolinx';p.sources[0].licence='Metrolinx-AUA';p.sources[0].notice=[METROLINX_AUA_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR,METROLINX_OGL_NOTICE].join('\n');
 assert.ok(auditReferencePack(parseReferencePack(p)).findings.some(f=>f.code==='NOTICE_INCOMPATIBLE'));
});
test('LTC source requires LTC terms notice',()=>{
 const p=fixturePack();p.sources[0].provider='ltc';p.sources[0].licence='LTC-Open-Data-Terms';p.sources[0].notice=SOURCES.ltc.notices.en[0];
 assert.equal(auditReferencePack(parseReferencePack(p)).findings.some(f=>f.code==='NOTICE_MISSING'),false);
 p.sources[0].notice='A generic agency credit';
 assert.ok(auditReferencePack(parseReferencePack(p)).findings.some(f=>f.code==='NOTICE_MISSING'));
});
test('correct OSM credit and ODbL statement are distinct',()=>{
 const p=fixturePack();p.sources[0].notice=SOURCES.osm.notices.en[0];
 block('NOTICE_MISSING',q=>q.sources[0].notice=p.sources[0].notice);
 p.sources[0].notice=SOURCES.osm.notices.en[1];
 block('NOTICE_MISSING',q=>q.sources[0].notice=p.sources[0].notice);
});
test('missing local capture digest is a notice not a blocker',()=>{
 const a=audit(p=>p.references[0].sha256='UNKNOWN');
 assert.equal(a.blocked,false);assert.ok(a.findings.some(f=>f.code==='REFERENCE_HASH_UNKNOWN'&&f.level==='notice'));
});
test('unknown dataset date is not fabricated',()=>{const a=audit();assert.ok(a.findings.some(f=>f.code==='DATASET_DATE_UNKNOWN'));});
test('reference not used produces information',()=>{
 const a=audit(p=>p.surfaces[0].referenceIds=[]);
 assert.ok(a.findings.some(f=>f.code==='REFERENCE_NOT_USED'&&f.level==='info'));
});
test('orphan included source produces information',()=>{
 const a=audit(p=>p.surfaces[0].sourceIds=[]);
 assert.ok(a.findings.some(f=>f.code==='SOURCE_NOT_USED'&&f.level==='info'));
});
test('known dataset date after acquisition generates a notice',()=>{
 const a=audit(p=>p.sources[0].datasetDate='2026-02-01');
 assert.ok(a.findings.some(f=>f.code==='SOURCE_DATE_CONFLICT'&&f.level==='notice'));
});
test('different source/reference tier generates a notice',()=>{
 const a=audit(p=>p.references[0].tier='community');
 assert.ok(a.findings.some(f=>f.code==='REFERENCE_TIER_CONFLICT'&&f.level==='notice'));
});
test('report results preserve exact counts',()=>{
 const a=audit(p=>p.sources[0].permission='NO');
 assert.equal(a.blockingCount,a.findings.filter(f=>f.level==='block').length);
 assert.equal(a.noticeCount,a.findings.filter(f=>f.level==='notice').length);
 assert.equal(a.informationCount,a.findings.filter(f=>f.level==='info').length);
});
const changeCases=[
 ['SOURCE_REMOVED',p=>p.sources=[]],
 ['SOURCE_PERMISSION',p=>p.sources[0].permission='UNKNOWN'],
 ['SOURCE_LICENCE',p=>p.sources[0].licence='OTHER-OPEN'],
 ['SOURCE_LICENCEURL',p=>p.sources[0].licenceUrl='UNKNOWN'],
 ['SOURCE_SOURCEURL',p=>p.sources[0].sourceUrl='UNKNOWN'],
 ['SOURCE_TIER',p=>p.sources[0].tier='secondary'],
 ['SOURCE_NOTICE',p=>p.sources[0].notice='missing notice'],
 ['SOURCE_REFERENCE_REMOVED',p=>p.sources[0].referenceIds=[]],
 ['REFERENCE_REMOVED',p=>p.references=[]],
 ['REFERENCE_URL',p=>p.references[0].url='UNKNOWN'],
 ['REFERENCE_LICENCEURL',p=>p.references[0].licenceUrl='UNKNOWN'],
 ['REFERENCE_COLLECTEDDATE',p=>p.references[0].collectedDate='UNKNOWN'],
 ['REFERENCE_TIER',p=>p.references[0].tier='UNKNOWN'],
 ['REFERENCE_SHA256',p=>p.references[0].sha256='UNKNOWN'],
 ['SURFACE_REMOVED',p=>p.surfaces=[]],
 ['SURFACE_OFFLINE',p=>p.surfaces[0].offline='NO'],
 ['SURFACE_KEYBOARD',p=>p.surfaces[0].keyboard='NO'],
 ['SURFACE_SCREENREADER',p=>p.surfaces[0].screenReader='UNKNOWN'],
 ['SURFACE_TARGETPX',p=>p.surfaces[0].targetPx=43],
 ['SURFACE_MAPCREDIT',p=>p.surfaces[0].mapCredit='UNKNOWN'],
 ['SURFACE_SOURCE_REMOVED',p=>p.surfaces[0].sourceIds=[]],
 ['SURFACE_REFERENCE_REMOVED',p=>p.surfaces[0].referenceIds=[]],
 ['SURFACE_LANGUAGE',p=>p.surfaces[0].language='fr'],
];
for(const [code,change] of changeCases)test(`comparison detects ${code}`,()=>{
 const before=parseReferencePack(fixturePack());const p=fixturePack();p.releaseId='release-two';change(p);
 const result=compareReferencePacks(before,parseReferencePack(p));
 assert.ok(result.changes.some(c=>c.code===code),`${code} absent`);
});
test('identical release packs have no differences',()=>{
 const p=parseReferencePack(fixturePack());const c=compareReferencePacks(p,p);
 assert.deepEqual(c.changes,[]);assert.equal(c.blocked,false);
});
test('a previously clear release becomes blocked on lost rights',()=>{
 const before=parseReferencePack(fixturePack());const now=fixturePack();now.sources[0].permission='NO';
 assert.equal(compareReferencePacks(before,parseReferencePack(now)).blocked,true);
});
