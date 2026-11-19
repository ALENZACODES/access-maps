import test from 'node:test';
import assert from 'node:assert/strict';
import { auditObligationRegister } from './obligation-audit.mjs';
import { compareObligationRegisters } from './obligation-change.mjs';
import { parseObligationRegister } from './obligation-core.mjs';
import {
  escapeObligationHtml, obligationPair, OBLIGATION_COPY,
  renderObligationText, renderObligationHtml, renderObligationJson,
  renderObligationReport,
} from './obligation-report.mjs';
import { obligation, frenchPair, source, page, placement, witness } from './obligation-fixtures.mjs';
function report(locale = 'en', input = obligation(), before = null) {
  const current = parseObligationRegister(input);
  const audit = auditObligationRegister(current);
  const comparison = before === null ? null : compareObligationRegisters(parseObligationRegister(before), current);
  return renderObligationReport(current, audit, locale, comparison);
}
test('report returns all three supported formats', () => {
  const result = report();
  assert.deepEqual(Object.keys(result), ['text', 'html', 'json']);
});
test('report returns text in English by default', () => {
  assert.match(report().text, /Attribution placement review/u);
});
test('French report heading is localised', () => {
  assert.match(report('fr').text, /Examen des mentions de source/u);
});
test('English report status shows no blocking findings', () => {
  assert.match(report().text, /No blocking findings in the submitted register/u);
});
test('French report status shows no blocking findings', () => {
  assert.match(report('fr').text, /Aucun point bloquant/u);
});
test('blocked report status appears in English', () => {
  const input = obligation();
  input.sources[0].permission = 'NO';
  assert.match(report('en', input).text, /Publication blocked/u);
});
test('blocked report status appears in French', () => {
  const input = obligation();
  input.sources[0].permission = 'NO';
  assert.match(report('fr', input).text, /Publication bloquée/u);
});
test('English text uses ASCII space before colon', () => {
  assert.ok(report('en').text.includes('Release: release-example'));
});
test('French text uses U+00A0 before colon for release', () => {
  assert.ok(report('fr').text.includes('Version\u00a0: release-example'));
});
test('French text uses U+00A0 before colon for dataset date', () => {
  assert.ok(report('fr').text.includes('Données en date du\u00a0: UNKNOWN'));
});
test('French text uses U+00A0 before colon for licence', () => {
  assert.ok(report('fr').text.includes('Licence\u00a0:'));
});
test('French text uses U+00A0 before colon for permission', () => {
  assert.ok(report('fr').text.includes('Permission\u00a0: YES'));
});
test('French text keeps typographic apostrophes', () => {
  assert.ok(report('fr').text.includes('Date d’acquisition'));
});
test('all French labels avoid straight apostrophes in contractions', () => {
  for (const value of Object.values(OBLIGATION_COPY.fr)) {
    assert.doesNotMatch(value, /\b(?:d|l|n|qu)'/u);
  }
});
test('all translations have the same keys', () => {
  assert.deepEqual(Object.keys(OBLIGATION_COPY.en), Object.keys(OBLIGATION_COPY.fr));
});
test('unknown dataset date stays UNKNOWN in both languages', () => {
  for (const locale of ['en', 'fr']) assert.match(report(locale).text, /UNKNOWN/u);
});
test('report retains licence ID as entered', () => {
  assert.match(report().text, /ODbL-1\.0/u);
});
test('report retains source URL as entered', () => {
  assert.match(report().text, /https:\/\/www\.openstreetmap\.org\/copyright/u);
});
test('report retains source acquisition date', () => {
  assert.match(report().text, /2026-01-04/u);
});
test('report retains source terms date', () => {
  assert.match(report().text, /2026-01-03/u);
});
test('report retains recorded witness identifiers', () => {
  assert.match(report().text, /osm-document/u);
});
test('report retains displayed notice element identifiers', () => {
  assert.match(report().text, /map-credit/u);
});
test('report retains page route and locale', () => {
  assert.match(report().text, /pages\/map-en\.html/u);
  assert.match(report().text, /Language: en/u);
});
test('report retains explicit page offline evidence', () => {
  assert.match(report().text, /Offline: YES/u);
});
test('report shows audit finding codes', () => {
  const input = obligation();
  input.sources[0].permission = 'UNKNOWN';
  assert.match(report('en', input).text, /PERMISSION_NOT_GRANTED/u);
});
test('report includes blocking checklist entries', () => {
  const input = obligation();
  input.sources[0].permission = 'UNKNOWN';
  assert.match(report('en', input).text, /Open actions/u);
});
test('report does not mistake unknown dataset date for block', () => {
  const result = report('en');
  const json = JSON.parse(result.json);
  assert.equal(json.audit.blocked, false);
});
test('report includes optional before/after changes', () => {
  const input = obligation();
  input.pages[0].targetPx = 43;
  assert.match(report('en', input, obligation()).text, /Changes since earlier register/u);
});
test('French report includes optional before/after change label', () => {
  const input = obligation();
  input.pages[0].targetPx = 43;
  assert.match(report('fr', input, obligation()).text, /Changements depuis/u);
});
test('text output is terminated with newline', () => {
  assert.ok(report('en').text.endsWith('\n'));
});
test('HTML output declares language en', () => {
  assert.match(report('en').html, /<html lang="en">/u);
});
test('HTML output declares language fr', () => {
  assert.match(report('fr').html, /<html lang="fr">/u);
});
test('HTML has restrictive CSP and no connection permission', () => {
  const html = report().html;
  assert.match(html, /Content-Security-Policy/u);
  assert.match(html, /connect-src &#39;none&#39;/u);
});
test('HTML contains no script tags', () => {
  assert.doesNotMatch(report().html, /<script\b/iu);
});
test('HTML contains no remote stylesheet', () => {
  assert.doesNotMatch(report().html, /<link\b/iu);
});
test('HTML has accessible main landmark', () => {
  assert.match(report().html, /<main id="main">/u);
});
test('HTML has skip link', () => {
  assert.match(report().html, /href="#main"/u);
});
test('HTML includes 44px minimum targets', () => {
  assert.match(report().html, /min-height:44px/u);
  assert.match(report().html, /min-width:44px/u);
});
test('HTML has visible focus treatment', () => {
  assert.match(report().html, /:focus-visible/u);
});
test('HTML supports reduced motion', () => {
  assert.match(report().html, /prefers-reduced-motion/u);
});
test('HTML includes source notice text', () => {
  assert.match(report().html, /OpenStreetMap contributors/u);
});
test('HTML includes page route', () => {
  assert.match(report().html, /pages\/map-en\.html/u);
});
test('HTML includes evidence tier', () => {
  assert.match(report().html, /primary/u);
});
test('HTML includes publication findings list', () => {
  assert.match(report().html, /Audit findings/u);
});
test('HTML includes before/after changes when supplied', () => {
  const after = obligation();
  after.pages[0].targetPx = 43;
  assert.match(report('en', after, obligation()).html, /Changes since earlier register/u);
});
test('HTML escapes angle brackets from source titles', () => {
  const input = obligation();
  input.sources[0].title = '<svg onload=alert(1)>';
  const html = report('en', input).html;
  assert.ok(html.includes('&lt;svg'));
  assert.ok(!html.includes('<svg'));
});
test('HTML escapes ampersands', () => {
  assert.equal(escapeObligationHtml('A&B'), 'A&amp;B');
});
test('HTML escapes quotation marks', () => {
  assert.equal(escapeObligationHtml('A"B'), 'A&quot;B');
});
test('HTML escapes straight apostrophes', () => {
  assert.equal(escapeObligationHtml("A'B"), 'A&#39;B');
});
test('HTML escapes closing tags in user notice', () => {
  const input = obligation();
  input.placements[0].notice += '</script><script>alert(1)</script>';
  const html = report('en', input).html;
  assert.ok(html.includes('&lt;/script&gt;'));
  assert.ok(!html.includes('</script>'));
});
test('HTML escapes user-supplied route text', () => {
  assert.equal(escapeObligationHtml('<route>'), '&lt;route&gt;');
});
test('HTML does not create external href to a supplied witness', () => {
  const html = report('en').html;
  assert.doesNotMatch(html, /href="https:\/\//u);
});
test('French HTML keeps unknown literal unchanged', () => {
  assert.match(report('fr').html, /UNKNOWN/u);
});
test('JSON report declares a versioned schema', () => {
  assert.equal(JSON.parse(report().json).schema, 'attribution-obligation-report/1');
});
test('JSON report includes release ID', () => {
  assert.equal(JSON.parse(report().json).releaseId, 'release-example');
});
test('JSON report preserves structured audit counts', () => {
  const data = JSON.parse(report().json);
  assert.equal(data.audit.counts.sources, 1);
  assert.equal(data.audit.counts.placements, 2);
});
test('JSON report includes a structured checklist', () => {
  const input = obligation();
  input.sources[0].permission = 'UNKNOWN';
  const data = JSON.parse(report('en', input).json);
  assert.ok(data.checklist.some(x => x.code === 'PERMISSION_NOT_GRANTED'));
});
test('JSON report includes comparison when supplied', () => {
  const after = obligation();
  after.pages[0].targetPx = 43;
  const data = JSON.parse(report('en', after, obligation()).json);
  assert.equal(data.comparison.blocked, true);
});
test('JSON report has null comparison when absent', () => {
  assert.equal(JSON.parse(report().json).comparison, null);
});
test('JSON output is terminated with newline', () => {
  assert.ok(report().json.endsWith('\n'));
});
test('direct text renderer agrees with bundled renderer', () => {
  const parsed = parseObligationRegister(obligation());
  const audit = auditObligationRegister(parsed);
  assert.equal(renderObligationText(parsed, audit), report().text);
});
test('direct HTML renderer agrees with bundled renderer', () => {
  const parsed = parseObligationRegister(obligation());
  const audit = auditObligationRegister(parsed);
  assert.equal(renderObligationHtml(parsed, audit), report().html);
});
test('direct JSON renderer agrees with bundled renderer', () => {
  const parsed = parseObligationRegister(obligation());
  const audit = auditObligationRegister(parsed);
  assert.equal(renderObligationJson(parsed, audit), report().json);
});
test('pair formatter uses no-break space in French', () => {
  assert.equal(obligationPair('fr', 'language', 'fr'), 'Langue\u00a0: fr');
});
test('pair formatter uses normal colon in English', () => {
  assert.equal(obligationPair('en', 'language', 'en'), 'Language: en');
});
test('French and English versions preserve the same record identities', () => {
  const fr = JSON.parse(report('fr', frenchPair()).json);
  const en = JSON.parse(report('en', frenchPair()).json);
  assert.equal(fr.releaseId, en.releaseId);
  assert.deepEqual(fr.audit.counts, en.audit.counts);
});
test('report never adds an invented source where none was supplied', () => {
  const input = obligation({ sources: [], placements: [], witnesses: [], pages: [] });
  const data = JSON.parse(report('en', input).json);
  assert.equal(data.audit.counts.sources, 0);
});
test('report uses explicit available witness rather than source-name guess', () => {
  const input = obligation();
  input.witnesses[0].id = 'recorded-proof';
  input.placements.forEach(x => { x.witnessIds = ['recorded-proof']; });
  assert.match(report('en', input).text, /recorded-proof/u);
});
test('all output variants contain release context', () => {
  const outputs = report('en');
  for (const variant of Object.values(outputs)) assert.ok(variant.includes('release-example'));
});
