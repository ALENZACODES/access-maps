import { emptyTrace, makeSource, makeLayer, makeSurface, makeNotice, OSM_CREDIT } from './trace-core.mjs';
import { emptyPairs, newPair } from './parity-core.mjs';
/** Synthetic records only. These are not observations of a real place. */
export function fixture() {
  const source={...makeSource('fictional-osm','Fictional source'),sourceUrl:'https://www.openstreetmap.org/copyright',licence:'ODbL',licenceUrl:'https://www.openstreetmap.org/copyright',credit:OSM_CREDIT,retrievedOn:'2026-11-19',tier:'imported',permission:'yes'};
  const en={...makeSurface('synthetic-en','Fictional map EN','en'),route:'/synthetic/en',mapShown:'yes',keyboard:'yes',screenReader:'yes',focusVisible:'yes',minimumTargetPx:44};
  const fr={...makeSurface('synthetic-fr','Carte fictive FR','fr'),route:'/synthetic/fr',mapShown:'yes',keyboard:'yes',screenReader:'yes',focusVisible:'yes',minimumTargetPx:44};
  const layer={...makeLayer('fictional-geometry','Fictional geometry',[source.id],[en.id,fr.id]),mode:'route',geometrySourceIds:[source.id],status:'included'};
  const enNotice={...makeNotice('notice-en',source.id,layer.id,en.id,'en'),text:OSM_CREDIT,placement:'adjacent',visible:'yes',readable:'yes',focusable:'yes',observedOn:'2026-11-19'};
  const frNotice={...makeNotice('notice-fr',source.id,layer.id,fr.id,'fr'),text:OSM_CREDIT,placement:'adjacent',visible:'yes',readable:'yes',focusable:'yes',observedOn:'2026-11-19'};
  const trace={...emptyTrace(),title:'Fictional bilingual source display',sources:[source],surfaces:[en,fr],layers:[layer],notices:[enNotice,frNotice]};
  const pair={...newPair('fictional-pair',en.id,fr.id),state:'included',reviewedOn:'2026-11-19',reviewTier:'manual',evidenceUrl:'https://example.org/evidence',parityObserved:'yes'};
  const pairs={...emptyPairs(),pairs:[pair]};
  return {trace,pairs};
}
