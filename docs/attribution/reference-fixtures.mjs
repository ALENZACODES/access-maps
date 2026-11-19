import { REFERENCE_SCHEMA } from './reference-core.mjs';
import { SOURCES } from './attribution-utils.mjs';
export function fixturePack(){
  return {
    schema:REFERENCE_SCHEMA,releaseId:'release-one',
    sources:[{id:'map-source',provider:'osm',licence:'ODbL-1.0',licenceUrl:SOURCES.osm.licenceUrl,sourceUrl:SOURCES.osm.sourceUrl,permission:'YES',tier:'primary',datasetDate:'UNKNOWN',acquiredDate:'2026-01-12',termsDate:'2026-01-10',notice:SOURCES.osm.notices.en.join('\n'),state:'included',referenceIds:['map-proof']}],
    references:[{id:'map-proof',sourceId:'map-source',title:'Map data provenance',url:'https://example.org/source',licenceUrl:SOURCES.osm.licenceUrl,collectedDate:'2026-01-10',termsDate:'2026-01-10',tier:'primary',offlineNote:'Local source note',sha256:'a'.repeat(64),language:'en'}],
    surfaces:[{id:'map-screen',language:'en',sourceIds:['map-source'],referenceIds:['map-proof'],mapCredit:'YES',offline:'YES',keyboard:'YES',screenReader:'YES',targetPx:44,route:'pages/map.html'}],
  };
}
