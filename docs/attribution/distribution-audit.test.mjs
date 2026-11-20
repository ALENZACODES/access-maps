import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDistribution,DISTRIBUTION_BUDGET_BYTES} from './distribution-audit.mjs';
import {UNKNOWN} from './distribution-core.mjs';
import {manifest,source,asset,view,metrolinxAua,metrolinxOgl,ltc,withDependencies,withEnglishFrenchPair} from './distribution-fixtures.mjs';
import {SOURCES,METROLINX_AUA_LEGEND,METROLINX_OGL_NOTICE,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR} from './attribution-utils.mjs';
const codes = (m, opts) => auditDistribution(m,opts).findings.map(f=>f.code);
const block = (m, code, opts) => {
  const result = auditDistribution(m,opts);
  assert.equal(result.blocked,true,JSON.stringify(result.findings));
  assert.ok(result.findings.some(f=>f.code===code&&f.level==='block'),`${code} absent`);
};
const changeSource = edits => manifest({sources:[source(edits)]});
const changeAsset = edits => manifest({assets:[asset(edits)]});
const changeView = edits => manifest({views:[view(edits)]});

test('install budget is the agreed inclusive byte limit',()=>assert.equal(DISTRIBUTION_BUDGET_BYTES,4_141_875));
test('basic complete release is not blocked',()=>assert.equal(auditDistribution(manifest()).blocked,false));
test('basic release keeps dataset UNKNOWN informational',()=>{
  const audit=auditDistribution(manifest());
  assert.equal(audit.findings.some(f=>f.code==='DATASET_DATE_UNKNOWN'&&f.level==='info'),true);
});
test('basic release preserves a concrete byte sum',()=>assert.equal(auditDistribution(manifest()).installBytes,128));
test('basic release returns the release ID',()=>assert.equal(auditDistribution(manifest()).releaseId,'release-one'));
test('basic release traces one view and one source',()=>assert.deepEqual(auditDistribution(manifest()).matrix[0].sources.map(x=>x.id),['source-osm']));
test('basic release has zero blockers',()=>assert.equal(auditDistribution(manifest()).blockingCount,0));
test('basic release retains budget in the report',()=>assert.equal(auditDistribution(manifest()).budgetBytes,DISTRIBUTION_BUDGET_BYTES));
test('basic release is not blocked when offline evidence is YES',()=>assert.ok(!codes(manifest()).includes('VIEW_OFFLINE_UNRESOLVED')));
test('basic release satisfies OSM credit and ODbL separately',()=>assert.ok(!codes(manifest()).includes('SOURCE_NOTICE_INCOMPLETE')));
test('no publication views blocks the release',()=>block(manifest({views:[]}), 'NO_VIEWS'));
test('no recorded source blocks the release',()=>block(manifest({sources:[]}), 'NO_SOURCES'));
test('no source permission blocks the release',()=>block(changeSource({permission:'NO'}),'PERMISSION_UNRESOLVED'));
test('UNKNOWN source permission blocks the release',()=>block(changeSource({permission:UNKNOWN}),'PERMISSION_UNRESOLVED'));
test('UNKNOWN licence evidence blocks the release',()=>block(changeSource({licenceEvidence:UNKNOWN}),'LICENCE_EVIDENCE_UNRESOLVED'));
test('denied licence evidence blocks the release',()=>block(changeSource({licenceEvidence:'NO'}),'LICENCE_EVIDENCE_UNRESOLVED'));
test('UNKNOWN source URL blocks the release',()=>block(changeSource({sourceUrl:UNKNOWN}),'SOURCE_URL_UNKNOWN'));
test('UNKNOWN licence URL blocks the release',()=>block(changeSource({licenceUrl:UNKNOWN}),'LICENCE_URL_UNKNOWN'));
test('UNKNOWN terms date blocks the release',()=>block(changeSource({termsDate:UNKNOWN}),'TERMS_DATE_UNKNOWN'));
test('UNKNOWN acquisition date blocks the release',()=>block(changeSource({acquiredDate:UNKNOWN}),'ACQUISITION_DATE_UNKNOWN'));
test('UNKNOWN tier blocks the release',()=>block(changeSource({tier:UNKNOWN}),'TIER_UNKNOWN'));
test('UNKNOWN dataset date does not itself block the release',()=>assert.equal(auditDistribution(changeSource({datasetDate:UNKNOWN})).blocked,false));
test('known dataset date drops informational finding',()=>assert.ok(!codes(changeSource({datasetDate:'2026-01-12'})).includes('DATASET_DATE_UNKNOWN')));
test('empty source notice blocks release',()=>block(changeSource({notice:''}),'SOURCE_NOTICE_EMPTY'));
test('OSM missing map credit blocks release',()=>block(changeSource({notice:SOURCES.osm.notices.en[1]}),'SOURCE_NOTICE_INCOMPLETE'));
test('OSM missing ODbL notice blocks release',()=>block(changeSource({notice:SOURCES.osm.notices.en[0]}),'SOURCE_NOTICE_INCOMPLETE'));
test('OSM generic licence name blocks release',()=>block(changeSource({licenceName:'Unspecified'}),'ODBL_LICENCE_MISSING'));
test('OSM exact credit satisfies release source notice',()=>assert.ok(!codes(manifest()).includes('SOURCE_NOTICE_EMPTY')));
test('OSM view missing map credit blocks release',()=>block(changeView({noticeText:SOURCES.osm.notices.en[1]}),'VIEW_NOTICE_MISSING'));
test('OSM view missing ODbL term blocks release',()=>block(changeView({noticeText:SOURCES.osm.notices.en[0]}),'VIEW_NOTICE_MISSING'));
test('OSM view with both notices passes notice checks',()=>assert.ok(!codes(manifest()).includes('VIEW_NOTICE_MISSING')));
test('OSM view with whitespace-normalized notice passes',()=>{
  const text=SOURCES.osm.notices.en.join('    \n   ');
  assert.ok(!codes(changeView({noticeText:text})).includes('VIEW_NOTICE_MISSING'));
});
const AUA_NOTICE=[METROLINX_AUA_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join('\n');
const auaManifest=(s=metrolinxAua(),v=view({sourceIds:['source-aua'],noticeText:AUA_NOTICE}),a=asset({sourceIds:['source-aua']}))=>manifest({sources:[s],assets:[a],views:[v]});
const oglManifest=(s=metrolinxOgl(),v=view({sourceIds:['source-ogl'],noticeText:METROLINX_OGL_NOTICE}),a=asset({sourceIds:['source-ogl']}))=>manifest({sources:[s],assets:[a],views:[v]});
test('AUA source with section 3 and both law lines passes',()=>assert.equal(auditDistribution(auaManifest()).blocked,false));
test('AUA source missing legend blocks',()=>block(auaManifest(metrolinxAua({notice:[METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join('\n')})),'SOURCE_NOTICE_INCOMPLETE'));
test('AUA source missing English applicable-law line blocks',()=>block(auaManifest(metrolinxAua({notice:[METROLINX_AUA_LEGEND,METROLINX_AUA_END_USER_LAWS_FR].join('\n')})),'SOURCE_NOTICE_INCOMPLETE'));
test('AUA source missing French applicable-law line blocks',()=>block(auaManifest(metrolinxAua({notice:[METROLINX_AUA_LEGEND,METROLINX_AUA_END_USER_LAWS_EN].join('\n')})),'SOURCE_NOTICE_INCOMPLETE'));
test('AUA source cannot substitute OGL notice',()=>block(auaManifest(metrolinxAua({notice:METROLINX_OGL_NOTICE})),'SOURCE_NOTICE_INCOMPLETE'));
test('AUA view cannot substitute OGL notice',()=>block(auaManifest(metrolinxAua(),view({sourceIds:['source-aua'],noticeText:METROLINX_OGL_NOTICE})),'VIEW_NOTICE_MISSING'));
test('AUA source with wrong licence name blocks',()=>block(auaManifest(metrolinxAua({licenceName:'Unspecified licence'})),'AUA_LICENCE_MISMATCH'));
test('AUA view missing French law line blocks',()=>block(auaManifest(metrolinxAua(),view({sourceIds:['source-aua'],noticeText:[METROLINX_AUA_LEGEND,METROLINX_AUA_END_USER_LAWS_EN].join('\n')})),'VIEW_NOTICE_MISSING'));
test('OGL source with OGL notice passes',()=>assert.equal(auditDistribution(oglManifest()).blocked,false));
test('OGL source missing OGL line blocks',()=>block(oglManifest(metrolinxOgl({notice:METROLINX_AUA_LEGEND})),'SOURCE_NOTICE_INCOMPLETE'));
test('OGL view missing OGL line blocks',()=>block(oglManifest(metrolinxOgl(),view({sourceIds:['source-ogl'],noticeText:METROLINX_AUA_LEGEND})),'VIEW_NOTICE_MISSING'));
test('OGL source with AUA licence name blocks',()=>block(oglManifest(metrolinxOgl({licenceName:'Metrolinx Access and Use Agreement'})),'OGL_LICENCE_MISMATCH'));
test('OGL view with OGL notice does not require AUA law lines',()=>assert.ok(!codes(oglManifest()).includes('VIEW_NOTICE_MISSING')));
test('AUA view with AUA notice does not require OGL statement',()=>assert.ok(!codes(auaManifest()).includes('VIEW_NOTICE_MISSING')));
const ltcManifest=(s=ltc(),v=view({sourceIds:['source-ltc'],noticeText:SOURCES.ltc.notices.en[0]}),a=asset({sourceIds:['source-ltc']}))=>manifest({sources:[s],assets:[a],views:[v]});
test('LTC source and English view pass',()=>assert.equal(auditDistribution(ltcManifest()).blocked,false));
test('LTC source requires its notice',()=>block(ltcManifest(ltc({notice:''})),'SOURCE_NOTICE_INCOMPLETE'));
test('LTC source requires identifiable terms',()=>block(ltcManifest(ltc({licenceName:'Unspecified'})),'LTC_LICENCE_MISMATCH'));
test('LTC French view needs French notice',()=>block(ltcManifest(ltc(),view({locale:'fr',sourceIds:['source-ltc'],noticeText:SOURCES.ltc.notices.en[0]})),'VIEW_NOTICE_MISSING'));
test('LTC French view with translated notice passes',()=>assert.equal(auditDistribution(ltcManifest(ltc(),view({locale:'fr',sourceIds:['source-ltc'],noticeText:SOURCES.ltc.notices.fr[0]}))).blocked,false));
test('custom source may supply explicitly permitted open terms',()=>{
  const s=source({provider:'other',licenceName:'Open Database License (ODbL) 1.0',notice:'Custom attribution'});
  const m=manifest({sources:[s],views:[view({noticeText:'Custom attribution'})]});
  assert.equal(auditDistribution(m).blocked,false);
});
test('custom source still needs explicit licence evidence',()=>block(changeSource({provider:'other',licenceEvidence:UNKNOWN,notice:'Custom attribution'}),'LICENCE_EVIDENCE_UNRESOLVED'));
test('included asset with UNKNOWN bytes blocks',()=>block(changeAsset({bytes:UNKNOWN}),'ASSET_SIZE_UNKNOWN'));
test('included asset with UNKNOWN digest blocks',()=>block(changeAsset({sha256:UNKNOWN}),'ASSET_HASH_UNKNOWN'));
test('held asset does not require known digest',()=>assert.ok(!codes(changeAsset({state:'held',sha256:UNKNOWN})).includes('ASSET_HASH_UNKNOWN')));
test('held asset referenced by view blocks release',()=>block(changeAsset({state:'held'}),'VIEW_ASSET_HELD'));
test('asset depending on missing identity blocks',()=>block(changeAsset({dependencyIds:['missing']}),'ASSET_DEPENDENCY_MISSING'));
test('asset depending on held asset blocks',()=>{
  const m=manifest({assets:[asset({dependencyIds:['held']}),asset({id:'held',path:'assets/held.js',state:'held',sourceIds:[]})]});
  block(m,'ASSET_DEPENDENCY_HELD');
});
test('asset declaring undefined source blocks',()=>block(changeAsset({sourceIds:['undefined']}),'ASSET_SOURCE_MISSING'));
test('asset declaring held source blocks',()=>{
  const m=manifest({sources:[source({state:'held'})]});
  block(m,'ASSET_SOURCE_HELD');
});
test('cyclic asset dependencies block',()=>block(changeAsset({dependencyIds:['data-asset']}),'DEPENDENCY_CYCLE'));
test('indirect cyclic asset dependencies block',()=>{
  const m=manifest({assets:[asset({dependencyIds:['a']}),asset({id:'a',path:'assets/a.js',dependencyIds:['data-asset'],sourceIds:[]})]});
  block(m,'DEPENDENCY_CYCLE');
});
test('direct and transitive asset dependencies without cycles pass',()=>assert.equal(auditDistribution(withDependencies(7)).blocked,false));
test('install size at exact budget passes',()=>{
  const m=changeAsset({bytes:DISTRIBUTION_BUDGET_BYTES});
  assert.ok(!codes(m).includes('INSTALL_BUDGET_EXCEEDED'));
});
test('install size one byte over budget blocks',()=>block(changeAsset({bytes:DISTRIBUTION_BUDGET_BYTES+1}),'INSTALL_BUDGET_EXCEEDED'));
test('custom stricter installation budget blocks',()=>block(changeAsset({bytes:128}),'INSTALL_BUDGET_EXCEEDED',{maxInstallBytes:100}));
test('invalid installation budget is rejected',()=>assert.throws(()=>auditDistribution(manifest(),{maxInstallBytes:-1}),/budget/u));
test('minimum touch target below 44 cannot weaken policy',()=>assert.throws(()=>auditDistribution(manifest(),{minimumTargetPx:24}),/at least 44/u));
test('custom touch minimum above 44 applies',()=>block(manifest(),'VIEW_TARGET_TOO_SMALL',{minimumTargetPx:48}));
test('view with no assets blocks',()=>block(changeView({assetIds:[]}), 'VIEW_NO_ASSETS'));
test('view with no sources blocks',()=>block(changeView({sourceIds:[]}), 'VIEW_NO_SOURCES'));
test('view referencing missing asset blocks',()=>block(changeView({assetIds:['missing']}),'VIEW_ASSET_MISSING'));
test('view missing source declaration blocks',()=>block(changeView({sourceIds:['other']}),'VIEW_SOURCE_UNDECLARED'));
test('view with extra unlinked source declaration blocks',()=>block(changeView({sourceIds:['source-osm','other']}),'VIEW_SOURCE_UNLINKED'));
test('view linked to undefined source blocks',()=>block(manifest({sources:[]}), 'VIEW_SOURCE_UNKNOWN'));
test('view linked to held source blocks',()=>block(manifest({sources:[source({state:'held'})]}),'VIEW_SOURCE_NOT_INCLUDED'));
test('view with notice visibility UNKNOWN blocks',()=>block(changeView({noticeVisible:UNKNOWN}),'VIEW_NOTICE_VISIBILITY_UNKNOWN'));
test('view with notice visibility NO blocks',()=>block(changeView({noticeVisible:'NO'}),'VIEW_NOTICE_VISIBILITY_UNKNOWN'));
test('view with offline UNKNOWN blocks when offline required',()=>block(changeView({offline:UNKNOWN}),'VIEW_OFFLINE_UNRESOLVED'));
test('view with offline NO blocks when offline required',()=>block(changeView({offline:'NO'}),'VIEW_OFFLINE_UNRESOLVED'));
test('online-only view allowed when offline not required',()=>assert.equal(auditDistribution(changeView({offline:'NO'}),{requireOffline:false}).blocked,false));
test('view with keyboard UNKNOWN blocks',()=>block(changeView({keyboard:UNKNOWN}),'VIEW_KEYBOARD_UNRESOLVED'));
test('view with keyboard NO blocks',()=>block(changeView({keyboard:'NO'}),'VIEW_KEYBOARD_UNRESOLVED'));
test('view with screen-reader UNKNOWN blocks',()=>block(changeView({screenReader:UNKNOWN}),'VIEW_SCREEN_READER_UNRESOLVED'));
test('view with screen-reader NO blocks',()=>block(changeView({screenReader:'NO'}),'VIEW_SCREEN_READER_UNRESOLVED'));
test('view with target UNKNOWN blocks',()=>block(changeView({targetPx:UNKNOWN}),'VIEW_TARGET_UNKNOWN'));
test('view with 43-pixel targets blocks',()=>block(changeView({targetPx:43}),'VIEW_TARGET_TOO_SMALL'));
test('view with 44-pixel targets passes',()=>assert.ok(!codes(manifest()).includes('VIEW_TARGET_TOO_SMALL')));
test('view with 80-pixel targets passes',()=>assert.ok(!codes(changeView({targetPx:80})).includes('VIEW_TARGET_TOO_SMALL')));
test('view with published date UNKNOWN is informational',()=>{
  const m=changeView({publishedDate:UNKNOWN}), result=auditDistribution(m);
  assert.equal(result.blocked,false);
  assert.ok(result.findings.some(f=>f.code==='VIEW_DATE_UNKNOWN'&&f.level==='info'));
});
test('view with known publication date lacks date-unknown notice',()=>assert.ok(!codes(manifest()).includes('VIEW_DATE_UNKNOWN')));
test('pair requirement is opt-in',()=>assert.equal(auditDistribution(manifest()).blocked,false));
test('pair requirement blocks missing language companion',()=>block(manifest(),'LANGUAGE_PAIR_MISSING',{requirePairs:true}));
test('explicit EN/FR pair passes requirement',()=>assert.equal(auditDistribution(withEnglishFrenchPair(),{requirePairs:true}).blocked,false));
test('pair requirement blocks French-only surface',()=>{
  const m=manifest({views:[view({id:'map-fr',path:'pages/map-fr.html',locale:'fr'})]});
  block(m,'LANGUAGE_PAIR_MISSING',{requirePairs:true});
});
test('disjoint source names do not prove permission',()=>block(changeSource({permission:UNKNOWN,name:'Public Open Data'}),'PERMISSION_UNRESOLVED'));
test('source provider label cannot replace terms evidence',()=>block(changeSource({termsDate:UNKNOWN,name:'OpenStreetMap'}),'TERMS_DATE_UNKNOWN'));
test('source with unknown tier is never assigned a favourable tier',()=>assert.ok(codes(changeSource({tier:UNKNOWN})).includes('TIER_UNKNOWN')));
test('audit result is deterministic',()=>{
  const a=auditDistribution(manifest()), b=auditDistribution(manifest());
  assert.deepEqual(a,b);
});
test('audit returns structured paths for errors',()=>{
  const f=auditDistribution(changeView({targetPx:40})).findings.find(x=>x.code==='VIEW_TARGET_TOO_SMALL');
  assert.equal(f.path,'views.map-en');assert.equal(f.viewId,'map-en');
});
test('audit finds affected source identity for missing notice',()=>{
  const f=auditDistribution(changeView({noticeText:''})).findings.find(x=>x.code==='VIEW_NOTICE_MISSING');
  assert.equal(f.sourceId,'source-osm');
});
test('audit reports each missing notice obligation separately',()=>{
  const fs=auditDistribution(changeView({noticeText:''})).findings.filter(x=>x.code==='VIEW_NOTICE_MISSING');
  assert.equal(fs.length,2);
});

test('other provider with proprietary licence name blocks',()=>block(changeSource({provider:'other',licenceName:'All rights reserved',notice:'Custom credit'}),'LICENCE_NOT_OPEN'));
test('other provider with unspecified licence name blocks',()=>block(changeSource({provider:'other',licenceName:'Open Data Licence',notice:'Custom credit'}),'LICENCE_NOT_OPEN'));
test('other provider with an explicit MIT licence can pass',()=>{
  const m=changeSource({provider:'other',licenceName:'MIT License',notice:'Custom credit'});
  assert.equal(auditDistribution(m).blocked,false);
});
test('other provider with an explicit Apache licence can pass',()=>{
  const m=changeSource({provider:'other',licenceName:'Apache-2.0',notice:'Custom credit'});
  assert.equal(auditDistribution(m).blocked,false);
});
test('other provider with an explicit Creative Commons attribution licence can pass',()=>{
  const m=changeSource({provider:'other',licenceName:'CC BY 4.0',notice:'Custom credit'});
  assert.equal(auditDistribution(m).blocked,false);
});
test('other provider with UNKNOWN permission remains blocked despite open licence name',()=>{
  const m=changeSource({provider:'other',licenceName:'MIT License',notice:'Custom credit',permission:UNKNOWN});
  block(m,'PERMISSION_UNRESOLVED');
});
