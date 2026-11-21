import {emptyTrace, OSM_CREDIT, makeSource, makeLayer, makeSurface, makeNotice} from './trace-core.mjs';
export function fixture() {
  return {
    ...emptyTrace(),title:'Fictional map',
    sources:[{...makeSource('osm-geom','Fictional source'),sourceUrl:'https://www.openstreetmap.org/copyright',licence:'ODbL',licenceUrl:'https://www.openstreetmap.org/copyright',retrievedOn:'2026-11-19',tier:'imported',credit:OSM_CREDIT,permission:'yes'}],
    surfaces:[{...makeSurface('map-en','Fictional map','en'),route:'/map',mapShown:'yes',keyboard:'yes',screenReader:'yes',focusVisible:'yes',minimumTargetPx:44}],
    layers:[{...makeLayer('paths','Fictional geometry',['osm-geom'],['map-en']),mode:'route',status:'included',geometrySourceIds:['osm-geom']}],
    notices:[{...makeNotice('notice-en','osm-geom','paths','map-en','en'),text:OSM_CREDIT,placement:'adjacent',visible:'yes',focusable:'yes',readable:'yes',observedOn:'2026-11-19'}],
  };
}
