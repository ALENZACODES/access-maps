import test from 'node:test';
import assert from 'node:assert/strict';
import {OBSERVATION_SCHEMA,OSM_CREDIT,newObservation} from './observation-core.mjs';
import {buildObservationMatrix,filterMatrix,matrixTsv,tsvCell} from './observation-matrix.mjs';
function journal() {
 const make=(method,i)=>({...newObservation('view1','osm',method,`observation${i}`),date:'2026-11-20',
   placement:'beside-map',creditSeen:'yes',licenceSeen:'yes',legible:'yes',focusVisible:'yes',
   targetPx:44,noticeText:OSM_CREDIT,evidence:'Fictional test'});
 return {schema:OBSERVATION_SCHEMA,title:'Fictional observation review',sources:[{
 id:'osm',provider:'OpenStreetMap',sourceUrl:'https://www.openstreetmap.org/copyright',
 licence:'ODbL-1.0',licenceUrl:'https://www.openstreetmap.org/copyright',retrievedOn:'2026-11-20',
 tier:'imported',credit:OSM_CREDIT,permission:'yes'}],views:[{
 id:'view1',title:'Fictional map',route:'/fictional',locale:'en',kind:'map',sourceIds:['osm'],included:'yes'}],
 observations:['visual','keyboard','screen-reader','touch'].map(make)};
}
test('four required rows per included source',()=>assert.equal(buildObservationMatrix(journal()).summary.rows,4));
test('all four test records are present',()=>assert.equal(buildObservationMatrix(journal()).summary.recorded,4));
test('missing observation is marked explicitly',()=>{const f=journal();f.observations.pop();assert.equal(buildObservationMatrix(f).summary.missing,1);});
test('negative evidence is a gap',()=>{const f=journal();f.observations[0].creditSeen='no';assert(buildObservationMatrix(f).summary.gaps>=1);});
test('unknown retrieval is blocking',()=>{const f=journal();f.sources[0].retrievedOn='UNKNOWN';assert(buildObservationMatrix(f).rows.every(x=>x.blocking>0));});
test('excluded views are not treated as passing audits',()=>{const f=journal();f.views[0].included='no';const result=buildObservationMatrix(f);assert.equal(result.summary.notIncluded,4);assert.equal(result.summary.recorded,0);});
test('view filtering returns only the selected view',()=>{const data=buildObservationMatrix(journal());assert.equal(filterMatrix(data,{viewId:'view1'}).length,4);assert.equal(filterMatrix(data,{viewId:'missing'}).length,0);});
test('source filtering returns only source results',()=>assert.equal(filterMatrix(buildObservationMatrix(journal()),{sourceId:'osm'}).length,4));
test('method filtering returns one row',()=>assert.equal(filterMatrix(buildObservationMatrix(journal()),{method:'visual'}).length,1));
test('status filtering returns all complete rows',()=>assert.equal(filterMatrix(buildObservationMatrix(journal()),{state:'recorded'}).length,4));
test('TSV contains all required headings',()=>{const value=matrixTsv(buildObservationMatrix(journal()));assert.match(value,/Evidence tier/);assert.match(value,/Credit observed/);assert.match(value,/Blocking gaps/);});
test('TSV uses one row per method plus header',()=>assert.equal(matrixTsv(buildObservationMatrix(journal())).trimEnd().split('\n').length,5));
test('TSV quotes double-quotes safely',()=>assert.equal(tsvCell('a"b'),'"a""b"'));
test('TSV prevents formula expressions',()=>assert.equal(tsvCell('=SUM(A1:A2)'),"\"'=SUM(A1:A2)\""));
test('TSV protects leading whitespace then formula',()=>assert.match(tsvCell(' \t+42'),/^"'/));
test('TSV protects @ and - formulas',()=>{assert.match(tsvCell('@evil'),/^"'/);assert.match(tsvCell('-1+2'),/^"'/);});
test('TSV preserves explicit UNKNOWN',()=>assert.equal(tsvCell('UNKNOWN'),'"UNKNOWN"'));
test('TSV does not remove recorded OSM text',()=>assert.match(matrixTsv(buildObservationMatrix(journal())),/ODbL-1.0/));
