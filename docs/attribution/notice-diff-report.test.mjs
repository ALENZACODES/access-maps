import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoticeRelease, UNKNOWN } from './notice-diff-core.mjs';
import { auditNoticeRelease } from './notice-diff-audit.mjs';
import { compareNoticeReleases } from './notice-diff-change.mjs';
import { COPY, safeHtml, reportLocale, renderNoticeText, renderNoticeHtml, renderNoticeJson, renderNoticeReport } from './notice-diff-report.mjs';
import { release, source, notice, surface, mutateSource, mutateSurface } from './notice-diff-fixtures.mjs';
function render(input = release(), lang = 'en', old = null) {
  const candidate = parseNoticeRelease(input);
  const audit = auditNoticeRelease(candidate);
  const comparison = old ? compareNoticeReleases(parseNoticeRelease(old), candidate) : null;
  return renderNoticeReport(candidate, audit, lang, comparison);
}
for (const language of ['en', 'fr']) {
  test(`${language} report carries the complete release ID`, () => assert.ok(render(release(), language).text.includes('release-one')));
  test(`${language} report identifies source provenance`, () => assert.ok(render(release(), language).text.includes('map-source')));
  test(`${language} report carries the licence name`, () => assert.ok(render(release(), language).text.includes('Open Database License')));
  test(`${language} report carries the source URL`, () => assert.ok(render(release(), language).text.includes('openstreetmap.org')));
  test(`${language} report carries the evidence tier`, () => assert.ok(render(release(), language).text.includes('primary')));
  test(`${language} report carries the explicit permission`, () => assert.ok(render(release(), language).text.includes('YES')));
  test(`${language} HTML declares its locale`, () => assert.ok(render(release(), language).html.includes(`lang="${language}"`)));
  test(`${language} HTML has a main landmark`, () => assert.match(render(release(), language).html, /<main id="main">/u));
  test(`${language} HTML has a skip link`, () => assert.match(render(release(), language).html, /href="#main"/u));
  test(`${language} HTML blocks all network connections`, () => assert.ok(render(release(), language).html.includes("connect-src 'none'")));
  test(`${language} HTML has no JavaScript element`, () => assert.doesNotMatch(render(release(), language).html, /<script\b/iu));
  test(`${language} HTML declares minimum 44px targets`, () => assert.match(render(release(), language).html, /min-height:44px/u));
  test(`${language} HTML allows reduced motion`, () => assert.match(render(release(), language).html, /prefers-reduced-motion/u));
  test(`${language} HTML supports keyboard focus`, () => assert.match(render(release(), language).html, /focus-visible/u));
  test(`${language} JSON output includes a report schema`, () => assert.equal(JSON.parse(render(release(), language).json).schema, 'attribution-notice-report/1'));
  test(`${language} JSON output includes the full release data`, () => assert.equal(JSON.parse(render(release(), language).json).release.sources[0].id, 'map-source'));
  test(`${language} JSON output includes structured audit`, () => assert.equal(JSON.parse(render(release(), language).json).audit.blocked, false));
  test(`${language} report keeps UNKNOWN exactly`, () => assert.ok(render(mutateSource(release(), { datasetDate: UNKNOWN }), language).text.includes(UNKNOWN)));
  test(`${language} report shows source-level date`, () => assert.ok(render(release(), language).text.includes('2026-01-10')));
  test(`${language} HTML has headings for sources, notices and surfaces`, () => {
    const html = render(release(), language).html;
    assert.ok(html.includes(COPY[language].sourceSection));
    assert.ok(html.includes(COPY[language].noticeSection));
    assert.ok(html.includes(COPY[language].surfaceSection));
  });
}
test('French labels use U+00A0 before colons', () => {
  const result = render(release(), 'fr').text;
  assert.ok(result.includes('Données en date du\u00a0:'));
  assert.ok(result.includes('Version\u00a0:'));
  assert.doesNotMatch(result, /Données en date du:/u);
});
test('French report preserves typographic apostrophes', () => assert.match(render(release(), 'fr').text, /d’acquisition/u));
test('French report uses no plain ASCII apostrophe in its message catalogue', () => {
  const values = Object.values(COPY.fr).join(' ');
  assert.doesNotMatch(values, /\b(?:d|l|n|qu)'/u);
});
test('French report uses U+202F before semicolons in user copy', () => {
  assert.doesNotMatch(Object.values(COPY.fr).join(' '), / (?=[;!?])/u);
});
test('report locale is deliberately limited to EN/FR', () => {
  assert.equal(reportLocale('fr'), 'fr');
  assert.equal(reportLocale('fr-CA'), 'en');
  assert.equal(reportLocale('es'), 'en');
});
test('safe HTML escapes markup delimiters', () => {
  assert.equal(safeHtml('<script>"x" & y\'z'), '&lt;script&gt;&quot;x&quot; &amp; y&#39;z');
});
test('HTML report escapes source identifiers and source description', () => {
  const input = release({ sources: [source({ note: '<img src=x onerror=bad>' })] });
  const result = render(input, 'en').html;
  assert.doesNotMatch(result, /<img src=x/u);
});
test('HTML report escapes notice text', () => {
  const input = release({ notices: [notice({ text: '<iframe src=bad>' }), release().notices[1]] });
  const html = render(input).html;
  assert.ok(html.includes('&lt;iframe'));
  assert.doesNotMatch(html, /<iframe\b/u);
});
test('HTML report does not link arbitrary provider URLs', () => {
  const html = render(release()).html;
  assert.doesNotMatch(html, /<a[^>]+https?:/iu);
});
test('text report exposes blocking findings', () => {
  const input = mutateSource(release(), { permission: UNKNOWN });
  const result = render(input);
  assert.ok(result.text.includes('PERMISSION_UNKNOWN'));
  assert.ok(result.text.includes(COPY.en.blocked));
});
test('HTML report exposes blocking findings', () => {
  const input = mutateSource(release(), { permission: UNKNOWN });
  assert.ok(render(input).html.includes('PERMISSION_UNKNOWN'));
});
test('text report exposes changes from earlier release', () => {
  const input = mutateSource(release(), { permission: UNKNOWN });
  const result = render(input, 'en', release());
  assert.ok(result.text.includes('source-changed'));
  assert.ok(result.text.includes(COPY.en.from));
});
test('French report exposes release comparisons', () => {
  const input = mutateSurface(release(), { targetPx: 43 });
  const result = render(input, 'fr', release());
  assert.ok(result.html.includes(COPY.fr.changes));
  assert.ok(result.text.includes('targetPx'));
});
test('HTML report renders change list as semantic list', () => {
  const input = mutateSource(release(), { sourceUrl: 'https://example.org/new' });
  const result = render(input, 'en', release());
  assert.match(result.html, /<ol>/u);
  assert.ok(result.html.includes('source-changed'));
});
test('JSON report includes comparison when supplied', () => {
  const input = mutateSource(release(), { permission: UNKNOWN });
  const result = JSON.parse(render(input, 'en', release()).json);
  assert.equal(result.comparison.blocked, true);
  assert.ok(result.comparison.changes.length > 0);
});
test('JSON report comparison is null when not supplied', () => assert.equal(JSON.parse(render().json).comparison, null));
test('empty notice list remains explicitly empty', () => {
  const result = render(release({ notices: [] }));
  assert.ok(result.text.includes(COPY.en.noNotices));
  assert.ok(result.html.includes(COPY.en.noNotices));
});
test('empty source list remains explicitly empty', () => {
  const result = render(release({ sources: [] }));
  assert.ok(result.text.includes(COPY.en.noSources));
  assert.ok(result.html.includes(COPY.en.noSources));
});
test('empty surface list remains explicitly empty', () => {
  const result = render(release({ surfaces: [] }));
  assert.ok(result.text.includes(COPY.en.noSurfaces));
  assert.ok(result.html.includes(COPY.en.noSurfaces));
});
test('rendering does not modify the source document', () => {
  const input = release();
  const before = JSON.stringify(input);
  render(input);
  assert.equal(JSON.stringify(input), before);
});
test('each report output ends with a newline', () => {
  const result = render();
  assert.ok(result.text.endsWith('\n'));
  assert.ok(result.html.endsWith('\n'));
  assert.ok(result.json.endsWith('\n'));
});
test('report can be produced with direct exported renderers', () => {
  const item = parseNoticeRelease(release());
  const audit = auditNoticeRelease(item);
  assert.ok(renderNoticeText(item, audit).includes('release-one'));
  assert.ok(renderNoticeHtml(item, audit).includes('<!doctype html>'));
  assert.equal(JSON.parse(renderNoticeJson(item, audit)).release.releaseId, 'release-one');
});
