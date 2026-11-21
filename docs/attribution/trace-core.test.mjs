import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACE_SCHEMA, UNKNOWN, OSM_CREDIT, MAX_BYTES, emptyTrace, parseTrace,
  jsonTrace, replaceRecord, removeRecord, makeSource, makeLayer, makeSurface,
  makeNotice, availableNoticeSlots, traceStats, safeHttps, validDate,
  sourceRecord, surfaceRecord, layerRecord, noticeRecord, TraceInputError,
} from './trace-core.mjs';

function fixture() {
  const source = {...makeSource('osm-local','Example fixture only'),
    sourceUrl:'https://www.openstreetmap.org/copyright',
    licence:'ODbL', licenceUrl:'https://www.openstreetmap.org/copyright',
    credit:OSM_CREDIT, retrievedOn:'2026-11-19', tier:'imported', permission:'yes'};
  const surface = {...makeSurface('map-en','Fictional map','en'),
    route:'/map', mapShown:'yes', keyboard:'yes', screenReader:'yes', focusVisible:'yes', minimumTargetPx:44};
  const layer = {...makeLayer('paths','Fixture paths',['osm-local'],['map-en']),
    mode:'route', status:'included', geometrySourceIds:['osm-local']};
  const notice = {...makeNotice('credit-one','osm-local','paths','map-en','en'),
    text:OSM_CREDIT, placement:'adjacent', visible:'yes', focusable:'yes', readable:'yes', observedOn:'2026-11-19'};
  return parseTrace({...emptyTrace(),title:'Fictional test',sources:[source],surfaces:[surface],layers:[layer],notices:[notice]});
}
function failure(callback, code) { assert.throws(callback, error => error instanceof TraceInputError && error.code === code); }

