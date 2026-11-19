import test from 'node:test';
import assert from 'node:assert/strict';
import { compareHandoffPacks, changesForSource, changesForHandoff,
  summarizedChanges, CHANGE_KINDS } from './handoff-change.mjs';
import { pack, source, surface, handoff } from './handoff-fixtures.mjs';
function compare(current, previous = pack()) { return compareHandoffPacks(previous, current); }
function changed(overrides = {}) { return pack(overrides); }
function has(result, kind, field = null) {
  return result.changes.some((item) => item.kind === kind && (field === null || item.field === field));
}
test('identical release has no changes', () => assert.deepEqual(compare(pack()).changes, []));
test('unchanged release is not blocked', () => assert.equal(compare(pack()).blocked, false));
test('changed release ID alone is not evidence regression', () => {
  assert.equal(compare(pack({releaseId:'new-release'})).changes.length, 0);
});
test('missing source is a blocking change', () => {
  const result = compare(changed({sources:[]}));
  assert.ok(has(result, 'source-removed'));
  assert.equal(result.blocked,true);
});
test('added source is recorded', () => {
  const result = compare(changed({sources:[source(),source({id:'new-source'})]}));
  assert.ok(has(result,'source-added'));
});
test('source licence change blocks', () => {
  const result = compare(changed({sources:[source({licenceName:'Different rights'})]}));
  assert.ok(has(result,'source-field','licenceName'));
  assert.equal(result.blocked,true);
});
test('source URL change blocks', () => {
  const result = compare(changed({sources:[source({sourceUrl:'https://example.org/new'})]}));
  assert.ok(has(result,'source-field','sourceUrl'));
});
test('source permission loss blocks', () => {
  const result = compare(changed({sources:[source({permission:'UNKNOWN'})]}));
  assert.ok(result.blocked);
  assert.ok(has(result,'source-field','permission'));
});
test('permission improvement does not independently block', () => {
  const result = compare(changed({sources:[source()]}),pack({sources:[source({permission:'NO'})]}));
  const item = result.changes.find((x)=>x.field==='permission');
  assert.equal(item.severity,'review');
});
test('source tier regression blocks', () => {
  const result = compare(changed({sources:[source({tier:'UNKNOWN'})]}));
  assert.ok(has(result,'source-field','tier'));
  assert.equal(result.blocked,true);
});
test('source tier improvement receives review', () => {
  const result = compare(changed({sources:[source({tier:'primary'})]}),pack({sources:[source({tier:'UNKNOWN'})]}));
  assert.equal(result.changes.find((x)=>x.field==='tier').severity,'review');
});
test('source notice removal blocks', () => {
  const result = compare(changed({sources:[source({notice:''})]}));
  assert.ok(has(result,'source-field','notice'));
});
test('source date change is visible', () => {
  const result = compare(changed({sources:[source({datasetDate:'2026-01-05'})]}));
  assert.ok(has(result,'source-field','datasetDate'));
});
test('source name edit is review rather than blockage alone', () => {
  const result = compare(changed({sources:[source({name:'Updated label'})]}));
  assert.equal(result.changes.find((x)=>x.field==='name').severity,'review');
});
test('removed surface blocks', () => {
  const result = compare(changed({surfaces:[]}));
  assert.ok(has(result,'surface-removed'));
});
test('added surface is recorded', () => {
  const result = compare(changed({surfaces:[surface(),surface({id:'list-fr',locale:'fr',mode:'list'})]}));
  assert.ok(has(result,'surface-added'));
});
test('surface locale change blocks', () => {
  const result = compare(changed({surfaces:[surface({locale:'fr'})]}));
  assert.ok(has(result,'surface-field','locale'));
});
test('surface linked sources change blocks', () => {
  const result = compare(changed({surfaces:[surface({sourceIds:[]})]}));
  assert.ok(has(result,'surface-field','sourceIds'));
});
test('offline capability loss blocks', () => {
  const result = compare(changed({surfaces:[surface({offline:'NO'})]}));
  assert.ok(has(result,'surface-field','offline'));
});
test('keyboard capability loss blocks', () => {
  const result = compare(changed({surfaces:[surface({keyboard:'UNKNOWN'})]}));
  assert.ok(has(result,'surface-field','keyboard'));
});
test('reader labelling loss blocks', () => {
  const result = compare(changed({surfaces:[surface({screenReader:'NO'})]}));
  assert.ok(has(result,'surface-field','screenReader'));
});
test('smaller touch target blocks', () => {
  const result = compare(changed({surfaces:[surface({targetPx:43})]}));
  assert.equal(result.changes.find((x)=>x.field==='targetPx').severity,'block');
});
test('larger touch target does not block', () => {
  const result = compare(changed({surfaces:[surface({targetPx:64})]}));
  assert.equal(result.changes.find((x)=>x.field==='targetPx').severity,'information');
  assert.equal(result.blocked,false);
});
test('surface publication date edit is review', () => {
  const result = compare(changed({surfaces:[surface({publicationDate:'2026-01-12'})]}));
  assert.equal(result.changes.find((x)=>x.field==='publicationDate').severity,'review');
});
test('removed handoff blocks', () => {
  const result = compare(changed({handoffs:[]}));
  assert.ok(has(result,'handoff-removed'));
});
test('added handoff is visible', () => {
  const result = compare(changed({handoffs:[handoff(),handoff({id:'handoff-b',format:'text'})]}));
  assert.ok(has(result,'handoff-added'));
});
test('handoff digest regression blocks', () => {
  const result = compare(changed({handoffs:[handoff({digest:'UNKNOWN'})]}));
  assert.ok(has(result,'handoff-field','digest'));
});
test('handoff approval loss blocks', () => {
  const result = compare(changed({handoffs:[handoff({approval:'NO'})]}));
  assert.ok(has(result,'handoff-field','approval'));
});
test('handoff approval improvement is review', () => {
  const result = compare(changed({handoffs:[handoff({approval:'YES'})]}),pack({handoffs:[handoff({approval:'NO'})]}));
  assert.equal(result.changes.find((x)=>x.field==='approval').severity,'review');
});
test('expiry extension is informational', () => {
  const result = compare(changed({handoffs:[handoff({expiresDate:'2028-01-10'})]}));
  assert.equal(result.changes.find((x)=>x.field==='expiresDate').severity,'information');
});
test('expiry shortened is blocking', () => {
  const result = compare(changed({handoffs:[handoff({expiresDate:'2026-12-10'})]}));
  assert.equal(result.changes.find((x)=>x.field==='expiresDate').severity,'block');
});
test('recipient change is blocking', () => {
  const result = compare(changed({handoffs:[handoff({recipient:'public-download'})]}));
  assert.ok(has(result,'handoff-field','recipient'));
});
test('handoff purpose edit is review', () => {
  const result = compare(changed({handoffs:[handoff({purpose:'Additional local attribution review'})]}));
  assert.equal(result.changes.find((x)=>x.field==='purpose').severity,'review');
});
test('policy audience change blocks', () => {
  const result = compare(changed({policy:{...pack().policy,audience:'public'}}));
  assert.ok(has(result,'policy-field','audience'));
});
test('policy retention change blocks', () => {
  const result = compare(changed({policy:{...pack().policy,retention:'explicit-export'}}));
  assert.ok(has(result,'policy-field','retention'));
});
test('policy purpose translation change is review', () => {
  const result = compare(changed({policy:{...pack().policy,purposeFr:'Autre objectif de consultation'}}));
  assert.equal(result.changes.find((x)=>x.field==='purposeFr').severity,'review');
});
test('new audit finding is recorded', () => {
  const result = compare(changed({sources:[source({permission:'NO'})]}));
  assert.ok(has(result,'new-finding'));
});
test('resolved audit finding is recorded', () => {
  const result = compare(pack(),pack({sources:[source({permission:'NO'})]}));
  assert.ok(has(result,'resolved-finding'));
});
test('changesForSource selects exact source changes', () => {
  const result = compare(changed({sources:[source({name:'Updated label'})]}));
  assert.ok(changesForSource(result,'osm-a').some((x)=>x.field==='name'));
});
test('changesForHandoff selects exactly associated changes', () => {
  const result = compare(changed({handoffs:[handoff({purpose:'Updated handoff purpose'})]}));
  assert.ok(changesForHandoff(result,'handoff-a').some((x)=>x.field==='purpose'));
});
test('change kinds are stable and unique', () => assert.equal(new Set(CHANGE_KINDS).size,CHANGE_KINDS.length));
test('summary counts all change kinds', () => {
  const result = compare(changed({sources:[source({name:'Renamed source'})]}));
  assert.equal(summarizedChanges(result)['source-field'],1);
});
test('comparison does not modify either input', () => {
  const old = pack(); const next = pack({surfaces:[surface({targetPx:50})]});
  const originalOld = structuredClone(old);const originalNext = structuredClone(next);
  compareHandoffPacks(old,next);
  assert.deepEqual(old,originalOld);assert.deepEqual(next,originalNext);
});
test('comparison findings have deterministic ordering', () => {
  const result=compare(changed({sources:[source({permission:'UNKNOWN',licenceUrl:'UNKNOWN'})]}));
  assert.deepEqual(result.changes,[...result.changes].sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)||a.field.localeCompare(b.field)));
});
