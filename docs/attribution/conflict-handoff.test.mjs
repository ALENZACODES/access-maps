import test from 'node:test';
import assert from 'node:assert/strict';
import {newConflict, emptyConflicts, UNKNOWN} from './conflict-core.mjs';
import {buildHandoff, handoffCopy, handoffJson, handoffText, HANDOFF_SCHEMA} from './conflict-handoff.mjs';

function row(id,surface='view-a',source='osm') {
  return {...newConflict(id),surfaceId:surface,layerId:'layer-a',sourceId:source,
    current:'old credit',proposed:'© OpenStreetMap contributors',source:'https://www.openstreetmap.org/copyright',
    licence:'ODbL',retrievedOn:'2026-11-19',tier:'publisher',reason:'Human comparison',
    decision:'resolved',severity:'review',reviewedOn:'2026-11-20',note:'Reviewed by a human'};
}
function model(rows=[row('item-a')]) {return {...emptyConflicts(),title:'Casebook',conflicts:rows};}
test('versioned deterministic result',()=>{const a=buildHandoff(model());assert.equal(a.schema,HANDOFF_SCHEMA);assert.equal(a.summary.views,1);assert.equal(a.summary.records,1);assert.equal(handoffJson(model()),handoffJson(model()));});
test('does not declare legal rights or access approval',()=>{const a=buildHandoff(model());assert.equal(a.groups[0].status,'recorded-review-only');assert.match(a.explanation,/not a legal or accessibility decision/u);});
test('sorts input records for deterministic handoff',()=>{const x=model([row('item-c','view-b'),row('item-a'),row('item-b','view-a','ltc')]);const y=model([...x.conflicts].reverse());assert.deepEqual(buildHandoff(x),buildHandoff(y));});
test('preserves unknown retrieval date',()=>{const r=row('item-a');r.retrievedOn=UNKNOWN;const item=buildHandoff(model([r])).groups[0].records[0];assert.equal(item.retrievedOn,UNKNOWN);assert.ok(item.missingFields.includes('retrievedOn'));});
test('missing permission note cannot be guessed',()=>{const r=row('item-a');r.note=UNKNOWN;const item=buildHandoff(model([r])).groups[0].records[0];assert.ok(item.missingFields.includes('note'));assert.ok(item.requiresAttention);});
test('unresolved record remains attention',()=>{const r=row('item-a');r.decision='hold';assert.equal(buildHandoff(model([r])).summary.unresolved,1);});
test('a missing credit is surfaced',()=>{const r=row('item-a');r.proposed='wrong';const item=buildHandoff(model([r])).groups[0].records[0];assert.ok(item.missingFields.includes('osmCredit'));assert.ok(item.findingCodes.includes('OSM_CREDIT_MISSING'));});
test('duplicate scope is preserved, not silently reconciled',()=>{const r=row('item-b');const a=buildHandoff(model([row('item-a'),r]));assert.equal(a.groups[0].recordCount,2);assert.ok(a.groups[0].records.every(x=>x.duplicateScope));});
test('filters a named surface',()=>{const x=buildHandoff(model([row('item-a'),row('item-b','view-b')]),{surfaceId:'view-b'});assert.equal(x.groups.length,1);assert.equal(x.groups[0].surfaceId,'view-b');});
test('rejects unknown surface selection',()=>assert.throws(()=>buildHandoff(model(),{surfaceId:'bogus'}),RangeError));
test('does not mutate provided ledger',()=>{const x=model();const before=JSON.stringify(x);buildHandoff(x);assert.equal(JSON.stringify(x),before);});
test('accepts empty supplied register',()=>{const a=buildHandoff(emptyConflicts());assert.equal(a.summary.records,0);assert.equal(a.groups.length,0);});
for(const locale of ['en','fr']) {
  test(`${locale} text includes source and date`,()=>{const s=handoffText(model(),locale);assert.ok(s.includes('© OpenStreetMap contributors'));assert.ok(s.includes('2026-11-19'));});
  test(`${locale} empty text explains no supplied records`,()=>assert.ok(handoffText(emptyConflicts(),locale).includes(handoffCopy(locale).noRows)));
  test(`${locale} text preserves UNKNOWN`,()=>{const r=row('item-a');r.tier=UNKNOWN;assert.ok(handoffText(model([r]),locale).includes('UNKNOWN'));});
}
test('French text label punctuation has nonbreaking spaces',()=>{const s=handoffText(model(),'fr');for(const label of ['Fiches','Vue de publication','Récupération le','Licence','Décision','État de la transmission']){assert.ok(s.includes(label+'\u00a0:'),label);assert.ok(!s.includes(label+':'),label);}});
test('English text label punctuation remains plain',()=>assert.ok(handoffText(model(),'en').includes('Publication view: view-a')));
