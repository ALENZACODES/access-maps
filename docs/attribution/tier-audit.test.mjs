import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTierLedger, compareTierLedgers, MIN_TARGET_PX} from './tier-audit.mjs';
import {ledger,record,surface,auaRecord,oglRecord,ltcRecord} from './tier-fixtures.mjs';
const codes = (input, options) => auditTierLedger(input,options).findings.map(item=>item.code);
const has = (input,code,options) => assert.ok(codes(input,options).includes(code),`Missing ${code}: ${codes(input,options)}`);
const changedRecord = (overrides) => ledger({records:[record(overrides)]});
const changedSurface = (overrides) => ledger({surfaces:[surface(overrides)]});
test('healthy included record with unknown dataset date is not blocked',()=>{
  const result=auditTierLedger(ledger());
  assert.equal(result.blocked,false);
  assert.deepEqual(result.counts,{block:0,attention:1,info:0});
  assert.ok(codes(ledger()).includes('SOURCE_DATE_UNKNOWN'));
});
test('minimum target dimension is exactly 44 px',()=>assert.equal(MIN_TARGET_PX,44));
test('43 px blocks, 44 px passes, 45 px passes',()=>{
  assert.equal(auditTierLedger(changedSurface({targetPx:43})).blocked,true);
  assert.equal(auditTierLedger(changedSurface({targetPx:44})).blocked,false);
  assert.equal(auditTierLedger(changedSurface({targetPx:45})).blocked,false);
});
test('an empty release cannot pass',()=>{
  const result=auditTierLedger(ledger({records:[],surfaces:[]}));
  assert.equal(result.blocked,true);
  assert.deepEqual(result.findings.map(v=>v.code).sort(),['LEDGER_EMPTY','SURFACES_EMPTY']);
});
test('held records are not audited as included',()=>{
  const input=changedRecord({state:'held',sourceUrl:'UNKNOWN',permission:'UNKNOWN'});
  assert.equal(codes(input).includes('SOURCE_LINK_UNKNOWN'),false);
  has(input,'RECORD_NOT_INCLUDED');
});
test('excluded records are blocked when published',()=>has(changedRecord({state:'excluded'}),'RECORD_NOT_INCLUDED'));
test('unreferenced included record receives attention',()=>{
  const input=ledger({records:[record(),record({id:'orphan'})]});
  has(input,'INCLUDED_RECORD_UNUSED');
});
test('source record cannot be guessed from surface',()=>has(changedSurface({recordIds:['other-record']}),'RECORD_NOT_FOUND'));
test('map credit is required for OSM map surfaces',()=>has(changedSurface({mapCredit:'NO'}),'MAP_CREDIT_NOT_ESTABLISHED'));
test('map credit is not inferred from route name',()=>has(changedSurface({mapCredit:'UNKNOWN'}),'MAP_CREDIT_NOT_ESTABLISHED'));
test('map credit requirement is scoped to maps',()=>{
  assert.equal(auditTierLedger(changedSurface({mode:'journey',mapCredit:'UNKNOWN'})).blocked,false);
});
test('missing labelled control evidence blocks',()=>has(changedSurface({labelled:'UNKNOWN'}),'LABEL_EVIDENCE_MISSING'));
test('explicit absence of labelled controls blocks',()=>has(changedSurface({labelled:'NO'}),'LABEL_EVIDENCE_MISSING'));
test('missing keyboard evidence blocks',()=>has(changedSurface({keyboard:'UNKNOWN'}),'KEYBOARD_EVIDENCE_MISSING'));
test('explicit absence of keyboard evidence blocks',()=>has(changedSurface({keyboard:'NO'}),'KEYBOARD_EVIDENCE_MISSING'));
test('offline is required by default',()=>has(changedSurface({offline:'NO'}),'OFFLINE_NOT_ESTABLISHED'));
test('UNKNOWN offline capability is not treated as YES',()=>has(changedSurface({offline:'UNKNOWN'}),'OFFLINE_NOT_ESTABLISHED'));
test('offline can be optional for an explicitly online target',()=>{
  assert.equal(auditTierLedger(changedSurface({offline:'NO'}),{requireOffline:false}).blocked,false);
});
test('UNKNOWN target size cannot pass',()=>has(changedSurface({targetPx:'UNKNOWN'}),'TARGET_UNKNOWN'));
test('publication date may remain UNKNOWN but is disclosed',()=>{
  const result=auditTierLedger(changedSurface({publicationDate:'UNKNOWN'}));
  assert.equal(result.blocked,false);
  assert.ok(result.findings.some(v=>v.code==='PUBLICATION_DATE_UNKNOWN'));
});
test('future publication date blocks when a date is supplied',()=>has(changedSurface({publicationDate:'2026-11-30'}),'FUTURE_PUBLICATION',{asOf:'2026-11-20'}));
test('publication date is not compared to an implicit clock',()=>assert.equal(codes(changedSurface({publicationDate:'2099-11-30'})).includes('FUTURE_PUBLICATION'),false));
test('invalid asOf raises instead of silently skipping',()=>assert.throws(()=>auditTierLedger(ledger(),{asOf:'yesterday'}),TypeError));
test('missing source URL blocks',()=>has(changedRecord({sourceUrl:'UNKNOWN'}),'SOURCE_LINK_UNKNOWN'));
test('missing licence URL blocks',()=>has(changedRecord({licenceUrl:'UNKNOWN'}),'LICENCE_LINK_UNKNOWN'));
test('missing evidence URL blocks',()=>has(changedRecord({evidenceUrl:'UNKNOWN'}),'EVIDENCE_LINK_UNKNOWN'));
test('missing acquisition date blocks',()=>has(changedRecord({acquiredOn:'UNKNOWN'}),'ACQUISITION_UNKNOWN'));
test('missing terms-reviewed date blocks',()=>has(changedRecord({termsReviewedOn:'UNKNOWN'}),'TERMS_DATE_UNKNOWN'));
test('unknown dataset date informs but does not fabricate',()=>{
  const result=auditTierLedger(changedRecord({sourceDate:'UNKNOWN'}));
  assert.equal(result.findings.find(v=>v.code==='SOURCE_DATE_UNKNOWN')?.level,'attention');
});
test('unknown tier blocks',()=>has(changedRecord({tier:'UNKNOWN'}),'TIER_UNKNOWN'));
test('unknown permission blocks',()=>has(changedRecord({permission:'UNKNOWN'}),'PERMISSION_UNKNOWN'));
test('denied permission blocks',()=>has(changedRecord({permission:'NO'}),'PERMISSION_DENIED'));
test('an empty source notice blocks',()=>has(changedRecord({attribution:''}),'NOTICE_EMPTY'));
test('future source date blocks with explicit review date',()=>has(changedRecord({sourceDate:'2026-12-01'}),'FUTURE_DATE',{asOf:'2026-11-15'}));
test('future terms date blocks with explicit review date',()=>has(changedRecord({termsReviewedOn:'2026-12-01'}),'FUTURE_DATE',{asOf:'2026-11-15'}));
test('future acquisition date blocks with explicit review date',()=>has(changedRecord({acquiredOn:'2026-12-01'}),'FUTURE_DATE',{asOf:'2026-11-15'}));
test('source after acquisition is disclosed',()=>has(changedRecord({sourceDate:'2026-11-04'}),'SOURCE_AFTER_ACQUISITION'));
test('terms review before acquisition is disclosed',()=>has(changedRecord({acquiredOn:'2026-11-04',termsReviewedOn:'2026-11-01'}),'TERMS_REVIEW_BEFORE_ACQUISITION'));
test('OSM requires map credit in attribution text',()=>has(changedRecord({attribution:'Other source'}),'OSM_CREDIT_MISSING'));
test('OSM requires explicit ODbL licence',()=>has(changedRecord({licenceName:'Unknown custom terms'}),'LICENCE_FAMILY_MISMATCH'));
test('OSM custom source is marked as attention, not inferred as catalogue source',()=>has(changedRecord({sourceUrl:'https://example.org/osm'}),'OSM_NONCATALOGUE_URL'));
test('AUA record has complete notices and no OGL requirement',()=>{
  const input=ledger({records:[auaRecord()],surfaces:[surface({recordIds:['aua-record'],mode:'journey'})]});
  assert.equal(auditTierLedger(input).blocked,false);
  assert.equal(codes(input).includes('OGL_NOTICE_MISSING'),false);
});
test('AUA exact section 3 legend required',()=>{
  const r=auaRecord({attribution:'Users must follow applicable laws when using the transit data.'});
  has(ledger({records:[r],surfaces:[surface({recordIds:[r.id],mode:'journey'})]}),'AUA_LEGEND_MISSING');
});
test('AUA applicable-laws English line required',()=>{
  const r=auaRecord({attribution:auaRecord().attribution.replace('Users must follow applicable laws when using the transit data.','')});
  has(ledger({records:[r],surfaces:[surface({recordIds:[r.id],mode:'journey'})]}),'AUA_LAWS_EN_MISSING');
});
test('AUA applicable-laws French line required',()=>{
  const r=auaRecord({attribution:auaRecord().attribution.replace('Les utilisateurs doivent respecter les lois applicables lorsqu’ils utilisent les données de transport en commun.','')});
  has(ledger({records:[r],surfaces:[surface({recordIds:[r.id],mode:'journey'})]}),'AUA_LAWS_FR_MISSING');
});
test('AUA and OGL must not be combined by assumption',()=>{
  const r=auaRecord({attribution:`${auaRecord().attribution}\nContains information licensed under the Open Government Licence - Ontario - Metrolinx.`});
  has(ledger({records:[r],surfaces:[surface({recordIds:[r.id],mode:'journey'})]}),'AUA_OGL_MIXED');
});
test('OGL record uses its own required line',()=>{
  const r=oglRecord();const input=ledger({records:[r],surfaces:[surface({recordIds:[r.id],mode:'journey'})]});
  assert.equal(auditTierLedger(input).blocked,false);
});
test('OGL line omission blocks',()=>{
  const r=oglRecord({attribution:'Other transport source'});
  has(ledger({records:[r],surfaces:[surface({recordIds:[r.id],mode:'journey'})]}),'OGL_NOTICE_MISSING');
});
test('OGL and AUA must not be mixed',()=>{
  const r=oglRecord({attribution:`${oglRecord().attribution}\n${auaRecord().attribution}`});
  has(ledger({records:[r],surfaces:[surface({recordIds:[r.id],mode:'journey'})]}),'OGL_AUA_MIXED');
});
test('LTC record credit can be described without endorsement',()=>{
  const r=ltcRecord();const input=ledger({records:[r],surfaces:[surface({recordIds:[r.id],mode:'journey'})]});
  assert.equal(auditTierLedger(input).blocked,false);
});
test('LTC missing credit blocks',()=>{
  const r=ltcRecord({attribution:'Unattributed transport data'});
  has(ledger({records:[r],surfaces:[surface({recordIds:[r.id],mode:'journey'})]}),'LTC_NOTICE_MISSING');
});
test('other source requires a concrete licence name',()=>{
  const r=record({family:'other',licenceName:'unknown terms'});
  has(ledger({records:[r]}),'OTHER_LICENCE_UNCLEAR');
});
test('finding ordering is stable and path-sorted',()=>{
  const x=changedRecord({tier:'UNKNOWN',permission:'UNKNOWN',sourceUrl:'UNKNOWN'});
  const findings=auditTierLedger(x).findings;
  assert.deepEqual(findings.map(f=>f.path),[...findings.map(f=>f.path)].sort());
});
test('finding shape always has code level entity path and detail',()=>{
  for(const item of auditTierLedger(changedRecord({permission:'UNKNOWN'})).findings)assert.deepEqual(Object.keys(item),['code','level','entity','path','detail']);
});
test('no hidden inferences in comparison when records unchanged',()=>{
  const result=compareTierLedgers(ledger(),ledger());
  assert.equal(result.blocked,false);assert.equal(result.changes.length,0);
});
test('comparison detects removed records',()=>{
  const current=ledger({records:[],surfaces:[]});
  const result=compareTierLedgers(ledger(),current);
  assert.equal(result.blocked,true);
  assert.ok(result.changes.some(v=>v.kind==='records-removed'));
});
test('comparison detects removed surfaces',()=>{
  const result=compareTierLedgers(ledger(),ledger({surfaces:[]}));
  assert.ok(result.changes.some(v=>v.kind==='surfaces-removed'));
});
test('comparison detects new records as attention',()=>{
  const result=compareTierLedgers(ledger(),ledger({records:[record(),record({id:'new-record',state:'held'})]}));
  assert.ok(result.changes.some(v=>v.kind==='records-added'&&v.severity==='attention'));
});
test('comparison detects new surfaces as attention',()=>{
  const result=compareTierLedgers(ledger(),ledger({surfaces:[surface(),surface({id:'new-fr',locale:'fr'})]}));
  assert.ok(result.changes.some(v=>v.kind==='surfaces-added'));
});
for(const field of ['permission','tier','family','licenceUrl','licenceName','sourceUrl','attribution','state','sourceDate','acquiredOn','termsReviewedOn','evidenceUrl']){
  const overrides={permission:'UNKNOWN',tier:'secondary',family:'other',licenceUrl:'UNKNOWN',licenceName:'Open Licence A',sourceUrl:'UNKNOWN',attribution:'© Other contributors',state:'held',sourceDate:'2026-10-01',acquiredOn:'2026-10-01',termsReviewedOn:'2026-10-01',evidenceUrl:'UNKNOWN'};
  test(`comparison blocks source evidence drift ${field}`,()=>{
    const result=compareTierLedgers(ledger(),changedRecord({[field]:overrides[field]}));
    assert.ok(result.changes.some(v=>v.field===field&&v.severity==='block'));
  });
}
for(const field of ['recordIds','offline','targetPx','mapCredit','labelled','keyboard','locale','mode']){
  const overrides={recordIds:[],offline:'UNKNOWN',targetPx:43,mapCredit:'UNKNOWN',labelled:'NO',keyboard:'NO',locale:'fr',mode:'journey'};
  test(`comparison blocks published surface drift ${field}`,()=>{
    const result=compareTierLedgers(ledger(),changedSurface({[field]:overrides[field]}));
    assert.ok(result.changes.some(v=>v.field===field&&v.severity==='block'));
  });
}
test('comparisons do not change input ledgers',()=>{
  const before=ledger(),after=changedSurface({targetPx:43});
  const snapshot=structuredClone(before);compareTierLedgers(before,after);assert.deepEqual(before,snapshot);
});
