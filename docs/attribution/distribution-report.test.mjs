import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDistribution} from './distribution-audit.mjs';
import {compareDistributions} from './distribution-change.mjs';
import {manifest, source, asset, view} from './distribution-fixtures.mjs';
import {
  REPORT_MESSAGES, escapeHtml, formatField, reportData,
  renderDistributionJson, renderDistributionText, renderDistributionHtml,
  renderDistributionReport,
} from './distribution-report.mjs';
import {UNKNOWN} from './distribution-core.mjs';
const base=manifest();
const audit=auditDistribution(base);
const compare=compareDistributions(base,manifest({releaseId:'release-next',views:[view({targetPx:48})]}));
const output=(locale='en')=>renderDistributionReport(base,audit,locale);

test('report has distinct English and French catalogues',()=>assert.notEqual(REPORT_MESSAGES.en.title,REPORT_MESSAGES.fr.title));
test('English title identifies attribution distribution chain',()=>assert.match(REPORT_MESSAGES.en.title,/Attribution distribution/u));
test('French title refers to sources and licences',()=>assert.match(REPORT_MESSAGES.fr.title,/sources et licences/u));
test('French release field uses a no-break space before colon',()=>assert.equal(formatField('fr','release','r1'),'Version\u00a0: r1'));
test('French dataset field uses a no-break space before colon',()=>assert.equal(formatField('fr','dataset',UNKNOWN),'Données en date du\u00a0: UNKNOWN'));
test('English release field uses plain colon spacing',()=>assert.equal(formatField('en','release','r1'),'Release: r1'));
test('unknown locale falls back to English labels',()=>assert.equal(formatField('xx','release','r1'),'Release: r1'));
test('French text contains curly apostrophe',()=>assert.match(output('fr').text,/d’acquisition/u));
test('French text retains UNKNOWN dataset dates',()=>assert.match(output('fr').text,/Données en date du\u00a0: UNKNOWN/u));
test('French HTML declares lang fr',()=>assert.match(output('fr').html,/<html lang="fr">/u));
test('English HTML declares lang en',()=>assert.match(output('en').html,/<html lang="en">/u));
test('HTML uses strict CSP blocking remote connections',()=>assert.match(output().html,/connect-src 'none'/u));
test('HTML uses CSP with no scripts',()=>assert.match(output().html,/script-src 'none'/u));
test('HTML prevents external images',()=>assert.match(output().html,/img-src 'none'/u));
test('HTML prevents external forms',()=>assert.match(output().html,/form-action 'none'/u));
test('HTML prevents object elements',()=>assert.match(output().html,/object-src 'none'/u));
test('HTML prevents dynamic base references',()=>assert.match(output().html,/base-uri 'none'/u));
test('HTML has a viewport meta tag',()=>assert.match(output().html,/name="viewport"/u));
test('HTML has a main landmark',()=>assert.match(output().html,/<main id="main">/u));
test('HTML has a skip link',()=>assert.match(output().html,/href="#main"/u));
test('HTML has a focus-visible rule',()=>assert.match(output().html,/:focus-visible/u));
test('HTML declares 44px links',()=>assert.match(output().html,/min-width:44px;min-height:44px/u));
test('HTML has reduced-motion rule',()=>assert.match(output().html,/prefers-reduced-motion/u));
test('HTML has print treatment',()=>assert.match(output().html,/@media print/u));
test('HTML has narrow-screen style',()=>assert.match(output().html,/@media\(max-width:40rem\)/u));
test('HTML includes source heading',()=>assert.match(output().html,/Recorded sources/u));
test('HTML includes publication view heading',()=>assert.match(output().html,/Publication views/u));
test('HTML includes findings heading',()=>assert.match(output().html,/Audit findings/u));
test('HTML preserves OSM credit',()=>assert.match(output().html,/OpenStreetMap contributors/u));
test('HTML preserves ODbL notice',()=>assert.match(output().html,/Open Database License/u));
test('HTML includes recorded licence URL',()=>assert.match(output().html,/https:\/\/www.openstreetmap.org\/copyright/u));
test('HTML contains budget information',()=>assert.match(output().html,/Install budget/u));
test('HTML contains byte total',()=>assert.match(output().html,/Total asset bytes/u));
test('HTML escapes an ampersand',()=>assert.equal(escapeHtml('A & B'),'A &amp; B'));
test('HTML escapes opening tag brackets',()=>assert.equal(escapeHtml('<script>'),'&lt;script&gt;'));
test('HTML escapes quote marks',()=>assert.equal(escapeHtml('"'), '&quot;'));
test('HTML escapes apostrophes',()=>assert.equal(escapeHtml("'"),'&#39;'));
test('HTML escaping handles numeric values',()=>assert.equal(escapeHtml(12),'12'));
test('HTML escaping protects source names',()=>{
  const m=manifest({sources:[source({name:'<img onerror=alert(1)>'})]});
  const html=renderDistributionHtml(m,auditDistribution(m));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(html.includes('&lt;img'));
});
test('HTML escaping protects audit details',()=>{
  const m=manifest({views:[view({noticeText:'<danger>'})]});
  const html=renderDistributionHtml(m,auditDistribution(m));
  assert.ok(html.includes('VIEW_NOTICE_MISSING'));
  assert.ok(!html.includes('<danger>'));
});
test('HTML escaping protects source licence names',()=>{
  const m=manifest({sources:[source({licenceName:'<unsafe>'})]});
  assert.ok(renderDistributionHtml(m,auditDistribution(m)).includes('&lt;unsafe&gt;'));
});
test('report data exports schema discriminator',()=>assert.equal(reportData(base,audit).schema,'attribution-distribution-report/1'));
test('report data exports release ID',()=>assert.equal(reportData(base,audit).releaseId,'release-one'));
test('report data exports source count',()=>assert.equal(reportData(base,audit).totals.sources,1));
test('report data exports asset count',()=>assert.equal(reportData(base,audit).totals.assets,1));
test('report data exports view count',()=>assert.equal(reportData(base,audit).totals.views,1));
test('report data exports actual byte total',()=>assert.equal(reportData(base,audit).totals.installBytes,128));
test('report data exports exact budget',()=>assert.equal(reportData(base,audit).totals.budgetBytes,4_141_875));
test('report data includes the distribution matrix',()=>assert.equal(reportData(base,audit).matrix[0].viewId,'map-en'));
test('report data has null comparison without baseline',()=>assert.equal(reportData(base,audit).comparison,null));
test('JSON report is valid JSON',()=>assert.doesNotThrow(()=>JSON.parse(output().json)));
test('JSON report ends with newline',()=>assert.match(output().json,/\n$/u));
test('JSON report preserves UNKNOWN',()=>assert.equal(JSON.parse(output().json).sources[0].datasetDate,UNKNOWN));
test('JSON report includes licence name',()=>assert.match(output().json,/ODbL/u));
test('JSON report includes source URL',()=>assert.match(output().json,/openstreetmap.org/u));
test('JSON report includes attribution notice',()=>assert.match(output().json,/OpenStreetMap contributors/u));
test('JSON report includes publication view',()=>assert.match(output().json,/map-en/u));
test('JSON report includes asset path',()=>assert.match(output().json,/assets\/data.json/u));
test('text report ends in newline',()=>assert.match(output().text,/\n$/u));
test('text report contains local release name',()=>assert.match(output().text,/release-one/u));
test('text report contains source URLs',()=>assert.match(output().text,/https:\/\/www.openstreetmap.org/u));
test('text report contains licence URLs',()=>assert.match(output().text,/Open Database License/u));
test('text report includes evidence tier',()=>assert.match(output().text,/Evidence tier: primary/u));
test('text report includes permission state',()=>assert.match(output().text,/Permission: YES/u));
test('text report includes acquisition date',()=>assert.match(output().text,/Acquired on: 2026-01-12/u));
test('text report includes terms review date',()=>assert.match(output().text,/Terms reviewed on: 2026-01-12/u));
test('text report includes publishing language',()=>assert.match(output().text,/map-en \(en\)/u));
test('text report lists findings',()=>assert.match(output().text,/DATASET_DATE_UNKNOWN/u));
test('French text uses a no-break space on budget',()=>assert.match(output('fr').text,/Budget d’installation\u00a0:/u));
test('French text preserves the source notice',()=>assert.match(output('fr').text,/OpenStreetMap contributors/u));
test('French report does not add a dataset date',()=>assert.match(output('fr').text,/UNKNOWN/u));
test('French report preserves source ID as submitted',()=>assert.match(output('fr').text,/source-osm/u));
test('blocked audit is represented as blocked in JSON',()=>{
  const m=manifest({sources:[source({permission:UNKNOWN})]});
  const data=JSON.parse(renderDistributionJson(m,auditDistribution(m)));
  assert.equal(data.blocked,true);
});
test('blocked audit is described in English text',()=>{
  const m=manifest({sources:[source({permission:UNKNOWN})]});
  assert.match(renderDistributionText(m,auditDistribution(m)),/Publication blocked/u);
});
test('blocked audit is described in French text',()=>{
  const m=manifest({sources:[source({permission:UNKNOWN})]});
  assert.match(renderDistributionText(m,auditDistribution(m),'fr'),/Publication bloquée/u);
});
test('change comparison included in JSON',()=>{
  const after=manifest({views:[view({targetPx:48})]});
  const data=JSON.parse(renderDistributionJson(after,auditDistribution(after),compare));
  assert.equal(data.comparison.beforeId,'release-one');
});
test('change comparison included in text',()=>{
  const after=manifest({views:[view({targetPx:48})]});
  assert.match(renderDistributionText(after,auditDistribution(after),'en',compare),/Release changes/u);
});
test('French change heading is translated',()=>{
  const after=manifest({views:[view({targetPx:48})]});
  assert.match(renderDistributionText(after,auditDistribution(after),'fr',compare),/Changements entre versions/u);
});
test('HTML includes comparison section when present',()=>{
  const after=manifest({views:[view({targetPx:48})]});
  assert.match(renderDistributionHtml(after,auditDistribution(after),'en',compare),/id="changes-title"/u);
});
test('HTML excludes comparison section without baseline',()=>assert.doesNotMatch(output().html,/id="changes-title"/u));
test('HTML includes changed target dimension',()=>{
  const after=manifest({views:[view({targetPx:48})]});
  assert.match(renderDistributionHtml(after,auditDistribution(after),'en',compare),/targetPx/u);
});
test('reportData includes affected views from comparison',()=>{
  const after=manifest({views:[view({targetPx:48})]});
  assert.deepEqual(reportData(after,auditDistribution(after),compare).comparison.impacts[0].affectedAssets,[]);
});
test('report renderer returns three formats',()=>assert.deepEqual(Object.keys(output()),['text','html','json']));
test('rendered formats are nonempty strings',()=>{
  for(const value of Object.values(output()))assert.equal(typeof value,'string');
});
test('report without any findings shows localized empty message',()=>{
  const m=manifest({sources:[source({datasetDate:'2026-01-12'})]});
  const a=auditDistribution(m);
  assert.equal(a.findings.length,0);
  assert.match(renderDistributionText(m,a),/No findings/u);
});
test('report with no source records does not insert placeholder source',()=>{
  const m=manifest({sources:[]});
  assert.ok(!renderDistributionHtml(m,auditDistribution(m)).includes('source-osm</h3>'));
});
