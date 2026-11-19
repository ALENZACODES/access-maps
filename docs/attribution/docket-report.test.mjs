import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocket } from './docket-core.mjs';
import { auditDocket } from './docket-audit.mjs';
import { compareDockets } from './docket-change.mjs';
import { renderDocketText, renderDocketHtml, renderDocketJson, COPY } from './docket-report.mjs';
import { fixtureDocket, fixtureSource, fixtureEvidence, fixtureSurface } from './docket-fixtures.mjs';

const dossier = (value = fixtureDocket()) => {
  const docket = parseDocket(value);
  return { docket, audit: auditDocket(docket) };
};
test('both message catalogues contain identical keys', () => {
  assert.deepEqual(Object.keys(COPY.en).sort(), Object.keys(COPY.fr).sort());
});
test('all English and French message values are nonempty strings', () => {
  for (const locale of ['en', 'fr']) {
    for (const [key, value] of Object.entries(COPY[locale])) {
      assert.equal(typeof value, 'string', key);
      assert.ok(value.trim().length > 0, key);
    }
  }
});
test('French copy uses typographic apostrophe where needed', () => {
  assert.ok(COPY.fr.acquired.includes('’'));
});
test('text report records no invented dataset date', () => {
  const { docket, audit } = dossier();
  const text = renderDocketText(docket, audit, 'en');
  assert.match(text, /Dataset date: UNKNOWN/u);
});
test('text report includes source and licence URL', () => {
  const { docket, audit } = dossier();
  const text = renderDocketText(docket, audit, 'en');
  assert.ok(text.includes(docket.sources[0].sourceUrl));
  assert.ok(text.includes(docket.sources[0].licenceUrl));
});
test('text report includes recorded recheck deadline', () => {
  const { docket, audit } = dossier();
  assert.match(renderDocketText(docket, audit), /Review due on: 2026-12-10/u);
});
test('text report carries nonbreaking French colon spacing', () => {
  const { docket, audit } = dossier();
  const text = renderDocketText(docket, audit, 'fr');
  for (const label of ['Version', 'Données en date du', 'Niveau de preuve', 'Licence']) {
    assert.ok(text.includes(`${label}\u00a0:`), label);
  }
});
test('French text has no ordinary space before colon on tested labels', () => {
  const { docket, audit } = dossier();
  const text = renderDocketText(docket, audit, 'fr');
  assert.doesNotMatch(text, /Données en date du :/u);
});
test('French report retains literal UNKNOWN', () => {
  const { docket, audit } = dossier();
  assert.match(renderDocketText(docket, audit, 'fr'), /UNKNOWN/u);
});
test('text output ends with newline', () => {
  const { docket, audit } = dossier();
  assert.ok(renderDocketText(docket, audit).endsWith('\n'));
});
test('text report includes all recorded source notices', () => {
  const { docket, audit } = dossier();
  assert.ok(renderDocketText(docket, audit).includes(docket.sources[0].notice));
});
test('text report carries evidence totals and decision count', () => {
  const { docket, audit } = dossier();
  const text = renderDocketText(docket, audit);
  assert.match(text, /Evidence records: 1/u);
  assert.match(text, /Decisions: 1/u);
});
test('blocked text contains explicit blocker codes', () => {
  const { docket, audit } = dossier(fixtureDocket({ sources: [fixtureSource({ permission: 'UNKNOWN' })] }));
  const text = renderDocketText(docket, audit);
  assert.match(text, /PERMISSION_NOT_YES/u);
  assert.match(text, /Publication blocked/u);
});
test('comparison text has before and after values', () => {
  const before = parseDocket(fixtureDocket());
  const after = parseDocket(fixtureDocket({ sources: [fixtureSource({ permission: 'NO' })] }));
  const audit = auditDocket(after);
  const text = renderDocketText(after, audit, 'en', compareDockets(before, after));
  assert.match(text, /Before=YES \| After=NO/u);
});
test('comparison with no changes has clear none label', () => {
  const { docket, audit } = dossier();
  assert.match(renderDocketText(docket, audit, 'fr', compareDockets(docket, docket)), /Aucun/u);
});
test('HTML report has EN document language', () => {
  const { docket, audit } = dossier();
  assert.match(renderDocketHtml(docket, audit, 'en'), /<html lang="en">/u);
});
test('HTML report has FR document language', () => {
  const { docket, audit } = dossier();
  assert.match(renderDocketHtml(docket, audit, 'fr'), /<html lang="fr">/u);
});
test('HTML report includes strict offline CSP', () => {
  const { docket, audit } = dossier();
  const html = renderDocketHtml(docket, audit);
  for (const directive of ["default-src 'none'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
});
test('HTML report does not load remote scripts, fonts or tiles', () => {
  const { docket, audit } = dossier();
  const html = renderDocketHtml(docket, audit);
  assert.doesNotMatch(html, /<script\b/u);
  assert.doesNotMatch(html, /@import/u);
  assert.doesNotMatch(html, /<iframe\b/u);
});
test('HTML report has skip link and landmarks', () => {
  const { docket, audit } = dossier();
  const html = renderDocketHtml(docket, audit);
  assert.match(html, /href="#main"/u);
  assert.match(html, /<main id="main">/u);
  assert.match(html, /<nav aria-label=/u);
});
test('HTML report declares 44px links and visible focus', () => {
  const { docket, audit } = dossier();
  const html = renderDocketHtml(docket, audit);
  assert.match(html, /min-height:44px/u);
  assert.match(html, /min-width:44px/u);
  assert.match(html, /:focus-visible/u);
});
test('HTML report includes reduced motion support', () => {
  const { docket, audit } = dossier();
  assert.match(renderDocketHtml(docket, audit), /prefers-reduced-motion/u);
});
test('HTML report includes forced-colours support', () => {
  const { docket, audit } = dossier();
  assert.match(renderDocketHtml(docket, audit), /forced-colors:active/u);
});
test('HTML report escapes content from record titles', () => {
  const { docket, audit } = dossier(fixtureDocket({ sources: [fixtureSource({ name: '<img src=x onerror=alert(1)>' })] }));
  const html = renderDocketHtml(docket, audit);
  assert.match(html, /&lt;img/u);
  assert.doesNotMatch(html, /<img src=x/u);
});
test('HTML report escapes quotes inside recorded source names', () => {
  const { docket, audit } = dossier(fixtureDocket({ sources: [fixtureSource({ name: '"unsafe" name' })] }));
  const html = renderDocketHtml(docket, audit);
  assert.match(html, /&quot;unsafe&quot;/u);
});
test('HTML report escapes multiline notices rather than interpolating markup', () => {
  const { docket, audit } = dossier(fixtureDocket({ sources: [fixtureSource({ notice: '<script>alert(1)</script>' })] }));
  const html = renderDocketHtml(docket, audit);
  assert.match(html, /&lt;script&gt;/u);
  assert.doesNotMatch(html, /<script>alert/u);
});
test('HTML report includes explicit change descriptions', () => {
  const before = parseDocket(fixtureDocket());
  const after = parseDocket(fixtureDocket({ sources: [fixtureSource({ permission: 'NO' })] }));
  const html = renderDocketHtml(after, auditDocket(after), 'fr', compareDockets(before, after));
  assert.ok(html.includes('permission'));
  assert.ok(html.includes('Changements'));
});
test('HTML report preserves French NBSP before labelled colons', () => {
  const { docket, audit } = dossier();
  const html = renderDocketHtml(docket, audit, 'fr');
  assert.ok(html.includes('Version\u00a0:'));
});
test('JSON output follows stable machine schema', () => {
  const { docket, audit } = dossier();
  const out = JSON.parse(renderDocketJson(docket, audit));
  assert.equal(out.schema, 'attribution-docket-report/1');
  assert.equal(out.releaseId, 'release-one');
});
test('JSON output preserves every source evidence link', () => {
  const { docket, audit } = dossier();
  const out = JSON.parse(renderDocketJson(docket, audit));
  assert.deepEqual(out.docket.sources[0].evidenceIds, ['osm-proof']);
});
test('JSON report includes blocking status and findings', () => {
  const { docket, audit } = dossier(fixtureDocket({ sources: [fixtureSource({ permission: 'NO' })] }));
  const out = JSON.parse(renderDocketJson(docket, audit));
  assert.equal(out.blocked, true);
  assert.ok(out.audit.findings.some((f) => f.code === 'PERMISSION_NOT_YES'));
});
test('JSON comparison roundtrips unchanged identities', () => {
  const { docket, audit } = dossier();
  const out = JSON.parse(renderDocketJson(docket, audit, compareDockets(docket, docket)));
  assert.deepEqual(out.comparison.changes, []);
});
test('JSON reports do not alter source dates or content', () => {
  const { docket, audit } = dossier();
  const baseline = JSON.stringify(docket);
  renderDocketText(docket, audit); renderDocketHtml(docket, audit); renderDocketJson(docket, audit);
  assert.equal(JSON.stringify(docket), baseline);
});
test('missing report fields leave UNKNOWN visible', () => {
  const { docket, audit } = dossier(fixtureDocket({ evidence: [fixtureEvidence({ observedOn: 'UNKNOWN' })] }));
  assert.match(renderDocketJson(docket, audit), /UNKNOWN/u);
});
test('HTML report represents empty source list safely', () => {
  const { docket, audit } = dossier(fixtureDocket({ sources: [] }));
  const html = renderDocketHtml(docket, audit);
  assert.match(html, /Publication blocked/u);
});
test('HTML report represents empty view list safely', () => {
  const { docket, audit } = dossier(fixtureDocket({ surfaces: [] }));
  const html = renderDocketHtml(docket, audit);
  assert.ok(html.includes('UNKNOWN'));
});
