import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTRIBUTION_SCHEMA, DISTRIBUTION_MAX_BYTES, UNKNOWN,
  DistributionInputError, strictText, strictId, strictDate,
  strictChoice, strictPath, strictUrl, strictList, unique,
  parseSource, parseAsset, parseView, parseDistribution,
  parseDistributionJson, serializeDistribution, canonicalDistribution,
} from './distribution-core.mjs';
import {manifest, source, asset, view, deepCopy, DEFAULT_HASH} from './distribution-fixtures.mjs';

const mutate = (key, value) => ({ ...manifest(), [key]: value });
const fails = fn => assert.throws(fn, DistributionInputError);

test('schema is explicit and stable', () => assert.equal(DISTRIBUTION_SCHEMA, 'attribution-distribution/1'));
test('document is bounded to 2 MiB', () => assert.equal(DISTRIBUTION_MAX_BYTES, 2_097_152));
test('UNKNOWN is retained verbatim', () => assert.equal(UNKNOWN, 'UNKNOWN'));
test('minimal fixture parses in place', () => assert.deepEqual(parseDistribution(manifest()), manifest()));
test('JSON parser round-trips an explicit release', () => assert.deepEqual(parseDistributionJson(JSON.stringify(manifest())), manifest()));
test('canonical serialisation ends in newline', () => assert.match(serializeDistribution(manifest()), /\n$/u));
test('canonical output parses again', () => assert.deepEqual(parseDistributionJson(serializeDistribution(manifest())), manifest()));
test('canonical output sorts sources by ID', () => {
  const value = manifest({sources:[source({id:'source-z'}),source({id:'source-a'})],assets:[],views:[]});
  assert.deepEqual(canonicalDistribution(value).sources.map(x=>x.id),['source-a','source-z']);
});
test('canonical output sorts assets and dependencies', () => {
  const value = manifest({sources:[source()],assets:[asset({id:'z',path:'assets/z.js',dependencyIds:['b','a']}),asset({id:'a',path:'assets/a.js'}),asset({id:'b',path:'assets/b.js'})],views:[]});
  const canonical = canonicalDistribution(value);
  assert.deepEqual(canonical.assets.map(x=>x.id),['a','b','z']);
  assert.deepEqual(canonical.assets[2].dependencyIds,['a','b']);
});
test('canonical output sorts views and source IDs', () => {
  const value = manifest({views:[view({id:'z-view',path:'pages/z-view.html',sourceIds:['z','a']}),view({id:'a-view',path:'pages/a-view.html'})]});
  assert.deepEqual(canonicalDistribution(value).views.map(x=>x.id),['a-view','z-view']);
  assert.deepEqual(canonicalDistribution(value).views[1].sourceIds,['a','z']);
});
test('source parsing does not infer missing dates', () => assert.equal(parseSource(source()).datasetDate,UNKNOWN));
test('asset byte counts remain numeric', () => assert.equal(parseAsset(asset()).bytes,128));
test('view target dimension remains numeric', () => assert.equal(parseView(view()).targetPx,44));
test('manifest rejects null', () => fails(()=>parseDistribution(null)));
test('manifest rejects array', () => fails(()=>parseDistribution([])));
test('manifest rejects number', () => fails(()=>parseDistribution(7)));
test('manifest rejects omitted schema', () => {const m=manifest();delete m.schema;fails(()=>parseDistribution(m));});
test('manifest rejects unknown schema', () => fails(()=>parseDistribution({...manifest(),schema:'other'})));
test('manifest rejects additional top-level fields', () => fails(()=>parseDistribution({...manifest(),privateData:'hidden'})));
test('manifest rejects missing release ID', () => fails(()=>parseDistribution({...manifest(),releaseId:''})));
test('manifest rejects unsupported release ID syntax', () => fails(()=>parseDistribution({...manifest(),releaseId:'UpperCase'})));
test('manifest rejects duplicate sources', () => fails(()=>parseDistribution(mutate('sources',[source(),source()]))));
test('manifest rejects duplicate asset IDs', () => fails(()=>parseDistribution(mutate('assets',[asset(),asset({path:'assets/b.js'})]))));
test('manifest rejects duplicate asset paths', () => fails(()=>parseDistribution(mutate('assets',[asset(),asset({id:'second'})]))));
test('manifest rejects duplicate view IDs', () => fails(()=>parseDistribution(mutate('views',[view(),view({path:'pages/b.html'})]))));
test('manifest rejects duplicate view paths', () => fails(()=>parseDistribution(mutate('views',[view(),view({id:'other'})]))));
test('manifest accepts empty arrays as parseable, not as publishable', () => assert.equal(parseDistribution(manifest({sources:[],assets:[],views:[]})).sources.length,0));
test('manifest rejects unbounded source arrays', () => fails(()=>parseDistribution(mutate('sources',Array.from({length:401},(_,i)=>source({id:`item-${i}`}))))));
test('manifest rejects unbounded asset arrays', () => fails(()=>parseDistribution(mutate('assets',Array.from({length:1501},(_,i)=>asset({id:`a-${i}`,path:`assets/${i}.js`})) ))));
test('manifest rejects unbounded view arrays', () => fails(()=>parseDistribution(mutate('views',Array.from({length:501},(_,i)=>view({id:`v-${i}`,path:`pages/${i}.html`})) ))));
test('JSON parser rejects invalid syntax', () => fails(()=>parseDistributionJson('{bad')));
test('JSON parser rejects null', () => fails(()=>parseDistributionJson('null')));
test('JSON parser rejects a nonstring', () => fails(()=>parseDistributionJson(null)));
test('JSON parser rejects too-large document', () => fails(()=>parseDistributionJson('a'.repeat(DISTRIBUTION_MAX_BYTES+1))));
test('JSON parser rejects duplicate record identities after parse', () => fails(()=>parseDistributionJson(JSON.stringify(mutate('sources',[source(),source()])))));
test('errors retain field paths', () => {
  assert.throws(()=>parseDistribution({...manifest(),releaseId:'BAD'}),error=>error instanceof DistributionInputError && error.path==='manifest.releaseId');
});
test('strictText allows single-line content', () => assert.equal(strictText('hello','x'),'hello'));
test('strictText allows line breaks for legal notices', () => assert.equal(strictText('a\nb','x'),'a\nb'));
test('strictText rejects empty required fields', () => fails(()=>strictText('','x')));
test('strictText accepts empty optional fields', () => assert.equal(strictText('','x',100,true),''));
test('strictText rejects nontext', () => fails(()=>strictText(7,'x')));
test('strictText rejects overlong content', () => fails(()=>strictText('a'.repeat(11),'x',10)));
test('strictText rejects non-NFC', () => fails(()=>strictText('e\u0301','x')));
test('strictText rejects hidden NUL', () => fails(()=>strictText('x\0y','x')));
test('strictText rejects terminal escape', () => fails(()=>strictText('a\u001bb','x')));
test('strictText allows normal apostrophe in legal text', () => assert.equal(strictText('l’App','x'),'l’App'));
test('strictId accepts lowercase dotted-free IDs', () => assert.equal(strictId('data-1','x'),'data-1'));
test('strictId rejects uppercase IDs', () => fails(()=>strictId('Data','x')));
test('strictId rejects leading hyphen', () => fails(()=>strictId('-a','x')));
test('strictId rejects trailing hyphen', () => fails(()=>strictId('a-','x')));
test('strictId rejects underscore', () => fails(()=>strictId('a_b','x')));
test('strictId rejects whitespace', () => fails(()=>strictId('a b','x')));
test('strictId rejects numeric prefix', () => fails(()=>strictId('1a','x')));
test('strictDate preserves UNKNOWN', () => assert.equal(strictDate(UNKNOWN,'x'),UNKNOWN));
test('strictDate permits leap day', () => assert.equal(strictDate('2024-02-29','x'),'2024-02-29'));
test('strictDate rejects nonleap day', () => fails(()=>strictDate('2025-02-29','x')));
test('strictDate rejects month zero', () => fails(()=>strictDate('2025-00-01','x')));
test('strictDate rejects month 13', () => fails(()=>strictDate('2025-13-01','x')));
test('strictDate rejects June 31', () => fails(()=>strictDate('2025-06-31','x')));
test('strictDate rejects impossible day zero', () => fails(()=>strictDate('2025-01-00','x')));
test('strictDate rejects ambiguous slash dates', () => fails(()=>strictDate('2025/01/01','x')));
test('strictDate rejects timestamps as dates', () => fails(()=>strictDate('2025-01-01T12:00Z','x')));
test('strictDate rejects locale guessed dates', () => fails(()=>strictDate('January 1, 2025','x')));
test('strictDate rejects a nonspecific year', () => fails(()=>strictDate('2025','x')));
test('strictDate rejects pre-1900 year', () => fails(()=>strictDate('1899-12-01','x')));
test('strictChoice accepts listed option', () => assert.equal(strictChoice('YES',['YES','NO'],'x'),'YES'));
test('strictChoice rejects a case variant', () => fails(()=>strictChoice('yes',['YES','NO'],'x')));
test('strictChoice rejects unsupported labels', () => fails(()=>strictChoice('MAYBE',['YES','NO'],'x')));
test('strictChoice rejects nonstring', () => fails(()=>strictChoice(null,['YES'],'x')));
test('strictPath accepts a local HTML path', () => assert.equal(strictPath('pages/map.html','x'),'pages/map.html'));
test('strictPath accepts an asset file', () => assert.equal(strictPath('assets/data-1.json','x'),'assets/data-1.json'));
test('strictPath rejects absolute path', () => fails(()=>strictPath('/etc/passwd','x')));
test('strictPath rejects parent traversal', () => fails(()=>strictPath('pages/../secret','x')));
test('strictPath rejects current directory marker', () => fails(()=>strictPath('pages/./index','x')));
test('strictPath rejects hidden segments', () => fails(()=>strictPath('pages/.hidden','x')));
test('strictPath rejects leading dot', () => fails(()=>strictPath('.env','x')));
test('strictPath rejects backslash', () => fails(()=>strictPath('pages\\index.html','x')));
test('strictPath rejects double slashes', () => fails(()=>strictPath('pages//index.html','x')));
test('strictPath rejects scheme', () => fails(()=>strictPath('https://example.org/a','x')));
test('strictPath rejects query', () => fails(()=>strictPath('page.html?x=1','x')));
test('strictPath rejects fragments', () => fails(()=>strictPath('page.html#part','x')));
test('strictUrl accepts HTTPS', () => assert.equal(strictUrl('https://example.org/data','x'),'https://example.org/data'));
test('strictUrl preserves UNKNOWN', () => assert.equal(strictUrl(UNKNOWN,'x'),UNKNOWN));
test('strictUrl rejects HTTP', () => fails(()=>strictUrl('http://example.org','x')));
test('strictUrl rejects JavaScript URLs', () => fails(()=>strictUrl('javascript:alert(1)','x')));
test('strictUrl rejects FTP', () => fails(()=>strictUrl('ftp://example.org','x')));
test('strictUrl rejects localhost', () => fails(()=>strictUrl('https://localhost/a','x')));
test('strictUrl rejects private hostnames', () => fails(()=>strictUrl('https://router.local/a','x')));
test('strictUrl rejects loopback IP', () => fails(()=>strictUrl('https://127.0.0.1/a','x')));
test('strictUrl rejects RFC1918 address', () => fails(()=>strictUrl('https://192.168.1.1/a','x')));
test('strictUrl rejects embedded credentials', () => fails(()=>strictUrl('https://user:pass@example.org/a','x')));
test('strictUrl rejects fragments', () => fails(()=>strictUrl('https://example.org/a#secret','x')));
test('strictUrl rejects broken URLs', () => fails(()=>strictUrl('garbage','x')));
test('strictList accepts empty array', () => assert.deepEqual(strictList([],'x',10,x=>x),[]));
test('strictList rejects a nonarray', () => fails(()=>strictList({},'x',10,x=>x)));
test('strictList rejects more items than allowed', () => fails(()=>strictList([1,2,3],'x',2,x=>x)));
test('strictList forwards parser path', () => assert.deepEqual(strictList(['a'],'x',2,(_v,p)=>p),['x[0]']));
test('unique allows distinct values', () => assert.deepEqual(unique(['a','b'],'x'),['a','b']));
test('unique rejects repeats', () => fails(()=>unique(['a','a'],'x')));

