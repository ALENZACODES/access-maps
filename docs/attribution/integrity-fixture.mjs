import {blankRegister,OSM_CREDIT,UNKNOWN,METHODS,newSource,newAsset,newCheck,newMeasurement} from './integrity-core.mjs';
export const HASH_A='a'.repeat(64);
export const HASH_B='b'.repeat(64);
/** Synthetic test-only source. No real site or place is described. */
export function fixture() {
  const source={...newSource('source-osm'),name:'Fictional ODbL example',sourceUrl:'https://www.openstreetmap.org/copyright',licence:'ODbL',licenceUrl:'https://www.openstreetmap.org/copyright',retrievedOn:'2026-11-19',tier:'imported',credit:OSM_CREDIT,permission:'yes'};
  const asset={...newAsset('asset-map'),label:'Fictional map geometry',fileName:'fictional-map.pmtiles',kind:'basemap',sourceIds:[source.id],sha256:HASH_A,byteLength:150,status:'included',route:'/fictional-map'};
  const checks=METHODS.map((method,index)=>({...newCheck(`check-${index+1}`,asset.id,source.id,method),noticeText:OSM_CREDIT,placement:'beside-map',observedOn:'2026-11-19',creditPresent:'yes',licenceShown:'yes',focusVisible:'yes',targetPx:44,evidence:'Fictional observation, manually entered'}));
  return {...blankRegister(),title:'Fictional source file integrity',sources:[source],assets:[asset],checks,measurements:[{...newMeasurement('measurement-1',asset.id,HASH_A,150),checkedOn:'2026-11-19',notes:'Fictional local hash'}]};
}
export function twoAssets() {
  const model=fixture();
  const source={...newSource('other-source'),name:'Fictional second source',sourceUrl:'https://example.org/data',licence:'OGL example',licenceUrl:'https://example.org/terms',retrievedOn:'2026-11-18',tier:'manual',credit:'Fictional data source',permission:'yes'};
  const asset={...newAsset('asset-list'),label:'Fictional list data',fileName:'fictional-list.json',kind:'document',sourceIds:[source.id],sha256:HASH_B,byteLength:25,status:'included',route:'/fictional-list'};
  model.sources.push(source);
  model.assets.push(asset);
  model.checks.push(...METHODS.map((method,i)=>({...newCheck(`other-check-${i+1}`,asset.id,source.id,method),noticeText:source.credit,placement:'visible-panel',observedOn:'2026-11-18',creditPresent:'yes',licenceShown:'yes',focusVisible:'yes',targetPx:48,evidence:'Synthetic observation'})));
  model.measurements.push({...newMeasurement('measurement-2',asset.id,HASH_B,25),checkedOn:'2026-11-18'});
  return model;
}
export function clone(value) {return JSON.parse(JSON.stringify(value));}
export function withUnknownFields() {
  const model=fixture();
  model.sources[0].sourceUrl=UNKNOWN;
  model.sources[0].licenceUrl=UNKNOWN;
  model.sources[0].retrievedOn=UNKNOWN;
  model.sources[0].tier=UNKNOWN;
  model.assets[0].sha256=UNKNOWN;
  model.assets[0].byteLength=UNKNOWN;
  return model;
}