test('empty register is schema-valid and uses no fabricated records', () => {
  const state = parseTrace(emptyTrace());
  assert.equal(state.schema,TRACE_SCHEMA);
  assert.equal(state.sources.length,0);
  assert.equal(state.layers.length,0);
  assert.equal(state.notices.length,0);
});
test('serialization is stable and all values survive round trip', () => {
  const first = fixture();
  const second = parseTrace(jsonTrace(first));
  assert.deepEqual(second,first);
  assert.ok(jsonTrace(first).endsWith('\n'));
});
test('parsed record is copied rather than returned by reference', () => {
  const input = fixture();
  const output = parseTrace(input);
  assert.notStrictEqual(output,input);
  assert.notStrictEqual(output.layers,input.layers);
  assert.notStrictEqual(output.sources[0],input.sources[0]);
});
test('dates accept UNKNOWN', () => assert.equal(validDate(UNKNOWN),true));
test('dates accept leap year February', () => assert.equal(validDate('2024-02-29'),true));
for (const value of ['2026-02-29','2026-00-10','2026-13-01','2026-04-31','2026-12-00','1989-02-30','0000-01-01','2026-1-1',42,null]) {
  test(`dates reject ${String(value)}`,() => assert.equal(validDate(value),false));
}
test('safe URLs only allow public HTTPS or UNKNOWN', () => {
  assert.equal(safeHttps(UNKNOWN),UNKNOWN);
  assert.equal(safeHttps('https://example.org/license'),'https://example.org/license');
});
for(const value of ['http://example.com','file:///etc/passwd','javascript:alert(1)','//example.org','https://user:pass@example.org','https://localhost/a','https://127.0.0.1/','https://10.0.0.1/','https://192.168.0.4/','https://172.16.0.4/','https://example.org:444/path','https://example.org/path#section','',null,{},'https://example.org:80/']) {
  test(`unsafe URLs rejected: ${String(value)}`,()=>assert.equal(safeHttps(value),null));
}
test('Unicode names retained', () => {
  assert.equal(makeSource('source-en','Données d’observation').name,'Données d’observation');
});
test('new sources start unknown and cannot imply rights', () => {
  const source = makeSource('my-source','Fixture');
  assert.equal(source.sourceUrl,UNKNOWN);
  assert.equal(source.licence,UNKNOWN);
  assert.equal(source.retrievedOn,UNKNOWN);
  assert.equal(source.tier,UNKNOWN);
  assert.equal(source.permission,UNKNOWN);
  assert.equal(source.credit,UNKNOWN);
});
test('new display surfaces start with unknown observations', () => {
  const surface = makeSurface('s-en','Demo','en');
  for(const field of ['mapShown','keyboard','screenReader','focusVisible','minimumTargetPx','route']) assert.equal(surface[field],UNKNOWN);
});
test('new layer is draft not included', () => assert.equal(makeLayer('layer-one','Demo',[],[]).status,'draft'));
test('new notice has no inferred placement or observation', () => {
  const n = makeNotice('n-one','s-one','l-one','map-en','en');
  for(const key of ['text','placement','visible','focusable','readable','observedOn']) assert.equal(n[key],UNKNOWN);
});
for (const invalid of ['', 'One', 'two spaces', '../escape','a/b','a%20','x'.repeat(81),'ü-id']) {
  test(`invalid IDs rejected: ${invalid}`,()=>failure(()=>makeSource(invalid,'test'),'ID'));
}
test('identifiers with digits, dashes, dots, underscores supported',()=>assert.equal(makeSource('p18-a_2.4','OK').id,'p18-a_2.4'));
test('unknown keys on root are rejected',()=> failure(()=>parseTrace({...emptyTrace(),extra:7}),'FIELD'));
test('missing root fields rejected',()=>{const data=emptyTrace(); delete data.notices; failure(()=>parseTrace(data),'FIELD');});
test('unknown schema rejected',()=>failure(()=>parseTrace({...emptyTrace(),schema:'other/1'}),'SCHEMA'));
test('non-object root rejected',()=>failure(()=>parseTrace([]),'SHAPE'));
test('JSON syntax failures rejected',()=>failure(()=>parseTrace('{bad json'),'JSON'));
test('oversized JSON rejected before parsing',()=>failure(()=>parseTrace(' '.repeat(MAX_BYTES + 1)),'LIMIT'));
test('array required for source records',()=>failure(()=>parseTrace({...emptyTrace(),sources:{}}),'ARRAY'));
test('unexpected source fields rejected',()=>{
  const data=fixture(); data.sources[0].authorization='yes';
  failure(()=>parseTrace(data),'FIELD');
});
test('unexpected notice fields rejected',()=>{
  const data=fixture(); data.notices[0].sponsors='unknown';
  failure(()=>parseTrace(data),'FIELD');
});
test('duplicate source IDs rejected',()=>{
  const data=fixture(); data.sources.push({...data.sources[0]});
  failure(()=>parseTrace(data),'DUPLICATE');
});
test('duplicate layer IDs rejected',()=>{
  const data=fixture(); data.layers.push({...data.layers[0]});
  failure(()=>parseTrace(data),'DUPLICATE');
});
test('duplicate surface IDs rejected',()=>{
  const data=fixture(); data.surfaces.push({...data.surfaces[0]});
  failure(()=>parseTrace(data),'DUPLICATE');
});
test('duplicate notice IDs rejected',()=>{
  const data=fixture(); data.notices.push({...data.notices[0]});
  failure(()=>parseTrace(data),'DUPLICATE');
});
test('duplicate notice tuple rejected with different IDs',()=>{
  const data=fixture(); data.notices.push({...data.notices[0],id:'credit-two'});
  failure(()=>parseTrace(data),'DUPLICATE');
});
test('duplicate references inside layer rejected',()=>{
  const data=fixture(); data.layers[0].sourceIds.push('osm-local');
  failure(()=>parseTrace(data),'DUPLICATE');
});
test('unknown source reference rejected',()=>{
  const data=fixture(); data.layers[0].sourceIds=['absent'];
  failure(()=>parseTrace(data),'REFERENCE');
});
test('unknown display-surface reference rejected',()=>{
  const data=fixture(); data.layers[0].surfaceIds=['absent'];
  failure(()=>parseTrace(data),'REFERENCE');
});
test('geometry must appear in layer sources',()=>{
  const data=fixture(); data.sources.push(makeSource('other','Other'));
  data.layers[0].geometrySourceIds=['other'];
  failure(()=>parseTrace(data),'REFERENCE');
});
test('notice cannot refer to unrelated source',()=>{
  const data=fixture(); data.sources.push(makeSource('other','Other'));
  data.notices[0].sourceId='other';
  failure(()=>parseTrace(data),'REFERENCE');
});
test('notice cannot refer to unrelated surface',()=>{
  const data=fixture(); data.surfaces.push(makeSurface('other-en','Other'));
  data.notices[0].surfaceId='other-en';
  failure(()=>parseTrace(data),'REFERENCE');
});
test('notice locale must match surface locale',()=>{
  const data=fixture(); data.notices[0].locale='fr';
  failure(()=>parseTrace(data),'REFERENCE');
});
test('notice cannot refer to missing layer',()=>{
  const data=fixture(); data.notices[0].layerId='missing';
  failure(()=>parseTrace(data),'REFERENCE');
});
test('invalid minimum target rejected',()=>{
  const data=fixture(); data.surfaces[0].minimumTargetPx=12.2;
  failure(()=>parseTrace(data),'SIZE');
});
test('minimum target UNKNOWN preserved',()=>{
  const data=fixture(); data.surfaces[0].minimumTargetPx=UNKNOWN;
  assert.equal(parseTrace(data).surfaces[0].minimumTargetPx,UNKNOWN);
});
test('relative route path segments cannot escape',()=>{
  const data=fixture(); data.surfaces[0].route='/../../other';
  failure(()=>parseTrace(data),'ROUTE');
});
test('untrusted route cannot be protocol URL',()=>{
  const data=fixture(); data.surfaces[0].route='https://example.com/';
  failure(()=>parseTrace(data),'ROUTE');
});
test('source text cannot contain C0 control characters',()=>{
  const data=fixture(); data.sources[0].name='a\u0007b';
  failure(()=>parseTrace(data),'TEXT');
});
test('record replacement updates only the selected ID',()=>{
  const data=fixture();
  const replacement={...data.sources[0],notes:'Reviewed manually'};
  const next=replaceRecord(data,'sources',replacement);
  assert.equal(next.sources[0].notes,'Reviewed manually');
  assert.equal(data.sources[0].notes,'');
});
test('record insertion succeeds with safe defaults',()=>{
  const data=fixture();
  const next=replaceRecord(data,'sources',makeSource('extra','Unproven'));
  assert.equal(next.sources.length,2);
  assert.equal(next.sources[1].permission,UNKNOWN);
});
test('dependent record deletion fails closed',()=>failure(()=>removeRecord(fixture(),'sources','osm-local'),'REFERENCE'));
test('layer deletion fails while referenced by notice',()=>failure(()=>removeRecord(fixture(),'layers','paths'),'REFERENCE'));
test('surface deletion fails while referenced by layer',()=>failure(()=>removeRecord(fixture(),'surfaces','map-en'),'REFERENCE'));
test('notices can be removed independently',()=>{
  const next=removeRecord(fixture(),'notices','credit-one');
  assert.equal(next.notices.length,0);
});
test('unknown IDs cannot be deleted silently',()=>failure(()=>removeRecord(fixture(),'notices','unknown-id'),'REFERENCE'));
test('notice slots count missing expected tuples',()=>{
  const next=removeRecord(fixture(),'notices','credit-one');
  assert.deepEqual(availableNoticeSlots(next),[{layerId:'paths',surfaceId:'map-en',sourceId:'osm-local',locale:'en'}]);
});
test('complete register has zero missing notice slots',()=>assert.equal(availableNoticeSlots(fixture()).length,0));
test('stats reflect only included records',()=>{
  const stats=traceStats(fixture());
  assert.equal(stats.sources,1);
  assert.equal(stats.includedLayers,1);
  assert.equal(stats.includedSources,1);
  assert.equal(stats.missingSlots,0);
});
test('stats do not infer inclusion from draft layer',()=>{
  const data=fixture();data.layers[0].status='held';
  assert.equal(traceStats(data).includedLayers,0);
});
for (const [validator,record] of [[sourceRecord,()=>fixture().sources[0]],[layerRecord,()=>fixture().layers[0]],[surfaceRecord,()=>fixture().surfaces[0]],[noticeRecord,()=>fixture().notices[0]]]) {
  test(`individual record validators preserve valid ${validator.name}`,()=>assert.deepEqual(validator(record()),record()));
}
export {fixture};
