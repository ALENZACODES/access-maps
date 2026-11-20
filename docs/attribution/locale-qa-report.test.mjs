import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localeCopy, LOCALE_QA_COPY, renderLocaleQaText, renderLocaleQaHtml,
  renderLocaleQaJson, renderLocaleQaReport,
} from './locale-qa-report.mjs';
import { fixtureRelease, withSource, withNotice, metrolinxRelease, ltcRelease } from './locale-qa-fixtures.mjs';
import { auditLocaleQa } from './locale-qa-audit.mjs';
import { compareLocaleQa } from './locale-qa-change.mjs';

const release = fixtureRelease();
const report = (input = release, locale = 'en', comparison = null) => renderLocaleQaReport(input, auditLocaleQa(input), locale, comparison);

test('English report copy covers sources, pages and findings', () => {
  const t = localeCopy('en');
  assert.ok(t.sources.length > 0);
  assert.ok(t.pages.length > 0);
  assert.ok(t.findings.length > 0);
});
test('French report copy is a distinct catalogue', () => {
  assert.notEqual(LOCALE_QA_COPY.fr.title, LOCALE_QA_COPY.en.title);
  assert.equal(localeCopy('fr').unknown, 'UNKNOWN');
});
test('unknown report locale falls back to English', () => {
  assert.equal(localeCopy('es'), LOCALE_QA_COPY.en);
});
test('plain text includes release identifier and source name', () => {
  const value = report().text;
  assert.ok(value.includes('release-one'));
  assert.ok(value.includes('OpenStreetMap data'));
});
test('plain text retains source and licence links', () => {
  const value = report().text;
  assert.ok(value.includes(release.sources[0].sourceUrl));
  assert.ok(value.includes(release.sources[0].licenceUrl));
});
test('plain text retains licence family and acquisition date', () => {
  const value = report().text;
  assert.ok(value.includes(release.sources[0].licenceName));
  assert.ok(value.includes(release.sources[0].acquiredDate));
});
test('plain text never replaces an unknown dataset date', () => {
  assert.match(report().text, /Dataset date: UNKNOWN/u);
});
test('French plain text uses a no-break space before colon', () => {
  assert.match(report(release, 'fr').text, /Données en date du\u00a0: UNKNOWN/u);
  assert.match(report(release, 'fr').text, /Version\u00a0: release-one/u);
});
test('French plain text contains the chosen notices', () => {
  const value = report(release, 'fr').text;
  assert.ok(value.includes('© OpenStreetMap contributors'));
  assert.ok(value.includes('Open Database License (ODbL) 1.0'));
});
test('notice review date and evidence URL survive plain-text export', () => {
  const value = report().text;
  assert.ok(value.includes(release.pages[0].notices[0].reviewDate));
  assert.ok(value.includes(release.pages[0].notices[0].evidenceUrl));
});
test('plain text includes source evidence tier and permission', () => {
  const value = report().text;
  assert.match(value, /Evidence tier: primary/u);
  assert.match(value, /Redistribution permission: YES/u);
});
test('plain text ends with one newline for machine consumption', () => {
  const value = report().text;
  assert.ok(value.endsWith('\n'));
  assert.ok(!value.endsWith('\n\n'));
});
test('text report enumerates nonblocking unknown-date information', () => {
  assert.ok(report().text.includes('DATASET_DATE_UNKNOWN'));
});
test('blocked release is labelled as blocked in reports', () => {
  const current = withSource(release, { permission: 'NO' });
  assert.ok(report(current).text.includes(LOCALE_QA_COPY.en.blocked));
  assert.ok(report(current, 'fr').text.includes(LOCALE_QA_COPY.fr.blocked));
});
test('clear release has no blocking status', () => {
  const value = report().text;
  assert.ok(value.includes(LOCALE_QA_COPY.en.clear));
  assert.ok(!value.includes(LOCALE_QA_COPY.en.blocked));
});
test('plain text records release comparison changes', () => {
  const current = withNotice(release, 'page-en', 'osm-credit', { visible: 'NO' });
  const comparison = compareLocaleQa(release, current);
  assert.ok(report(current, 'en', comparison).text.includes('Release changes'));
  assert.ok(report(current, 'en', comparison).text.includes('visible'));
});
test('HTML is a self-contained document', () => {
  const html = report().html;
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<main id="main">'));
  assert.ok(html.includes('</html>'));
});
test('HTML sets the language attribute to English', () => {
  assert.match(report().html, /<html lang="en">/u);
});
test('HTML sets the language attribute to French', () => {
  assert.match(report(release, 'fr').html, /<html lang="fr">/u);
});
test('HTML blocks remote connections through CSP', () => {
  const html = report().html;
  assert.ok(html.includes('connect-src '));
  assert.ok(html.includes('object-src '));
  assert.ok(html.includes('base-uri '));
  assert.doesNotMatch(html, /<script\b/iu);
});
test('HTML has an accessible skip link and named main region', () => {
  const html = report().html;
  assert.ok(html.includes('href="#main"'));
  assert.ok(html.includes('<main id="main">'));
});
test('HTML links declare 44px target dimensions', () => {
  const html = report().html;
  assert.ok(html.includes('min-height:44px'));
  assert.ok(html.includes('min-width:44px'));
});
test('HTML includes visible focus styling', () => {
  assert.ok(report().html.includes(':focus-visible'));
});
test('HTML includes reduced-motion styling', () => {
  assert.ok(report().html.includes('prefers-reduced-motion'));
});
test('HTML escapes supplied title content', () => {
  const current = withSource(release, { name: '<img src=x onerror=alert(1)>' });
  const html = report(current).html;
  assert.ok(html.includes('&lt;img'));
  assert.doesNotMatch(html, /<img\s+src=x/iu);
});
test('HTML escapes supplied notice content', () => {
  const current = withNotice(release, 'page-en', 'osm-credit', { text: '<script>bad()</script>' });
  const html = report(current).html;
  assert.ok(html.includes('&lt;script&gt;'));
  assert.doesNotMatch(html, /<script>bad/u);
});
test('HTML displays source URLs as explicit HTTPS links', () => {
  const html = report().html;
  assert.ok(html.includes('href="https://www.openstreetmap.org/copyright"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});
test('HTML avoids external links for UNKNOWN values', () => {
  const current = withSource(release, { sourceUrl: 'UNKNOWN' });
  const html = report(current).html;
  assert.ok(html.includes('<span>UNKNOWN</span>'));
});
test('HTML shows all included page IDs', () => {
  const html = report().html;
  for (const page of release.pages) assert.ok(html.includes(page.id));
});
test('HTML shows each recorded notice and its review status', () => {
  const html = report().html;
  assert.ok(html.includes('osm-credit'));
  assert.ok(html.includes('accepted'));
  assert.ok(html.includes('osm-licence'));
});
test('HTML includes a report status announcement region', () => {
  assert.ok(report().html.includes('role="status"'));
});
test('HTML escapes changing release identifiers', () => {
  const current = withSource(release, { permission: 'NO' });
  const html = renderLocaleQaHtml(current, auditLocaleQa(current), 'en');
  assert.ok(html.includes('SOURCE_PERMISSION_MISSING'));
});
test('HTML includes before/after comparison evidence', () => {
  const current = withSource(release, { permission: 'NO' });
  const comparison = compareLocaleQa(release, current);
  const html = report(current, 'en', comparison).html;
  assert.ok(html.includes('Release changes'));
  assert.ok(html.includes('permission'));
});
test('JSON includes stable machine-readable report schema', () => {
  const data = JSON.parse(report().json);
  assert.equal(data.schema, 'attribution-locale-qa-report/1');
});
test('JSON includes the audit, source count and page count', () => {
  const data = JSON.parse(report().json);
  assert.equal(data.audit.sourceCount, 1);
  assert.equal(data.audit.pageCount, 2);
});
test('JSON output represents UNKNOWN literally', () => {
  assert.ok(report().json.includes('DATASET_DATE_UNKNOWN'));
});
test('JSON report includes full change records when a baseline exists', () => {
  const current = withSource(release, { permission: 'NO' });
  const comparison = compareLocaleQa(release, current);
  const data = JSON.parse(report(current, 'en', comparison).json);
  assert.ok(data.comparison.changes.length > 0);
  assert.equal(data.blocked, true);
});
test('JSON report marks clear release as unblocked', () => {
  assert.equal(JSON.parse(report().json).blocked, false);
});
test('JSON round-trips as a complete object', () => {
  const data = JSON.parse(renderLocaleQaJson(release, auditLocaleQa(release)));
  assert.equal(data.releaseId, release.releaseId);
});
test('reports accept Metrolinx AUA exact legal notices', () => {
  const value = metrolinxRelease('AUA');
  const reports = report(value);
  assert.ok(reports.text.includes('Users must follow applicable laws'));
  assert.ok(reports.html.includes('Metrolinx makes no representations'));
});
test('reports accept Metrolinx OGL independently', () => {
  const value = metrolinxRelease('OGL');
  const reports = report(value);
  assert.ok(reports.text.includes('Contains information licensed under'));
  assert.ok(!reports.text.includes('Users must follow applicable laws'));
});
test('reports accept LTC language-specific notices', () => {
  const value = ltcRelease();
  const reports = report(value, 'fr');
  assert.ok(reports.text.includes('London Transit Commission'));
  assert.ok(reports.text.includes('Données fournies'));
});
test('independent report functions match the combined result', () => {
  const audit = auditLocaleQa(release);
  assert.equal(renderLocaleQaText(release, audit), report().text);
  assert.equal(renderLocaleQaHtml(release, audit), report().html);
  assert.equal(renderLocaleQaJson(release, audit), report().json);
});
test('French HTML report uses U+00A0 before the release label colon', () => {
  assert.match(report(release, 'fr').html, /Version\u00a0: release-one/u);
});
test('French HTML comparison labels use U+00A0 before colon', () => {
  const current = withSource(release, { permission: 'NO' });
  const comparison = compareLocaleQa(release, current);
  const html = report(current, 'fr', comparison).html;
  assert.match(html, /Avant\u00a0:/u);
  assert.match(html, /Après\u00a0:/u);
});
test('French text finding paths use U+00A0 before colon', () => {
  const current = withSource(release, { permission: 'NO' });
  const text = report(current, 'fr').text;
  assert.match(text, /\.permission\u00a0:/u);
});
