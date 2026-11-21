import {SCHEMA, OSM_CREDIT} from './dependency-core.mjs';
/** Deliberately fictional records for repeatable tests; never a provider feed. */
export function fixture() {
  return {
    schema: SCHEMA,
    title: 'Fictional offline map release',
    sources: [
      {id:'osm-data',name:'Fictional map geometry source',sourceUrl:'https://www.openstreetmap.org/copyright',
        licence:'ODbL',licenceUrl:'https://www.openstreetmap.org/copyright',retrievedOn:'2026-11-19',tier:'imported',
        permission:'yes',credit:OSM_CREDIT,notes:'Fictional fixture; terms require actual review'},
      {id:'local-info',name:'Fictional operator catalogue',sourceUrl:'https://example.org/source',
        licence:'Other public data terms',licenceUrl:'https://example.org/terms',retrievedOn:'2026-11-19',
        tier:'manual',permission:'yes',credit:'Fictional catalogue source',notes:'Fictional fixture'},
    ],
    assets: [
      {id:'geometry',label:'Fictional map geometry',path:'/maps/geometry.pmtiles',kind:'tile',sourceIds:['osm-data'],
        dependsOn:[],bytes:50200,mode:'included',notes:''},
      {id:'catalogue',label:'Fictional catalogue',path:'/data/catalogue.json',kind:'metadata',sourceIds:['local-info'],
        dependsOn:[],bytes:750,mode:'included',notes:''},
      {id:'map-ui',label:'Fictional map interface',path:'/app/map.html',kind:'interface',sourceIds:[],
        dependsOn:['geometry','catalogue'],bytes:1400,mode:'included',notes:'Both sources inherited'},
    ],
    surfaces: [
      {id:'map-en',label:'Fictional map view',route:'/map/en',locale:'en',assetIds:['map-ui'],
        keyboard:'yes',screenReader:'yes',focusVisible:'yes',minimumTargetPx:44,notes:'Fictional fixture',
        notices:[
          {sourceId:'osm-data',text:OSM_CREDIT,position:'adjacent',observedOn:'2026-11-19',visible:'yes',readable:'yes'},
          {sourceId:'local-info',text:'Fictional catalogue source',position:'visible-panel',observedOn:'2026-11-19',visible:'yes',readable:'yes'},
        ]},
    ],
  };
}
export function cloneFixture() {return structuredClone(fixture());}
