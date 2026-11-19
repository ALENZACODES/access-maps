import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoverageRegister } from './coverage-core.mjs';
import { compareCoverage } from './coverage-change.mjs';
import { register,source,view } from './coverage-fixture.test.mjs';
const compare=(before,after)=>compareCoverage(parseCoverageRegister(before),parseCoverageRegister(after));
const changed=(result,field)=>result.changes.some((change)=>change.field===field);

test('unchanged release has no field-level changes',()=>{
  const result=compare(register(),register());assert.equal(result.blocked,false);assert.equal(result.changes.length,0);
});
test('changed release ID alone does not imply changed evidence',()=>{
  const result=compare(register(),register({releaseId:'release-two'}));assert.equal(result.changes.length,0);
});
test('removing included source is blocking',()=>{
  const result=compare(register(),register({sources:[]}));assert.equal(result.blocked,true);
  assert.ok(result.changes.some((change)=>change.kind==='source'&&change.field==='removed'&&change.blocking));
});
test('removing included view is blocking',()=>{
  const result=compare(register(),register({views:[]}));assert.equal(result.blocked,true);
  assert.ok(result.changes.some((change)=>change.kind==='view'&&change.field==='removed'&&change.blocking));
});
test('removing held source is informational in field comparison',()=>{
  const before=register({sources:[source(),source({id:'held-source',state:'held'})]});
  const result=compare(before,register());assert.ok(result.changes.some((change)=>change.id==='held-source'&&!change.blocking));
});
test('adding an included source produces a change',()=>{
  const after=register({sources:[source(),source({id:'new-source',state:'held'})]});
  const result=compare(register(),after);assert.ok(result.changes.some((change)=>change.field==='added'&&change.id==='new-source'));
});
for(const field of ['provider','sourceUrl','licenceUrl','licenceKind','licenceName','permission','evidenceTier',
  'acquiredOn','termsReviewedOn','attribution','state']){
  test(`change to critical source field ${field} blocks release comparison`,()=>{
    const value={provider:'other',sourceUrl:'https://example.org/new',licenceUrl:'https://example.org/terms',
      licenceKind:'other-open',licenceName:'Open Database License 1.0',permission:'UNKNOWN',evidenceTier:'secondary',
      acquiredOn:'2026-10-30',termsReviewedOn:'2026-10-30',attribution:'Updated credit',state:'held'}[field];
    const result=compare(register(),register({sources:[source({[field]:value})]}));
    assert.equal(result.blocked,true);assert.ok(changed(result,field));
  });
}
for(const field of ['sourceIds','state','offline','keyboard','screenReader','mapCredit','minimumTargetPx']){
  test(`critical view field ${field} produces a blocking regression`,()=>{
    const value={sourceIds:[],state:'held',offline:'NO',keyboard:'NO',screenReader:'NO',mapCredit:'NO',minimumTargetPx:43}[field];
    const result=compare(register(),register({views:[view({[field]:value})]}));
    assert.equal(result.blocked,true);assert.ok(changed(result,field));
  });
}
test('descending target size is blocking even above 44px',()=>{
  const before=register({views:[view({minimumTargetPx:60})]});
  const after=register({views:[view({minimumTargetPx:55})]});
  const result=compare(before,after);assert.equal(result.blocked,true);
});
test('ascending target size is not blocking',()=>{
  const result=compare(register(),register({views:[view({minimumTargetPx:55})]}));
  assert.equal(result.blocked,false);assert.ok(changed(result,'minimumTargetPx'));
});
test('source dates are compared but unknown dataset age is not fabricated',()=>{
  const result=compare(register(),register({sources:[source({datasetAsOf:'2026-10-01'})]}));
  assert.ok(changed(result,'datasetAsOf'));
  assert.equal(result.before.findings.find((finding)=>finding.code==='DATASET_DATE_UNKNOWN').level,'info');
});
test('source links ignore ordering in comparison while detecting removal',()=>{
  const two=register({sources:[source(),source({id:'second',provider:'other',licenceKind:'other-open',licenceName:'Open Data Licence'})],
    views:[view({sourceIds:['osm-base','second']})]});
  const reordered=register({sources:two.sources,views:[view({sourceIds:['second','osm-base']})]});
  const result=compare(two,reordered);
  assert.equal(changed(result,'sourceIds'),false);
  const removed=compare(two,register({sources:two.sources,views:[view({sourceIds:['osm-base']})]}));
  assert.equal(removed.blocked,true);assert.ok(changed(removed,'sourceIds'));
});
test('changes are deterministically ordered by entity, field, and kind',()=>{
  const after=register({sources:[source({permission:'NO',title:'Updated'})],views:[view({offline:'NO',title:'Updated'})]});
  assert.deepEqual(compare(register(),after).changes,compare(register(),after).changes);
});
test('comparison holds the complete before and after audit snapshots',()=>{
  const result=compare(register(),register({views:[view({offline:'NO'})]}));
  assert.equal(result.before.blocked,false);assert.equal(result.after.blocked,true);
  assert.ok(result.newBlockers.some((finding)=>finding.code==='OFFLINE_DENIED'));
});
test('changing notes alone is not a release regression',()=>{
  const result=compare(register(),register({sources:[source({notes:'Source reviewed again'})]}));
  assert.equal(result.blocked,false);assert.ok(changed(result,'notes'));
});
