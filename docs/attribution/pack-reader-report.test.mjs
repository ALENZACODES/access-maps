import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
  METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, SOURCES,
} from './attribution-utils.mjs';
import { exampleManifestText } from './pack-reader-example.mjs';
import { readPack, selectCoverage } from './pack-reader-model.mjs';
import { coverageText, issueText, sourceNotices } from './pack-reader-report.mjs';

const sourceIds = ['gtfs-ltc', 'metrolinx-go', 'metrolinx-up', 'osm-ontario'];
const pack = () => readPack(exampleManifestText());

test('the example is a four-part pack excerpt with complete attribution declarations', () => {
  const example = JSON.parse(exampleManifestText());
  assert.match(example.sourceCommit, /^[a-f0-9]{40}$/u);
  assert.equal(example.version, 1);
  assert.equal(example.sources.length, 4);
  assert.deepEqual(example.sources.map(s => s.sourceId).sort(), sourceIds);
  assert.equal(new Set(example.sources.map(s => s.retrieved)).size, 2);
  assert.ok(example.sources.every(s => s.licence && s.attribution && s.inWebPack));
  assert.ok(example.sources.every(s => !Object.hasOwn(s, 'notes')));
  const all = selectCoverage(pack());
  assert.equal(all.partCount, 4);
  assert.equal(all.recordCount, 1910);
  assert.equal(all.withheldCount, 0);
  assert.deepEqual(all.issues, []);
  assert.deepEqual(all.rows.map(r => r.sourceId).sort(), sourceIds);
  assert.ok(all.rows.every(r => r.tier === 'UNKNOWN'));
});

test('the London excerpt and the Toronto transit excerpt are disjoint and retain feed identities', () => {
  const sample = pack();
  const london = selectCoverage(sample, 'london', 'transit');
  const toronto = selectCoverage(sample, 'toronto', 'transit');
  assert.deepEqual(london.rows.map(r => [r.sourceId, r.recordCount]), [['gtfs-ltc', 588]]);
  assert.deepEqual(toronto.rows.map(r => [r.sourceId, r.recordCount]).sort(),
    [['metrolinx-go', 201], ['metrolinx-up', 3]]);
  assert.equal(selectCoverage(sample, 'london', 'washroom').rows.length, 0);
  assert.equal(selectCoverage(sample, '', 'washroom').recordCount, 1118);
});

test('export scope, totals and source identities agree with the actual filtered pack', () => {
  const view = selectCoverage(pack(), 'toronto', 'transit');
  const out = coverageText(view, 'en', 'Toronto', 'Transit');
  assert.ok(out.startsWith('Sources in the selected map files\n'));
  for (const line of [
    'Region: Toronto', 'Data type: Transit', 'Included files: 2', 'Listed records: 204',
    'Source identifier: metrolinx-go', 'Source identifier: metrolinx-up',
    'Evidence tier: UNKNOWN', 'Retrieved on: 2026-11-15',
  ]) assert.ok(out.split('\n').includes(line), line);
  assert.doesNotMatch(out, /gtfs-ltc|osm-ontario|OpenStreetMap/u);
  assert.ok(out.endsWith('\n'));
  assert.doesNotMatch(out, /undefined|\[object Object\]/u);
});

test('bilingual reports preserve the literal OSM credit on its own line', () => {
  const view = selectCoverage(pack(), 'toronto', 'washroom');
  for (const locale of ['en', 'fr']) {
    const out = coverageText(view, locale, 'Toronto', locale === 'en' ? 'Washrooms' : 'Toilettes');
    assert.deepEqual(out.split('\n').filter(line => line === '© OpenStreetMap contributors'),
      ['© OpenStreetMap contributors']);
    assert.ok(out.split('\n').includes(SOURCES.osm.licenceUrl));
    assert.equal(out.includes(METROLINX_AUA_LEGEND), false);
  }
});

test('French report field labels use a nonbreaking space before each colon', () => {
  const out = coverageText(selectCoverage(pack()), 'fr', 'Tout le lot', 'Tous les types');
  assert.match(out, /^Région : Tout le lot$/mu);
  assert.match(out, /^Niveau de preuve : UNKNOWN$/mu);
  const fieldLines = out.split('\n').filter(line => /^[\p{L}][^:]{1,65}:/u.test(line) && !line.startsWith('https:'));
  assert.ok(fieldLines.length > 16);
  for (const line of fieldLines) assert.ok(line.includes(' : '), line);
});

test('GO and UP each retain both exact English terms statements and both language notices', () => {
  for (const sourceId of ['metrolinx-go', 'metrolinx-up']) {
    for (const locale of ['en', 'fr']) {
      const notices = sourceNotices({sourceId, partCount: 1, attribution: 'UNKNOWN'}, locale);
      const en = notices.filter(n => n.lang === 'en').map(n => n.text);
      for (const line of [METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, METROLINX_AUA_END_USER_LAWS_EN]) {
        assert.ok(en.includes(line));
      }
      assert.ok(notices.some(n => n.lang === 'fr' && n.text === METROLINX_AUA_END_USER_LAWS_FR));
      assert.deepEqual(notices.flatMap(n => n.href ? [n.href] : []),
        [SOURCES.metrolinx.sourceUrl, SOURCES.metrolinx.licenceUrl]);
    }
  }
});

