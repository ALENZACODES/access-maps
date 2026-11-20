import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './trace-test-fixture.mjs';
import { emptyTrace, UNKNOWN } from './trace-core.mjs';
import {collectPackets,packetJson,packetText,PacketError,PACKET_SCHEMA} from './trace-packet.mjs';

test('builds deterministic packets with source, notice and surface',()=>{
  const p=collectPackets(fixture());
  assert.equal(p.schema,PACKET_SCHEMA);
  assert.equal(p.packets.length,1);
  assert.equal(p.packets[0].creditPlacements[0].adjacencyRequired,true);
  assert.equal(p.packets[0].status,'recorded-review-only');
  assert.equal(packetJson(fixture()),packetJson(fixture()));
});
test('preserves precise OpenStreetMap credit and source dates',()=>{
  const item=collectPackets(fixture()).packets[0].creditPlacements[0];
  assert.equal(item.source.credit,'© OpenStreetMap contributors');
  assert.equal(item.source.retrievedOn,'2026-11-19');
  assert.equal(item.notice.observedOn,'2026-11-19');
});
test('missing notice is UNKNOWN and blocks recorded-review-only',()=>{
  const model=fixture();model.notices=[];
  const p=collectPackets(model).packets[0];
  assert.equal(p.creditPlacements[0].notice,UNKNOWN);
  assert.ok(p.gapCodes.includes('NOTICE_MISSING'));
  assert.equal(p.status,'needs-attention');
});
test('unknown record evidence stays UNKNOWN',()=>{
  const model=fixture();model.sources[0].retrievedOn=UNKNOWN;model.sources[0].tier=UNKNOWN;
  const item=collectPackets(model).packets[0].creditPlacements[0];
  assert.equal(item.source.retrievedOn,UNKNOWN);
  assert.ok(item.gaps.includes('RETRIEVAL_UNKNOWN'));
  assert.ok(item.gaps.includes('TIER_UNKNOWN'));
});
test('missing map-adjacent credit is exposed',()=>{
  const model=fixture();model.notices[0].placement='details-only';
  assert.ok(collectPackets(model).packets[0].gapCodes.includes('OSM_ADJACENCY'));
});
test('surface target and keyboard evidence are included in gaps',()=>{
  const model=fixture();model.surfaces[0].minimumTargetPx=24;model.surfaces[0].keyboard=UNKNOWN;
  const gaps=collectPackets(model).packets[0].gapCodes;
  assert.ok(gaps.includes('TARGET_UNKNOWN_OR_SMALL'));
  assert.ok(gaps.includes('SURFACE_KEYBOARD'));
});
test('held layers stay outside publication packet by default',()=>{
  const model=fixture();model.layers[0].status='held';
  assert.equal(collectPackets(model).packets.length,0);
  assert.equal(collectPackets(model,{includeHeld:true}).packets.length,1);
});
test('a selected existing surface can have no included layers',()=>{
  const model=fixture();model.layers[0].status='held';
  const p=collectPackets(model,{surfaceId:'map-en'});
  assert.equal(p.packets.length,1);assert.equal(p.packets[0].creditPlacements.length,0);
});
test('unrecognised surface is rejected',()=>assert.throws(()=>collectPackets(fixture(),{surfaceId:'nonexistent'}),PacketError));
test('empty model produces no artificial source records',()=>{
  assert.deepEqual(collectPackets(emptyTrace()).packets,[]);
});
for(const lang of ['en','fr']) {
  test(`${lang} text export includes all evidence and no invented dates`,()=>{
    const t=packetText(fixture(),lang);
    assert.match(t,/© OpenStreetMap contributors/u);
    assert.match(t,/2026-11-19/u);
    assert.ok(t.includes(lang==='fr'?'Récupération le':'Retrieved on'));
  });
  test(`${lang} empty packet is meaningful`,()=>{
    const t=packetText(emptyTrace(),lang);
    assert.ok(t.includes(lang==='fr'?'Aucune couche':'No included map layers'));
  });
}
test('JSON export remains valid schema and does not store personal data',()=>{
  const json=packetJson(fixture());
  assert.equal(JSON.parse(json).schema,PACKET_SCHEMA);
  assert.ok(!json.includes('localStorage'));
});

test('French packet labels use a nonbreaking space before every colon', () => {
  const fr = packetText(fixture(), 'fr');
  const labels = ['Vue affichée', 'Chemin local', 'Langue', 'État de l’examen', 'Couche',
    'Source', 'Licence', 'Adresse de la source', 'Adresse de la licence',
    'Récupération le', 'Niveau de preuve', 'Autorisation de redistribution',
    'Crédit', 'Mention affichée', 'Emplacement de la mention', 'Observation le',
    'Lacunes consignées'];
  for (const label of labels) {
    assert.ok(fr.includes(label + '\u00a0:'), label);
    assert.ok(!fr.includes(label + ':'), label);
  }
  const en = packetText(fixture(), 'en');
  assert.ok(en.includes('Display surface: '));
});
