import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_SCHEMA, REFERENCE_MAX_BYTES, REFERENCE_MAX_RECORDS, REFERENCE_MAX_REFERENCES, REFERENCE_MAX_SURFACES, ReferenceInputError, parseReferencePack, parseReferencePackJson, referenceIndex, describeSource } from './reference-core.mjs';
import { fixturePack } from './reference-fixtures.mjs';
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';


const clone=(v)=>structuredClone(v);
function invalid(change){const p=fixturePack();change(p);assert.throws(()=>parseReferencePack(p),ReferenceInputError);}
test('valid fixture parses deterministically and remains read only',()=>{
  const parsed=parseReferencePack(fixturePack());
  assert.equal(parsed.schema,REFERENCE_SCHEMA);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.sources[0]));
  assert.deepEqual(parseReferencePackJson(JSON.stringify(fixturePack())),parsed);
});
test('lookup maps are indexed by exact identifiers',()=>{
  const p=parseReferencePack(fixturePack());const idx=referenceIndex(p);
  assert.equal(idx.sources.get('map-source').provider,'osm');
  assert.equal(idx.references.get('map-proof').sourceId,'map-source');
  assert.equal(idx.surfaces.get('map-screen').targetPx,44);
  assert.equal(idx.sources.get('missing'),undefined);
});
test('catalogue-derived source description keeps unknown date',()=>{
  const p=parseReferencePack(fixturePack());
  const d=describeSource(p.sources[0],'fr');
  assert.equal(d.name,'OpenStreetMap');assert.equal(d.datasetDate,'UNKNOWN');
});
test('all resource limits are explicit',()=>{
  assert.equal(REFERENCE_MAX_BYTES,2_097_152);
  assert.equal(REFERENCE_MAX_RECORDS,500);
  assert.equal(REFERENCE_MAX_REFERENCES,1000);
  assert.equal(REFERENCE_MAX_SURFACES,500);
});
test('incorrect document types are rejected',()=>{
  for(const value of [null,[],false,0,'bad',{}])assert.throws(()=>parseReferencePack(value),ReferenceInputError);
});
test('invalid JSON and oversized documents are rejected',()=>{
  assert.throws(()=>parseReferencePackJson('{'),ReferenceInputError);
  assert.throws(()=>parseReferencePackJson('x'.repeat(REFERENCE_MAX_BYTES+1)),ReferenceInputError);
  assert.throws(()=>parseReferencePackJson(null),ReferenceInputError);
});
test('unsupported versions are rejected',()=>invalid(p=>p.schema='attribution-reference-pack/2'));
test('extraneous root fields are rejected',()=>invalid(p=>p.hidden='invalid'));
test('missing root fields are rejected',()=>invalid(p=>delete p.sources));
test('invalid release identity is rejected',()=>invalid(p=>p.releaseId='Bad ID'));
for(const entry of [null,0,'bad',[],true])test(`source record must be an object: ${String(entry)}`,()=>invalid(p=>p.sources[0]=entry));
for(const entry of [null,0,'bad',[],true])test(`reference record must be an object: ${String(entry)}`,()=>invalid(p=>p.references[0]=entry));
for(const entry of [null,0,'bad',[],true])test(`surface record must be an object: ${String(entry)}`,()=>invalid(p=>p.surfaces[0]=entry));
for(const field of Object.keys(fixturePack().sources[0]))test(`source field ${field} is required`,()=>invalid(p=>delete p.sources[0][field]));
for(const field of Object.keys(fixturePack().references[0]))test(`reference field ${field} is required`,()=>invalid(p=>delete p.references[0][field]));
for(const field of Object.keys(fixturePack().surfaces[0]))test(`surface field ${field} is required`,()=>invalid(p=>delete p.surfaces[0][field]));
for(const type of ['source','reference','surface'])test(`extra field in ${type} rejected`,()=>invalid(p=>{const key=type==='source'?'sources':type==='reference'?'references':'surfaces';p[key][0].something='x';}));
for(const value of ['UNKNOWN','Missing','source with spaces','Capital','a_', 'a--b','a/b','','../bad','a?b','a'.repeat(80)])test(`invalid source ID: ${value}`,()=>invalid(p=>p.sources[0].id=value));
for(const value of ['ftp://example.com','http://example.com','javascript:alert(1)','https://localhost/file','https://127.0.0.1/x','https://example.com/#fragment','https://me:password@example.org/','file:///tmp/a',''])test(`invalid source URL: ${value}`,()=>invalid(p=>p.sources[0].sourceUrl=value));
for(const value of ['2026-02-30','2026-13-01','2026-00-03','2025-02-29','2026-01-00','2026/01/01','1900-02-29','2026-2-01',''])test(`invalid source date: ${value}`,()=>invalid(p=>p.sources[0].acquiredDate=value));
for(const value of ['no','yes','TRUE','FALSE',false,null,undefined])test(`invalid permission: ${String(value)}`,()=>invalid(p=>p.sources[0].permission=value));
for(const value of ['other','first','last','secondary-high',null])test(`invalid evidence tier: ${String(value)}`,()=>invalid(p=>p.sources[0].tier=value));
for(const value of ['unlicensed','not-known','ODBL',null])test(`invalid licence: ${String(value)}`,()=>invalid(p=>p.sources[0].licence=value));
for(const value of ['no',false,25.5,-1,2001,NaN])test(`invalid target size: ${String(value)}`,()=>invalid(p=>p.surfaces[0].targetPx=value));
for(const value of ['en-CA','ES','fr-CA','other',null])test(`invalid surface language: ${String(value)}`,()=>invalid(p=>p.surfaces[0].language=value));
for(const value of ['YES','NO','UNKNOWN'])test(`valid recorded permission ${value}`,()=>{const p=fixturePack();p.sources[0].permission=value;assert.equal(parseReferencePack(p).sources[0].permission,value);});
for(const value of ['primary','secondary','community','UNKNOWN'])test(`valid tier ${value}`,()=>{const p=fixturePack();p.sources[0].tier=value;assert.equal(parseReferencePack(p).sources[0].tier,value);});
test('valid leap day is accepted',()=>{const p=fixturePack();p.sources[0].datasetDate='2024-02-29';assert.equal(parseReferencePack(p).sources[0].datasetDate,'2024-02-29');});
test('unknown dataset date is preserved',()=>{const p=fixturePack();assert.equal(parseReferencePack(p).sources[0].datasetDate,'UNKNOWN');});
test('source references must be unique',()=>invalid(p=>p.sources[0].referenceIds=['map-proof','map-proof']));
test('surface sources must be unique',()=>invalid(p=>p.surfaces[0].sourceIds=['map-source','map-source']));
test('surface references must be unique',()=>invalid(p=>p.surfaces[0].referenceIds=['map-proof','map-proof']));
test('source record IDs must be unique',()=>invalid(p=>p.sources.push(clone(p.sources[0]))));
test('reference IDs must be unique',()=>invalid(p=>p.references.push(clone(p.references[0]))));
test('surface IDs must be unique',()=>invalid(p=>p.surfaces.push(clone(p.surfaces[0]))));
test('free text allows line breaks for legal notices',()=>{const p=fixturePack();p.sources[0].notice+='\n'+METROLINX_AUA_LEGEND;assert.ok(parseReferencePack(p).sources[0].notice.includes(METROLINX_AUA_LEGEND));});
test('unsafe controls are rejected from legal notices',()=>invalid(p=>p.sources[0].notice+='\u0000'));
test('unsafe controls are rejected from offline note',()=>invalid(p=>p.references[0].offlineNote+='\u0000'));
test('non-normalized text is rejected',()=>invalid(p=>p.references[0].title='Cafe\u0301'));
test('hash uses lowercase exactly 64 hex characters',()=>invalid(p=>p.references[0].sha256='ABC'));
test('known provider notices come from current catalogue',()=>{
  assert.ok(SOURCES.osm.notices.en.includes('© OpenStreetMap contributors'));
  assert.equal(typeof METROLINX_AUA_END_USER_LAWS_EN,'string');
  assert.equal(typeof METROLINX_AUA_END_USER_LAWS_FR,'string');
  assert.ok(METROLINX_AUA_LEGEND.length>100);
  assert.ok(METROLINX_OGL_NOTICE.includes('Metrolinx'));
});
test('empty lists are valid structurally but should be audited',()=>{
  const p=fixturePack();p.sources=[];p.references=[];p.surfaces=[];
  assert.equal(parseReferencePack(p).sources.length,0);
});
