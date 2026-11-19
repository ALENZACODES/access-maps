import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
import { CLAIM_SCHEMA } from './claim-trace-core.mjs';

export function source(overrides = {}) {
  return {
    id: 'source-map', provider: 'osm', family: 'osm', name: 'Map data',
    url: SOURCES.osm.sourceUrl, licence: SOURCES.osm.licence,
    licenceUrl: SOURCES.osm.licenceUrl, permission: 'YES', tier: 'primary',
    acquiredDate: '2026-01-05', datasetDate: 'UNKNOWN', termsDate: '2026-01-02',
    notice: SOURCES.osm.notices.en.join('\n'), state: 'included', ...overrides,
  };
}
export function reference(overrides = {}) {
  return {
    id: 'reference-map', sourceId: 'source-map', url: 'https://example.org/mapping/statement',
    title: 'Map source document', date: '2026-01-05', tier: 'primary',
    excerpt: 'A documented observation', language: 'en', ...overrides,
  };
}
export function claim(overrides = {}) {
  return {
    id: 'claim-map', kind: 'place', sourceIds: ['source-map'],
    referenceIds: ['reference-map'], text: 'The map displays the recorded location.',
    language: 'en', observedDate: '2026-01-05', status: 'included',
    disclosure: 'evidence', notes: '', ...overrides,
  };
}
export function surface(overrides = {}) {
  return {
    id: 'surface-map', language: 'en', route: 'places/map.html',
    claimIds: ['claim-map'], sourceIds: ['source-map'],
    offline: 'YES', keyboard: 'YES', screenReader: 'YES', targetPx: 44,
    mapCredit: 'YES', publishedDate: 'UNKNOWN', ...overrides,
  };
}
export function release(overrides = {}) {
  return {
    schema: CLAIM_SCHEMA, releaseId: 'release-one', sources: [source()],
    references: [reference()], claims: [claim()], surfaces: [surface()], ...overrides,
  };
}
export function auaSource(overrides = {}) {
  return source({
    id: 'source-aua', provider: 'metrolinx', family: 'metrolinx-aua',
    name: 'Transit feed', url: SOURCES.metrolinx.sourceUrl,
    licence: 'Metrolinx Access and Use Agreement',
    licenceUrl: SOURCES.metrolinx.sourceUrl,
    notice: [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR].join('\n'),
    ...overrides,
  });
}
export function oglSource(overrides = {}) {
  return source({
    id: 'source-ogl', provider: 'metrolinx', family: 'metrolinx-ogl',
    name: 'Open government dataset', url: SOURCES.metrolinx.sourceUrl,
    licence: 'Open Government Licence – Ontario – Metrolinx',
    licenceUrl: SOURCES.metrolinx.licenceUrl, notice: METROLINX_OGL_NOTICE, ...overrides,
  });
}
export function ltcSource(overrides = {}) {
  return source({
    id: 'source-ltc', provider: 'ltc', family: 'ltc', name: 'LTC service data',
    url: SOURCES.ltc.sourceUrl, licence: 'LTC Open Data Terms of Use',
    licenceUrl: SOURCES.ltc.licenceUrl, notice: SOURCES.ltc.notices.en[0], ...overrides,
  });
}
export function copy(value) { return structuredClone(value); }
