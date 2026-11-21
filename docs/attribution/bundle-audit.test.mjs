import test from 'node:test';
import assert from 'node:assert/strict';
import {auditBundle,compareBundles,missingNoticeSlots,viewCoverage,isOsmSource,needsNearMap,FINDING_CODES} from './bundle-audit.mjs';
import {fixture,changedFixture,secondSourceFixture} from './bundle-fixture.mjs';
import {emptyBundle,UNKNOWN,OSM_CREDIT} from './bundle-core.mjs';

const codes=state=>auditBundle(state).findings.map(x=>x.code);
const has=(state,code)=>assert.ok(codes(state).includes(code),`Missing ${code}: ${codes(state).join(', ')}`);
const no=(state,code)=>assert.ok(!codes(state).includes(code),`Unexpected ${code}`);
const mutate=fn=>changedFixture(fn);

test('complete fictional fixture has no blocking metadata findings',()=>{
  const report=auditBundle(fixture());
  assert.equal(report.status,'manual-review');
  assert.equal(report.totals.block,0);
  assert.equal(report.totals.includedViews,1);
  assert.equal(report.totals.includedAssets,1);
});
test('fixture still has an explicitly unknown dataset date',()=>{
  const report=auditBundle(fixture());
  assert.ok(report.findings.some(x=>x.code==='DATASET_DATE_UNKNOWN'&&x.severity==='information'));
});
test('empty register does not falsely claim readiness',()=>{
  const report=auditBundle(emptyBundle());
  assert.equal(report.status,'no-candidates');
  assert.equal(report.totals.includedViews,0);
  has(emptyBundle(),'NO_INCLUDED_VIEWS');
});
test('unknown inclusion state is a block',()=>{
  const state=mutate(b=>{b.views[0].included=UNKNOWN;});
  has(state,'VIEW_UNKNOWN');
});
test('excluded view does not require evidence',()=>{
  const state=mutate(b=>{b.views[0].included='no';b.notices=[];b.observations=[];});
  assert.equal(auditBundle(state).totals.block,0);
});
test('unknown route blocks included view',()=>has(mutate(b=>{b.views[0].route=UNKNOWN;}),'VIEW_ROUTE_UNKNOWN'));
test('English title unknown blocks included view',()=>has(mutate(b=>{b.views[0].titleEn=UNKNOWN;}),'VIEW_TITLE_UNKNOWN'));
test('French title unknown blocks included view',()=>has(mutate(b=>{b.views[0].titleFr=UNKNOWN;}),'VIEW_TITLE_UNKNOWN'));
test('view without included assets is blocked',()=>has(mutate(b=>{b.assets[0].included='no';}),'VIEW_NO_ASSETS'));
test('asset inclusion UNKNOWN is blocked',()=>has(mutate(b=>{b.assets[0].included=UNKNOWN;}),'ASSET_UNKNOWN'));
test('held assets are recorded without pretending they appear',()=>{
  const state=mutate(b=>{b.assets[0].included='no';});
  has(state,'HELD_ASSET');
  assert.equal(auditBundle(state).totals.includedAssets,0);
});
test('included asset with zero sources is blocked',()=>{
  const state=mutate(b=>{b.assets[0].sourceIds=[];b.assets[0].geometrySourceIds=[];b.uses=[];b.notices=[];});
  has(state,'ASSET_NO_SOURCES');
});
test('included asset without join records is blocked',()=>{
  const state=mutate(b=>{b.uses=[];b.notices=[];});
  has(state,'ASSET_NO_USES');
  has(state,'USE_MISSING');
});
test('unknown required-state blocks source use',()=>has(mutate(b=>{b.uses[0].required=UNKNOWN;}),'USE_UNKNOWN'));
test('source use with required=no is not treated as required notice',()=>{
  const state=mutate(b=>{b.uses[0].required='no';b.notices=[];});
  no(state,'NOTICE_MISSING');
});
for(const [field,code] of [
  ['name','SOURCE_NAME_UNKNOWN'],['sourceUrl','SOURCE_URL_UNKNOWN'],['licence','LICENCE_UNKNOWN'],
  ['licenceUrl','LICENCE_URL_UNKNOWN'],['family','LICENCE_FAMILY_UNKNOWN'],
  ['retrievedOn','RETRIEVAL_UNKNOWN'],['tier','TIER_UNKNOWN'],['credit','SOURCE_CREDIT_UNKNOWN'],
]) {
  test(`${field} missing produces ${code}`,()=>has(mutate(b=>{b.sources[0][field]=UNKNOWN;}),code));
}
test('explicit unknown permission blocks',()=>has(mutate(b=>{b.sources[0].permission=UNKNOWN;}),'PERMISSION_UNKNOWN'));
test('explicit no permission blocks',()=>has(mutate(b=>{b.sources[0].permission='no';}),'PERMISSION_NO'));
test('OSM licence family is separate from source name',()=>{
  const source=fixture().sources[0];
  assert.equal(isOsmSource(source),true);
  assert.equal(isOsmSource({...source,family:'other'}),false);
});
test('incorrect OSM credit blocks even with licence present',()=>{
  const state=mutate(b=>{b.sources[0].credit='OpenStreetMap';});
  has(state,'OSM_CREDIT_MISMATCH');
});
test('exact OSM credit is accepted',()=>{
  no(fixture(),'OSM_CREDIT_MISMATCH');
  assert.equal(fixture().sources[0].credit,OSM_CREDIT);
});
test('OSM near-map placement requirement follows geometry relationship',()=>{
  const state=fixture();
  assert.equal(needsNearMap(state,state.assets[0],state.sources[0]),true);
});
test('OSM geometry shown as list does not require near-map placement',()=>{
  const state=mutate(b=>{b.views[0].delivery='list';});
  assert.equal(needsNearMap(state,state.assets[0],state.sources[0]),false);
});
test('OSM data without geometry does not require near-map placement',()=>{
  const state=mutate(b=>{b.assets[0].geometrySourceIds=[];});
  assert.equal(needsNearMap(state,state.assets[0],state.sources[0]),false);
});
test('missing English notice is blocking',()=>{
  const state=mutate(b=>{b.notices=b.notices.filter(n=>n.locale!=='en');});
  has(state,'NOTICE_MISSING');
});
test('missing French notice is blocking',()=>{
  const state=mutate(b=>{b.notices=b.notices.filter(n=>n.locale!=='fr');});
  has(state,'NOTICE_MISSING');
});
for(const locale of ['en','fr']) {
  test(`${locale} unknown displayed text is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).text=UNKNOWN;}),'NOTICE_TEXT_UNKNOWN');
  });
  test(`${locale} changed displayed text is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).text='Incomplete credit';}),'NOTICE_CREDIT_MISMATCH');
  });
  test(`${locale} invisible notice is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).visible='no';}),'NOTICE_NOT_VISIBLE');
  });
  test(`${locale} unknown visibility is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).visible=UNKNOWN;}),'NOTICE_NOT_VISIBLE');
  });
  test(`${locale} inaccessible keyboard notice is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).keyboard='no';}),'NOTICE_KEYBOARD');
  });
  test(`${locale} unknown keyboard evidence is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).keyboard=UNKNOWN;}),'NOTICE_KEYBOARD');
  });
  test(`${locale} absent screen-reader evidence is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).screenReader='no';}),'NOTICE_SCREEN_READER');
  });
  test(`${locale} unknown screen-reader evidence is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).screenReader=UNKNOWN;}),'NOTICE_SCREEN_READER');
  });
  test(`${locale} unknown placement is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).placement=UNKNOWN;}),'NOTICE_PLACEMENT_UNKNOWN');
  });
  test(`${locale} missing placement is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).placement='missing';}),'NOTICE_PLACEMENT_UNKNOWN');
  });
  test(`${locale} non-adjacent OSM geometry notice is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).placement='details';}),'OSM_NEAR_MAP_MISSING');
  });
  test(`${locale} unknown observed date is blocked`,()=>{
    has(mutate(b=>{b.notices.find(n=>n.locale===locale).observedOn=UNKNOWN;}),'NOTICE_DATE_UNKNOWN');
  });
}
for(const method of ['visual','keyboard','screen-reader','touch']) {
  test(`missing ${method} observation blocks`,()=>{
    const state=mutate(b=>{b.observations=b.observations.filter(o=>o.method!==method);});
    has(state,'OBSERVATION_MISSING');
  });
  test(`${method} observation result UNKNOWN blocks`,()=>{
    const state=mutate(b=>{b.observations.find(o=>o.method===method).result=UNKNOWN;});
    has(state,'OBSERVATION_UNKNOWN');
  });
  test(`${method} negative result blocks`,()=>{
    const state=mutate(b=>{b.observations.find(o=>o.method===method).result='no';});
    has(state,'OBSERVATION_NO');
  });
  test(`${method} observed date UNKNOWN blocks`,()=>{
    const state=mutate(b=>{b.observations.find(o=>o.method===method).observedOn=UNKNOWN;});
    has(state,'OBSERVATION_DATE_UNKNOWN');
  });
  test(`${method} evidence UNKNOWN blocks`,()=>{
    const state=mutate(b=>{b.observations.find(o=>o.method===method).evidence=UNKNOWN;});
    has(state,'OBSERVATION_EVIDENCE_UNKNOWN');
  });
}
test('UNKNOWN touch target blocks',()=>has(mutate(b=>{b.observations[3].minimumTargetPx=UNKNOWN;}),'TARGET_UNKNOWN'));
test('24px touch target blocks',()=>has(mutate(b=>{b.observations[3].minimumTargetPx=24;}),'TARGET_TOO_SMALL'));
test('43px touch target blocks',()=>has(mutate(b=>{b.observations[3].minimumTargetPx=43;}),'TARGET_TOO_SMALL'));
test('44px touch target is accepted',()=>no(fixture(),'TARGET_TOO_SMALL'));
test('45px touch target is accepted',()=>no(mutate(b=>{b.observations[3].minimumTargetPx=45;}),'TARGET_TOO_SMALL'));
test('zero touch target blocks',()=>has(mutate(b=>{b.observations[3].minimumTargetPx=0;}),'TARGET_TOO_SMALL'));
test('separately licensed data produces caution when mixed with ODbL',()=>{
  const report=auditBundle(secondSourceFixture());
  assert.ok(report.findings.some(x=>x.code==='MIXED_LICENCE_FAMILIES'&&x.severity==='attention'));
});
test('unused source is informational only',()=>{
  const state=mutate(b=>{b.sources.push({...b.sources[0],id:'unused-source'});});
  assert.ok(auditBundle(state).findings.some(x=>x.code==='UNUSED_SOURCE'&&x.severity==='information'));
});
test('findings order is deterministic',()=>{
  const x=auditBundle(secondSourceFixture());
  assert.deepEqual(x.findings,auditBundle(secondSourceFixture()).findings);
});
test('finding codes come from maintained vocabulary',()=>{
  for(const issue of auditBundle(secondSourceFixture()).findings)assert.ok(FINDING_CODES.includes(issue.code),issue.code);
});
test('missing notice slot lists actual locale',()=>{
  const state=mutate(b=>{b.notices.splice(0,1);});
  assert.deepEqual(missingNoticeSlots(state),[{useId:'fictional-source-use',viewId:'fictional-map',assetId:'fictional-path',sourceId:'osm-source',locale:'en'}]);
});
test('missing notice slots do not include held view',()=>{
  const state=mutate(b=>{b.views[0].included='no';b.notices=[];});
  assert.deepEqual(missingNoticeSlots(state),[]);
});
test('missing notice slots do not include held assets',()=>{
  const state=mutate(b=>{b.assets[0].included='no';b.notices=[];});
  assert.deepEqual(missingNoticeSlots(state),[]);
});
test('missing notice slots do not include optional uses',()=>{
  const state=mutate(b=>{b.uses[0].required='no';b.notices=[];});
  assert.deepEqual(missingNoticeSlots(state),[]);
});
test('view coverage records both notice languages',()=>{
  const row=viewCoverage(fixture())[0];
  assert.equal(row.expectedNotices,2);
  assert.equal(row.recordedNotices,2);
  assert.equal(row.blockingGaps,0);
});
test('view coverage preserves English and French view names',()=>{
  const row=viewCoverage(fixture())[0];
  assert.equal(row.titleEn,'Fictional sample map');
  assert.equal(row.titleFr,'Carte fictive');
});
test('view coverage shows missing source notices',()=>{
  const state=mutate(b=>{b.notices=[];});
  const row=viewCoverage(state)[0];
  assert.equal(row.expectedNotices,2);
  assert.equal(row.recordedNotices,0);
  assert.ok(row.blockingGaps>=2);
});
test('same bundle comparison has no changes',()=>{
  const report=compareBundles(fixture(),fixture());
  assert.equal(report.blocking,false);
  assert.deepEqual(report.added,[]);
  assert.deepEqual(report.resolved,[]);
});
test('comparison identifies changed exact source credit',()=>{
  const current=mutate(b=>{b.sources[0].credit='Altered';});
  const report=compareBundles(fixture(),current);
  assert.ok(report.creditChanged.includes('osm-source'));
  assert.equal(report.blocking,true);
});
test('comparison identifies changed licence',()=>{
  const current=mutate(b=>{b.sources[0].licence='New fictional terms';});
  const report=compareBundles(fixture(),current);
  assert.deepEqual(report.licenceChanged,['osm-source']);
  assert.equal(report.blocking,true);
});
test('comparison detects newly missing French notice',()=>{
  const current=mutate(b=>{b.notices=b.notices.filter(n=>n.locale==='en');});
  const report=compareBundles(fixture(),current);
  assert.ok(report.added.some(f=>f.code==='NOTICE_MISSING'));
  assert.equal(report.blocking,true);
});
test('comparison shows resolved missing evidence',()=>{
  const old=mutate(b=>{b.notices=b.notices.filter(n=>n.locale==='en');});
  const report=compareBundles(old,fixture());
  assert.ok(report.resolved.some(f=>f.code==='NOTICE_MISSING'));
  assert.equal(report.blocking,false);
});
test('comparison flags removal of included view',()=>{
  const current=mutate(b=>{b.views[0].included='no';});
  const report=compareBundles(fixture(),current);
  assert.deepEqual(report.includedRemoved,['fictional-map']);
  assert.equal(report.blocking,true);
});
test('comparison does not invent a prior missing record',()=>{
  const report=compareBundles(emptyBundle(),fixture());
  assert.deepEqual(report.includedRemoved,[]);
});
