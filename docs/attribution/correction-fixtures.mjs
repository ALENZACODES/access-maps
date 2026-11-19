/** Construct compact, valid test records; callers explicitly override individual fields. */
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
import { CORRECTION_SCHEMA } from './correction-core.mjs';
export function source(fields={}) {
  return {
    id:'osm-one',provider:'osm',name:'OpenStreetMap',sourceUrl:SOURCES.osm.sourceUrl,
    licenceUrl:SOURCES.osm.licenceUrl,licence:'ODbL-1.0',permission:'YES',
    datasetDate:'UNKNOWN',acquisitionDate:'2026-11-01',termsDate:'2026-10-01',
    notice:SOURCES.osm.notices.en.join('\n'),tier:'primary',included:'YES',...fields,
  };
}
export function evidence(fields={}) {
  return {
    id:'map-evidence',title:'Source notes',url:'https://example.org/notes',
    licenceUrl:SOURCES.osm.licenceUrl,collectedOn:'2026-11-01',tier:'primary',
    language:'en',excerpt:'Map attribution and terms are recorded.',sourceId:'osm-one',...fields,
  };
}
export function correction(fields={}) {
  return {
    id:'case-one',sourceId:'osm-one',surfaceId:'surface-one',issue:'notice',
    state:'resolved',openedOn:'2026-11-01',updatedOn:'2026-11-03',
    summary:'Correct a displayed credit',currentText:'Earlier credit text',
    proposedText:'© OpenStreetMap contributors',permission:'YES',
    evidenceIds:['map-evidence'],decision:'accept',decisionOn:'2026-11-03',
    decisionNote:'Source conditions support the replacement.',assignee:'UNKNOWN',locale:'en',...fields,
  };
}
export function surface(fields={}) {
  return {
    id:'surface-one',route:'pages/map-en.html',locale:'en',sourceIds:['osm-one'],
    caseIds:['case-one'],offline:'YES',keyboard:'YES',screenReader:'YES',
    minimumTargetPx:44,publishedOn:'UNKNOWN',...fields,
  };
}
export function register(fields={}) {
  return {
    schema:CORRECTION_SCHEMA,releaseId:'release-one',sources:[source()],
    evidence:[evidence()],cases:[correction()],surfaces:[surface()],
    localePairRequired:false,...fields,
  };
}
export function pairRegister(fields={}) {
  const frSurface=surface({id:'surface-fr',route:'pages/map-fr.html',locale:'fr',caseIds:[]});
  return register({surfaces:[surface(),frSurface],localePairRequired:true,...fields});
}
export function metrolinxAua(fields={}) {
  return source({id:'metro-one',provider:'metrolinx',name:'Metrolinx',
    sourceUrl:SOURCES.metrolinx.sourceUrl,licenceUrl:SOURCES.metrolinx.licenceUrl,
    licence:'Metrolinx-AUA',notice:[METROLINX_AUA_LEGEND,
      METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join('\n'),...fields});
}
export function metrolinxOgl(fields={}) {
  return metrolinxAua({id:'metro-ogl',licence:'OGL-Ontario-Metrolinx',notice:METROLINX_OGL_NOTICE,...fields});
}
export function ltcSource(fields={}) {
  return source({id:'ltc-one',provider:'ltc',name:'London Transit Commission',
    sourceUrl:SOURCES.ltc.sourceUrl,licenceUrl:SOURCES.ltc.licenceUrl,
    licence:'LTC-Open-Data-Terms',notice:SOURCES.ltc.notices.en[0],...fields});
}
export function emptyRegister() {
  return register({sources:[],evidence:[],cases:[],surfaces:[]});
}
export function clone(value) { return structuredClone(value); }
export function withCase(value) { return register({cases:[correction(value)]}); }
export function withSource(value) { return register({sources:[source(value)]}); }
export function withSurface(value) { return register({surfaces:[surface(value)]}); }
export function withEvidence(value) { return register({evidence:[evidence(value)]}); }
export function replaceCase(input,changes) {
  return register({...input,cases:input.cases.map((item,i)=>i===0?{...item,...changes}:item)});
}
export function replaceSource(input,changes) {
  return register({...input,sources:input.sources.map((item,i)=>i===0?{...item,...changes}:item)});
}
export function replaceSurface(input,changes) {
  return register({...input,surfaces:input.surfaces.map((item,i)=>i===0?{...item,...changes}:item)});
}
