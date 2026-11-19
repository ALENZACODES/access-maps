import test from 'node:test';
import assert from 'node:assert/strict';
import { renderClaimHtml, renderClaimText, renderClaimJson, renderClaimReport, TRACE_COPY, TRACE_HTML_CSP, TRACE_HTML_STYLE } from './claim-trace-report.mjs';
import { auditClaimTrace } from './claim-trace-audit.mjs';
import { compareClaimTraces } from './claim-trace-change.mjs';
import { release, claim, source, surface } from './claim-trace-fixture.test.mjs';
function report(trace = release(), language = 'en', before = null) {
  return renderClaimReport(trace, auditClaimTrace(trace), language, before ? compareClaimTraces(before, trace) : null);
}
test('all three report formats are available', () => {
  assert.deepEqual(Object.keys(report()), ['text', 'html', 'json']);
});
test('the public metadata report contains explicit source and licence links', () => {
  const output = report();
  assert.ok(output.text.includes('https://www.openstreetmap.org/copyright'));
  assert.ok(output.html.includes('https://www.openstreetmap.org/copyright'));
  assert.ok(output.text.includes('Open Database License'));
});
test('language text is translated but evidence stays unchanged', () => {
  const document = release();
  const english = report(document, 'en');
  const french = report(document, 'fr');
  assert.ok(english.text.includes('Dataset date: UNKNOWN'));
  assert.ok(french.text.includes('Données en date du\u00a0: UNKNOWN'));
  assert.ok(french.html.includes('lang="fr"'));
  assert.ok(english.html.includes('lang="en"'));
});
test('report does not turn UNKNOWN into a favourable assumption', () => {
  const output = report();
  for (const content of Object.values(output)) assert.ok(content.includes('UNKNOWN'));
});
test('French label punctuation uses a nonbreaking space before colon', () => {
  const output = report(release(), 'fr');
  assert.match(output.text, /Version\u00a0:/u);
  assert.match(output.text, /Données en date du\u00a0:/u);
  assert.doesNotMatch(output.text, /Données en date du:/u);
});
test('French labels have no ASCII apostrophe in translations', () => {
  for (const value of Object.values(TRACE_COPY.fr)) assert.doesNotMatch(value, /\w'\w/u);
});
test('export content reports the selected release id', () => {
  const output = report(release({releaseId: 'release-example'}));
  assert.ok(output.text.includes('release-example'));
  assert.ok(output.html.includes('release-example'));
  assert.equal(JSON.parse(output.json).releaseId, 'release-example');
});
test('HTML escapes untrusted claim text', () => {
  const document = release({claims: [claim({text: '<svg onload="alert(1)">example</svg>'})]});
  const html = report(document).html;
  assert.ok(html.includes('&lt;svg'));
  assert.ok(!html.includes('<svg'));
});
test('HTML escapes quotes in claim text', () => {
  const html = report(release({claims: [claim({text: 'Notes say "closed" & off-line'})]})).html;
  assert.ok(html.includes('&quot;closed&quot;'));
  assert.ok(html.includes('&amp;'));
});
test('HTML does not load remote scripts or styles', () => {
  const html = report().html;
  assert.ok(html.includes("script-src &#39;none&#39;"));
  assert.ok(html.includes("connect-src &#39;none&#39;"));
  assert.doesNotMatch(html, /<script\b/u);
  assert.doesNotMatch(html, /<link\b/u);
});
test('HTML has semantic landmarks and a skip link', () => {
  const html = report().html;
  assert.ok(html.includes('<main id="main">'));
  assert.ok(html.includes('href="#main"'));
  assert.ok(html.includes('role="status"'));
});
test('report CSP is offline-only', () => {
  assert.match(TRACE_HTML_CSP, /default-src 'none'/u);
  assert.match(TRACE_HTML_CSP, /connect-src 'none'/u);
  assert.match(TRACE_HTML_CSP, /form-action 'none'/u);
});
test('HTML controls satisfy the declared 44px minimum', () => {
  assert.ok(TRACE_HTML_STYLE.includes('min-height:44px'));
  assert.ok(TRACE_HTML_STYLE.includes('min-width:44px'));
  assert.ok(TRACE_HTML_STYLE.includes(':focus-visible'));
});
test('reduced motion and print treatments are present', () => {
  assert.ok(TRACE_HTML_STYLE.includes('prefers-reduced-motion'));
  assert.ok(TRACE_HTML_STYLE.includes('@media print'));
});
test('forced-colours mode retains keyboard focus', () => {
  assert.ok(TRACE_HTML_STYLE.includes('forced-colors:active'));
});
test('JSON output parses and preserves source provenance', () => {
  const parsed = JSON.parse(report().json);
  assert.equal(parsed.schema, 'attribution-claim-report/1');
  assert.equal(parsed.trace.sources[0].permission, 'YES');
  assert.equal(parsed.trace.sources[0].datasetDate, 'UNKNOWN');
});
test('audit errors are represented in text HTML and JSON', () => {
  const output = report(release({sources: [source({permission: 'NO'})]}));
  for (const content of Object.values(output)) assert.ok(content.includes('SOURCE_PERMISSION_DENIED'));
});
test('change reports display field-level comparisons in all formats', () => {
  const before = release();
  const after = release({surfaces: [surface({targetPx: 40})]});
  const output = report(after, 'en', before);
  for (const content of Object.values(output)) assert.ok(content.includes('targetPx'));
});
test('empty audit produces explicit no-findings text', () => {
  const audit = auditClaimTrace(release());
  const html = renderClaimHtml(release(), {...audit, findings: []});
  assert.ok(html.includes('UNKNOWN'));
});
for (const language of ['en', 'fr']) {
  test(`${language} output contains the selected document and source`, () => {
    const trace = release();
    const audited = auditClaimTrace(trace);
    assert.ok(renderClaimText(trace, audited, language).includes('source-map'));
    assert.ok(renderClaimHtml(trace, audited, language).includes('claim-map'));
    assert.equal(JSON.parse(renderClaimJson(trace, audited)).trace.claims[0].id, 'claim-map');
  });
}
