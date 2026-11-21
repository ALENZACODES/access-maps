import {
  SOURCE_STATES, LICENCES, SILOS, RECORD_STATES, ASSET_STATES, PACKAGE_STATES,
  MAX_SOURCES, MAX_RECORDS, MAX_ASSETS, MAX_PACKAGES, fail, exact, id, token,
  safeText, date, hash, integer, unique, copy, sorted, bodyDigest, siloForLicence,
  pathSafe, bilingual, noIdentity,
} from './p15af-contract.mjs';

export const CATALOG_SCHEMA = 'access-maps-source-impact-catalog/1';
const SOURCE_FIELDS = ['sourceId','licence','silo','status','observedOn','retrievedOn',
  'sourceDigest','reference','attribution','ownerToken','statusReason'];
const RECORD_FIELDS = ['recordId','recordDigest','accessState','feature','state','sourceIds',
  'evidence','updatedOn','reason'];
const EVIDENCE_FIELDS = ['evidenceId','sourceId','digest','observedOn','retrievedOn','tier'];
const ASSET_FIELDS = ['assetId','path','digest','bytes','state','recordIds','sourceIds','builtOn'];
const PACKAGE_FIELDS = ['packageId','version','state','assetIds','recordIds','sourceIds','builtOn','digest'];
const FEATURES = ['entrance','washroom','lift','parking','path','seating','crossing','curb-cut','platform','door','ramp','surface','gradient','outage'];
const ACCESS = ['YES','NO','UNKNOWN'];

