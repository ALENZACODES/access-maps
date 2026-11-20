import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_REVIEW_COPY, reviewLabel, escapeReviewHtml,
  renderAccessReviewText, renderAccessReviewHtml, renderAccessReviewJson,
  buildAccessReviewReport,
} from './access-review-report.mjs';
import { auditAccessReview } from './access-review-audit.mjs';
import { compareAccessReviews } from './access-review-change.mjs';
import { reviewRelease, reviewSource, reviewSurface, reviewTarget } from './access-review-fixtures.mjs';
import { UNKNOWN } from './access-review-core.mjs';
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE } from './attribution-utils.mjs';

function reportInput() { return reviewRelease(); }
function changedInput() {
  const r = reportInput();
  r.releaseId = 'second-release';
  r.surfaces[0].targets[0].visible = 'NO';
  return r;
}

test('report labels include complete EN and FR catalogues', () => {
  assert.equal(new Set(Object.keys(ACCESS_REVIEW_COPY.en)).size, Object.keys(ACCESS_REVIEW_COPY.en).length);
  assert.deepEqual(Object.keys(ACCESS_REVIEW_COPY.en).sort(), Object.keys(ACCESS_REVIEW_COPY.fr).sort());
  assert.equal(reviewLabel('fr', 'unknown'), UNKNOWN);
  assert.equal(reviewLabel('en', 'unknown'), UNKNOWN);
});
test('locale defaults to English for unsupported string', () => {
  assert.equal(reviewLabel('es', 'title'), ACCESS_REVIEW_COPY.en.title);
});
test('French copy keeps curly apostrophe', () => {
  assert.match(ACCESS_REVIEW_COPY.fr.title, /l’accessibilité/u);
  assert.doesNotMatch(ACCESS_REVIEW_COPY.fr.title, /l'accessibilité/u);
});
test('French labels use the correct source vocabulary', () => {
  assert.equal(ACCESS_REVIEW_COPY.fr.licence, 'Licence');
  assert.equal(ACCESS_REVIEW_COPY.fr.date, 'Données en date du');
  assert.ok(ACCESS_REVIEW_COPY.fr.disclaimer.includes('observations'));
});
test('HTML escaping handles all dangerous characters', () => {
  assert.equal(escapeReviewHtml(`<script x="'">&`), '&lt;script x=&quot;&#39;&quot;&gt;&amp;');
});
test('escaping preserves Unicode and UNKNOWN', () => {
  assert.equal(escapeReviewHtml('l’App'), 'l’App');
  assert.equal(escapeReviewHtml(UNKNOWN), UNKNOWN);
});
test('basic text report contains source and licence fields', () => {
  const report = renderAccessReviewText(reportInput());
  assert.ok(report.includes('Open Database License (ODbL) 1.0'));
  assert.ok(report.includes('ODbL-1.0'));
  assert.ok(report.includes(SOURCES.osm.sourceUrl));
  assert.ok(report.includes('© OpenStreetMap contributors'));
  assert.ok(report.includes('UNKNOWN'));
});
test('text report includes acquisition and terms dates', () => {
  const text = renderAccessReviewText(reportInput());
  assert.ok(text.includes('2026-11-12'));
  assert.ok(text.includes('2026-11-11'));
  assert.ok(text.includes('Acquired on:'));
});
test('text report includes all notice-target techniques', () => {
  const text = renderAccessReviewText(reportInput());
  for (const technique of ['keyboard', 'screen-reader', 'contrast', 'reflow', 'touch']) assert.ok(text.includes(technique));
});
test('French text report uses a no-break space before colon', () => {
  const text = renderAccessReviewText(reportInput(), null, 'fr');
  assert.ok(text.includes('Données en date du\u00a0: UNKNOWN'));
  assert.ok(text.includes('Version\u00a0: release-one'));
});
test('French report includes the accessible evidence disclaimer', () => {
  const text = renderAccessReviewText(reportInput(), null, 'fr');
  assert.ok(text.includes('observations manuelles'));
  assert.ok(text.includes('Aucun point bloquant'));
});
test('English report describes blocking changes', () => {
  const after = changedInput();
  const comparison = compareAccessReviews(reportInput(), after);
  const report = renderAccessReviewText(after, auditAccessReview(after), 'en', comparison);
  assert.ok(report.includes('NOTICE_HIDDEN'));
  assert.ok(report.includes('Release changes'));
  assert.ok(report.includes('Before'));
  assert.ok(report.includes('After'));
});
test('French change report preserves before and after', () => {
  const after = changedInput();
  const comparison = compareAccessReviews(reportInput(), after);
  const text = renderAccessReviewText(after, auditAccessReview(after), 'fr', comparison);
  assert.ok(text.includes('Avant'));
  assert.ok(text.includes('Après'));
  assert.ok(text.includes('Changements entre les versions'));
});
test('no-change comparison has a readable fallback', () => {
  const comparison = compareAccessReviews(reportInput(), reportInput());
  const text = renderAccessReviewText(reportInput(), null, 'en', comparison);
  assert.ok(text.includes('No recorded changes'));
});
test('text report presents no-finding label for fully dated record', () => {
  const r = reportInput();
  r.sources[0].datasetDate = '2026-11-10';
  const text = renderAccessReviewText(r);
  assert.ok(text.includes('No findings'));
});
test('HTML report is a standalone document', () => {
  const html = renderAccessReviewHtml(reportInput());
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes('<main id="main">'));
  assert.ok(html.includes('</html>'));
});
test('French HTML report sets lang=fr', () => {
  const html = renderAccessReviewHtml(reportInput(), null, 'fr');
  assert.ok(html.includes('<html lang="fr">'));
  assert.ok(html.includes('Données en date du'));
  assert.ok(html.includes('Version'));
});
test('HTML report has network-blocking CSP', () => {
  const html = renderAccessReviewHtml(reportInput());
  for (const fragment of ["default-src 'none'", "connect-src 'none'", "base-uri 'none'", "object-src 'none'", "form-action 'none'"]) assert.ok(html.includes(fragment));
});
test('HTML report has no executable JavaScript', () => {
  const html = renderAccessReviewHtml(reportInput());
  assert.doesNotMatch(html, /<script\b/iu);
  assert.doesNotMatch(html, /\bonclick\s*=/iu);
});
test('HTML report has landmarks and skip navigation', () => {
  const html = renderAccessReviewHtml(reportInput());
  assert.ok(html.includes('href="#main"'));
  assert.ok(html.includes('<nav aria-label='));
  assert.ok(html.includes('<section id="findings">'));
});
test('HTML styles include minimum link size and visible keyboard focus', () => {
  const html = renderAccessReviewHtml(reportInput());
  assert.ok(html.includes('min-height:44px'));
  assert.ok(html.includes('min-width:44px'));
  assert.ok(html.includes(':focus-visible'));
});
test('HTML report includes reduced-motion and narrow-width rules', () => {
  const html = renderAccessReviewHtml(reportInput());
  assert.ok(html.includes('prefers-reduced-motion:reduce'));
  assert.ok(html.includes('max-width:45rem'));
});
test('HTML report escapes user-supplied markup in names and notes', () => {
  const r = reportInput();
  r.sources[0].notice += '\n<script>alert("danger")</script>';
  r.surfaces[0].targets[0].observations[0].note = '<img src=x onerror=alert(1)>';
  const html = renderAccessReviewHtml(r);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img'));
  assert.doesNotMatch(html, /<script>\s*alert/u);
  assert.doesNotMatch(html, /<img\s+src=x/iu);
});
test('HTML URLs are explicitly HTTPS and use safe rel', () => {
  const html = renderAccessReviewHtml(reportInput());
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('https://www.openstreetmap.org/copyright'));
});
test('unknown source URL is text, not a fake anchor', () => {
  const r = reportInput();
  r.sources[0].sourceUrl = UNKNOWN;
  const html = renderAccessReviewHtml(r);
  assert.ok(html.includes(`<span>${UNKNOWN}</span>`));
});
test('HTML report retains recorded notice text', () => {
  const html = renderAccessReviewHtml(reportInput());
  assert.ok(html.includes('© OpenStreetMap contributors'));
  assert.ok(html.includes('Open Database License (ODbL) 1.0'));
});
test('HTML report prints observation outcomes and dates', () => {
  const html = renderAccessReviewHtml(reportInput());
  assert.ok(html.includes('PASS'));
  assert.ok(html.includes('2026-11-12'));
  assert.ok(html.includes('screen-reader'));
});
test('HTML comparison report shows the changed finding type', () => {
  const after = changedInput();
  const comparison = compareAccessReviews(reportInput(), after);
  const html = renderAccessReviewHtml(after, auditAccessReview(after), 'en', comparison);
  assert.ok(html.includes('notice-target-changed'));
  assert.ok(html.includes('NOTICE_HIDDEN'));
});
test('report JSON has a stable schema', () => {
  const data = JSON.parse(renderAccessReviewJson(reportInput()));
  assert.equal(data.schema, 'attribution-access-review-report/1');
  assert.equal(data.releaseId, 'release-one');
});
test('report JSON maintains findings structure', () => {
  const data = JSON.parse(renderAccessReviewJson(reportInput()));
  assert.equal(data.blocked, false);
  assert.ok(Array.isArray(data.findings));
  assert.ok(data.findings.some(item => item.code === 'DATASET_DATE_UNKNOWN'));
});
test('report JSON includes coverage statistics', () => {
  const data = JSON.parse(renderAccessReviewJson(reportInput()));
  assert.equal(data.coverage.length, 5);
  assert.equal(data.coverage.find(row => row.technique === 'keyboard').passCount, 2);
});
test('report JSON shows changes for a baseline', () => {
  const after = changedInput();
  const data = JSON.parse(renderAccessReviewJson(after, null, compareAccessReviews(reportInput(), after)));
  assert.equal(data.blocked, true);
  assert.ok(data.changes.some(item => item.kind === 'notice-target-changed'));
});
test('report JSON omits unneeded comparison when absent', () => {
  const data = JSON.parse(renderAccessReviewJson(reportInput()));
  assert.deepEqual(data.changes, []);
});
test('build function returns complete matched report formats', () => {
  const result = buildAccessReviewReport(reportInput(), 'fr');
  assert.equal(result.locale, 'fr');
  assert.ok(result.text.includes('Version\u00a0:'));
  assert.ok(result.html.includes('lang="fr"'));
  assert.equal(JSON.parse(result.json).releaseId, 'release-one');
});
test('build report accepts explicit audit options', () => {
  const result = buildAccessReviewReport(reportInput(), 'en', null, { requirePaired: true });
  assert.equal(result.audit.blocked, true);
  assert.ok(result.text.includes('LOCALE_COMPANION_MISSING'));
});
test('source and licence terms use a single authoritative catalogue', () => {
  const r = reportInput();
  assert.equal(r.sources[0].sourceUrl, SOURCES.osm.sourceUrl);
  assert.equal(r.sources[0].licenceUrl, SOURCES.osm.licenceUrl);
});
test('Metrolinx legal lines are not silently appended to OSM report', () => {
  const html = renderAccessReviewHtml(reportInput());
  assert.ok(!html.includes(METROLINX_AUA_LEGEND));
  assert.ok(!html.includes(METROLINX_OGL_NOTICE));
});
test('the text report preserves a genuine unknown dataset date', () => {
  const r = reportInput();
  r.sources[0].datasetDate = UNKNOWN;
  const text = renderAccessReviewText(r);
  assert.ok(text.includes('Dataset date: UNKNOWN'));
});
test('text and HTML report results agree on blocking status', () => {
  const r = changedInput();
  const result = buildAccessReviewReport(r);
  assert.equal(result.audit.blocked, true);
  assert.ok(result.text.includes(ACCESS_REVIEW_COPY.en.blocked));
  assert.ok(result.html.includes(ACCESS_REVIEW_COPY.en.blocked));
  assert.equal(JSON.parse(result.json).blocked, true);
});
test('reports do not imply that observations establish accessibility', () => {
  const result = buildAccessReviewReport(reportInput());
  assert.ok(result.text.includes('not an accessibility certification'));
  assert.ok(result.html.includes('not an accessibility certification'));
});
