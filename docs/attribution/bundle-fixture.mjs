import {SCHEMA,OSM_CREDIT,UNKNOWN} from './bundle-core.mjs';
/** Fictional view and asset; only the source credit text is canonical. */
export function fixture() {
  return {
    schema:SCHEMA,title:'Fictional publication disclosure',
    sources:[{
      id:'osm-source',name:'Fictional OpenStreetMap-derived geometry',
      sourceUrl:'https://www.openstreetmap.org/copyright',licence:'Open Database License 1.0',
      licenceUrl:'https://www.openstreetmap.org/copyright',family:'ODbL',
      retrievedOn:'2026-11-19',tier:'imported',permission:'yes',
      credit:OSM_CREDIT,datasetAsOf:UNKNOWN,
    }],
    views:[{
      id:'fictional-map',titleEn:'Fictional sample map',titleFr:'Carte fictive',
      route:'/fictional-map',delivery:'map',included:'yes',notesEn:'Fixture only',notesFr:'Exemple fictif',
    }],
    assets:[{
      id:'fictional-path',label:'Fictional path geometry',viewId:'fictional-map',
      sourceIds:['osm-source'],geometrySourceIds:['osm-source'],included:'yes',notes:'Fixture',
    }],
    uses:[{
      id:'fictional-source-use',viewId:'fictional-map',assetId:'fictional-path',
      sourceId:'osm-source',required:'yes',notes:'Fixture',
    }],
    notices:[
      {id:'notice-en',useId:'fictional-source-use',locale:'en',text:OSM_CREDIT,
        placement:'near-map',visible:'yes',keyboard:'yes',screenReader:'yes',observedOn:'2026-11-19'},
      {id:'notice-fr',useId:'fictional-source-use',locale:'fr',text:OSM_CREDIT,
        placement:'near-map',visible:'yes',keyboard:'yes',screenReader:'yes',observedOn:'2026-11-19'},
    ],
    observations:[
      {id:'observation-visual',viewId:'fictional-map',method:'visual',observedOn:'2026-11-19',result:'yes',minimumTargetPx:UNKNOWN,evidence:'Fixture observation'},
      {id:'observation-keyboard',viewId:'fictional-map',method:'keyboard',observedOn:'2026-11-19',result:'yes',minimumTargetPx:UNKNOWN,evidence:'Fixture observation'},
      {id:'observation-reader',viewId:'fictional-map',method:'screen-reader',observedOn:'2026-11-19',result:'yes',minimumTargetPx:UNKNOWN,evidence:'Fixture observation'},
      {id:'observation-touch',viewId:'fictional-map',method:'touch',observedOn:'2026-11-19',result:'yes',minimumTargetPx:44,evidence:'Fixture observation'},
    ],
  };
}
export function changedFixture(callback) {
  const state=fixture();callback(state);return state;
}
export function secondSourceFixture() {
  const state=fixture();
  state.sources.push({id:'fictional-other',name:'Fictional separately licensed data',sourceUrl:'https://example.org/source',
    licence:'Example terms',licenceUrl:'https://example.org/terms',family:'other',retrievedOn:UNKNOWN,
    tier:'manual',permission:'UNKNOWN',credit:'Credit supplied in example',datasetAsOf:UNKNOWN});
  state.assets[0].sourceIds.push('fictional-other');
  state.uses.push({id:'fictional-second-use',viewId:'fictional-map',assetId:'fictional-path',
    sourceId:'fictional-other',required:'yes',notes:'Fixture'});
  return state;
}
