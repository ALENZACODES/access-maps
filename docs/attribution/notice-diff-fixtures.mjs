/** Synthetic unit-test records only; never shipped as provider datasets. */
import { NOTICE_SCHEMA, LEGAL_NOTICES } from './notice-diff-core.mjs';
import { SOURCES } from './attribution-utils.mjs';

export function source(options = {}) {
  return {
    id: 'map-source', provider: 'osm', licence: 'ODbL-1.0',
    sourceUrl: SOURCES.osm.sourceUrl, licenceUrl: SOURCES.osm.licenceUrl,
    licenceName: 'Open Database License (ODbL) 1.0',
    permission: 'YES', licenceEvidence: 'YES', tier: 'primary',
    acquiredDate: '2026-01-12', datasetDate: '2026-01-11', termsDate: '2026-01-10',
    state: 'included', note: '', ...options,
  };
}
export function notice(options = {}) {
  return {
    id: 'map-credit', sourceId: 'map-source', locale: 'en', kind: 'credit',
    text: LEGAL_NOTICES.osmCredit, visible: 'YES', nearMap: 'YES',
    termsUrl: SOURCES.osm.licenceUrl, recordedDate: '2026-01-12', ...options,
  };
}
export function licenceNotice(options = {}) {
  return notice({ id: 'map-licence', kind: 'licence', text: LEGAL_NOTICES.osmLicence, ...options });
}
export function surface(options = {}) {
  return {
    id: 'map-view', route: 'pages/map-en.html', locale: 'en', mode: 'map',
    sourceIds: ['map-source'], noticeIds: ['map-credit', 'map-licence'],
    offline: 'YES', keyboard: 'YES', screenReader: 'YES', targetPx: 44,
    publishedDate: '2026-01-13', ...options,
  };
}
export function release(options = {}) {
  return {
    schema: NOTICE_SCHEMA, releaseId: 'release-one',
    sources: [source()], notices: [notice(), licenceNotice()], surfaces: [surface()], ...options,
  };
}
export function auaSource(options = {}) {
  return source({ id: 'aua-feed', provider: 'metrolinx', licence: 'Metrolinx-AUA',
    sourceUrl: SOURCES.metrolinx.sourceUrl, licenceUrl: SOURCES.metrolinx.sourceUrl,
    licenceName: 'Metrolinx GTFS Access and Use Agreement', ...options });
}
export function oglSource(options = {}) {
  return source({ id: 'ogl-feed', provider: 'metrolinx', licence: 'Metrolinx-OGL',
    sourceUrl: SOURCES.metrolinx.sourceUrl, licenceUrl: SOURCES.metrolinx.licenceUrl,
    licenceName: 'Open Government Licence Ontario Metrolinx', ...options });
}
export function ltcSource(options = {}) {
  return source({ id: 'ltc-feed', provider: 'ltc', licence: 'LTC-Terms',
    sourceUrl: SOURCES.ltc.sourceUrl, licenceUrl: SOURCES.ltc.licenceUrl,
    licenceName: 'LTC Open Data Terms of Use', ...options });
}
export function auaRelease(options = {}) {
  const notices = [
    notice({ id: 'aua-legend', sourceId: 'aua-feed', kind: 'credit', text: LEGAL_NOTICES.aua[0], termsUrl: SOURCES.metrolinx.sourceUrl }),
    notice({ id: 'aua-laws-en', sourceId: 'aua-feed', kind: 'law', text: LEGAL_NOTICES.aua[1], termsUrl: SOURCES.metrolinx.sourceUrl }),
    notice({ id: 'aua-laws-fr', sourceId: 'aua-feed', kind: 'law', text: LEGAL_NOTICES.aua[2], termsUrl: SOURCES.metrolinx.sourceUrl }),
  ];
  return release({ sources: [auaSource()], notices,
    surfaces: [surface({ id: 'transit-view', route: 'pages/transit-en.html', mode: 'journey', sourceIds: ['aua-feed'], noticeIds: notices.map(n => n.id) })], ...options });
}
export function oglRelease(options = {}) {
  return release({ sources: [oglSource()],
    notices: [notice({ id: 'ogl-credit', sourceId: 'ogl-feed', text: LEGAL_NOTICES.ogl, termsUrl: SOURCES.metrolinx.licenceUrl })],
    surfaces: [surface({ id: 'ogl-view', route: 'pages/ogl-en.html', mode: 'journey', sourceIds: ['ogl-feed'], noticeIds: ['ogl-credit'] })], ...options });
}
export function ltcRelease(options = {}) {
  return release({ sources: [ltcSource()],
    notices: [notice({ id: 'ltc-credit', sourceId: 'ltc-feed', text: LEGAL_NOTICES.ltcEn, termsUrl: SOURCES.ltc.licenceUrl })],
    surfaces: [surface({ id: 'ltc-view', route: 'pages/ltc-en.html', mode: 'journey', sourceIds: ['ltc-feed'], noticeIds: ['ltc-credit'] })], ...options });
}
export function mutateSource(input, change) {
  return { ...input, sources: input.sources.map((s, i) => i === 0 ? { ...s, ...change } : s) };
}
export function mutateNotice(input, change) {
  return { ...input, notices: input.notices.map((n, i) => i === 0 ? { ...n, ...change } : n) };
}
export function mutateSurface(input, change) {
  return { ...input, surfaces: input.surfaces.map((s, i) => i === 0 ? { ...s, ...change } : s) };
}
export function duplicate(value) { return JSON.parse(JSON.stringify(value)); }
