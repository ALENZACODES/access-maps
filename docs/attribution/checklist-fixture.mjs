import {emptyChecklist,newSource,newView,newObservation,OSM_CREDIT} from './checklist-core.mjs';
/** Fictional fixture. Names and paths are not evidence about actual places. */
export function fixture(){
  const src={...newSource('osm'),name:'Fictional map geometry',sourceUrl:'https://www.openstreetmap.org/copyright',licence:'ODbL',licenceUrl:'https://www.openstreetmap.org/copyright',retrievedOn:'2026-11-20',tier:'imported',permission:'yes',credit:OSM_CREDIT};
  const view={...newView('fictional-map',['osm']),title:'Fictional map view',route:'/fixture-map',locale:'en',included:'yes',kind:'map',mapCreditNearMap:'yes'};
  const observations=['visual','keyboard','screen-reader','touch'].map((method,index)=>({...newObservation(`record${index+1}`,view.id,src.id,method),observedOn:'2026-11-20',noticeText:OSM_CREDIT,placement:'near-map',noticePresent:'yes',licenceAvailable:'yes',keyboardReachable:'yes',screenReaderReadable:'yes',focusVisible:'yes',targetPx:44,evidence:'fictional manual fixture'}));
  return {...emptyChecklist(),title:'Fictional review',sources:[src],views:[view],observations};
}
