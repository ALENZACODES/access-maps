import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTrace,compareTraces} from './trace-audit.mjs';
import {emptyTrace, UNKNOWN, makeSource, makeNotice} from './trace-core.mjs';
import {fixture} from './trace-test-fixture.mjs';

function check(issue, mutate) {
  const data=fixture();mutate(data);
  const result=auditTrace(data);
  assert.equal(result.publication,'blocked');
  assert.ok(result.findings.some(item=>item.code===issue),JSON.stringify(result.findings));
}
test('complete fixture has no blocking findings',()=>{
  const result=auditTrace(fixture());
  assert.equal(result.counts.block,0);
  assert.equal(result.publication,'review-needed');
});
test('empty register reports no candidates',()=>assert.equal(auditTrace(emptyTrace()).publication,'no-candidates'));
test('held layers are not treated as published evidence',()=>{
  const data=fixture();data.layers[0].status='held'; data.sources[0].permission=UNKNOWN;
  const result=auditTrace(data);
  assert.equal(result.counts.block,0);
  assert.ok(result.findings.some(item=>item.code==='LAYER_HELD'));
});
test('invalid source URL blocks included layer',()=>check('SOURCE_URL_UNKNOWN',d=>{d.sources[0].sourceUrl=UNKNOWN;}));
test('missing licence blocks included layer',()=>check('LICENCE_UNKNOWN',d=>{d.sources[0].licence=UNKNOWN;}));
test('missing licence URL blocks included layer',()=>check('LICENCE_URL_UNKNOWN',d=>{d.sources[0].licenceUrl=UNKNOWN;}));
test('missing credit blocks included layer',()=>check('CREDIT_UNKNOWN',d=>{d.sources[0].credit=UNKNOWN;}));
test('missing retrieval date blocks included layer',()=>check('RETRIEVAL_UNKNOWN',d=>{d.sources[0].retrievedOn=UNKNOWN;}));
test('missing evidence tier blocks included layer',()=>check('TIER_UNKNOWN',d=>{d.sources[0].tier=UNKNOWN;}));
test('missing permission blocks included layer',()=>check('PERMISSION_UNSUPPORTED',d=>{d.sources[0].permission=UNKNOWN;}));
test('permission explicitly no blocks included layer',()=>check('PERMISSION_UNSUPPORTED',d=>{d.sources[0].permission='no';}));
test('OSM credit must use exact spelling',()=>check('OSM_CREDIT',d=>{d.sources[0].credit='© OpenStreetMap';}));
test('UNKNOWN local route blocks',()=>check('ROUTE_UNKNOWN',d=>{d.surfaces[0].route=UNKNOWN;}));
test('keyboard observation unknown blocks',()=>check('ACCESS_KEYBOARD',d=>{d.surfaces[0].keyboard=UNKNOWN;}));
test('keyboard observation no blocks',()=>check('ACCESS_KEYBOARD',d=>{d.surfaces[0].keyboard='no';}));
test('screen reader observation unknown blocks',()=>check('ACCESS_SCREENREADER',d=>{d.surfaces[0].screenReader=UNKNOWN;}));
test('focus observation unknown blocks',()=>check('ACCESS_FOCUSVISIBLE',d=>{d.surfaces[0].focusVisible=UNKNOWN;}));
test('minimum control 43 px blocks',()=>check('TARGET_TOO_SMALL_OR_UNKNOWN',d=>{d.surfaces[0].minimumTargetPx=43;}));
test('minimum target UNKNOWN blocks',()=>check('TARGET_TOO_SMALL_OR_UNKNOWN',d=>{d.surfaces[0].minimumTargetPx=UNKNOWN;}));
test('44 px counts as permitted documented size',()=>assert.equal(auditTrace(fixture()).counts.block,0));
test('map visibility unknown blocks',()=>check('MAP_STATUS_UNKNOWN',d=>{d.surfaces[0].mapShown=UNKNOWN;}));
test('layer with no sources blocks',()=>check('NO_SOURCES',d=>{d.layers[0].sourceIds=[];d.layers[0].geometrySourceIds=[];d.notices=[];}));
test('layer with no surfaces blocks',()=>check('NO_SURFACES',d=>{d.layers[0].surfaceIds=[];d.notices=[];}));
test('UNKNOWN mode blocks',()=>check('MODE_UNKNOWN',d=>{d.layers[0].mode=UNKNOWN;}));
test('route layer missing geometry source blocks',()=>check('GEOMETRY_SOURCE_UNKNOWN',d=>{d.layers[0].geometrySourceIds=[];}));
test('missing notice blocks',()=>check('MISSING_NOTICE',d=>{d.notices=[];}));
test('unknown notice text blocks',()=>check('NOTICE_TEXT_UNKNOWN',d=>{d.notices[0].text=UNKNOWN;}));
test('missing source credit in notice blocks',()=>check('CREDIT_NOT_IN_NOTICE',d=>{d.notices[0].text='Other text';}));
test('notice not visible blocks',()=>check('NOTICE_VISIBILITY',d=>{d.notices[0].visible='no';}));
test('notice visibility unknown blocks',()=>check('NOTICE_VISIBILITY',d=>{d.notices[0].visible=UNKNOWN;}));
test('notice keyboard observation unknown blocks',()=>check('NOTICE_KEYBOARD',d=>{d.notices[0].focusable=UNKNOWN;}));
test('notice reader observation no blocks',()=>check('NOTICE_READING',d=>{d.notices[0].readable='no';}));
test('notice placement unknown blocks',()=>check('PLACEMENT_MISSING',d=>{d.notices[0].placement=UNKNOWN;}));
test('notice marked not shown blocks',()=>check('PLACEMENT_MISSING',d=>{d.notices[0].placement='not-shown';}));
test('notice observation date UNKNOWN blocks',()=>check('OBSERVATION_DATE_UNKNOWN',d=>{d.notices[0].observedOn=UNKNOWN;}));
test('OSM geometry must credit beside map',()=>check('OSM_ADJACENCY',d=>{d.notices[0].placement='visible-panel';}));
test('credit hidden in details also yields caution',()=>{
  const d=fixture();d.notices[0].placement='details-only';
  const result=auditTrace(d);
  assert.ok(result.findings.some(f=>f.code==='CREDIT_BEHIND_DETAILS'));
});
test('not all layer credits are automatically assumed to be OSM',()=>{
  const d=fixture(); d.sources[0].licence='Example permissive licence';
  d.sources[0].credit='Example credit';d.notices[0].text='Example credit';
  d.notices[0].placement='visible-panel';
  const result=auditTrace(d);
  assert.equal(result.findings.some(f=>f.code==='OSM_ADJACENCY'),false);
});
test('non-OSM overlay can use visible panel',()=>{
  const d=fixture();d.sources[0].licence='Other';d.layers[0].mode='overlay';d.layers[0].geometrySourceIds=[];
  d.notices[0].placement='visible-panel';
  assert.equal(auditTrace(d).counts.block,0);
});
test('unused records have information findings, not blockers',()=>{
  const d=fixture();d.sources.push(makeSource('unused','Unused'));
  assert.equal(auditTrace(d).counts.block,0);
  assert.ok(auditTrace(d).findings.some(f=>f.code==='UNUSED_SOURCE'));
});
test('mixed licence families receive an explicit caution',()=>{
  const d=fixture();d.sources.push({...makeSource('secondary','Fixture'),sourceUrl:'https://example.org/source',licence:'Other',licenceUrl:'https://example.org/licence',retrievedOn:'2026-11-19',tier:'imported',credit:'Example credit',permission:'yes'});
  d.layers[0].sourceIds.push('secondary');
  d.notices.push({...makeNotice('secondary-notice','secondary','paths','map-en','en'),text:'Example credit',placement:'visible-panel',visible:'yes',focusable:'yes',readable:'yes',observedOn:'2026-11-19'});
  assert.ok(auditTrace(d).findings.some(f=>f.code==='MIXED_LICENCES'));
});
test('finding ordering puts blocks before caution and info',()=>{
  const d=fixture();d.layers[0].status='held';
  const types=auditTrace(d).findings.map(f=>f.severity);
  assert.ok(types.every(x=>x==='info'));
});
test('unchanged trace comparison does not invent regressions',()=>{
  const d=fixture(); const result=compareTraces(d,d);
  assert.equal(result.counts.block,0);
});
test('lost included layer is reported',()=>{
  const d=fixture();const next=fixture(); next.layers[0].status='held';
  assert.ok(compareTraces(d,next).findings.some(f=>f.code==='INCLUDED_LAYER_REMOVED'));
});
test('changed source evidence is a finding',()=>{
  const d=fixture();const next=fixture();next.sources[0].credit='Other credit';
  assert.ok(compareTraces(d,next).findings.some(f=>f.code==='SOURCE_EVIDENCE_CHANGED'));
});
test('changed notice placement is a finding',()=>{
  const d=fixture();const next=fixture();next.notices[0].placement='details-only';
  assert.ok(compareTraces(d,next).findings.some(f=>f.code==='NOTICE_CHANGED'));
});
test('removed notice triggers regression and missing credit',()=>{
  const d=fixture();const next=fixture();next.notices=[];
  const codes=compareTraces(d,next).findings.map(f=>f.code);
  assert.ok(codes.includes('NOTICE_REMOVED'));
  assert.ok(codes.includes('MISSING_NOTICE'));
});
test('changed target size is not silently ignored',()=>{
  const d=fixture();const next=fixture();next.surfaces[0].minimumTargetPx=43;
  const codes=compareTraces(d,next).findings.map(f=>f.code);
  assert.ok(codes.includes('SURFACE_CHANGED'));
  assert.ok(codes.includes('TARGET_TOO_SMALL_OR_UNKNOWN'));
});
