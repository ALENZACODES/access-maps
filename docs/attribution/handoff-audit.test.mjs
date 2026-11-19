import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHandoffPack, CODES, LEVELS } from './handoff-audit.mjs';
import { pack, publicPack, source, surface, handoff, fourProviders,
  auaSource, oglSource, ltcSource } from './handoff-fixtures.mjs';
function audit(overrides = {}, options = {}) { return auditHandoffPack(pack(overrides), options); }
function codes(result) { return result.findings.map((item) => item.code); }
function expects(code, overrides, options) {
  const result = audit(overrides, options);
  assert.equal(result.blocked, true, `Expected a block for ${code}`);
  assert.ok(codes(result).includes(code), `Missing ${code}: ${codes(result).join(', ')}`);
}
test('valid local handoff passes with an informational unknown dataset date', () => {
  const result = audit();
  assert.equal(result.blocked, false);
  assert.ok(codes(result).includes('SOURCE_DATE_UNKNOWN'));
});
test('public bilingual handoff passes', () => assert.equal(auditHandoffPack(publicPack()).blocked, false));
test('all four provider paths can coexist with distinct terms', () => assert.equal(auditHandoffPack(fourProviders()).blocked, false));
test('findings contain stable location and code', () => {
  const item = audit().findings[0];
  assert.equal(typeof item.code, 'string');
  assert.equal(typeof item.path, 'string');
  assert.equal(typeof item.detail, 'string');
});
test('every finding uses a supported severity', () => {
  for (const finding of audit().findings) assert.ok(LEVELS.includes(finding.level));
});
test('code catalogue has unique names', () => assert.equal(new Set(CODES).size, CODES.length));
test('empty source inventory blocks', () => expects('NO_SOURCES', {sources:[]}));
test('empty surface inventory blocks', () => expects('NO_SURFACES', {surfaces:[]}));
test('empty handoff inventory blocks', () => expects('NO_HANDOFFS', {handoffs:[]}));
test('unknown audience blocks', () => expects('POLICY_AUDIENCE_UNKNOWN', {policy:{...pack().policy,audience:'UNKNOWN'}}));
test('unknown retention blocks', () => expects('POLICY_RETENTION_UNKNOWN', {policy:{...pack().policy,retention:'UNKNOWN'}}));
test('unknown policy date is attention, not invented', () => {
  const result = audit({policy:{...pack().policy,reviewDate:'UNKNOWN'}});
  assert.equal(result.blocked,false);
  assert.ok(codes(result).includes('POLICY_DATE_UNKNOWN'));
});
test('missing source URL blocks', () => expects('SOURCE_URL_UNKNOWN',{sources:[source({sourceUrl:'UNKNOWN'})]}));
test('missing licence URL blocks', () => expects('LICENCE_URL_UNKNOWN',{sources:[source({licenceUrl:'UNKNOWN'})]}));
test('missing evidence URL blocks', () => expects('SOURCE_EVIDENCE_UNKNOWN',{sources:[source({evidenceUrl:'UNKNOWN'})]}));
test('unknown licence name blocks', () => expects('LICENCE_NAME_UNKNOWN',{sources:[source({licenceName:'UNKNOWN'})]}));
test('unknown source evidence tier blocks', () => expects('SOURCE_TIER_UNKNOWN',{sources:[source({tier:'UNKNOWN'})]}));
test('unknown source permission blocks', () => expects('PERMISSION_UNKNOWN',{sources:[source({permission:'UNKNOWN'})]}));
test('denied source permission blocks', () => expects('PERMISSION_DENIED',{sources:[source({permission:'NO'})]}));
test('unknown acquisition date blocks', () => expects('SOURCE_ACQUIRED_UNKNOWN',{sources:[source({acquiredDate:'UNKNOWN'})]}));
test('unknown terms date blocks', () => expects('SOURCE_TERMS_UNKNOWN',{sources:[source({termsDate:'UNKNOWN'})]}));
test('unknown dataset date does not block', () => {
  assert.equal(audit({sources:[source({datasetDate:'UNKNOWN'})]}).blocked,false);
});
test('missing attribution notice blocks', () => expects('NOTICE_MISSING',{sources:[source({notice:''})]}));
test('missing OSM credit blocks', () => expects('OSM_CREDIT_MISSING',{sources:[source({notice:'Map data'})]}));
test('OSM credit is distinct from ODbL licence name', () => expects('ODBL_NAME_MISSING',{sources:[source({licenceName:'Data licence'})]}));
test('missing AUA section legend blocks', () => expects('AUA_LEGEND_MISSING',{sources:[auaSource({notice:'Users must follow applicable laws when using the transit data.'})],surfaces:[surface({sourceIds:['aua-a']})],handoffs:[handoff({sourceIds:['aua-a']})]}));
test('missing AUA applicable-laws lines blocks', () => expects('AUA_LAWS_MISSING',{sources:[auaSource({notice:'Data used in this product or service is provided with the permission of Metrolinx.'})],surfaces:[surface({sourceIds:['aua-a']})],handoffs:[handoff({sourceIds:['aua-a']})]}));
test('AUA/OGL notice mixing is rejected', () => expects('TERMS_MIXED',{sources:[auaSource({notice:`${auaSource().notice}\nContains information licensed under the Open Government Licence - Ontario - Metrolinx.`})],surfaces:[surface({sourceIds:['aua-a']})],handoffs:[handoff({sourceIds:['aua-a']})]}));
test('OGL without its notice blocks', () => expects('OGL_NOTICE_MISSING',{sources:[oglSource({notice:'Generic transport notice'})],surfaces:[surface({sourceIds:['ogl-a']})],handoffs:[handoff({sourceIds:['ogl-a']})]}));
test('OGL carrying AUA section 3 blocks', () => expects('TERMS_MIXED',{sources:[oglSource({notice:`${oglSource().notice}\n${auaSource().notice}`})],surfaces:[surface({sourceIds:['ogl-a']})],handoffs:[handoff({sourceIds:['ogl-a']})]}));
test('LTC attribution source absent blocks', () => expects('LTC_NOTICE_MISSING',{sources:[ltcSource({notice:'Transit agency data'})],surfaces:[surface({sourceIds:['ltc-a']})],handoffs:[handoff({sourceIds:['ltc-a']})]}));
test('held source without publication is not automatically allowed', () => expects('SOURCE_NOT_INCLUDED',{sources:[source({status:'held'})]}));
test('excluded source cannot support an included surface', () => expects('SOURCE_NOT_INCLUDED',{sources:[source({status:'excluded'})]}));
test('missing surface source link blocks', () => expects('SOURCE_NOT_FOUND',{surfaces:[surface({sourceIds:['absent']})]}));
test('missing handoff surface blocks', () => expects('DELIVERY_MISSING_SURFACE',{handoffs:[handoff({surfaceIds:['absent']})]}));
test('missing handoff source blocks', () => expects('DELIVERY_MISSING_SOURCE',{handoffs:[handoff({sourceIds:['absent']})]}));
test('surface source missing from handoff declaration blocks', () => expects('DELIVERY_UNLINKED_SOURCE',{handoffs:[handoff({sourceIds:[]})]}));
test('handoff with no surfaces blocks', () => expects('DELIVERY_EMPTY',{handoffs:[handoff({surfaceIds:[]})]}));
test('handoff with no sources blocks', () => expects('DELIVERY_EMPTY',{handoffs:[handoff({sourceIds:[]})]}));
test('unknown recipient blocks', () => expects('DELIVERY_RECIPIENT_UNKNOWN',{handoffs:[handoff({recipient:'UNKNOWN'})]}));
test('unknown scope blocks', () => expects('DELIVERY_SCOPE_UNKNOWN',{handoffs:[handoff({scope:'UNKNOWN'})]}));
test('unknown digest blocks', () => expects('DELIVERY_DIGEST_UNKNOWN',{handoffs:[handoff({digest:'UNKNOWN'})]}));
test('unknown approval blocks', () => expects('DELIVERY_PERMISSION_UNKNOWN',{handoffs:[handoff({approval:'UNKNOWN'})]}));
test('denied approval blocks', () => expects('DELIVERY_PERMISSION_DENIED',{handoffs:[handoff({approval:'NO'})]}));
test('unknown approval date blocks', () => expects('DELIVERY_DATE_UNKNOWN',{handoffs:[handoff({approvedDate:'UNKNOWN'})]}));
test('approval after expiry blocks', () => expects('DELIVERY_DATE_ORDER',{handoffs:[handoff({expiresDate:'2020-01-01'})]}));
test('expired delivery blocks on explicit reference date', () => expects('DELIVERY_EXPIRED',{}, {referenceDate:'2028-01-01'}));
test('without a reference date expiry is not assumed', () => assert.equal(audit().blocked,false));
test('unknown expiry is attention only', () => {
  const result = audit({handoffs:[handoff({expiresDate:'UNKNOWN'})]});
  assert.equal(result.blocked,false);
  assert.ok(codes(result).includes('DELIVERY_EXPIRY_UNKNOWN'));
});
test('public download with unknown approval blocks', () => expects('PUBLIC_DELIVERY_WITHOUT_APPROVAL',{...publicPack(),handoffs:[handoff({recipient:'public-download',surfaceIds:['map-en','map-fr'],approval:'UNKNOWN'})]}));
test('public download with broad scope blocks', () => expects('PUBLIC_DELIVERY_SCOPE_UNKNOWN',{...publicPack(),handoffs:[handoff({recipient:'public-download',surfaceIds:['map-en','map-fr'],scope:'source-summary'})]}));
test('public download requires language companion', () => expects('ALTERNATE_LANGUAGE_MISSING',{handoffs:[handoff({recipient:'public-download'})],policy:{...pack().policy,audience:'public'}}));
test('fr companion with same declared sources satisfies public language check', () => {
  assert.equal(auditHandoffPack(publicPack()).blocked,false);
});
test('screen reader UNKNOWN blocks', () => expects('SURFACE_READER_UNKNOWN',{surfaces:[surface({screenReader:'UNKNOWN'})]}));
test('keyboard NO blocks', () => expects('SURFACE_KEYBOARD_DENIED',{surfaces:[surface({keyboard:'NO'})]}));
test('offline NO blocks', () => expects('SURFACE_OFFLINE_DENIED',{surfaces:[surface({offline:'NO'})]}));
test('offline UNKNOWN blocks', () => expects('SURFACE_OFFLINE_UNKNOWN',{surfaces:[surface({offline:'UNKNOWN'})]}));
test('map credit UNKNOWN blocks', () => expects('SURFACE_MAP_CREDIT_UNKNOWN',{surfaces:[surface({mapCredit:'UNKNOWN'})]}));
test('map credit NO blocks', () => expects('SURFACE_MAP_CREDIT_DENIED',{surfaces:[surface({mapCredit:'NO'})]}));
test('UNKNOWN target blocks', () => expects('SURFACE_TARGET_UNKNOWN',{surfaces:[surface({targetPx:'UNKNOWN'})]}));
test('43px target blocks', () => expects('SURFACE_TARGET_SMALL',{surfaces:[surface({targetPx:43})]}));
test('44px target passes', () => assert.equal(audit({surfaces:[surface({targetPx:44})]}).blocked,false));
test('88px target passes', () => assert.equal(audit({surfaces:[surface({targetPx:88})]}).blocked,false));
test('date conflicts are not silently made into source age claims', () => {
  const result = audit({sources:[source({datasetDate:'2026-02-01'})]});
  assert.ok(codes(result).includes('SOURCE_DATE_AFTER_ACQUISITION'));
});
test('source terms after handoff approval blocks', () => expects('SOURCE_TERMS_AFTER_APPROVAL',{sources:[source({termsDate:'2026-02-01'})]}));
test('short purpose creates a review finding', () => {
  const result = audit({handoffs:[handoff({purpose:'short'})]});
  assert.ok(codes(result).includes('HANDOFF_PURPOSE_NOT_DISCLOSED'));
  assert.equal(result.blocked,false);
});
test('two identical delivery scopes create an attention finding', () => {
  const value = pack({handoffs:[handoff(),handoff({id:'handoff-b'})]});
  const result = auditHandoffPack(value);
  assert.ok(codes(result).includes('DUPLICATE_DELIVERY_SCOPE'));
});
test('different delivery formats do not create a duplicate scope finding', () => {
  const value = pack({handoffs:[handoff(),handoff({id:'handoff-b',format:'text'})]});
  const result = auditHandoffPack(value);
  assert.ok(!codes(result).includes('DUPLICATE_DELIVERY_SCOPE'));
});
test('all counted blocking findings match actual list', () => {
  const result = audit({sources:[source({permission:'NO'})]});
  assert.equal(result.blockingCount,result.findings.filter((x)=>x.level==='block').length);
});
test('attention and information counts are consistent', () => {
  const result = audit();
  assert.equal(result.attentionCount,result.findings.filter((x)=>x.level==='attention').length);
  assert.equal(result.informationCount,result.findings.filter((x)=>x.level==='information').length);
});
test('audit findings have stable sorting', () => {
  const result = audit({sources:[source({permission:'UNKNOWN',licenceUrl:'UNKNOWN'})]});
  assert.deepEqual(result.findings, [...result.findings].sort((a,b)=>a.path.localeCompare(b.path)||a.code.localeCompare(b.code)));
});
test('no network is needed for the audit', () => {
  const before = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network must not be called'); };
  try { assert.equal(audit().releaseId,'sample-release'); }
  finally { globalThis.fetch = before; }
});
test('no inferred rights from the provider name', () => expects('PERMISSION_UNKNOWN',{sources:[source({permission:'UNKNOWN',name:'OpenStreetMap'})]}));
