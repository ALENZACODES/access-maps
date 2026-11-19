import test from 'node:test';
import assert from 'node:assert/strict';
import { CORRECTION_SCHEMA, CORRECTION_MAX_BYTES, CORRECTION_MAX_CASES,
  CorrectionInputError, isObject, exactFields, safeText, safeId, enumValue,
  validDate, publicUrl, distinctIds, parseSource, parseEvidence, parseCase,
  parseSurface, parseCorrectionRegister, parseCorrectionJson, serializeCorrectionRegister,
  sourceMap, caseMap, evidenceMap, activeCases, resolvedCases,
  groupCasesBySource, groupCasesBySurface } from './correction-core.mjs';
import { register, source, evidence, correction, surface, clone, emptyRegister,
  withCase, withSource, withSurface, withEvidence } from './correction-fixtures.mjs';

const rejects=(fn,part)=>assert.throws(fn,error=>error instanceof CorrectionInputError && (!part||error.message.includes(part)));
test('schema value identifies the exact contract',()=>assert.equal(CORRECTION_SCHEMA,'attribution-corrections/1'));
test('maximum JSON input is bounded',()=>assert.equal(CORRECTION_MAX_BYTES,2_097_152));
test('maximum cases is bounded',()=>assert.equal(CORRECTION_MAX_CASES,400));
test('object predicate accepts plain record',()=>assert.equal(isObject({id:1}),true));
test('object predicate rejects null',()=>assert.equal(isObject(null),false));
test('object predicate rejects array',()=>assert.equal(isObject([]),false));
test('object predicate rejects string',()=>assert.equal(isObject('x'),false));
test('required exact fields pass',()=>assert.doesNotThrow(()=>exactFields({a:1},['a'],'item')));
test('missing exact field fails',()=>rejects(()=>exactFields({},['a'],'item'),'item.a'));
test('extra exact field fails',()=>rejects(()=>exactFields({a:1,b:2},['a'],'item'),'item.b'));
test('nonobject exact fields fail',()=>rejects(()=>exactFields([],['a'],'item'),'Expected object'));
test('safe text preserves French apostrophe',()=>assert.equal(safeText('d’OpenStreetMap','name'),'d’OpenStreetMap'));
test('safe text allows line break for legal notices',()=>assert.equal(safeText('alpha\nbeta','notice'),'alpha\nbeta'));
test('safe text permits optional blank note',()=>assert.equal(safeText('','note',20,true),''));
test('safe text rejects blank required value',()=>rejects(()=>safeText(' ','name'),'bounded'));
test('safe text rejects non-string values',()=>rejects(()=>safeText(15,'name'),'bounded'));
test('safe text enforces limit',()=>rejects(()=>safeText('abc','name',2),'bounded'));
test('safe text rejects decomposed accents',()=>rejects(()=>safeText('e\u0301','name'),'NFC'));
test('safe text rejects embedded null',()=>rejects(()=>safeText('a\u0000b','name'),'Control'));
test('safe text rejects DEL',()=>rejects(()=>safeText('a\u007fb','name'),'Control'));
test('safe text allows tab in evidence excerpts',()=>assert.equal(safeText('a\tb','excerpt'),'a\tb'));
test('safe id accepts hyphen identifiers',()=>assert.equal(safeId('case-10','id'),'case-10'));
test('safe id rejects upper-case identifiers',()=>rejects(()=>safeId('Case','id'),'Invalid'));
test('safe id rejects path characters',()=>rejects(()=>safeId('../a','id'),'Invalid'));
test('safe id rejects underscores',()=>rejects(()=>safeId('source_one','id'),'Invalid'));
test('enum accepts allowed state',()=>assert.equal(enumValue('YES',['YES','NO'],'permission'),'YES'));
test('enum rejects unlisted state',()=>rejects(()=>enumValue('maybe',['YES'],'permission'),'Expected'));
test('UNKNOWN date remains UNKNOWN',()=>assert.equal(validDate('UNKNOWN','date'),'UNKNOWN'));
test('calendar leap day passes',()=>assert.equal(validDate('2024-02-29','date'),'2024-02-29'));
test('nonleap February 29 fails',()=>rejects(()=>validDate('2025-02-29','date'),'Invalid'));
test('month 13 fails',()=>rejects(()=>validDate('2025-13-01','date'),'Invalid'));
test('month 00 fails',()=>rejects(()=>validDate('2025-00-01','date'),'Invalid'));
test('day zero fails',()=>rejects(()=>validDate('2025-01-00','date'),'Invalid'));
test('invalid date format fails',()=>rejects(()=>validDate('01/01/2025','date'),'Expected'));
test('nonstring date fails',()=>rejects(()=>validDate(0,'date'),'Expected'));
test('public https URL passes',()=>assert.equal(publicUrl('https://example.org/terms','url'),'https://example.org/terms'));
test('unknown URL is preserved',()=>assert.equal(publicUrl('UNKNOWN','url'),'UNKNOWN'));
for(const [name,url] of [
  ['HTTP','http://example.org'],['file','file:///etc/passwd'],['javascript','javascript:alert(1)'],
  ['local','https://localhost/a'],['private','https://192.168.1.2/a'],
  ['loopback','https://127.0.0.1/a'],['credentials','https://user:pass@example.org'],
  ['fragment','https://example.org/a#section'],['bad','not a URL'],
]) test(`rejects ${name} source URL`,()=>rejects(()=>publicUrl(url,'url')));
test('distinct ids preserve order',()=>assert.deepEqual(distinctIds(['one','two'],'ids'),['one','two']));
test('distinct ids reject duplicate',()=>rejects(()=>distinctIds(['one','one'],'ids'),'Duplicate'));
test('distinct ids reject wrong type',()=>rejects(()=>distinctIds('one','ids'),'array'));
test('distinct ids enforce upper bound',()=>rejects(()=>distinctIds(['one','two'],'ids',1),'array'));
test('source fixture parses',()=>assert.equal(parseSource(source()).provider,'osm'));
test('evidence fixture parses',()=>assert.equal(parseEvidence(evidence()).id,'map-evidence'));
test('case fixture parses',()=>assert.equal(parseCase(correction()).id,'case-one'));
test('surface fixture parses',()=>assert.equal(parseSurface(surface()).id,'surface-one'));
test('register parses with exact shape',()=>assert.equal(parseCorrectionRegister(register()).releaseId,'release-one'));
test('parsed record does not retain input object identity',()=>assert.notEqual(parseCorrectionRegister(register()),register()));
test('source rejects missing licence',()=>{const x=source();delete x.licence;rejects(()=>parseSource(x),'licence');});
test('source rejects unknown extra field',()=>rejects(()=>parseSource({...source(),extra:1}),'extra'));
test('source rejects unrelated provider',()=>rejects(()=>parseSource(source({provider:'other-city'})),'provider'));
test('source rejects guessed permission',()=>rejects(()=>parseSource(source({permission:'probably'})),'permission'));
test('evidence rejects unsupported language',()=>rejects(()=>parseEvidence(evidence({language:'es'})),'language'));
test('evidence rejects missing URL',()=>rejects(()=>parseEvidence(evidence({url:''})),'url'));
test('evidence rejects unknown fields',()=>rejects(()=>parseEvidence({...evidence(),privateNote:'x'}),'privateNote'));
test('case rejects unsupported issue type',()=>rejects(()=>parseCase(correction({issue:'medical'})),'issue'));
test('case rejects unsupported state',()=>rejects(()=>parseCase(correction({state:'pending'})),'state'));
test('case rejects duplicate evidence ids',()=>rejects(()=>parseCase(correction({evidenceIds:['one','one']})),'Duplicate'));
test('case rejects invalid decision',()=>rejects(()=>parseCase(correction({decision:'maybe'})),'decision'));
test('case rejects invalid locale',()=>rejects(()=>parseCase(correction({locale:'fr-CA'})),'locale'));
test('surface rejects unknown target text',()=>rejects(()=>parseSurface(surface({minimumTargetPx:'44'})),'minimumTargetPx'));
test('surface accepts literal UNKNOWN target',()=>assert.equal(parseSurface(surface({minimumTargetPx:'UNKNOWN'})).minimumTargetPx,'UNKNOWN'));
test('surface rejects negative target',()=>rejects(()=>parseSurface(surface({minimumTargetPx:-1})),'minimumTargetPx'));
test('surface rejects fractional target',()=>rejects(()=>parseSurface(surface({minimumTargetPx:43.5})),'minimumTargetPx'));
test('surface rejects absolute route',()=>rejects(()=>parseSurface(surface({route:'/private'})),'route'));
test('surface rejects traversal route',()=>rejects(()=>parseSurface(surface({route:'../private'})),'route'));
test('surface rejects backslash route',()=>rejects(()=>parseSurface(surface({route:'folder\\private'})),'route'));
test('surface rejects duplicate sources',()=>rejects(()=>parseSurface(surface({sourceIds:['one','one']})),'Duplicate'));
test('invalid root schema fails',()=>rejects(()=>parseCorrectionRegister(register({schema:'other'})),'schema'));
test('root unknown field fails',()=>rejects(()=>parseCorrectionRegister({...register(),bogus:'x'}),'bogus'));
test('root missing field fails',()=>{const x=register();delete x.cases;rejects(()=>parseCorrectionRegister(x),'cases');});
test('root rejects duplicate sources',()=>rejects(()=>parseCorrectionRegister(register({sources:[source(),source()]})),'Duplicate'));
test('root rejects duplicate cases',()=>rejects(()=>parseCorrectionRegister(register({cases:[correction(),correction()]})),'Duplicate'));
test('root rejects duplicate surfaces',()=>rejects(()=>parseCorrectionRegister(register({surfaces:[surface(),surface()]})),'Duplicate'));
test('root rejects duplicate evidence',()=>rejects(()=>parseCorrectionRegister(register({evidence:[evidence(),evidence()]})),'Duplicate'));
test('root rejects nonboolean pairing',()=>rejects(()=>parseCorrectionRegister(register({localePairRequired:'YES'})),'boolean'));
test('root rejects excessive records',()=>rejects(()=>parseCorrectionRegister(register({cases:Array(401).fill(correction())})),'array'));
test('JSON round-trip retains UNKNOWN dates',()=>assert.equal(parseCorrectionJson(JSON.stringify(register())).sources[0].datasetDate,'UNKNOWN'));
test('JSON malformed input rejected',()=>rejects(()=>parseCorrectionJson('{'),'Malformed'));
test('JSON nonstring input rejected',()=>rejects(()=>parseCorrectionJson({}),'large'));
test('JSON oversized string rejected',()=>rejects(()=>parseCorrectionJson('x'.repeat(CORRECTION_MAX_BYTES+1)),'large'));
test('serialized register ends in newline',()=>assert.ok(serializeCorrectionRegister(register()).endsWith('\n')));
test('serialization retains schema',()=>assert.equal(JSON.parse(serializeCorrectionRegister(register())).schema,CORRECTION_SCHEMA));
test('source map retrieves source',()=>assert.equal(sourceMap(register()).get('osm-one').provider,'osm'));
test('case map retrieves case',()=>assert.equal(caseMap(register()).get('case-one').state,'resolved'));
test('evidence map retrieves source',()=>assert.equal(evidenceMap(register()).get('map-evidence').sourceId,'osm-one'));
test('resolved cases are returned',()=>assert.equal(resolvedCases(register()).length,1));
test('active cases empty for resolved record',()=>assert.equal(activeCases(register()).length,0));
test('open case is active',()=>assert.equal(activeCases(withCase({state:'open'})).length,1));
test('cases group by source',()=>assert.equal(groupCasesBySource(register()).get('osm-one').length,1));
test('cases group by surface',()=>assert.equal(groupCasesBySurface(register()).get('surface-one').length,1));
test('empty register can parse',()=>assert.equal(parseCorrectionRegister(emptyRegister()).sources.length,0));
test('clone creates deep copy',()=>assert.notEqual(clone(register()).sources,register().sources));
test('with source override retained',()=>assert.equal(withSource({permission:'UNKNOWN'}).sources[0].permission,'UNKNOWN'));
test('with surface override retained',()=>assert.equal(withSurface({offline:'UNKNOWN'}).surfaces[0].offline,'UNKNOWN'));
test('with evidence override retained',()=>assert.equal(withEvidence({tier:'UNKNOWN'}).evidence[0].tier,'UNKNOWN'));
