import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './locale-parity-fixture.mjs';
import { comparisonText, reportText, reportHtml, reportJson, reportTsv } from './locale-parity-report.mjs';

test('human-readable text uses the selected language for titles, decisions and field separators', () => {
  const sample = fixture();
  const english = reportText(sample);
  assert.match(english, /^Bilingual notice parity report$/mu);
  assert.match(english, /^Catalog: Fictional bilingual notice catalog$/mu);
  const french = reportText(sample, 'fr');
  assert.match(french, /^Catalogue\u00a0: Fictional bilingual notice catalog$/mu);
  assert.match(french, /^Décision d’examen\u00a0: Examen requis$/mu);
  assert.match(french, /^Paires complètes\u00a0: 1\/1$/mu);
  assert.match(french, /^Français\u00a0: © OpenStreetMap contributors$/mu);
  assert.match(french, /^Aucun constat$/mu);
  assert.doesNotMatch(french, /review-needed|No findings/u);
});

test('unknown notice values and complete audit references are preserved in both formats', () => {
  const sample = fixture();
  sample.entries.pop();
  const plain = reportText(sample, 'fr');
  assert.match(plain, /Français\u00a0: UNKNOWN/u);
  assert.match(plain, /Bloquant — Entrée française manquante\u00a0: pairs\.osm-credit\.fr \[FR_ENTRY_MISSING\]/u);
  const html = reportHtml(sample, 'fr');
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<td lang="fr">UNKNOWN<\/td>/u);
  assert.match(html, /Entrée française manquante\u00a0: /u);
});

test('HTML report uses escaped content, a constrained language, and a script-free CSP', () => {
  const sample = fixture();
  sample.label = '<script> "Label"';
  const html = reportHtml(sample, 'fr" onload="x');
  assert.match(html, /<html lang="en">/u);
  assert.match(html, /&lt;script&gt; &quot;Label&quot;/u);
  assert.doesNotMatch(html, /<script\b|onload=/iu);
  assert.match(html, /default-src 'none'/u);
  const french = reportHtml(fixture(), 'fr');
  assert.match(french, /<title>Rapport de correspondance des mentions bilingues — l’App<\/title>/u);
  assert.match(french, /<th scope="col">Identifiant de la paire<\/th>/u);
  assert.match(french, /<td lang="en">© OpenStreetMap contributors<\/td>/u);
});

test('machine exports keep stable keys, identifiers and raw evidence', () => {
  const sample = fixture();
  sample.entries[0].text = '=SUM(1,2)';
  const json = JSON.parse(reportJson(sample));
  assert.equal(json.catalog.entries[0].text, '=SUM(1,2)');
  assert.ok(json.audit.findings.some(f => f.code === 'OSM_CREDIT_NOT_EXACT'));
  const tsv = reportTsv(sample);
  assert.match(tsv, /^pairId\tentryId\tlocale\tkind\ttext\tlicence\tsourceId\n/u);
  assert.ok(tsv.includes("\t'=SUM(1,2)\t"));
});

test('an empty comparison has an explicit French translation and an English default', () => {
  const before = fixture();
  const after = fixture();
  after.entries.reverse();
  assert.equal(comparisonText(before, after), 'No changes');
  assert.equal(comparisonText(before, after, 'fr'), 'Aucun changement');
});

test('change severity and field names are translated while entry IDs stay intact', () => {
  const before = fixture();
  const after = fixture();
  after.entries[0].licence = 'UNKNOWN';
  after.entries.pop();
  assert.deepEqual(comparisonText(before, after, 'fr').split('\n'), [
    'Bloquant — Entrée retirée\u00a0: entry-fr', 'Priorité élevée — Licence modifiée\u00a0: entry-en',
  ]);
  assert.deepEqual(comparisonText(before, after).split('\n'), [
    'Blocking — Entry removed: entry-fr', 'High priority — Licence changed: entry-en',
  ]);
});
