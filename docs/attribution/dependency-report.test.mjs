import test from 'node:test';
import assert from 'node:assert/strict';
import {COPY, localeFromSearch, labelValue, coverageRows, dependencyRows, safeTsvCell,
  renderTsv, coverageTsv, dependencyTsv, reportText, comparisonText, COVERAGE_COLUMNS} from './dependency-report.mjs';
import {fixture, cloneFixture} from './dependency-fixture.mjs';
import {UNKNOWN, OSM_CREDIT} from './dependency-core.mjs';

test('English/French interface keys match',()=>{
  assert.deepEqual(Object.keys(COPY.en).sort(),Object.keys(COPY.fr).sort());
});
test('French interface uses typographic apostrophes',()=>{
  assert.ok(COPY.fr.intro.includes('dépendances'));
  assert.ok(!COPY.fr.warning.includes("l'"));
});
for(const query of ['?lang=en','?lang=EN','?lang=fr-CA','',null,undefined,4]) {
  test(`language fallback for ${String(query)}`,()=>assert.equal(localeFromSearch(query),'en'));
}
test('French locale accepts exact language choice',()=>assert.equal(localeFromSearch('?lang=fr'),'fr'));
test('French language with extra parameters remains supported',()=>assert.equal(localeFromSearch('?lang=fr&view=a'),'fr'));
test('French labels use U+00A0 before colon',()=>assert.equal(labelValue('Source',UNKNOWN,'fr'),'Source\u00a0: UNKNOWN'));
test('English labels use ordinary colon',()=>assert.equal(labelValue('Source',UNKNOWN,'en'),'Source: UNKNOWN'));
test('unknown locale uses English punctuation',()=>assert.equal(labelValue('Source',UNKNOWN,'xx'),'Source: UNKNOWN'));
test('coverage rows include inherited source evidence',()=>{
  const rows=coverageRows(fixture());
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(item=>item.sourceId),['local-info','osm-data']);
  assert.ok(rows.every(item=>item.surfaceId==='map-en'));
});
test('coverage rows preserve exact OSM source credit',()=>{
  const rows=coverageRows(fixture());
  assert.equal(rows.find(item=>item.sourceId==='osm-data').credit,OSM_CREDIT);
});
test('coverage rows preserve notice placement separately',()=>{
  const rows=coverageRows(fixture());
  assert.equal(rows.find(item=>item.sourceId==='osm-data').noticePosition,'adjacent');
});
test('coverage rows preserve source retrieval date',()=>{
  const row=coverageRows(fixture()).find(item=>item.sourceId==='osm-data');
  assert.equal(row.retrievedOn,'2026-11-19');
});
test('coverage rows preserve source evidence tier',()=>{
  const row=coverageRows(fixture()).find(item=>item.sourceId==='osm-data');
  assert.equal(row.tier,'imported');
});
test('coverage rows show UNKNOWN for absent notices',()=>{
  const model=cloneFixture();model.surfaces[0].notices=[];
  const rows=coverageRows(model);
  assert.ok(rows.every(item=>item.noticeText===UNKNOWN));
  assert.ok(rows.every(item=>item.noticePosition===UNKNOWN));
});
test('coverage rows preserve an unknown retrieval date',()=>{
  const model=cloneFixture();model.sources[0].retrievedOn=UNKNOWN;
  assert.equal(coverageRows(model).find(item=>item.sourceId==='osm-data').retrievedOn,UNKNOWN);
});
test('coverage rows preserve an unknown licence',()=>{
  const model=cloneFixture();model.sources[0].licence=UNKNOWN;
  assert.equal(coverageRows(model).find(item=>item.sourceId==='osm-data').licence,UNKNOWN);
});
test('coverage rows retain source and licence addresses',()=>{
  const row=coverageRows(fixture()).find(item=>item.sourceId==='osm-data');
  assert.equal(row.sourceUrl,'https://www.openstreetmap.org/copyright');
  assert.equal(row.licenceUrl,'https://www.openstreetmap.org/copyright');
});
test('coverage rows are deterministic',()=>assert.deepEqual(coverageRows(fixture()),coverageRows(fixture())));
test('coverage rows do not mutate inventory',()=>{
  const model=fixture(),serialized=JSON.stringify(model);
  coverageRows(model);
  assert.equal(JSON.stringify(model),serialized);
});
test('dependency table includes every actual dependency edge',()=>{
  const rows=dependencyRows(fixture());
  assert.ok(rows.some(row=>row.assetId==='map-ui'&&row.dependsOn==='geometry'&&row.relationship==='depends-on'));
  assert.ok(rows.some(row=>row.assetId==='map-ui'&&row.dependsOn==='catalogue'&&row.relationship==='depends-on'));
});
test('dependency table includes direct source origins',()=>{
  const rows=dependencyRows(fixture());
  assert.ok(rows.some(row=>row.assetId==='geometry'&&row.dependsOn==='osm-data'&&row.relationship==='sourced-from'));
});
test('dependency table marks assets with no origin instead of creating one',()=>{
  const model=cloneFixture();model.assets[0].sourceIds=[];
  assert.ok(dependencyRows(model).some(row=>row.assetId==='geometry'&&row.dependsOn===UNKNOWN));
});
test('dependency table is sorted deterministically',()=>assert.deepEqual(dependencyRows(fixture()),dependencyRows(fixture())));
const hostile=['=1+1','+SUM(1,2)','-1+1','@HYPERLINK("x")',' \t=1','  -1','\t+1'];
for(const item of hostile) {
  test(`TSV cell neutralizes spreadsheet formula ${JSON.stringify(item)}`,()=>{
    assert.ok(safeTsvCell(item).startsWith("'"));
  });
}
for(const content of ['a\tb','a\nb','a\rb','a\u0000b']) {
  test('TSV sanitizes control separators',()=>{
    const cell=safeTsvCell(content);
    assert.ok(!/[\t\r\n\u0000]/u.test(cell));
  });
}
test('TSV cell leaves ordinary copyright text unchanged',()=>assert.equal(safeTsvCell(OSM_CREDIT),OSM_CREDIT));
test('TSV cell serializes unknown explicitly',()=>assert.equal(safeTsvCell(null),UNKNOWN));
test('TSV cell serializes numeric zero',()=>assert.equal(safeTsvCell(0),'0'));
test('TSV headers are explicit and stable',()=>{
  assert.ok(COVERAGE_COLUMNS.includes('sourceUrl'));
  assert.ok(COVERAGE_COLUMNS.includes('licenceUrl'));
  assert.ok(COVERAGE_COLUMNS.includes('retrievedOn'));
  assert.ok(COVERAGE_COLUMNS.includes('tier'));
  assert.ok(COVERAGE_COLUMNS.includes('noticePosition'));
});
test('coverage TSV has header and rows',()=>{
  const lines=coverageTsv(fixture()).trimEnd().split('\n');
  assert.equal(lines.length,3);
  assert.ok(lines[0].includes('sourceId'));
});
test('dependency TSV has header and actual edges',()=>{
  const content=dependencyTsv(fixture());
  assert.match(content,/assetId\tdependsOn\trelationship/u);
  assert.match(content,/map-ui\tgeometry\tdepends-on/u);
});
test('TSV renderer rejects invalid arguments',()=>{
  assert.throws(()=>renderTsv('not rows',[]),TypeError);
  assert.throws(()=>renderTsv([],null),TypeError);
  assert.throws(()=>renderTsv([null],['id']),TypeError);
});
test('French findings text labels are typographically correct',()=>{
  const out=reportText(fixture(),'fr');
  assert.ok(out.includes('Lacunes bloquantes\u00a0:'));
  assert.ok(out.includes('Source\u00a0:'));
  assert.ok(out.includes('Licence\u00a0:'));
});
test('English findings text preserves ordinary colons',()=>{
  const out=reportText(fixture(),'en');
  assert.ok(out.includes('Blocking gaps:'));
  assert.ok(out.includes('Source:'));
});
test('French findings include unchanged source legal credit',()=>{
  assert.ok(reportText(fixture(),'fr').includes(OSM_CREDIT));
});
test('both languages retain source date and tier',()=>{
  for(const lang of ['en','fr']) {
    const out=reportText(fixture(),lang);
    assert.ok(out.includes('2026-11-19'));
    assert.ok(out.includes('imported'));
  }
});
test('report never describes the underlying place as accessible',()=>{
  assert.ok(!reportText(fixture(),'en').includes('place is accessible'));
});
test('empty audit still explains limitations',()=>{
  const model=cloneFixture();model.surfaces=[];
  assert.ok(reportText(model,'en').includes(COPY.en.noRights));
});
test('unknown notice is not silently filled in text export',()=>{
  const model=cloneFixture();model.surfaces[0].notices=[];
  assert.ok(reportText(model,'en').includes('Notice records: UNKNOWN'));
});
test('comparison text reports source changes',()=>{
  const previous=fixture(),current=cloneFixture();current.sources[0].retrievedOn=UNKNOWN;
  assert.ok(comparisonText(previous,current,'en').includes('SOURCE_CHANGED'));
});
test('comparison text reports introduced evidence gaps',()=>{
  const previous=fixture(),current=cloneFixture();current.sources[0].tier=UNKNOWN;
  assert.ok(comparisonText(previous,current,'fr').includes('TIER_UNKNOWN'));
});
test('French comparison labels use nonbreaking colon',()=>{
  const output=comparisonText(fixture(),fixture(),'fr');
  assert.ok(output.includes('Fiches modifiées\u00a0:'));
  assert.ok(output.includes('Nouvelles lacunes\u00a0:'));
});
test('comparison of identical inventories contains no phantom changes',()=>{
  const output=comparisonText(fixture(),fixture(),'en');
  assert.ok(output.includes('Changed records: 0'));
  assert.ok(!output.includes('SOURCE_CHANGED'));
});
test('coverage table has no guessed age calculations',()=>{
  assert.ok(!COVERAGE_COLUMNS.includes('age'));
  assert.ok(!COVERAGE_COLUMNS.includes('freshness'));
});
