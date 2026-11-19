import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCheckpoint, compareCheckpoints } from './checkpoint-audit.mjs';
import { CHECKPOINT_COPY, checkpointField, escapeCheckpointHtml, renderCheckpointHtml, renderCheckpointJson, renderCheckpointText } from './checkpoint-report.mjs';
import { checkpointFixture, mutatedSource, mutatedSurface } from './checkpoint-fixtures.mjs';
function report(locale, input = checkpointFixture()) {
  const audit = auditCheckpoint(input);
  return { html: renderCheckpointHtml(input, audit, locale), json: renderCheckpointJson(input, audit), text: renderCheckpointText(input, audit, locale), audit };
}
test('both language catalogues share every key', () => {
  assert.deepEqual(Object.keys(CHECKPOINT_COPY.en), Object.keys(CHECKPOINT_COPY.fr));
});
test('French labels use the required no-break space before colons', () => {
  assert.equal(checkpointField('fr', 'data', 'UNKNOWN'), 'Données en date du\u00a0: UNKNOWN');
  assert.equal(checkpointField('en', 'data', 'UNKNOWN'), 'Dataset date: UNKNOWN');
});
test('French text preserves UNKNOWN literally', () => {
  const output = report('fr').text;
  assert.ok(output.includes('Données en date du\u00a0: UNKNOWN'));
  assert.ok(!output.includes('Données en date du:'));
});
test('English text uses the App-neutral terminology', () => {
  const output = report('en').text;
  assert.ok(output.includes('Source and licence checkpoint'));
  assert.ok(output.includes('Source: https://example.org/data'));
  assert.ok(output.includes('Evidence URL:'));
});
test('renderers preserve recorded source and licence rather than inferring rights', () => {
  const source = mutatedSource({ licenceName: 'Recorded terms text', permission: 'UNKNOWN' });
  const output = report('en', source).text;
  assert.ok(output.includes('Recorded terms text'));
  assert.ok(output.includes('Permission: UNKNOWN'));
});
test('HTML report includes all required document landmarks', () => {
  const html = report('en').html;
  for (const pattern of ['<html lang="en">', '<main id="main">', 'href="#main"', 'name="viewport"', 'Content-Security-Policy']) assert.ok(html.includes(pattern), pattern);
});
test('HTML report CSP blocks scripts, network, objects and forms', () => {
  const html = report('fr').html;
  for (const rule of ["default-src 'none'", "connect-src 'none'", "script-src 'none'", "object-src 'none'", "form-action 'none'"]) assert.ok(html.includes(rule));
});
test('HTML has keyboard focus and 44px clickable links', () => {
  const html = report('en').html;
  assert.ok(html.includes('min-width:44px'));
  assert.ok(html.includes('min-height:44px'));
  assert.ok(html.includes(':focus-visible'));
});
test('HTML escapes angle brackets and quotes in fields', () => {
  const input = mutatedSource({ name: '<script>bad</script>', notice: 'Attribution <b>test</b> & "text"' });
  const html = report('en', input).html;
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(html.includes('&amp; &quot;text&quot;'));
  assert.ok(!html.includes('<script>bad</script>'));
});
test('HTML escapes apostrophes', () => assert.equal(escapeCheckpointHtml(`'"<&>`), '&#39;&quot;&lt;&amp;&gt;'));
test('HTML French language metadata and labels are correct', () => {
  const html = report('fr').html;
  assert.ok(html.includes('<html lang="fr">'));
  assert.ok(html.includes('Examen des sources et des licences'));
});
test('blocking audit appears in all formats', () => {
  const output = report('en', mutatedSource({ permission: 'UNKNOWN' }));
  assert.equal(output.audit.blocked, true);
  assert.ok(output.html.includes('Publication blocked'));
  assert.ok(output.text.includes('Publication blocked'));
  assert.equal(JSON.parse(output.json).blocked, true);
});
test('clean release does not claim external conditions', () => {
  const output = report('en');
  assert.ok(output.text.includes('does not assess any place or route'));
  assert.ok(output.html.includes('does not assess any place or route'));
});
test('structured JSON keeps source and surface records', () => {
  const value = JSON.parse(report('en').json);
  assert.equal(value.schema, 'attribution-checkpoint-report/1');
  assert.equal(value.sources[0].id, 'sample-source');
  assert.equal(value.surfaces[0].id, 'sample-view');
  assert.equal(value.sources[0].datasetDate, 'UNKNOWN');
});
test('report includes before/after comparison in all outputs', () => {
  const after = mutatedSurface({ targetPx: 43 });
  const audit = auditCheckpoint(after);
  const change = compareCheckpoints(checkpointFixture(), after);
  assert.ok(renderCheckpointText(after, audit, 'en', change).includes('SURFACE_TARGETPX'));
  assert.ok(renderCheckpointHtml(after, audit, 'en', change).includes('SURFACE_TARGETPX'));
  assert.ok(renderCheckpointJson(after, audit, change).includes('SURFACE_TARGETPX'));
});
test('no-change comparison displays an explicit empty state', () => {
  const input = checkpointFixture();
  const audit = auditCheckpoint(input);
  const comparison = compareCheckpoints(input, input);
  assert.ok(renderCheckpointText(input, audit, 'en', comparison).includes('No changes'));
  assert.ok(renderCheckpointHtml(input, audit, 'fr', comparison).includes('Aucun changement'));
});
test('unknown target is not converted to 0', () => {
  const output = report('en', mutatedSurface({ targetPx: 'UNKNOWN' }));
  assert.ok(output.text.includes('UNKNOWN px'));
  assert.ok(output.json.includes('"targetPx": "UNKNOWN"'));
});
test('HTML does not embed remote images or scripts', () => {
  const html = report('en').html;
  assert.ok(!/<script\b/u.test(html));
  assert.ok(!/<img\b/u.test(html));
});
test('report shows licence URLs as links without adding network requests', () => {
  const html = report('en').html;
  assert.ok(html.includes('href="https://example.org/terms"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});
test('reporting is deterministic for identical inputs', () => {
  assert.deepEqual(report('fr'), report('fr'));
});