function sourceRow(row) {
  exact(row, SOURCE_FIELDS);
  id(row.sourceId,'sourceId');
  fail(LICENCES.includes(row.licence),'LICENCE','Source licence is unsupported.');
  fail(SILOS.includes(row.silo)&&row.silo===siloForLicence(row.licence),'SILO','Source export silo does not match licence.');
  fail(SOURCE_STATES.includes(row.status),'SOURCE_STATE','Source state invalid.');
  date(row.observedOn);date(row.retrievedOn);
  fail(row.retrievedOn>=row.observedOn,'DATE_ORDER','Source retrieval predates observation.');
  hash(row.sourceDigest,'sourceDigest');
  fail(pathSafe(row.reference),'PATH','Source reference must remain package-relative.');
  bilingual(row.attribution,'attribution');
  token(row.ownerToken,'ownerToken');
  safeText(row.statusReason,'statusReason',500);
  return copy(row);
}
function evidenceRow(row) {
  exact(row,EVIDENCE_FIELDS);
  id(row.evidenceId);id(row.sourceId);hash(row.digest);
  date(row.observedOn);date(row.retrievedOn);
  fail(row.retrievedOn>=row.observedOn,'DATE_ORDER','Evidence retrieval predates observation.');
  integer(row.tier,'tier',0,3);
  return copy(row);
}
function recordRow(row) {
  exact(row,RECORD_FIELDS);
  id(row.recordId);hash(row.recordDigest);
  fail(ACCESS.includes(row.accessState),'ACCESS','Record access state invalid.');
  fail(FEATURES.includes(row.feature),'FEATURE','Record feature invalid.');
  fail(RECORD_STATES.includes(row.state),'RECORD_STATE','Record state invalid.');
  fail(Array.isArray(row.sourceIds)&&row.sourceIds.length<=100,'SOURCES','Record source list invalid.');
  row.sourceIds.forEach(id);unique(row.sourceIds,'record source IDs');
  fail(Array.isArray(row.evidence)&&row.evidence.length<=100,'EVIDENCE','Record evidence list invalid.');
  row.evidence.forEach(evidenceRow);unique(row.evidence.map(item=>item.evidenceId),'record evidence IDs');
  date(row.updatedOn);safeText(row.reason,'record reason',500);
  if(row.accessState==='UNKNOWN')fail(row.state!=='usable'||row.evidence.length>0,'UNKNOWN','Unknown records remain reviewable with evidence or hold state.');
  return copy(row);
}
function assetRow(row) {
  exact(row,ASSET_FIELDS);
  id(row.assetId);fail(pathSafe(row.path),'PATH','Asset path is not package-relative.');
  hash(row.digest);integer(row.bytes,'asset bytes',0,1024*1024*1024);
  fail(ASSET_STATES.includes(row.state),'ASSET_STATE','Asset state invalid.');
  for(const field of ['recordIds','sourceIds']){
    fail(Array.isArray(row[field])&&row[field].length<=MAX_RECORDS,'REFERENCES',`${field} invalid.`);
    row[field].forEach(id);unique(row[field],field);
  }
  date(row.builtOn);return copy(row);
}
function packageRow(row) {
  exact(row,PACKAGE_FIELDS);
  id(row.packageId);integer(row.version,'package version',1,100000);
  fail(PACKAGE_STATES.includes(row.state),'PACKAGE_STATE','Package state invalid.');
  for(const field of ['assetIds','recordIds','sourceIds']){
    fail(Array.isArray(row[field])&&row[field].length<=MAX_ASSETS,'REFERENCES',`${field} invalid.`);
    row[field].forEach(id);unique(row[field],field);
  }
  date(row.builtOn);hash(row.digest);return copy(row);
}
export function createImpactCatalog(input) {
  exact(input,['catalogId','asOf','sources','records','assets','packages']);
  id(input.catalogId);date(input.asOf);
  for(const [field,limit] of [['sources',MAX_SOURCES],['records',MAX_RECORDS],['assets',MAX_ASSETS],['packages',MAX_PACKAGES]]){
    fail(Array.isArray(input[field])&&input[field].length<=limit,'LIMIT',`${field} exceeds limit.`);
  }
  const sources=input.sources.map(sourceRow),records=input.records.map(recordRow),
    assets=input.assets.map(assetRow),packages=input.packages.map(packageRow);
  for(const [rows,key,label] of [[sources,'sourceId','source IDs'],[records,'recordId','record IDs'],
    [assets,'assetId','asset IDs'],[packages,'packageId','package IDs']])unique(rows.map(row=>row[key]),label);
  const sourceMap=new Map(sources.map(row=>[row.sourceId,row]));
  const recordMap=new Map(records.map(row=>[row.recordId,row]));
  const assetMap=new Map(assets.map(row=>[row.assetId,row]));
  for(const record of records){
    fail(record.sourceIds.every(value=>sourceMap.has(value)),'SOURCE_REF','Record references missing source.');
    for(const evidence of record.evidence){
      const source=sourceMap.get(evidence.sourceId);
      fail(source,'SOURCE_REF','Evidence references missing source.');
      fail(record.sourceIds.includes(evidence.sourceId),'SOURCE_REF','Evidence source is not linked to record.');
      fail(evidence.digest===source.sourceDigest,'EVIDENCE_DIGEST','Evidence digest differs from source snapshot.');
      fail(evidence.observedOn>=source.observedOn&&evidence.retrievedOn<=input.asOf,
        'EVIDENCE_DATE','Evidence chronology is inconsistent.');
    }
    if(record.accessState!=='UNKNOWN'&&record.state==='usable'){
      fail(record.evidence.some(row=>row.tier>=2),'EVIDENCE_REQUIRED','Usable known-state record requires tier 2 evidence.');
    }
    if(record.sourceIds.some(value=>sourceMap.get(value).status!=='active')){
      fail(record.state!=='usable','SOURCE_HELD','Record using a non-active source cannot be usable.');
    }
  }
  for(const asset of assets){
    fail(asset.recordIds.every(value=>recordMap.has(value)),'RECORD_REF','Asset references missing record.');
    fail(asset.sourceIds.every(value=>sourceMap.has(value)),'SOURCE_REF','Asset references missing source.');
    const derivedSources=new Set(asset.recordIds.flatMap(value=>recordMap.get(value).sourceIds));
    fail(asset.sourceIds.every(value=>derivedSources.has(value)),'ASSET_LINEAGE','Asset source list includes unrelated source.');
  }
  for(const pkg of packages){
    fail(pkg.assetIds.every(value=>assetMap.has(value)),'ASSET_REF','Package references missing asset.');
    fail(pkg.recordIds.every(value=>recordMap.has(value)),'RECORD_REF','Package references missing record.');
    const derivedRecords=new Set(pkg.assetIds.flatMap(value=>assetMap.get(value).recordIds));
    fail(pkg.recordIds.every(value=>derivedRecords.has(value)),'PACKAGE_LINEAGE','Package record list includes unrelated record.');
    const derivedSources=new Set(pkg.assetIds.flatMap(value=>assetMap.get(value).sourceIds));
    fail(pkg.sourceIds.every(value=>derivedSources.has(value)),'PACKAGE_LINEAGE','Package source list includes unrelated source.');
    if(pkg.state==='ready')fail(pkg.assetIds.every(value=>assetMap.get(value).state==='current')&&
      pkg.recordIds.every(value=>recordMap.get(value).state==='usable')&&
      pkg.sourceIds.every(value=>sourceMap.get(value).status==='active'),
      'PACKAGE_READY','Ready package depends on held or non-current material.');
  }
  const result={schema:CATALOG_SCHEMA,catalogId:input.catalogId,asOf:input.asOf,
    sources:sorted(sources,row=>row.sourceId),records:sorted(records,row=>row.recordId),
    assets:sorted(assets,row=>row.assetId),packages:sorted(packages,row=>row.packageId),digest:''};
  result.digest=bodyDigest(result);noIdentity(result);return result;
}
export function validateImpactCatalog(input) {
  exact(input,['schema','catalogId','asOf','sources','records','assets','packages','digest']);
  fail(input.schema===CATALOG_SCHEMA,'SCHEMA','Unsupported impact catalog.');
  const result=createImpactCatalog({catalogId:input.catalogId,asOf:input.asOf,sources:input.sources,
    records:input.records,assets:input.assets,packages:input.packages});hash(input.digest);
  fail(result.digest===input.digest,'HASH','Impact catalog digest invalid.');
  return result;
}
export function catalogIndexes(input) {
  const catalog=validateImpactCatalog(input);
  return {
    sources:new Map(catalog.sources.map(row=>[row.sourceId,row])),
    records:new Map(catalog.records.map(row=>[row.recordId,row])),
    assets:new Map(catalog.assets.map(row=>[row.assetId,row])),
    packages:new Map(catalog.packages.map(row=>[row.packageId,row])),
  };
}
