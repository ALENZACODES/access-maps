import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {OBSERVATION_SCHEMA, UNKNOWN, OSM_CREDIT, emptyJournal, parseJournal, parseSource, parseView, parseObservation,
  newObservation, replaceObservation, removeObservation, validDate, safeUrl, serializeJournal, observationIndex} from './observation-core.mjs';
import {auditJournal, auditComparison, observationsNeeded, renderAuditText, FINDING_TEXT} from './observation-audit.mjs';
import {COPY,localeFromSearch} from './observation-copy.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture() {
 const row=newObservation('view1','osm','visual','obs1');
 return {schema:OBSERVATION_SCHEMA,title:'Fictional map review',sources:[{
 id:'osm',provider:'OpenStreetMap',sourceUrl:'https://www.openstreetmap.org/copyright',
 licence:'ODbL-1.0',licenceUrl:'https://www.openstreetmap.org/copyright',retrievedOn:'2026-11-20',
 tier:'imported',credit:OSM_CREDIT,permission:'yes'}],
 views:[{id:'view1',title:'Fictional map',route:'/fictional',locale:'en',kind:'map',sourceIds:['osm'],included:'yes'}],
 observations:[{...row,date:'2026-11-20',placement:'beside-map',creditSeen:'yes',licenceSeen:'yes',legible:'yes',
 focusVisible:'yes',targetPx:48,noticeText:OSM_CREDIT,evidence:'Manual fictional fixture'}]};
}
function fullFixture() {
 const f=fixture();
 for(const method of ['keyboard','screen-reader','touch']) f.observations.push({...f.observations[0],id:`obs-${method}`,method});
 return f;
}
test('empty register contains no inferred source metadata',()=>{assert.deepEqual(emptyJournal().sources,[]);assert.deepEqual(emptyJournal().observations,[]);});
test('round trip preserves explicit legal text',()=>assert.deepEqual(parseJournal(serializeJournal(fixture())),fixture()));
test('does not infer unknown from record name',()=>{const f=fixture(); f.sources[0].retrievedOn=UNKNOWN;assert.equal(parseJournal(f).sources[0].retrievedOn,UNKNOWN);});
test('rejects malformed input instead of changing collection',()=>assert.throws(()=>parseJournal('{'),/JSON/));
test('rejects missing schema',()=>{const f=fixture();delete f.schema;assert.throws(()=>parseJournal(f),/schema/);});
test('rejects unsupported schema',()=>{const f=fixture();f.schema='old';assert.throws(()=>parseJournal(f),/schema/);});
test('rejects unknown root fields',()=>{const f=fixture();f.extra=1;assert.throws(()=>parseJournal(f),/extra/);});
test('rejects duplicate sources',()=>{const f=fixture();f.sources.push(copy(f.sources[0]));assert.throws(()=>parseJournal(f),/DUPLICATE|Repeated/);});
test('rejects duplicate views',()=>{const f=fixture();f.views.push(copy(f.views[0]));assert.throws(()=>parseJournal(f),/Repeated/);});
test('rejects duplicate observations',()=>{const f=fixture();f.observations.push(copy(f.observations[0]));assert.throws(()=>parseJournal(f),/Repeated/);});
test('rejects unknown source references',()=>{const f=fixture();f.views[0].sourceIds=['absent'];assert.throws(()=>parseJournal(f),/source record/);});
test('rejects unknown view references',()=>{const f=fixture();f.observations[0].viewId='missing';assert.throws(()=>parseJournal(f),/view record/);});
test('rejects observation for unrelated source',()=>{const f=fixture();f.views[0].sourceIds=[];assert.throws(()=>parseJournal(f),/not used/);});
test('rejects control characters in notes',()=>{const f=fixture();f.observations[0].notes='bad\u0001';assert.throws(()=>parseJournal(f),/Invalid text/);});
test('rejects unsafe routes',()=>{const f=fixture();f.views[0].route='//external';assert.throws(()=>parseJournal(f),/local absolute/);});
test('rejects traversal routes',()=>{const f=fixture();f.views[0].route='/../x';assert.throws(()=>parseJournal(f),/local absolute/);});
test('rejects invalid URL credentials',()=>{const f=fixture();f.sources[0].sourceUrl='https://john:pass@example.com';assert.throws(()=>parseJournal(f),/HTTPS/);});
test('rejects HTTP URL',()=>assert.equal(safeUrl('http://example.com'),null));
test('rejects localhost URL',()=>assert.equal(safeUrl('https://localhost/x'),null));
test('rejects private-range URL',()=>assert.equal(safeUrl('https://192.168.1.1/x'),null));
test('accepts explicit UNKNOWN URL',()=>assert.equal(safeUrl(UNKNOWN),UNKNOWN));
test('accepts leap day',()=>assert.equal(validDate('2024-02-29'),true));
test('rejects invalid leap day',()=>assert.equal(validDate('2025-02-29'),false));
test('rejects fabricated calendar date',()=>assert.equal(validDate('2026-13-01'),false));
test('rejects out of range target',()=>{const f=fixture();f.observations[0].targetPx=-1;assert.throws(()=>parseJournal(f),/target size/);});
test('rejects fractional target',()=>{const f=fixture();f.observations[0].targetPx=44.5;assert.throws(()=>parseJournal(f),/target size/);});
test('rejects false source tier',()=>{const f=fixture();f.sources[0].tier='certified';assert.throws(()=>parseJournal(f),/Expected one/);});
test('new observation contains explicit UNKNOWN cells',()=>{const r=newObservation('view1','osm','touch','new1');assert.equal(r.date,UNKNOWN);assert.equal(r.targetPx,UNKNOWN);});
test('replace observation is immutable',()=>{const f=fixture();const n={...f.observations[0],creditSeen:'no'};const next=replaceObservation(f,n);assert.equal(f.observations[0].creditSeen,'yes');assert.equal(next.observations[0].creditSeen,'no');});
test('remove observation preserves other records',()=>{const f=fixture();const next=removeObservation(f,'obs1');assert.equal(next.observations.length,0);assert.equal(next.views.length,1);});
test('observation index groups methods per source',()=>{const x=observationIndex(fullFixture());assert.equal(x.size,4);});
test('missing methods are explicit',()=>assert.equal(observationsNeeded(fixture()).length,3));
test('all methods complete',()=>assert.equal(observationsNeeded(fullFixture()).length,0));
test('missing observations block inclusion',()=>{const a=auditJournal(fixture());assert(a.findings.some(x=>x.code==='NO_OBSERVATION'));});
test('complete test fixture has no blockers',()=>assert.equal(auditJournal(fullFixture()).totals.blocking,0));
test('OSM exact credit required',()=>{const f=fullFixture();f.sources[0].credit='not correct';assert(auditJournal(f).findings.some(x=>x.code==='OSM_EXACT'));});
test('OSM credit must be beside map',()=>{const f=fullFixture();f.observations[0].placement='details-only';assert(auditJournal(f).findings.some(x=>x.code==='PLACEMENT_HIDDEN'));});
test('touch controls below 44 block',()=>{const f=fullFixture();f.observations.at(-1).targetPx=43;assert(auditJournal(f).findings.some(x=>x.code==='TARGET_TOO_SMALL'));});
test('44 CSS pixels passes target check',()=>{const f=fullFixture();f.observations.at(-1).targetPx=44;assert(!auditJournal(f).findings.some(x=>x.code==='TARGET_TOO_SMALL'));});
test('unknown retrieval date blocks',()=>{const f=fullFixture();f.sources[0].retrievedOn=UNKNOWN;assert(auditJournal(f).findings.some(x=>x.code==='RETRIEVAL_UNKNOWN'));});
test('unknown tier blocks',()=>{const f=fullFixture();f.sources[0].tier=UNKNOWN;assert(auditJournal(f).findings.some(x=>x.code==='TIER_UNKNOWN'));});
test('unknown permission blocks',()=>{const f=fullFixture();f.sources[0].permission=UNKNOWN;assert(auditJournal(f).findings.some(x=>x.code==='PERMISSION_UNKNOWN'));});
test('no permission blocks',()=>{const f=fullFixture();f.sources[0].permission='no';assert(auditJournal(f).findings.some(x=>x.code==='PERMISSION_NO'));});
test('absent credit blocks',()=>{const f=fullFixture();f.observations[0].creditSeen='no';assert(auditJournal(f).findings.some(x=>x.code==='CREDIT_NOT_SEEN'));});
test('unknown credit blocks',()=>{const f=fullFixture();f.observations[0].creditSeen=UNKNOWN;assert(auditJournal(f).findings.some(x=>x.code==='CREDIT_UNKNOWN'));});
test('unknown notice text blocks',()=>{const f=fullFixture();f.observations[0].noticeText=UNKNOWN;assert(auditJournal(f).findings.some(x=>x.code==='TEXT_UNKNOWN'));});
test('unknown evidence is attention',()=>{const f=fullFixture();f.observations[0].evidence=UNKNOWN;assert(auditJournal(f).findings.some(x=>x.severity==='attention'));});
test('conflicting same-method observations block',()=>{const f=fullFixture();f.observations.push({...f.observations[0],id:'another',creditSeen:'no'});assert(auditJournal(f).findings.some(x=>x.code==='OBSERVATION_CONFLICT'));});
test('unknown inclusion blocks',()=>{const f=fixture();f.views[0].included=UNKNOWN;assert(auditJournal(f).findings.some(x=>x.code==='VIEW_STATUS_UNKNOWN'));});
test('no included views are informational',()=>{const f=fixture();f.views[0].included='no';assert(auditJournal(f).findings.some(x=>x.code==='NONE_INCLUDED'));});
test('comparison detects newly absent credit',()=>{const f=fullFixture();const next=copy(f);next.observations[0].creditSeen='no';assert(auditComparison(f,next).introduced.some(x=>x.code==='CREDIT_NOT_SEEN'));});
test('comparison detects resolved credit issue',()=>{const f=fullFixture();const old=copy(f);old.observations[0].creditSeen='no';assert(auditComparison(old,f).resolved.some(x=>x.code==='CREDIT_NOT_SEEN'));});
test('comparison names removed included view',()=>{const f=fullFixture();const next=copy(f);next.views[0].included='no';assert.deepEqual(auditComparison(f,next).removedIncludedViews,['view1']);});
test('EN report explains purpose',()=>assert.match(renderAuditText(fixture(),'en'),/not an assessment of access conditions/));
test('FR report explains purpose',()=>assert.match(renderAuditText(fixture(),'fr'),/ne constituent pas une évaluation/));
test('every issue has EN and FR text',()=>{for(const [name,copy] of Object.entries(FINDING_TEXT)){assert.equal(copy.length,2,name);assert(copy.every(x=>x.length>10),name);}});
test('language selection refuses unsupported locale',()=>assert.equal(localeFromSearch('?lang=es'),'en'));
test('French language selection',()=>assert.equal(localeFromSearch('?lang=fr'),'fr'));
test('French copy uses curly apostrophes',()=>assert(!/\b[ldjcmnst]'[a-z]/iu.test(JSON.stringify(COPY.fr))));
test('all locale copy keys are paired',()=>assert.deepEqual(Object.keys(COPY.fr).sort(),Object.keys(COPY.en).sort()));
test('all locale copy is nonempty',()=>{for(const lang of ['en','fr'])for(const [key,value] of Object.entries(COPY[lang]))assert(value.length>0,key);});
test('page has restrictive offline CSP',async()=>{const html=await readFile(join(here,'observation.html'),'utf8');assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);assert.match(html,/observation-route\.mjs/);});
test('44px targets and focus styles are declared',async()=>{const css=await readFile(join(here,'observation.css'),'utf8');assert.match(css,/min-height:44px/);assert.match(css,/:focus-visible/);});
test('route imports only bundled local files',async()=>{const route=await readFile(join(here,'observation-route.mjs'),'utf8');assert.match(route,/\.\/observation-core\.mjs/);assert.match(route,/\.\/observation-audit\.mjs/);assert.match(route,/\.\/observation-copy\.mjs/);assert(!/fetch\(|localStorage|setInterval|sendBeacon/u.test(route));});
test('entry point preserves merged placement and trace tools',async()=>{const html=await readFile(join(here,'index.html'),'utf8');assert.match(html,/placement\.html\?lang=fr/);assert.match(html,/trace\.html\?lang=fr/);assert.match(html,/observation\.html\?lang=fr/);});
test('homepage journal link stylesheet makes 44px targets',async()=>{
 const css=await readFile(join(here,'observation-link.css'),'utf8');
 const html=await readFile(join(here,'index.html'),'utf8');
 assert.match(css,/min-height:44px/); assert.match(css,/:focus-visible/);
 assert.match(html,/observation-link\.css/);
});
test('no external source names beyond selected provider families are embedded',async()=>{
 const html=await readFile(join(here,'observation.html'),'utf8');
 assert(!/MiWay|verify|vérif|real-time|guarantee/iu.test(html));
});
