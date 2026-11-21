import {sha256} from './p15af-contract.mjs';
import {createImpactCatalog} from './p15af-catalog.mjs';
export const DAY='2026-11-21',NEXT='2026-11-22',LATER='2026-11-23';
export const sourceDigest=sha256('source-snapshot-one');
export function source(patch={}) {
 return {sourceId:'source-one',licence:'CC-BY-4.0',silo:'open',status:'active',
  observedOn:DAY,retrievedOn:NEXT,sourceDigest,reference:'sources/source-one.json',
  attribution:{en:'Source attribution',fr:'Attribution de la source'},
  ownerToken:'actor-source-steward',statusReason:'Source record supplied for review.',...patch};
}
export function evidence(patch={}) {
 return {evidenceId:'evidence-one',sourceId:'source-one',digest:sourceDigest,
  observedOn:DAY,retrievedOn:NEXT,tier:2,...patch};
}
export function record(patch={}) {
 return {recordId:'record-one',recordDigest:sha256('record-one'),accessState:'YES',
  feature:'entrance',state:'usable',sourceIds:['source-one'],evidence:[evidence()],
  updatedOn:NEXT,reason:'Record evidence supplied for review.',...patch};
}
export function asset(patch={}) {
 return {assetId:'asset-one',path:'assets/asset-one.json',digest:sha256('asset-one'),
  bytes:120,state:'current',recordIds:['record-one'],sourceIds:['source-one'],builtOn:NEXT,...patch};
}
export function pkg(patch={}) {
 return {packageId:'package-one',version:1,state:'ready',assetIds:['asset-one'],
  recordIds:['record-one'],sourceIds:['source-one'],builtOn:NEXT,digest:sha256('package-one'),...patch};
}
export function catalog(options={}) {
 return createImpactCatalog({catalogId:'catalog-one',asOf:NEXT,
  sources:options.sources??[source()],records:options.records??[record()],
  assets:options.assets??[asset()],packages:options.packages??[pkg()]});
}
