import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, labelLine, statusText, renderHandoffText, renderHandoffHtml,
  renderHandoffJson, renderHandoffReport, reportFilename, REPORT_COPY } from './handoff-report.mjs';
import { auditHandoffPack } from './handoff-audit.mjs';
import { compareHandoffPacks } from './handoff-change.mjs';
import { pack, source, handoff } from './handoff-fixtures.mjs';
const fixture = pack();
const audit = auditHandoffPack(fixture);
test('HTML escapes all five significant markup characters', () => assert.equal(escapeHtml('<>&"\''), '&lt;&gt;&amp;&quot;&#39;'));
test('English labels use an ordinary colon', () => assert.equal(labelLine('Source', 'X', 'en'), 'Source: X'));
test('French labels use U+00A0 before colon', () => assert.equal(labelLine('Langue', 'fr', 'fr'), 'Langue\u00a0: fr'));
test('French dataset label uses nonbreaking space', () => assert.ok(renderHandoffText(fixture,audit,'fr').includes('Données en date du\u00a0: UNKNOWN')));
test('English title present in text report', () => assert.ok(renderHandoffText(fixture,audit).includes('Attribution handoff audit')));
test('French title present in text report', () => assert.ok(renderHandoffText(fixture,audit,'fr').includes('Examen des transmissions de sources')));
test('report includes release ID', () => assert.ok(renderHandoffText(fixture,audit).includes(fixture.releaseId)));
test('report includes source URL', () => assert.ok(renderHandoffText(fixture,audit).includes(fixture.sources[0].sourceUrl)));
test('report includes licence URL', () => assert.ok(renderHandoffText(fixture,audit).includes(fixture.sources[0].licenceUrl)));
test('report includes evidence URL', () => assert.ok(renderHandoffText(fixture,audit).includes(fixture.sources[0].evidenceUrl)));
test('report includes permission evidence', () => assert.ok(renderHandoffText(fixture,audit).includes('Permission: YES')));
test('report includes evidence tier', () => assert.ok(renderHandoffText(fixture,audit).includes('Evidence tier: primary')));
test('report includes UNKNOWN dataset date', () => assert.ok(renderHandoffText(fixture,audit).includes('Dataset date: UNKNOWN')));
test('report includes recorded terms date', () => assert.ok(renderHandoffText(fixture,audit).includes('2026-01-08')));
test('report includes attribution notice', () => assert.ok(renderHandoffText(fixture,audit).includes('© OpenStreetMap contributors')));
test('report includes delivery digest', () => assert.ok(renderHandoffText(fixture,audit).includes('a'.repeat(64))));
test('report includes approval date', () => assert.ok(renderHandoffText(fixture,audit).includes('2026-01-10')));
test('report includes expiry date', () => assert.ok(renderHandoffText(fixture,audit).includes('2027-01-10')));
test('report includes explicit recipient', () => assert.ok(renderHandoffText(fixture,audit).includes('local-device')));
test('report includes explicit purpose', () => assert.ok(renderHandoffText(fixture,audit).includes('Review source notices offline')));
test('report includes policy purpose translation', () => assert.ok(renderHandoffText(fixture,audit,'fr').includes('Consulter les sources')));
test('report includes a findings section', () => assert.ok(renderHandoffText(fixture,audit).includes('Findings')));
test('no findings copy appears on an empty finding list', () => {
  const empty = {...audit,findings:[]};
  assert.ok(renderHandoffText(fixture,empty).includes('No findings'));
});
test('blocking state appears in text report', () => {
  const blocked = auditHandoffPack(pack({sources:[source({permission:'NO'})]}));
  assert.ok(renderHandoffText(fixture,blocked).includes('Publication blocked'));
});
test('report changes include field names', () => {
  const next=pack({handoffs:[handoff({purpose:'Updated documentation purpose'})]});
  const comparison=compareHandoffPacks(fixture,next);
  assert.ok(renderHandoffText(next,auditHandoffPack(next),'en',comparison).includes('purpose'));
});
test('report changes include previous value', () => {
  const next=pack({handoffs:[handoff({purpose:'Updated documentation purpose'})]});
  const comparison=compareHandoffPacks(fixture,next);
  assert.ok(renderHandoffText(next,auditHandoffPack(next),'en',comparison).includes('Review source notices offline'));
});
test('HTML report is standalone', () => assert.ok(renderHandoffHtml(fixture,audit).startsWith('<!doctype html>')));
test('HTML report declares lang=en', () => assert.ok(renderHandoffHtml(fixture,audit).includes('lang="en"')));
test('French HTML report declares lang=fr', () => assert.ok(renderHandoffHtml(fixture,audit,'fr').includes('lang="fr"')));
test('HTML CSP disallows network connections', () => assert.ok(renderHandoffHtml(fixture,audit).includes('connect-src &#39;none&#39;') || renderHandoffHtml(fixture,audit).includes("connect-src 'none'")));
test('HTML CSP disallows scripts', () => assert.ok(renderHandoffHtml(fixture,audit).includes("script-src 'none'")));
test('HTML report contains no script element', () => assert.doesNotMatch(renderHandoffHtml(fixture,audit), /<script\b/iu));
test('HTML report contains a main landmark', () => assert.ok(renderHandoffHtml(fixture,audit).includes('<main id="main">')));
test('HTML report contains skip link', () => assert.ok(renderHandoffHtml(fixture,audit).includes('href="#main"')));
test('HTML report contains source URLs as guarded links', () => assert.ok(renderHandoffHtml(fixture,audit).includes('rel="noopener noreferrer"')));
test('HTML report contains a 44px control dimension', () => assert.ok(renderHandoffHtml(fixture,audit).includes('min-height:44px')));
test('HTML report contains visible focus styling', () => assert.ok(renderHandoffHtml(fixture,audit).includes(':focus-visible')));
test('HTML report contains reduced-motion styling', () => assert.ok(renderHandoffHtml(fixture,audit).includes('prefers-reduced-motion')));
test('HTML report uses no external stylesheets', () => assert.doesNotMatch(renderHandoffHtml(fixture,audit), /<link\b/iu));
test('HTML report escapes malicious source titles', () => {
  const withAttack = pack({sources:[source({name:'<img src=x onerror=alert(1)>'})]});
  const html=renderHandoffHtml(withAttack,auditHandoffPack(withAttack));
  assert.ok(html.includes('&lt;img'));
  assert.doesNotMatch(html, /<img\b/iu);
});
test('HTML report escapes malicious source text', () => {
  const withAttack = pack({sources:[source({notice:'© OpenStreetMap contributors <script>alert(1)</script>'})]});
  const html=renderHandoffHtml(withAttack,auditHandoffPack(withAttack));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.doesNotMatch(html, /<script\b/iu);
});
test('HTML report includes comparison results', () => {
  const next=pack({sources:[source({name:'Edited source'})]});
  const comparison=compareHandoffPacks(fixture,next);
  assert.ok(renderHandoffHtml(next,auditHandoffPack(next),'en',comparison).includes('Changes from previous release'));
});
test('JSON report uses stable schema', () => {
  const output=JSON.parse(renderHandoffJson(fixture,audit));
  assert.equal(output.schema,'attribution-handoff-report/1');
});
test('JSON report exposes input and audit', () => {
  const output=JSON.parse(renderHandoffJson(fixture,audit));
  assert.equal(output.pack.releaseId,fixture.releaseId);
  assert.equal(output.audit.blocked,audit.blocked);
});
test('JSON report preserves UNKNOWN', () => {
  assert.equal(JSON.parse(renderHandoffJson(fixture,audit)).pack.sources[0].datasetDate,'UNKNOWN');
});
test('JSON comparison can be omitted', () => assert.equal(JSON.parse(renderHandoffJson(fixture,audit)).comparison,null));
test('report object has all three output formats', () => {
  const report=renderHandoffReport(fixture,audit);
  assert.deepEqual(Object.keys(report).sort(),['html','json','text']);
});
test('output filenames are locale-scoped', () => assert.equal(reportFilename('fr','json'),'attribution-handoff-fr.json'));
test('text export has .txt suffix', () => assert.equal(reportFilename('en','text'),'attribution-handoff-en.txt'));
test('labels exist in both languages', () => assert.deepEqual(Object.keys(REPORT_COPY.en).sort(),Object.keys(REPORT_COPY.fr).sort()));
test('English success copy does not make location claims', () => assert.ok(statusText(audit,'en').includes('supplied records')));
test('French success copy does not assert external conditions', () => assert.ok(statusText(audit,'fr').includes('renseignements')));