test('LTC notice preserves the registry wording, French punctuation and official terms address', () => {
  const view = selectCoverage(pack(), 'london', 'transit');
  const [row] = view.rows;
  const notices = sourceNotices(row, 'fr');
  assert.deepEqual(notices.map(n => n.lang), ['en', 'fr', 'fr']);
  assert.ok(notices[1].text.includes('London :'));
  assert.ok(notices[1].text.includes('conditions d’utilisation.'));
  assert.equal(notices[2].href, SOURCES.ltc.licenceUrl);
  const original = JSON.parse(exampleManifestText()).sources.find(s => s.sourceId === 'gtfs-ltc');
  assert.ok(original.attribution.includes(notices[0].text));
  assert.ok(original.attribution.includes(notices[1].text));
});

test('a missing source notice cannot be mistaken for the text in a loaded file', () => {
  const example = JSON.parse(exampleManifestText());
  const osm = example.sources.find(s => s.sourceId === 'osm-ontario');
  osm.attribution = 'Different line';
  const view = selectCoverage(readPack(JSON.stringify(example)), 'toronto', 'washroom');
  const out = coverageText(view, 'en', 'Toronto', 'Washrooms');
  assert.ok(out.includes(issueText('notice-mismatch', 'en')));
  assert.match(out, /^© OpenStreetMap contributors$/mu);
  assert.doesNotMatch(out, /Different line/u);
});

test('catalogue source links depend only on the exact source ID', () => {
  const unknown = {sourceId: 'not-metrolinx-go', attribution: 'https://example.invalid/terms', partCount: 2};
  assert.deepEqual(sourceNotices(unknown, 'en'), [{ text: unknown.attribution, lang: 'und' }]);
  const withNoAttribution = {...unknown, attribution: ''};
  assert.deepEqual(sourceNotices(withNoAttribution, 'fr'), [{text: 'UNKNOWN', lang: 'und'}]);
  const unsafe = {...unknown, sourceId: 'osm-ontario'};
  assert.ok(sourceNotices(unsafe, 'en').every(n => n.href === undefined || n.href === SOURCES.osm.licenceUrl));
});

test('held-only selections give the withheld count without attributing displayed records to the source', () => {
  const example = JSON.parse(exampleManifestText());
  const ltc = example.tranches.transit.cells['n43.0_w081.5'];
  const [part] = ltc.parts.splice(0);
  example.withheld.push({ path: part.path, sourceId: part.sourceId, tranche: 'transit', cell: 'n43.0_w081.5', reason: 'file omitted' });
  example.counts.records -= part.count;
  example.counts.bySource[part.sourceId] = 0;
  example.counts.byTranche.transit -= part.count;
  const view = selectCoverage(readPack(JSON.stringify(example)), 'london', 'transit');
  const out = coverageText(view, 'en', 'London', 'Transit');
  assert.equal(view.withheldCount, 1);
  assert.equal(view.partCount, 0);
  assert.equal(view.rows.length, 1);
  assert.doesNotMatch(out, /Transit data is available from London/u);
  assert.match(out, /^Withheld files in this selection: 1$/mu);
});

test('empty selections retain zero and the selection context in both languages', () => {
  const view = selectCoverage(pack(), 'london', 'path');
  assert.equal(view.rows.length, 0);
  const en = coverageText(view, 'en', 'London', 'Paths');
  const fr = coverageText(view, 'fr', 'London', 'Chemins');
  assert.match(en, /No source rows match this selection/u);
  assert.match(fr, /Aucune source ne correspond à cette sélection/u);
  assert.match(en, /^Included files: 0$/mu);
  assert.match(fr, /^Fichiers inclus : 0$/mu);
  assert.doesNotMatch(en + fr, /© OpenStreetMap/u);
});

test('every model issue has distinct actionable wording in each language', () => {
  const codes = ['metadata-gap', 'licence-mismatch', 'notice-mismatch', 'missing-source', 'held-source',
    'duplicate-part', 'conflicting-part', 'withheld-conflict', 'count-mismatch'];
  for (const locale of ['en', 'fr']) {
    const all = codes.map(code => issueText(code, locale));
    assert.equal(new Set(all).size, codes.length);
    assert.ok(all.every(label => label !== issueText('future-issue', locale)));
    assert.ok(all.every(label => !/undefined|vérif|verify/iu.test(label)));
  }
  assert.doesNotMatch(issueText('__proto__', 'fr'), /__proto__|undefined/u);
});
