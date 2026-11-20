import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRightsMatrix} from './rights-core.mjs';
import {auditRightsMatrix} from './rights-audit.mjs';
import {compareRightsMatrices} from './rights-change.mjs';
import {
  RIGHTS_COPY, renderRightsHtml, renderRightsJson, renderRightsText, renderRightsReport,
} from './rights-report.mjs';
import {matrix, source, output, exception, auaSource, otherSource} from './rights-fixtures.mjs';
const parse = value => parseRightsMatrix(value);
function report(input = matrix(), locale = 'en', previous = null) {
  const current = parse(input);
  const audit = auditRightsMatrix(current);
  const comparison = previous ? compareRightsMatrices(parse(previous), current) : null;
  return renderRightsReport(current, audit, locale, comparison);
}

test('English report includes release and source count', () => {
  const {text} = report();
  assert.ok(text.includes('Publication rights decision matrix'));
  assert.ok(text.includes('Release: release-one'));
  assert.ok(text.includes('Sources: 1'));
});
test('French report uses translated main heading', () => {
  const {text} = report(matrix(), 'fr');
  assert.ok(text.includes('Matrice des droits de publication'));
  assert.ok(text.includes('Version\u00a0: release-one'));
});
test('French dataset-date field uses U+00A0 before colon', () => {
  const {text} = report(matrix(), 'fr');
  assert.ok(text.includes('Données en date du\u00a0: UNKNOWN'));
  assert.ok(!text.includes('Données en date du: UNKNOWN'));
});
test('UNKNOWN is never substituted with a calculated date', () => {
  const {text, json, html} = report();
  assert.ok(text.includes('UNKNOWN'));
  assert.ok(json.includes('"datasetAsOf": "UNKNOWN"'));
  assert.ok(html.includes('UNKNOWN'));
});
test('source licence name and URLs appear in text output', () => {
  const {text} = report();
  assert.ok(text.includes('Open Database License (ODbL) 1.0'));
  assert.ok(text.includes('https://www.openstreetmap.org/copyright'));
});
test('source evidence tier and acquisition date appear in report', () => {
  const {text} = report();
  assert.ok(text.includes('Evidence tier: primary'));
  assert.ok(text.includes('Acquired: 2026-05-01'));
});
test('French source evidence fields are translated', () => {
  const {text} = report(matrix(), 'fr');
  assert.ok(text.includes('Date d’acquisition\u00a0:'));
  assert.ok(text.includes('Niveau de preuve\u00a0: primary'));
  assert.ok(text.includes('Permission\u00a0: OUI'));
});
test('permission NO is presented in French without implying approval', () => {
  const input = matrix({sources: [source({permission: 'NO'})]});
  const {text} = report(input, 'fr');
  assert.ok(text.includes('Permission\u00a0: NON'));
  assert.ok(text.includes('Publication bloquée'));
});
test('permission UNKNOWN remains literal in French', () => {
  const input = matrix({sources: [source({permission: 'UNKNOWN'})]});
  const {text} = report(input, 'fr');
  assert.ok(text.includes('Permission\u00a0: UNKNOWN'));
});
test('output route and target appear in English output', () => {
  const {text} = report();
  assert.ok(text.includes('Route: pages/map-en.html'));
  assert.ok(text.includes('Minimum target: 44'));
});
test('output route and target appear in French output', () => {
  const {text} = report(matrix(), 'fr');
  assert.ok(text.includes('Page\u00a0: pages/map-en.html'));
  assert.ok(text.includes('Dimension minimale des cibles\u00a0: 44'));
});
test('all source notices are preserved as text', () => {
  const {text} = report();
  assert.ok(text.includes('© OpenStreetMap contributors'));
  assert.ok(text.includes('Open Database License (ODbL) 1.0'));
});
test('audit warnings appear in text report with stable codes', () => {
  const {text} = report(matrix({sources: [source({redistribution: 'NO'})]}));
  assert.ok(text.includes('SOURCE_REDISTRIBUTION_MISSING'));
  assert.ok(text.includes('OUTPUT_REDISTRIBUTION_UNSUPPORTED'));
});
test('text output ends in newline', () => assert.ok(report().text.endsWith('\n')));
test('HTML output declares source language and landmarks', () => {
  const {html} = report();
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes('<main id="report">'));
  assert.ok(html.includes('href="#report"'));
});
test('HTML French report declares French language', () => {
  const {html} = report(matrix(), 'fr');
  assert.ok(html.includes('<html lang="fr">'));
  assert.ok(html.includes('Version\u00a0:'));
});
test('HTML report has no executable JavaScript', () => {
  const {html} = report();
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('onload='));
  assert.ok(!html.includes('onclick='));
});
test('HTML report CSP blocks provider connections', () => {
  const {html} = report();
  assert.ok(html.includes('connect-src &#39;none&#39;'));
  assert.ok(html.includes('form-action &#39;none&#39;'));
  assert.ok(html.includes('object-src &#39;none&#39;'));
});
test('HTML report links require deliberate user action', () => {
  const {html} = report();
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes('target="_blank"'));
});
test('HTML report limits links to explicit HTTPS evidence', () => {
  const input = matrix({sources: [source({licenceUrl: 'UNKNOWN'})]});
  const {html} = report(input);
  assert.ok(html.includes('<span>UNKNOWN</span>'));
  assert.ok(!html.includes('href="UNKNOWN"'));
});
test('HTML escaping protects supplied source names', () => {
  const input = matrix({sources: [source({name: '<img src=x onerror=alert(1)>'})]});
  const {html} = report(input);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
});
test('HTML escaping protects supplied attributions', () => {
  const unusual = `${source().attribution}\n<script>alert(1)</script>`;
  const input = matrix({sources: [source({attribution: unusual})], outputs: [output({attribution: unusual})]});
  const {html} = report(input);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>alert'));
});
test('HTML escaping protects release identifiers', () => {
  assert.throws(() => parse(matrix({releaseId: '<script>'})));
});
test('HTML escapes supplied ampersands in source labels', () => {
  const {html} = report(matrix({sources: [source({name: 'Maps & data'})]}));
  assert.ok(html.includes('Maps &amp; data'));
});
test('HTML report uses 44px link minimums', () => {
  const {html} = report();
  assert.ok(html.includes('min-width:44px'));
  assert.ok(html.includes('min-height:44px'));
});
test('HTML focus remains visible', () => {
  const {html} = report();
  assert.ok(html.includes(':focus-visible'));
  assert.ok(html.includes('outline:3px'));
});
test('HTML reduces motion on request', () => {
  const {html} = report();
  assert.ok(html.includes('prefers-reduced-motion:reduce'));
});
test('HTML report offers print CSS', () => assert.ok(report().html.includes('@media print')));
test('HTML is self-contained without external CSS assets', () => {
  const {html} = report();
  assert.ok(html.includes('<style>'));
  assert.ok(!/<link[^>]+stylesheet/iu.test(html));
});
test('JSON output uses a versioned schema', () => {
  const data = JSON.parse(report().json);
  assert.equal(data.schema, 'attribution-rights-report/1');
});
test('JSON output contains original source evidence', () => {
  const data = JSON.parse(report().json);
  assert.equal(data.matrix.sources[0].permission, 'YES');
  assert.equal(data.matrix.sources[0].datasetAsOf, 'UNKNOWN');
});
test('JSON output includes audit blockers', () => {
  const data = JSON.parse(report(matrix({sources: [source({permission: 'NO'})]})).json);
  assert.equal(data.audit.blocked, true);
  assert.ok(data.audit.findings.some(f => f.code === 'SOURCE_PERMISSION_MISSING'));
});
test('JSON report has null comparison when no baseline supplied', () => {
  const data = JSON.parse(report().json);
  assert.equal(data.comparison, null);
});
test('JSON output captures comparison when supplied', () => {
  const changed = matrix({sources: [source({permission: 'NO'})]});
  const data = JSON.parse(report(changed, 'en', matrix()).json);
  assert.ok(data.comparison.blocked);
  assert.ok(data.comparison.changes.some(c => c.field === 'permission'));
});
test('comparison appears in text report', () => {
  const changed = matrix({sources: [source({licenceName: 'Changed name'})]});
  const {text} = report(changed, 'en', matrix());
  assert.ok(text.includes('Changes since earlier release'));
  assert.ok(text.includes('Before: Open Database License (ODbL) 1.0'));
  assert.ok(text.includes('After: Changed name'));
});
test('comparison appears in HTML report', () => {
  const changed = matrix({sources: [source({licenceName: 'Changed name'})]});
  const {html} = report(changed, 'en', matrix());
  assert.ok(html.includes('Changes since earlier release'));
  assert.ok(html.includes('licenceName'));
});
test('comparison appears in French report with nonbreaking punctuation', () => {
  const changed = matrix({sources: [source({licenceName: 'Nouvelle licence'})]});
  const {html} = report(changed, 'fr', matrix());
  assert.ok(html.includes('Avant\u00a0:'));
  assert.ok(html.includes('Après\u00a0:'));
});
test('comparison values containing HTML are escaped', () => {
  const changed = matrix({sources: [source({licenceName: '<b>change</b>'})]});
  const {html} = report(changed, 'en', matrix());
  assert.ok(html.includes('&lt;b&gt;change&lt;/b&gt;'));
  assert.ok(!html.includes('<b>change</b>'));
});
test('AUA legal lines remain intact in both report languages', () => {
  const src = auaSource();
  const input = matrix({sources: [src], outputs: [output({kind: 'journey', sourceIds: [src.id], attribution: src.attribution})]});
  for (const lang of ['en', 'fr']) {
    const {text} = report(input, lang);
    assert.ok(text.includes('Users must follow applicable laws'));
    assert.ok(text.includes('Les utilisateurs doivent respecter les lois applicables'));
  }
});
test('report handles an empty source or output list without a crash', () => {
  const {text, html, json} = report(matrix({sources: [], outputs: []}));
  assert.ok(text.includes('No findings') === false);
  assert.ok(html.includes('RELEASE_NO_SOURCES'));
  assert.ok(JSON.parse(json).audit.blocked);
});
test('report applies French status translation', () => {
  const {text} = report(matrix({sources: [source({permission: 'NO'})]}), 'fr');
  assert.ok(text.includes('Publication bloquée'));
});
test('fallback locale uses English without inventing a third translation', () => {
  const {text} = report(matrix(), 'en-CA');
  assert.ok(text.includes('Release:'));
});
test('language copy dictionaries have the same keys', () => {
  assert.deepEqual(Object.keys(RIGHTS_COPY.en).sort(), Object.keys(RIGHTS_COPY.fr).sort());
});
test('French strings use typographic apostrophes', () => {
  for (const value of Object.values(RIGHTS_COPY.fr)) {
    assert.ok(!/\b(?:l|d|qu|n|s)'/iu.test(value), value);
  }
});
test('source report is generated without reading system clock', () => {
  const before = Date.now;
  Date.now = () => { throw new Error('Clock must not be read'); };
  try { assert.ok(report().text.includes('UNKNOWN')); }
  finally { Date.now = before; }
});
test('renderRightsReport returns exactly supported report formats', () => {
  assert.deepEqual(Object.keys(report()).sort(), ['html', 'json', 'text']);
});
