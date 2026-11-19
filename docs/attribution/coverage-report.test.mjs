import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoverageRegister } from './coverage-core.mjs';
import { auditCoverage } from './coverage-audit.mjs';
import { compareCoverage } from './coverage-change.mjs';
import { escapeHtml, cleanUrl, coverageCopy, coverageText, coverageHtml, coverageJson, renderCoverage } from './coverage-report.mjs';
import { register,source,view } from './coverage-fixture.test.mjs';
const raw=register();const parsed=parseCoverageRegister(raw);const audit=auditCoverage(parsed);

test('HTML escaping covers markup and attribute delimiters',()=>{
  assert.equal(escapeHtml(`<div class="x" title='&'>`),'&lt;div class=&quot;x&quot; title=&#39;&amp;&#39;&gt;');
});
test('only public HTTPS external links are presented as anchors',()=>{
  for(const value of ['javascript:alert(1)','file:///tmp/a','http://example.org/','UNKNOWN'])assert.equal(cleanUrl(value),null);
  assert.equal(cleanUrl('https://example.org/'),'https://example.org/');
});
test('French copy includes readable report headings',()=>{
  assert.equal(coverageCopy('fr').title,'Couverture des sources et des licences');
  assert.equal(coverageCopy('fr').date,'Données en date du');
});
test('English output contains recorded source, licence, permission, and dates',()=>{
  const text=coverageText(parsed,audit,'en');
  for(const item of ['release-one','Open Database License','YES','UNKNOWN','2026-11-01','https://www.openstreetmap.org/'])assert.ok(text.includes(item),item);
});
test('French output has NBSP before colon in date and release labels',()=>{
  const text=coverageText(parsed,audit,'fr');
  assert.ok(text.includes('Données en date du\u00a0: UNKNOWN'));
  assert.ok(text.includes('Version\u00a0: release-one'));
  assert.ok(!text.includes('Données en date du :'));
});
test('HTML report includes accessible table headers and landmarks',()=>{
  const html=coverageHtml(parsed,audit,'en');
  for(const fragment of ['lang="en"','<main','<header','<footer','scope="col"','<thead>','<tbody>','role="status"'])assert.ok(html.includes(fragment),fragment);
});
test('HTML report uses a restrictive CSP and does not embed executable scripts',()=>{
  const html=coverageHtml(parsed,audit,'fr');
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(!html.includes('<script'));
});
test('HTML report has 44px minimum link targets',()=>{
  const html=coverageHtml(parsed,audit,'fr');
  assert.ok(html.includes('min-width:44px;min-height:44px'));
});
test('French HTML report uses correct language',()=>{
  assert.ok(coverageHtml(parsed,audit,'fr').includes('lang="fr"'));
});
test('HTML treats sourced markup as text, never HTML',()=>{
  const malicious=parseCoverageRegister(register({sources:[source({title:'<img src=x onerror=alert(1)>',
    notes:'<script>alert(1)</script>',attribution:'© OpenStreetMap contributors <b>not code</b>'})]}));
  const html=coverageHtml(malicious,auditCoverage(malicious),'en');
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>alert'));
});
test('JSON report is structured and includes the coverage matrix',()=>{
  const report=JSON.parse(coverageJson(parsed,audit));
  assert.equal(report.schema,'attribution-coverage-report/1');
  assert.equal(report.releaseId,'release-one');
  assert.deepEqual(report.matrix[0].sources[0].id,'osm-base');
});
test('printable report includes candidate comparison findings',()=>{
  const next=parseCoverageRegister(register({views:[view({offline:'NO'})]}));
  const comparison=compareCoverage(parsed,next);
  const output=renderCoverage(next,auditCoverage(next),'fr',comparison);
  assert.ok(output.html.includes('Changements'));
  assert.ok(output.text.includes('offline'));
  assert.ok(JSON.parse(output.json).comparison.blocked);
});
test('absence of comparison does not invent changes',()=>{
  const report=JSON.parse(coverageJson(parsed,audit));assert.equal(report.comparison,null);
});
test('report contains no false claim about physical accessibility',()=>{
  const content=coverageText(parsed,audit,'en');
  assert.ok(content.includes('not conditions at a destination'));
});
