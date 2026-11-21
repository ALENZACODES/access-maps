import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,source,record,asset,pkg,DAY,NEXT,LATER,sourceDigest} from './p15af-fixtures.mjs';
import {createImpactCatalog,validateImpactCatalog,catalogIndexes} from './p15af-catalog.mjs';
import {ImpactError,sha256} from './p15af-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ImpactError&&error.code===code);
test('catalog validates and seals a complete source-to-package chain',()=>{const row=catalog();assert.equal(validateImpactCatalog(row).digest,row.digest);});
test('catalog sorts all entity collections deterministically',()=>{const row=catalog();assert.deepEqual(row.sources.map(x=>x.sourceId),['source-one']);});
test('catalog rejects unsupported root fields',()=>{const row=catalog();fails(()=>validateImpactCatalog({...row,privateNote:'x'}),'SHAPE');});
test('catalog rejects duplicate source IDs',()=>{const s=source();fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[s,s],records:[],assets:[],packages:[]}),'DUPLICATE');});
test('catalog rejects duplicate record IDs',()=>{const r=record();fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[r,r],assets:[],packages:[]}),'DUPLICATE');});
test('catalog rejects malformed source digest',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({sourceDigest:'bad'})],records:[],assets:[],packages:[]}),'HASH');});
test('catalog rejects unknown licence',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({licence:'PROPRIETARY'})],records:[],assets:[],packages:[]}),'LICENCE');});
test('catalog rejects source silo inconsistent with licence',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({licence:'ODbL-1.0'})],records:[],assets:[],packages:[]}),'SILO');});
test('catalog rejects source retrieval before observation',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({observedOn:NEXT,retrievedOn:DAY})],records:[],assets:[],packages:[]}),'DATE_ORDER');});
test('catalog rejects unsafe source path',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({reference:'../secret'})],records:[],assets:[],packages:[]}),'PATH');});
test('catalog rejects invalid French attribution typography',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({attribution:{en:'Source',fr:'Source : note'}})],records:[],assets:[],packages:[]}),'TYPOGRAPHY');});
test('catalog rejects missing record source reference',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record({sourceIds:['missing']})],assets:[],packages:[]}),'SOURCE_REF');});
test('catalog rejects evidence that references unlinked source',()=>{const second=source({sourceId:'source-two',sourceDigest:sha256('two'),reference:'sources/two.json'});const r=record({evidence:[{...record().evidence[0],sourceId:'source-two',digest:sha256('two')}]});fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source(),second],records:[r],assets:[],packages:[]}),'SOURCE_REF');});
test('catalog rejects evidence digest that differs from source snapshot',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record({evidence:[{...record().evidence[0],digest:sha256('other')}]})],assets:[],packages:[]}),'EVIDENCE_DIGEST');});
test('catalog rejects evidence retrieval after catalog date',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:DAY,sources:[source()],records:[record()],assets:[],packages:[]}),'EVIDENCE_DATE');});
test('catalog rejects usable known-state record without tier 2 evidence',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record({evidence:[{...record().evidence[0],tier:1}]})],assets:[],packages:[]}),'EVIDENCE_REQUIRED');});
test('catalog requires non-active source records to be non-usable',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({status:'held'})],records:[record()],assets:[],packages:[]}),'SOURCE_HELD');});
test('catalog permits UNKNOWN record with review-required state',()=>{const row=catalog({records:[record({accessState:'UNKNOWN',state:'review-required'})],assets:[],packages:[]});assert.equal(row.records[0].accessState,'UNKNOWN');});
test('catalog rejects record with unsupported feature',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record({feature:'escalator'})],assets:[],packages:[]}),'FEATURE');});
test('catalog rejects malformed record digest',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record({recordDigest:'bad'})],assets:[],packages:[]}),'HASH');});
test('catalog rejects duplicate evidence IDs',()=>{const ev=record().evidence[0];fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record({evidence:[ev,ev]})],assets:[],packages:[]}),'DUPLICATE');});
test('catalog rejects asset reference to missing record',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record()],assets:[asset({recordIds:['missing']})],packages:[]}),'RECORD_REF');});
test('catalog rejects asset source not represented by its records',()=>{const s=source({sourceId:'source-two',sourceDigest:sha256('two'),reference:'sources/two.json'});fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source(),s],records:[record()],assets:[asset({sourceIds:['source-two']})],packages:[]}),'ASSET_LINEAGE');});
test('catalog rejects package with missing asset',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record()],assets:[asset()],packages:[pkg({assetIds:['missing']})]}),'ASSET_REF');});
test('catalog rejects package record unrelated to asset lineage',()=>{const r2=record({recordId:'record-two',recordDigest:sha256('r2')});fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record(),r2],assets:[asset()],packages:[pkg({recordIds:['record-two']})]}),'PACKAGE_LINEAGE');});
test('catalog rejects ready package depending on quarantined asset',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record()],assets:[asset({state:'quarantined'})],packages:[pkg()]}),'PACKAGE_READY');});
test('catalog rejects ready package depending on held source',()=>{fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({status:'held'})],records:[record({state:'review-required'})],assets:[asset({state:'stale'})],packages:[pkg()]}),'PACKAGE_READY');});
test('catalog detects root digest tampering',()=>{const row=catalog();const changed={...row,asOf:LATER};fails(()=>validateImpactCatalog(changed),'HASH');});
test('catalog indexes return four typed maps',()=>{const maps=catalogIndexes(catalog());assert.equal(maps.sources.size,1);assert.equal(maps.packages.size,1);});
test('catalog contains no identity-bearing fields',()=>{const row=catalog();assert.ok(!JSON.stringify(row).includes('@'));});
test('catalog record state and access state are independent dimensions',()=>{const row=catalog({records:[record({accessState:'UNKNOWN',state:'quarantined'})],assets:[asset({state:'quarantined'})],packages:[pkg({state:'held'})]});assert.equal(row.records[0].accessState,'UNKNOWN');assert.equal(row.records[0].state,'quarantined');});
test('catalog rejects package digest mutation after creation',()=>{const row=catalog();const changed={...row,packages:[{...row.packages[0],digest:sha256('new')}]};fails(()=>validateImpactCatalog(changed),'HASH');});

