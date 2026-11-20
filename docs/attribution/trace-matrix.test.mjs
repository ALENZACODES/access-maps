import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTraceMatrix,matrixBySurface,matrixBySource,matrixTsv,matrixJson,MATRIX_COLUMNS} from './trace-matrix.mjs';
import {fixture} from './trace-test-fixture.mjs';
import {UNKNOWN,OSM_CREDIT} from './trace-core.mjs';
test('one included source, layer and surface produces one row',()=>{
  const rows=buildTraceMatrix(fixture());
  assert.equal(rows.length,1);
  assert.equal(rows[0].noticeId,'notice-en');
});
test('matrix retains the exact OSM credit',()=>assert.equal(buildTraceMatrix(fixture())[0].noticeText,OSM_CREDIT));
test('geometry is adjacent when notice states adjacent',()=>assert.equal(buildTraceMatrix(fixture())[0].adjacency,'documented'));
test('matrix does not infer place attributes',()=>assert.equal(Object.hasOwn(buildTraceMatrix(fixture())[0],'accessible'),false));
test('notice deletion produces a missing row',()=>{
  const d=fixture();d.notices=[];
  const row=buildTraceMatrix(d)[0];
  assert.equal(row.noticeId,UNKNOWN);
  assert.equal(row.displayState,'missing');
  assert.equal(row.adjacency,'missing');
});
test('notice text UNKNOWN gives credit state UNKNOWN',()=>{
  const d=fixture();d.notices[0].text=UNKNOWN;
  assert.equal(buildTraceMatrix(d)[0].creditState,UNKNOWN);
});
test('incorrect credit text reports missing',()=>{
  const d=fixture();d.notices[0].text='Example';
  assert.equal(buildTraceMatrix(d)[0].creditState,'missing');
});
test('unreadable notice yields incomplete row',()=>{
  const d=fixture();d.notices[0].readable='no';
  assert.equal(buildTraceMatrix(d)[0].displayState,'incomplete');
});
test('notice focus UNKNOWN yields incomplete row',()=>{
  const d=fixture();d.notices[0].focusable=UNKNOWN;
  assert.equal(buildTraceMatrix(d)[0].displayState,'incomplete');
});
test('a hidden notice yields incomplete row',()=>{
  const d=fixture();d.notices[0].visible='no';
  assert.equal(buildTraceMatrix(d)[0].displayState,'incomplete');
});
test('a source with unknown tier remains UNKNOWN',()=>{
  const d=fixture();d.sources[0].tier=UNKNOWN;
  assert.equal(buildTraceMatrix(d)[0].tier,UNKNOWN);
});
test('a source with unknown retrieval remains UNKNOWN',()=>{
  const d=fixture();d.sources[0].retrievedOn=UNKNOWN;
  assert.equal(buildTraceMatrix(d)[0].retrievedOn,UNKNOWN);
});
test('default filter excludes held layers',()=>{
  const d=fixture();d.layers[0].status='held';
  assert.equal(buildTraceMatrix(d).length,0);
});
test('explicit option includes held layers',()=>{
  const d=fixture();d.layers[0].status='held';
  assert.equal(buildTraceMatrix(d,{includedOnly:false}).length,1);
});
test('unknown source filter produces no rows',()=>assert.equal(buildTraceMatrix(fixture(),{sourceId:'invalid-source'}).length,0));
test('unknown surface filter produces no rows',()=>assert.equal(buildTraceMatrix(fixture(),{surfaceId:'invalid-surface'}).length,0));
test('matching source filter preserves row',()=>assert.equal(buildTraceMatrix(fixture(),{sourceId:'osm-geom'}).length,1));
test('matching surface filter preserves row',()=>assert.equal(buildTraceMatrix(fixture(),{surfaceId:'map-en'}).length,1));
test('surface rollup counts documented row',()=>{
  const result=matrixBySurface(fixture());
  assert.equal(result[0].total,1);
  assert.equal(result[0].documented,1);
  assert.equal(result[0].adjacentRequired,1);
  assert.equal(result[0].adjacentDocumented,1);
});
test('surface rollup counts missing notice',()=>{
  const d=fixture();d.notices=[];
  const result=matrixBySurface(d);
  assert.equal(result[0].missing,1);
  assert.equal(result[0].documented,0);
});
test('source rollup counts expected notices',()=>{
  const result=matrixBySource(fixture());
  assert.equal(result[0].expectedNotices,1);
  assert.equal(result[0].recordedNotices,1);
  assert.equal(result[0].missingNotices,0);
});
test('source rollup preserves licence details',()=>{
  const result=matrixBySource(fixture());
  assert.equal(result[0].licence,'ODbL');
  assert.equal(result[0].tier,'imported');
});
test('source rollup missing count is explicit',()=>{
  const d=fixture();d.notices=[];
  assert.equal(matrixBySource(d)[0].missingNotices,1);
});
test('non-OSM licence does not require adjacency',()=>{
  const d=fixture();d.sources[0].licence='Other';d.sources[0].credit='Other credit';
  d.layers[0].geometrySourceIds=[];d.notices[0].text='Other credit';
  assert.equal(buildTraceMatrix(d)[0].adjacency,'not-required');
});
test('TSV starts with expected column headers',()=>assert.equal(matrixTsv([]),`${MATRIX_COLUMNS.join('\t')}\n`));
test('TSV has data rows',()=>assert.equal(matrixTsv(buildTraceMatrix(fixture())).trim().split('\n').length,2));
test('TSV removes line breaks from text cells',()=>{
  const d=fixture();d.notices[0].text='Line 1\nLine 2';
  assert.equal(matrixTsv(buildTraceMatrix(d)).trim().split('\n').length,2);
});
test('TSV neutralizes formula injection',()=>{
  const d=fixture();d.sources[0].name='=HYPERLINK("https://evil.invalid")';
  const exported=matrixTsv(buildTraceMatrix(d));
  assert.ok(exported.includes("'=HYPERLINK"));
});
test('TSV neutralizes plus-prefixed formula',()=>{
  const d=fixture();d.sources[0].name='+cmd';
  assert.ok(matrixTsv(buildTraceMatrix(d)).includes("'+cmd"));
});
test('TSV neutralizes minus-prefixed formula',()=>{
  const d=fixture();d.sources[0].name='-cmd';
  assert.ok(matrixTsv(buildTraceMatrix(d)).includes("'-cmd"));
});
test('TSV export refuses non-array rows',()=>assert.throws(()=>matrixTsv({}),TypeError));
test('TSV export refuses invalid row elements',()=>assert.throws(()=>matrixTsv([null]),TypeError));
test('JSON export preserves typed rows and schema',()=>{
  const payload=JSON.parse(matrixJson(buildTraceMatrix(fixture())));
  assert.equal(payload.schema,'map-notice-trace-matrix/1');
  assert.equal(payload.rows[0].sourceId,'osm-geom');
});
test('matrix derived data does not mutate input',()=>{
  const d=fixture();const snapshot=JSON.stringify(d);
  buildTraceMatrix(d);matrixBySource(d);matrixBySurface(d);
  assert.equal(JSON.stringify(d),snapshot);
});
