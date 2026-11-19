import test from 'node:test';
import assert from 'node:assert/strict';
import { CoverageInputError, COVERAGE_SCHEMA, MAX_DOCUMENT_BYTES, parseCoverageJson,
  parseCoverageRegister, parseCoverageSource, parseCoverageView, coverageToJson,
  linkedSources,linkedViews,includedViews,includedSources,sourcesById,viewsById } from './coverage-core.mjs';
import { register,source,view } from './coverage-fixture.test.mjs';
const bad = (value, path) => assert.throws(()=>parseCoverageRegister(value),(error)=>
  error instanceof CoverageInputError && (!path || error.path.includes(path)));

test('versioned contract does not mutate caller data', () => {
  const raw = register();const before = structuredClone(raw);
  const parsed = parseCoverageRegister(raw);
  assert.deepEqual(raw,before);assert.notStrictEqual(parsed,raw);
  assert.equal(parsed.schema,COVERAGE_SCHEMA);
  assert.ok(Object.isFrozen(parsed));assert.ok(Object.isFrozen(parsed.sources));
});
test('round trip retains exact unknown and UTF-8 notice bytes',()=>{
  const raw=register({sources:[source({notes:'Texte français\nDeux lignes'})]});
  assert.deepEqual(parseCoverageJson(coverageToJson(raw)),parseCoverageRegister(raw));
});
test('input must be JSON text',()=>assert.throws(()=>parseCoverageJson({}),CoverageInputError));
test('input size is bounded in UTF-8 bytes',()=>assert.throws(()=>parseCoverageJson('é'.repeat(MAX_DOCUMENT_BYTES)),CoverageInputError));
test('malformed JSON is rejected',()=>assert.throws(()=>parseCoverageJson('{'),CoverageInputError));
test('all required root fields are explicit',()=>{
  for(const key of Object.keys(register())){
    const raw=register();delete raw[key];bad(raw,key);
  }
});
test('extra root fields are rejected',()=>bad({...register(),special:true},'special'));
test('schema must match exactly',()=>bad({...register(),schema:'attribution-coverage/2'},'schema'));
test('release identifier is bounded and hyphenated',()=>{
  for(const releaseId of ['','Bad','invalid_id','two words','-bad','x'.repeat(65)])bad({...register(),releaseId},'releaseId');
});
test('source and view arrays are required',()=>{
  for(const key of ['sources','views'])bad({...register(),[key]:{}},key);
});
test('duplicate identifiers are rejected',()=>{
  bad(register({sources:[source(),source()]}),'sources');
  bad(register({views:[view(),view()]}),'views');
});
test('duplicate source links are rejected',()=>bad(register({views:[view({sourceIds:['osm-base','osm-base']})]}),'sourceIds'));
test('source references remain explicit even if unknown',()=>{
  const parsed=parseCoverageRegister(register({views:[view({sourceIds:['not-present']})]}));
  assert.equal(parsed.views[0].sourceIds[0],'not-present');
});
test('included and linked selectors preserve release state',()=>{
  const raw=register({sources:[source(),source({id:'second',state:'held'})],views:[view(),view({id:'held-view',state:'held'})]});
  const parsed=parseCoverageRegister(raw);
  assert.deepEqual(includedSources(parsed).map((x)=>x.id),['osm-base']);
  assert.deepEqual(includedViews(parsed).map((x)=>x.id),['map-en']);
  assert.deepEqual(linkedViews(parsed,'osm-base').map((x)=>x.id),['map-en','held-view']);
  assert.deepEqual(linkedSources(parsed,'map-en').map((x)=>x.id),['osm-base']);
  assert.deepEqual(linkedSources(parsed,'absent'),[]);
  assert.equal(sourcesById(parsed).get('second').state,'held');
  assert.equal(viewsById(parsed).get('held-view').state,'held');
});
for(const field of ['id','provider','title','sourceUrl','licenceUrl','licenceKind','licenceName','permission','evidenceTier',
  'acquiredOn','datasetAsOf','termsReviewedOn','attribution','notes','state']){
  test(`missing source.${field} is rejected`,()=>{const raw=source();delete raw[field];assert.throws(()=>parseCoverageSource(raw),CoverageInputError);});
}
for(const field of ['id','title','kind','language','sourceIds','state','offline','keyboard','screenReader','mapCredit',
  'minimumTargetPx','publishedOn','notes']){
  test(`missing view.${field} is rejected`,()=>{const raw=view();delete raw[field];assert.throws(()=>parseCoverageView(raw),CoverageInputError);});
}
for(const field of ['permission','offline','keyboard','screenReader','mapCredit']){
  test(`unrecognised state in ${field} is rejected`,()=>{
    if(field==='permission')assert.throws(()=>parseCoverageSource(source({permission:'MAYBE'})),CoverageInputError);
    else assert.throws(()=>parseCoverageView(view({[field]:'MAYBE'})),CoverageInputError);
  });
}
for(const value of ['2026-02-30','2025-02-29','2026-00-01','2026-13-01','2026-04-31','1800-01-01','not-date','']){
  test(`invalid calendar date ${value || 'empty'} is rejected`,()=>{
    assert.throws(()=>parseCoverageSource(source({acquiredOn:value})),CoverageInputError);
    assert.throws(()=>parseCoverageView(view({publishedOn:value})),CoverageInputError);
  });
}
test('leap day accepted in correct year',()=>assert.equal(parseCoverageSource(source({acquiredOn:'2024-02-29'})).acquiredOn,'2024-02-29'));
for(const value of ['http://example.org/','javascript:alert(1)','file:///tmp/a','https://localhost/','https://127.0.0.1/','https://10.1.1.1/',
  'https://192.168.1.2/','https://172.16.0.1/','https://user:pass@example.org/','https://example.org/#fragment']){
  test(`unsafe source URL ${value} is rejected`,()=>assert.throws(()=>parseCoverageSource(source({sourceUrl:value})),CoverageInputError));
}
for(const value of [null,NaN,Infinity,-1,43.5,1001]){
  test(`invalid target ${String(value)} rejected`,()=>assert.throws(()=>parseCoverageView(view({minimumTargetPx:value})),CoverageInputError));
}
test('target 44 and unknown are valid contract values',()=>{
  assert.equal(parseCoverageView(view({minimumTargetPx:44})).minimumTargetPx,44);
  assert.equal(parseCoverageView(view({minimumTargetPx:'UNKNOWN'})).minimumTargetPx,'UNKNOWN');
});
test('exact allowed provider selection is enforced',()=>{
  for(const value of ['unknown','miway','Metrolinx',null])assert.throws(()=>parseCoverageSource(source({provider:value})),CoverageInputError);
});
test('embedded scripts in provenance text remain inert plain text',()=>{
  const parsed=parseCoverageSource(source({notes:'<script>alert(1)</script>'}));
  assert.ok(parsed.notes.includes('<script>'));
});
test('control characters are rejected but legal multiline notices work',()=>{
  assert.throws(()=>parseCoverageSource(source({notes:'bad\u0000text'})),CoverageInputError);
  assert.ok(parseCoverageSource(source({attribution:'First\nSecond'})).attribution.includes('\n'));
});