const badSources = [
  ['provider', 'different'], ['permission', 'MAYBE'], ['licenceEvidence', true],
  ['tier', 'unrated'], ['state', 'published'], ['datasetDate', 'yesterday'],
  ['acquiredDate', '2024-02-30'], ['termsDate', 0], ['sourceUrl', 'ftp://a.org'],
  ['licenceUrl', 'https://localhost'], ['name', ''], ['id', 'Bad_Id'],
];
for (const [key, value] of badSources) {
  test(`source rejects invalid ${key}`, () => fails(()=>parseSource(source({[key]:value}))));
}
test('source rejects unknown field', () => fails(()=>parseSource({...source(), unlisted:'value'})));
test('source rejects omitted field', () => {const s=source();delete s.notice;fails(()=>parseSource(s));});
test('source allows UNKNOWN permission for audit to decide', () => assert.equal(parseSource(source({permission:UNKNOWN})).permission,UNKNOWN));
test('source allows UNKNOWN date for audit to decide', () => assert.equal(parseSource(source({termsDate:UNKNOWN})).termsDate,UNKNOWN));
test('source accepts multi-line attribution notice', () => assert.match(parseSource(source({notice:'first\nsecond'})).notice,/second/u));
test('source permits empty notice as an auditable problem', () => assert.equal(parseSource(source({notice:''})).notice,''));
const badAssets = [
  ['kind','video'],['state','active'],['bytes',-1],['bytes',1.2],['bytes',Number.NaN],
  ['bytes',Number.MAX_SAFE_INTEGER+1],['sha256','AAA'],['path','../secret'],
  ['id','Asset'],['sourceIds',['A']],['dependencyIds',['abc','abc']],
];
for (const [key,value] of badAssets) test(`asset rejects invalid ${key} = ${JSON.stringify(value)}`,()=>fails(()=>parseAsset(asset({[key]:value}))));
test('asset rejects unknown field',()=>fails(()=>parseAsset({...asset(), unexpected:true})));
test('asset rejects omitted field',()=>{const a=asset();delete a.bytes;fails(()=>parseAsset(a));});
test('asset accepts UNKNOWN byte total for audit',()=>assert.equal(parseAsset(asset({bytes:UNKNOWN})).bytes,UNKNOWN));
test('asset accepts UNKNOWN digest for audit',()=>assert.equal(parseAsset(asset({sha256:UNKNOWN})).sha256,UNKNOWN));
test('asset preserves 64-character lowercase digest',()=>assert.equal(parseAsset(asset()).sha256,DEFAULT_HASH));
const badViews = [
  ['locale','es'],['targetPx',-1],['targetPx',12.5],['targetPx',1001],
  ['noticeVisible',true],['offline','MAYBE'],['keyboard','yes'],
  ['screenReader','unknown'],['publishedDate','n/a'],['assetIds',['Upper']],
  ['sourceIds',['a','a']],['path','https://example.org'],['id','MAP'],
];
for(const [key,value] of badViews) test(`view rejects invalid ${key} = ${JSON.stringify(value)}`,()=>fails(()=>parseView(view({[key]:value}))));
test('view rejects unknown field',()=>fails(()=>parseView({...view(),secret:'abc'})));
test('view rejects omitted field',()=>{const v=view();delete v.locale;fails(()=>parseView(v));});
test('view permits UNKNOWN target for audit',()=>assert.equal(parseView(view({targetPx:UNKNOWN})).targetPx,UNKNOWN));
test('view permits UNKNOWN published date for audit',()=>assert.equal(parseView(view({publishedDate:UNKNOWN})).publishedDate,UNKNOWN));
test('view permits empty notice for audit',()=>assert.equal(parseView(view({noticeText:''})).noticeText,''));
test('parser does not change supplied array order',()=>{
  const m=manifest({sources:[source({id:'source-b'}),source({id:'source-a'})]});
  assert.deepEqual(parseDistribution(m).sources.map(s=>s.id),['source-b','source-a']);
});
test('serializer does not mutate original input',()=>{
  const m=manifest({sources:[source({id:'source-z'}),source({id:'source-a'})]});
  const snapshot=deepCopy(m); serializeDistribution(m); assert.deepEqual(m,snapshot);
});
test('serializer is deterministic across input record ordering',()=>{
  const a=manifest({sources:[source({id:'source-z'}),source({id:'source-a'})]});
  const b=manifest({sources:[...a.sources].reverse()});
  assert.equal(serializeDistribution(a),serializeDistribution(b));
});