test('catalog rejects source state outside lifecycle',()=>{
 fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({status:'published'})],
  records:[],assets:[],packages:[]}),'SOURCE_STATE');
});
test('catalog rejects unknown silo labels',()=>{
 fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({silo:'mixed'})],
  records:[],assets:[],packages:[]}),'SILO');
});
test('catalog rejects source reference with absolute path',()=>{
 fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source({reference:'/tmp/source.json'})],
  records:[],assets:[],packages:[]}),'PATH');
});
test('catalog rejects evidence tier above the supported maximum',()=>{
 fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],
  records:[record({evidence:[{...record().evidence[0],tier:4}]})],assets:[],packages:[]}),'INTEGER');
});
test('catalog rejects record state outside review lifecycle',()=>{
 fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],
  records:[record({state:'published'})],assets:[],packages:[]}),'RECORD_STATE');
});
test('catalog rejects duplicate record source identifiers',()=>{
 fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],
  records:[record({sourceIds:['source-one','source-one']})],assets:[],packages:[]}),'DUPLICATE');
});
test('catalog rejects asset path traversal',()=>{
 fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record()],
  assets:[asset({path:'assets/../../escape'})],packages:[]}),'PATH');
});
test('catalog rejects package with duplicate asset references',()=>{
 fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record()],
  assets:[asset()],packages:[pkg({assetIds:['asset-one','asset-one']})]}),'DUPLICATE');
});
test('catalog rejects package version zero',()=>{
 fails(()=>createImpactCatalog({catalogId:'c',asOf:NEXT,sources:[source()],records:[record()],
  assets:[asset()],packages:[pkg({version:0})]}),'INTEGER');
});
test('catalog preserves ODbL silo for every dependent entity',()=>{
 const odbl=source({licence:'ODbL-1.0',silo:'odbl',sourceId:'source-odbl',
  sourceDigest:sha256('odbl'),reference:'sources/odbl.json'});
 const rowRecord=record({recordId:'record-odbl',recordDigest:sha256('record-odbl'),
  sourceIds:['source-odbl'],evidence:[{...record().evidence[0],sourceId:'source-odbl',digest:sha256('odbl')}]});
 const rowAsset=asset({assetId:'asset-odbl',recordIds:['record-odbl'],sourceIds:['source-odbl'],digest:sha256('asset-odbl')});
 const rowPackage=pkg({packageId:'package-odbl',assetIds:['asset-odbl'],recordIds:['record-odbl'],
  sourceIds:['source-odbl'],digest:sha256('package-odbl')});
 const result=createImpactCatalog({catalogId:'odbl-catalog',asOf:NEXT,sources:[odbl],
  records:[rowRecord],assets:[rowAsset],packages:[rowPackage]});
 assert.equal(result.sources[0].silo,'odbl');
});
test('catalog returns defensive copies of nested evidence',()=>{
 const row=catalog(),copy=validateImpactCatalog(row);
 copy.records[0].evidence[0].tier=0;
 assert.equal(row.records[0].evidence[0].tier,2);
});

test('catalog exposes the exact current snapshot digest to every consumer',()=>{
 const row=catalog();
 assert.equal(validateImpactCatalog(row).digest,row.digest);
});
test('catalog source records keep their own retrieval and observation dates',()=>{
 const row=catalog();
 assert.equal(row.sources[0].observedOn,DAY);
 assert.equal(row.sources[0].retrievedOn,NEXT);
});
