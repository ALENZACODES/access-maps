// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import { openTileArchive } from './tile-notice-archive.mjs';
import { testArchive } from './tile-notice-archive-fixture.mjs';
import { makeVectorTile } from './tile-notice-fixture.mjs';
import { parseTileSources, joinTileSources, parseSourceRegistry } from './tile-notice-sources.mjs';
import { localizedLabel } from './tile-notice-labels.mjs';
import { tileReport } from './tile-notice-report.mjs';

const pos = {z: 0, x: 0, y: 0};

/** @param {string} id @param {string} [credit] */
function source(id, credit = '© source record') {
  return {id, name: 'sample label', licence_id: 'terms-id', attribution: credit, retrieved_at: '2024-02-29', tier: 0};
}

/**
 * @param {Parameters<typeof makeVectorTile>[0]} layers
 * @param {ReturnType<typeof source>[] | null} [sources]
 * @param {string} [notice]
 */
async function sample(layers, sources = null, notice = '© archive notice') {
  const payload = makeVectorTile(layers);
  const bytes = testArchive({
    tiles: [{...pos, bytes:payload}],
    metadata: {name: 'Local sample', attribution: notice},
  });
  const archive = await openTileArchive(new Blob([bytes]));
  const tileBytes = await archive.readTile(0,0,0);
  assert.ok(tileBytes);
  const tile = parseTileSources(tileBytes);
  const registry = sources ? parseSourceRegistry(JSON.stringify({sources})) : null;
  return {archive, position:pos, tile, rows: joinTileSources(tile, registry), hasRegistry: registry !== null};
}

test('a matched source exports the exact credits and four separate provenance fields', async () => {
  const notice = '© A. B. — note :  source';
  const credit = '© A. B. — texte « intact »';
  const state = await sample([{name:'points',features:[{source_id:'s1'}]}], [source('s1',credit)], notice);
  const blob = tileReport(state,'fr');
  assert.equal(blob.type, 'text/plain;charset=utf-8');
  const report = await blob.text();
  for (const part of [
    'Mention enregistrée dans l’archive\u00a0: '+notice, 'Identifiant de source\u00a0: s1',
    'Mention du registre\u00a0: '+credit, 'Licence\u00a0: terms-id',
    'Date de collecte\u00a0: 2024-02-29', 'Niveau de preuve\u00a0: 0',
  ]) assert.ok(report.includes(part), part);
});

test('unregistered ID and absent registry yield different reports and retain UNKNOWN', async () => {
  const layer = {name:'points',features:[{source_id:'outside'}]};
  const supplied = await tileReport(await sample([layer], []), 'en').text();
  const missing = await tileReport(await sample([layer]), 'en').text();
  assert.match(supplied, /Local registry supplied: Yes/);
  assert.match(supplied, /no entry in the selected registry/);
  assert.match(missing, /Local registry supplied: No/);
  assert.match(missing, /Open a source registry/);
  for (const report of [supplied, missing]) {
    assert.ok(report.includes('Source ID: outside'));
    assert.ok(report.includes('Licence: UNKNOWN'));
    assert.ok(report.includes('Retrieval date: UNKNOWN'));
    assert.ok(report.includes('Evidence tier: UNKNOWN'));
  }
});

test('missing source IDs keep their count and cannot acquire another entry’s credit', async () => {
  const state = await sample([{name:'layer', features:[{}, {other:'s-1'}]}], [source('s-1','unused credit')]);
  const report = await tileReport(state, 'en').text();
  assert.match(report, /Source ID: UNKNOWN\n  Encoded features: 2/);
  assert.match(report, /no usable source ID/);
  assert.doesNotMatch(report, /unused credit/);
});

test('the same source across layers has one evidence entry and two independent counts', async () => {
  const state = await sample([
    {name:'a', features:[{source_id:'s'}, {source_id:'s'}]},
    {name:'b', features:[{source_id:'s'}]},
  ], [source('s', 'one reference')]);
  const report = await tileReport(state, 'en').text();
  assert.match(report, /Layer: a\n\[1\] Source ID: s\n  Encoded features: 2/);
  assert.match(report, /Layer: b\n\[1\] Source ID: s\n  Encoded features: 1/);
  assert.equal(report.match(/Registry attribution: one reference/g)?.length, 1);
  assert.equal(report.match(/Source details/g)?.length, 1);
  assert.match(report, /Encoded features: 3\nLayers in this tile: 2/);
});

test('an absent tile omits counts while a present empty layer keeps its recorded name', async () => {
  const state = await sample([{name:'without-features', features:[]}]);
  const present = await tileReport(state, 'en').text();
  const absent = await tileReport({...state, tile:null}, 'en').text();
  assert.match(present, /Encoded features: 0\nLayers in this tile: 1/);
  assert.match(present, /Layer: without-features\nNo features encoded/);
  assert.match(absent, /no tile at this address/);
  assert.doesNotMatch(absent, /Encoded features:|Layer: without-features/);
});

test('credit line breaks cannot create additional report headings', async () => {
  const text = 'Text\nInvented heading\u2028continuation';
  const state = await sample([{name:'empty', features:[]}], null, text);
  const report = await tileReport(state, 'en').text();
  assert.ok(report.includes('"Text\\nInvented heading\\u2028continuation"'));
  assert.doesNotMatch(report, /^Invented heading/m);
});

test('all groups appear in a long UTF-8 report, including its final page', async () => {
  const sources = Array.from({length:48}, (_,i) => source('s-'+String(i).padStart(2,'0'), 'é'.repeat(900)+i));
  const state = await sample([{name:'items',features:sources.map(({id})=>({source_id:id}))}],sources);
  const exported = tileReport(state, 'en');
  const report = await exported.text();
  assert.ok(exported.size > 32768);
  assert.equal(report.match(/^  Registry attribution:/gm)?.length, sources.length);
  assert.match(report, /\[48\] Source ID: s-47\n/);
  assert.ok(report.endsWith(sources.at(-1)?.attribution + '\n'));
});

test('address and geographic bounds describe the selected tile even when the archive is empty there', async () => {
  const state = await sample([{name:'t',features:[]}]);
  const result = await tileReport({...state,position:{z:1,x:1,y:1},tile:null}, 'en').text();
  assert.match(result, /Tile \(zoom \/ column \/ row\): 1 \/ 1 \/ 1/);
  assert.match(result, /Tile bounds \(west, south, east, north\): 0 \| -85\.051128779807 \| 180 \| 0/);
  assert.match(result, /Archive bounds \(west, south, east, north\): -180 \| -85 \| 180 \| 85/);
});

test('French punctuation uses different spaces around a colon and guillemets', () => {
  assert.equal(localizedLabel('', '« Qui ? » Note : oui ; ici !').fr,
    '«\u202fQui\u202f?\u202f» Note\u00a0: oui\u202f; ici\u202f!');
});
