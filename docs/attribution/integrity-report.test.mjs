import test from 'node:test';
import assert from 'node:assert/strict';
import {reportTsv,reportJson,reportText,comparisonText,impactText,reviewHtml,safeCell,COLUMNS} from './integrity-report.mjs';
import {fixture,twoAssets,clone,HASH_A,HASH_B} from './integrity-fixture.mjs';
import {UNKNOWN,OSM_CREDIT} from './integrity-core.mjs';
import {COPY,LABELS,FIELDS,label,labelled,messages} from './integrity-copy.mjs';

test('CSV-compatible TSV has the precise expected stable column order',()=>{
  assert.deepEqual(COLUMNS,[
    'assetId','asset','status','kind','route','sourceId','source','licence','retrievedOn','tier',
    'expectedSha256','expectedBytes','measurementCount','method','checkId','notice',
    'placement','observedOn','gapCount','state'
  ]);
});
test('TSV header has a cell for every published column',()=>{
  const cells=reportTsv(fixture()).split('\n')[0].split('\t');
  assert.equal(cells.length,COLUMNS.length);
});
test('TSV includes a record for each interaction method',()=>{
  const lines=reportTsv(fixture()).trim().split('\n');
  assert.equal(lines.length,5);
  assert.ok(lines.some(line=>line.includes('"screen-reader"')));
  assert.ok(lines.some(line=>line.includes('"touch"')));
});
test('TSV preserves the SHA-256 hex digest as text',()=>{
  const output=reportTsv(fixture());
  assert.ok(output.includes(HASH_A));
  assert.ok(output.includes('"150"'));
});
test('TSV includes two source sets without inventing cross-links',()=>{
  const output=reportTsv(twoAssets());
  assert.equal(output.trim().split('\n').length,9);
  assert.ok(output.includes('"source-osm"'));
  assert.ok(output.includes('"other-source"'));
});
test('TSV with no asset-source relationships contains just the header',()=>{
  const model=fixture();model.assets[0].sourceIds=[];model.checks=[];
  const lines=reportTsv(model).trim().split('\n');
  assert.equal(lines.length,1);
});
for(const expression of ['=1+1','+SUM(1,2)','-1+2','@HYPERLINK','  =cmd','\t+cmd']) {
  test(`TSV never evaluates potential spreadsheet expression ${JSON.stringify(expression)}`,()=>{
    const cell=safeCell(expression);
    assert.match(cell,/^"'/u);
    assert.ok(!cell.includes('\n'));
    assert.ok(!cell.includes('\t'));
  });
}
test('TSV doubles quotes in arbitrary source names',()=>{
  assert.equal(safeCell('A "test" source'),'"A ""test"" source"');
});
test('TSV removes embedded newlines without merging rows',()=>{
  assert.equal(safeCell('Line one\nLine two'),'"Line one Line two"');
});
test('a known zero cannot be silently converted into UNKNOWN in a TSV cell',()=>{
  assert.equal(safeCell(0),'"0"');
});
test('null evidence explicitly prints UNKNOWN',()=>{
  assert.equal(safeCell(null),'"UNKNOWN"');
});
test('JSON report embeds parsed source and blocking findings',()=>{
  const model=fixture();model.measurements[0].sha256=HASH_B;
  const result=JSON.parse(reportJson(model));
  assert.equal(result.register.sources[0].credit,OSM_CREDIT);
  assert.ok(result.audit.findings.some(x=>x.code==='FILE_HASH_MISMATCH'));
});
test('JSON report preserves dataset age as supplied, not calculated',()=>{
  const model=fixture();model.sources[0].retrievedOn=UNKNOWN;
  assert.equal(JSON.parse(reportJson(model)).register.sources[0].retrievedOn,UNKNOWN);
});
test('JSON report does not include file bytes or browser storage state',()=>{
  const output=reportJson(fixture());
  assert.ok(!output.includes('fileBytes'));
  assert.ok(!output.includes('localStorage'));
  assert.ok(!output.includes('sessionStorage'));
});
for(const locale of ['en','fr']) {
  test(`${locale} text report contains exact OSM credit`,()=>{
    assert.ok(reportText(fixture(),locale).includes(OSM_CREDIT));
  });
  test(`${locale} text report includes observed date and retrieval date`,()=>{
    const text=reportText(fixture(),locale);
    assert.ok(text.includes('2026-11-19'));
    assert.ok(text.includes('Fictional map geometry'));
  });
  test(`${locale} text report contains both file SHA and measurement SHA`,()=>{
    const text=reportText(fixture(),locale);
    assert.equal(text.split(HASH_A).length-1,2);
  });
  test(`${locale} text report preserves the recorded licence`,()=>{
    assert.ok(reportText(fixture(),locale).includes('ODbL'));
  });
  test(`${locale} text report includes exact notice placement`,()=>{
    assert.ok(reportText(fixture(),locale).includes('beside-map'));
  });
  test(`${locale} text report includes source origin and its tier`,()=>{
    const text=reportText(fixture(),locale);
    assert.ok(text.includes('Fictional ODbL example'));
    assert.ok(text.includes('imported'));
  });
  test(`${locale} text report displays specific failing code`,()=>{
    const model=fixture();model.measurements[0].byteLength=10;
    assert.ok(reportText(model,locale).includes('FILE_LENGTH_MISMATCH'));
  });
  test(`${locale} HTML export is script-free and self-contained`,()=>{
    const html=reviewHtml(fixture(),locale);
    assert.ok(!/<script\b/iu.test(html));
    assert.ok(!/<iframe\b/iu.test(html));
    assert.ok(!/<form\b/iu.test(html));
    assert.ok(!/onload=|onclick=|onerror=/iu.test(html));
    assert.ok(html.includes("connect-src 'none'"));
    assert.ok(html.includes("script-src 'none'"));
  });
  test(`${locale} HTML export contains landmarks and labelled sections`,()=>{
    const html=reviewHtml(fixture(),locale);
    assert.match(html,/<main>/u);
    assert.match(html,/<section aria-labelledby="asset-asset-map">/u);
    assert.match(html,/<h2 id="asset-asset-map">/u);
    assert.match(html,/<h3>Fictional ODbL example<\/h3>/u);
  });
  test(`${locale} HTML export displays exact OSM credit`,()=>{
    assert.ok(reviewHtml(fixture(),locale).includes(OSM_CREDIT));
  });
  test(`${locale} HTML export contains a source HTTPS legal link`,()=>{
    assert.match(reviewHtml(fixture(),locale),/href="https:\/\/www\.openstreetmap\.org\/copyright"/u);
  });
  test(`${locale} HTML export supports visible focus and narrow displays`,()=>{
    const html=reviewHtml(fixture(),locale);
    assert.ok(html.includes(':focus-visible'));
    assert.ok(html.includes('width=device-width, initial-scale=1'));
  });
  test(`${locale} HTML export preserves UNKNOWN on incomplete evidence`,()=>{
    const model=fixture();model.sources[0].retrievedOn=UNKNOWN;
    assert.ok(reviewHtml(model,locale).includes(UNKNOWN));
  });
}
test('French text labels use nonbreaking spaces before colons',()=>{
  const text=reportText(fixture(),'fr');
  for(const key of ['gaps','asset','kind','route','status','sha256','source','licence','retrievedOn','tier','credit','method','noticeText','placement','observedOn','measurement','checkedOn']) {
    assert.ok(text.includes(`${label('fr',key)}\u00a0:`),key);
    assert.ok(!text.includes(`${label('fr',key)}:`),key);
  }
});
test('English text labels use ordinary colons',()=>{
  const text=reportText(fixture(),'en');
  for(const key of ['gaps','asset','kind','route','source','licence','credit']) assert.ok(text.includes(`${label('en',key)}:`),key);
});
test('French comparison labels preserve nonbreaking spacing',()=>{
  const old=fixture(),now=clone(old);
  now.measurements[0].sha256=HASH_B;
  const text=comparisonText(old,now,'fr');
  assert.ok(text.includes(`${label('fr','introduced')}\u00a0:`));
  assert.ok(text.includes(`${label('fr','regressions')}\u00a0:`));
});
test('comparison export includes a changed-measurement entry',()=>{
  const old=fixture(),now=clone(old);
  now.measurements[0].sha256=HASH_B;
  assert.ok(comparisonText(old,now).includes('MEASUREMENT_CHANGED'));
});
test('comparison export reports resolved missing measurement',()=>{
  const old=fixture(),now=clone(old);
  old.measurements=[];
  assert.ok(comparisonText(old,now).includes('1'));
});
test('source impact export lists its dependent asset',()=>{
  assert.ok(impactText(fixture(),'source-osm','en').includes('Fictional map geometry'));
});
test('source impact export is empty of unrelated asset details',()=>{
  const text=impactText(twoAssets(),'other-source','fr');
  assert.ok(text.includes('Fictional list data'));
  assert.ok(!text.includes('Fictional map geometry'));
});
test('source impact export includes blocking gap codes',()=>{
  const model=fixture();model.measurements=[];
  assert.ok(impactText(model,'source-osm').includes('MEASUREMENT_MISSING'));
});
test('HTML output escapes crafted text instead of injecting elements',()=>{
  const model=fixture();model.assets[0].label='A <img src=x onerror=alert(1)> & "bad"';
  const html=reviewHtml(model);
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&amp;'));
  assert.ok(!/<img\s/u.test(html));
});
test('HTML output safely escapes a crafted source name',()=>{
  const model=fixture();model.sources[0].name='Source </h3><script>alert(1)</script>';
  const html=reviewHtml(model);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!/<script\b/iu.test(html));
});
test('HTML does not render UNKNOWN external links as anchors',()=>{
  const model=fixture();model.sources[0].sourceUrl=UNKNOWN;
  model.sources[0].licenceUrl=UNKNOWN;
  assert.ok(!reviewHtml(model).includes('href="UNKNOWN"'));
});
test('HTML includes no externally linked stylesheets or scripts',()=>{
  const html=reviewHtml(fixture());
  assert.ok(!/<link\b/iu.test(html));
  assert.ok(!/<script\b/iu.test(html));
});
test('exporting an empty record is a meaningful draft, not a claim of completion',()=>{
  const model=fixture();model.assets=[];model.checks=[];model.measurements=[];
  const html=reviewHtml(model);
  assert.ok(html.includes('No source'));// warning clearly frames the limited scope
  assert.ok(html.includes('<main>'));
});
test('user-facing copy keys are aligned in both languages',()=>{
  assert.deepEqual(Object.keys(COPY.en).sort(),Object.keys(COPY.fr).sort());
});
test('field label keys are aligned in both languages',()=>{
  assert.deepEqual(Object.keys(LABELS.en).sort(),Object.keys(LABELS.fr).sort());
});
test('every editable input has a translated label',()=>{
  for(const kind of Object.keys(FIELDS)) for(const key of FIELDS[kind]) {
    assert.ok(label('en',key),key);
    assert.ok(label('fr',key),key);
  }
});
test('user-facing copy never asserts an agency endorsement or partnership',()=>{
  const all=JSON.stringify(COPY);
  assert.ok(!/partnership|endorsed|real-time|guaranteed|vérif/iu.test(all));
});
test('no inherited social or personal metadata appears in reports',()=>{
  const json=reportJson(fixture());
  for(const term of ['password','access_token','api_key','phoneNumber','emailAddress']) assert.ok(!json.includes(term));
});
test('HTML carries no implicit analytics or remote tile request',()=>{
  const html=reviewHtml(fixture());
  assert.ok(!/navigator\.sendBeacon|fetch\(/u.test(html));
  assert.ok(!/mapbox|google-analytics/u.test(html));
});
test('display language selection defaults to English for unknown locale',()=>{
  assert.equal(messages('de'),COPY.en);
  assert.equal(messages('fr'),COPY.fr);
});
test('labels preserve literal UNKNOWN for absent provenance',()=>{
  assert.equal(labelled('fr','source',UNKNOWN),'Source\u00a0: UNKNOWN');
  assert.equal(labelled('en','source',UNKNOWN),'Source: UNKNOWN');
});
