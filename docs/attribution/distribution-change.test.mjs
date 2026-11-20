import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDistributions, affectedSourceUsage, impactSummary } from './distribution-change.mjs';
import { manifest, source, asset, view, deepCopy, DEFAULT_DATE, withDependencies } from './distribution-fixtures.mjs';
import {UNKNOWN} from './distribution-core.mjs';

const compare = (key, prior, next) => {
  const before = manifest();
  const after = manifest({releaseId:'release-two', [key]:next});
  const result=compareDistributions(before, after);
  return result;
};
const sourceChange = edits => compare('sources',null,[source(edits)]);
const assetChange = edits => compare('assets',null,[asset(edits)]);
const viewChange = edits => compare('views',null,[view(edits)]);
const change = (result,kind,field) => result.changes.find(x=>x.kind===kind&&x.field===field);

test('identical manifests have no field changes',()=>{
  const before=manifest(),after=deepCopy(before);
  const result=compareDistributions(before,after);
  assert.deepEqual(result.changes,[]);
});
test('comparison retains original release ID',()=>{
  const result=compareDistributions(manifest(),manifest({releaseId:'next'}));
  assert.equal(result.beforeId,'release-one');
});
test('comparison retains candidate release ID',()=>{
  const result=compareDistributions(manifest(),manifest({releaseId:'next'}));
  assert.equal(result.afterId,'next');
});
test('clean same-release comparison is not blocked',()=>{
  const result=compareDistributions(manifest(),manifest());
  assert.equal(result.blocked,false);
});
test('new source causes a review item',()=>{
  const result=compare('sources',null,[source(),source({id:'second'})]);
  assert.equal(result.changes.find(x=>x.id==='second').severity,'review');
});
test('deleted source is blocking',()=>{
  const result=compare('sources',null,[]);
  assert.equal(change(result,'source','record').severity,'block');
});
test('added asset is marked review',()=>{
  const result=compare('assets',null,[asset(),asset({id:'another',path:'assets/another.js'})]);
  assert.equal(result.changes.find(x=>x.kind==='asset'&&x.id==='another').severity,'review');
});
test('removed asset is blocking',()=>{
  const result=compare('assets',null,[]);
  assert.equal(change(result,'asset','record').severity,'block');
});
test('added view is marked review',()=>{
  const result=compare('views',null,[view(),view({id:'map-fr',path:'pages/map-fr.html',locale:'fr'})]);
  assert.equal(result.changes.find(x=>x.kind==='view'&&x.id==='map-fr').severity,'review');
});
test('removed view is blocking',()=>{
  const result=compare('views',null,[]);
  assert.equal(change(result,'view','record').severity,'block');
});
test('source provider changes block',()=>assert.equal(change(sourceChange({provider:'other'}),'source','provider').severity,'block'));
test('source origin changes block',()=>assert.equal(change(sourceChange({sourceUrl:'https://example.org/data'}),'source','sourceUrl').severity,'block'));
test('source licence name changes block',()=>assert.equal(change(sourceChange({licenceName:'Other licence'}),'source','licenceName').severity,'block'));
test('source licence URL changes block',()=>assert.equal(change(sourceChange({licenceUrl:'https://example.org/licence'}),'source','licenceUrl').severity,'block'));
test('source permission becomes UNKNOWN and blocks',()=>assert.equal(change(sourceChange({permission:UNKNOWN}),'source','permission').severity,'block'));
test('source permission becomes NO and blocks',()=>assert.equal(change(sourceChange({permission:'NO'}),'source','permission').severity,'block'));
test('source licenceEvidence becomes UNKNOWN and blocks',()=>assert.equal(change(sourceChange({licenceEvidence:UNKNOWN}),'source','licenceEvidence').severity,'block'));
test('source tier changes and blocks',()=>assert.equal(change(sourceChange({tier:'secondary'}),'source','tier').severity,'block'));
test('source terms date change blocks',()=>assert.equal(change(sourceChange({termsDate:'2026-01-20'}),'source','termsDate').severity,'block'));
test('source notice change blocks',()=>assert.equal(change(sourceChange({notice:'Altered text'}),'source','notice').severity,'block'));
test('source publication state changes block',()=>assert.equal(change(sourceChange({state:'held'}),'source','state').severity,'block'));
test('source name change is review only',()=>assert.equal(change(sourceChange({name:'Different name'}),'source','name').severity,'review'));
test('source acquired date change is review only',()=>assert.equal(change(sourceChange({acquiredDate:'2026-01-20'}),'source','acquiredDate').severity,'review'));
test('source dataset date becomes UNKNOWN from known and blocks',()=>{
  const before=manifest({sources:[source({datasetDate:DEFAULT_DATE})]});
  const after=manifest({sources:[source({datasetDate:UNKNOWN})]});
  assert.equal(change(compareDistributions(before,after),'source','datasetDate').severity,'block');
});
test('source dataset date becomes known from UNKNOWN and is review',()=>{
  const result=sourceChange({datasetDate:DEFAULT_DATE});
  assert.equal(change(result,'source','datasetDate').severity,'review');
});
test('asset path change blocks',()=>assert.equal(change(assetChange({path:'assets/new.json'}),'asset','path').severity,'block'));
test('asset kind change blocks',()=>assert.equal(change(assetChange({kind:'javascript'}),'asset','kind').severity,'block'));
test('asset source IDs change blocks',()=>assert.equal(change(assetChange({sourceIds:['different']}),'asset','sourceIds').severity,'block'));
test('asset dependencies change block',()=>assert.equal(change(assetChange({dependencyIds:['missing']}),'asset','dependencyIds').severity,'block'));
test('asset state change blocks',()=>assert.equal(change(assetChange({state:'excluded'}),'asset','state').severity,'block'));
test('asset digest change blocks',()=>assert.equal(change(assetChange({sha256:'b'.repeat(64)}),'asset','sha256').severity,'block'));
test('asset size change blocks',()=>assert.equal(change(assetChange({bytes:129}),'asset','bytes').severity,'block'));
test('view path change blocks',()=>assert.equal(change(viewChange({path:'pages/new.html'}),'view','path').severity,'block'));
test('view language change blocks',()=>assert.equal(change(viewChange({locale:'fr'}),'view','locale').severity,'block'));
test('view asset IDs change blocks',()=>assert.equal(change(viewChange({assetIds:['unknown']}),'view','assetIds').severity,'block'));
test('view source IDs change blocks',()=>assert.equal(change(viewChange({sourceIds:['unknown']}),'view','sourceIds').severity,'block'));
test('view notice text change blocks',()=>assert.equal(change(viewChange({noticeText:''}),'view','noticeText').severity,'block'));
test('view notice visibility drops and blocks',()=>assert.equal(change(viewChange({noticeVisible:'NO'}),'view','noticeVisible').severity,'block'));
test('view offline evidence drops and blocks',()=>assert.equal(change(viewChange({offline:UNKNOWN}),'view','offline').severity,'block'));
test('view keyboard evidence drops and blocks',()=>assert.equal(change(viewChange({keyboard:'NO'}),'view','keyboard').severity,'block'));
test('view screen-reader evidence drops and blocks',()=>assert.equal(change(viewChange({screenReader:'NO'}),'view','screenReader').severity,'block'));
test('view target shrinks and blocks',()=>assert.equal(change(viewChange({targetPx:40}),'view','targetPx').severity,'block'));
test('view target improves and is informational',()=>assert.equal(change(viewChange({targetPx:48}),'view','targetPx').severity,'info'));
test('view target becomes UNKNOWN and blocks',()=>assert.equal(change(viewChange({targetPx:UNKNOWN}),'view','targetPx').severity,'block'));
test('view target becomes known from UNKNOWN and is informational',()=>{
  const before=manifest({views:[view({targetPx:UNKNOWN})]});
  const result=compareDistributions(before,manifest());
  assert.equal(change(result,'view','targetPx').severity,'block');
});
test('view published date loses known value and blocks',()=>assert.equal(change(viewChange({publishedDate:UNKNOWN}),'view','publishedDate').severity,'block'));
test('view published date changes to a known date and triggers review',()=>assert.equal(change(viewChange({publishedDate:'2026-01-20'}),'view','publishedDate').severity,'review'));
test('comparison knows the source affects its published view',()=>{
  const result=sourceChange({name:'Changed name'});
  assert.deepEqual(change(result,'source','name').affectedViews,['map-en']);
});
test('comparison knows asset affects a published view',()=>{
  const result=assetChange({bytes:129});
  assert.deepEqual(change(result,'asset','bytes').affectedViews,['map-en']);
});
test('comparison knows view change affects itself',()=>{
  const result=viewChange({targetPx:80});
  assert.deepEqual(change(result,'view','targetPx').affectedViews,['map-en']);
});
test('comparison knows orphan asset has no impacted views',()=>{
  const result=compare('assets',null,[asset(),asset({id:'orphan',path:'assets/orphan.json'})]);
  assert.deepEqual(result.changes.find(x=>x.id==='orphan').affectedViews,[]);
});
test('comparison computes downstream impact from transitive asset',()=>{
  const before=withDependencies(4),after=deepCopy(before);
  after.assets[0].sha256='b'.repeat(64);
  const result=compareDistributions(before,after);
  assert.deepEqual(change(result,'asset','sha256').affectedViews,['map-en']);
});
test('comparison reports newly blocking audit conditions',()=>{
  const result=sourceChange({permission:UNKNOWN});
  assert.ok(result.newlyBlocking.some(x=>x.includes('PERMISSION_UNRESOLVED')));
});
test('comparison reports resolved audit conditions',()=>{
  const before=manifest({sources:[source({permission:UNKNOWN})]});
  const result=compareDistributions(before,manifest());
  assert.ok(result.resolved.some(x=>x.includes('PERMISSION_UNRESOLVED')));
});
test('comparison retains both full audits',()=>{
  const result=compareDistributions(manifest(),manifest());
  assert.equal(result.previousAudit.releaseId,'release-one');
  assert.equal(result.currentAudit.releaseId,'release-one');
});
test('comparison is blocked if candidate audit is blocked',()=>assert.equal(sourceChange({permission:UNKNOWN}).blocked,true));
test('comparison blocks material evidence change even if both audits pass',()=>{
  const result=sourceChange({sourceUrl:'https://example.org/public'});
  assert.equal(result.blocked,true);
});
test('comparison of a larger touch target alone is not blocked',()=>{
  const result=viewChange({targetPx:80});
  assert.equal(result.blocked,false);
});
test('comparison has deterministic ordering',()=>{
  const a=sourceChange({name:'Updated',permission:UNKNOWN});
  const b=sourceChange({name:'Updated',permission:UNKNOWN});
  assert.deepEqual(a.changes,b.changes);
});
test('comparison does not change input manifests',()=>{
  const before=manifest(),after=manifest({sources:[source({name:'Updated'})]});
  const originalBefore=deepCopy(before),originalAfter=deepCopy(after);
  compareDistributions(before,after);
  assert.deepEqual(before,originalBefore);
  assert.deepEqual(after,originalAfter);
});
test('affectedSourceUsage returns map view for known source',()=>assert.deepEqual(affectedSourceUsage(manifest(),'source-osm'),['map-en']));
test('affectedSourceUsage returns empty for unknown source',()=>assert.deepEqual(affectedSourceUsage(manifest(),'unknown'),[]));
test('impactSummary returns empty list if no changes',()=>assert.deepEqual(impactSummary(compareDistributions(manifest(),manifest())),[]));
test('impactSummary groups source and asset changes by affected view',()=>{
  const before=manifest(),after=manifest({sources:[source({name:'Updated'})],assets:[asset({bytes:129})]});
  const result=impactSummary(compareDistributions(before,after));
  assert.equal(result.length,1);
  assert.equal(result[0].viewId,'map-en');
  assert.deepEqual(result[0].affectedSources,['source-osm']);
  assert.deepEqual(result[0].affectedAssets,['data-asset']);
});
test('impactSummary counts blocking changes separately',()=>{
  const result=impactSummary(sourceChange({permission:'NO'}));
  assert.equal(result[0].blocks,1);
});
test('impactSummary counts review changes separately',()=>{
  const result=impactSummary(sourceChange({name:'New name'}));
  assert.equal(result[0].reviews,1);
});
test('impactSummary counts informational improvements separately',()=>{
  const result=impactSummary(viewChange({targetPx:80}));
  assert.equal(result[0].information,1);
});
test('impactSummary does not count unrelated orphan assets',()=>{
  const result=impactSummary(compare('assets',null,[asset(),asset({id:'orphan',path:'assets/orphan.json'})]));
  assert.deepEqual(result,[]);
});
