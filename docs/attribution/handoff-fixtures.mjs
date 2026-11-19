/** Synthetic fixtures used only by the test suites, never production data. */
import {
  HANDOFF_SCHEMA,
  parseHandoffPack,
} from './handoff-core.mjs';
import {
  METROLINX_AUA_LEGEND,
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
  METROLINX_OGL_NOTICE,
  SOURCES,
} from './attribution-utils.mjs';
const DATE = '2026-01-10';
const DIGEST = 'a'.repeat(64);
export function source(overrides = {}) {
  return {
    id: 'osm-a', provider: 'osm', name: 'Map reference',
    sourceUrl: SOURCES.osm.sourceUrl, licenceName: 'Open Database License (ODbL) 1.0',
    licenceUrl: SOURCES.osm.licenceUrl, permission: 'YES', tier: 'primary',
    datasetDate: 'UNKNOWN', acquiredDate: '2026-01-09', termsDate: '2026-01-08',
    notice: '© OpenStreetMap contributors', status: 'included',
    evidenceUrl: 'https://example.org/map-evidence', ...overrides,
  };
}
export function auaSource(overrides = {}) {
  return source({
    id: 'aua-a', provider: 'metrolinx-aua', name: 'Transit record A',
    sourceUrl: SOURCES.metrolinx.sourceUrl, licenceName: 'Metrolinx Access and Use Agreement',
    licenceUrl: SOURCES.metrolinx.sourceUrl,
    notice: [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN,
      METROLINX_AUA_END_USER_LAWS_FR].join('\n'),
    ...overrides,
  });
}
export function oglSource(overrides = {}) {
  return source({
    id: 'ogl-a', provider: 'metrolinx-ogl', name: 'Transit record B',
    sourceUrl: SOURCES.metrolinx.sourceUrl, licenceName: 'Open Government Licence - Ontario - Metrolinx',
    licenceUrl: SOURCES.metrolinx.licenceUrl,
    notice: METROLINX_OGL_NOTICE, ...overrides,
  });
}
export function ltcSource(overrides = {}) {
  return source({
    id: 'ltc-a', provider: 'ltc', name: 'Transit reference C',
    sourceUrl: SOURCES.ltc.sourceUrl, licenceName: 'LTC Open Data Terms of Use',
    licenceUrl: SOURCES.ltc.licenceUrl,
    notice: 'Data provided by the London Transit Commission (LTC) under its Open Data Terms of Use.',
    ...overrides,
  });
}
export function surface(overrides = {}) {
  return {
    id: 'map-en', mode: 'map', locale: 'en', sourceIds: ['osm-a'],
    offline: 'YES', keyboard: 'YES', screenReader: 'YES', mapCredit: 'YES',
    targetPx: 44, publicationDate: DATE, ...overrides,
  };
}
export function handoff(overrides = {}) {
  return {
    id: 'handoff-a', surfaceIds: ['map-en'], sourceIds: ['osm-a'],
    recipient: 'local-device', purpose: 'Review source notices offline',
    format: 'json', scope: 'attribution-only', approval: 'YES',
    approvedDate: DATE, expiresDate: '2027-01-10', digest: DIGEST,
    ...overrides,
  };
}
export function pack(overrides = {}) {
  return {
    schema: HANDOFF_SCHEMA,
    releaseId: 'sample-release',
    policy: {
      audience: 'internal', purposeEn: 'Review sources before publication',
      purposeFr: 'Consulter les sources avant publication',
      retention: 'ephemeral', contact: 'none', reviewDate: DATE,
    },
    sources: [source()], surfaces: [surface()], handoffs: [handoff()],
    ...overrides,
  };
}
export function parsed(overrides = {}) { return parseHandoffPack(pack(overrides)); }
export function publicPack() {
  return pack({
    policy: { ...pack().policy, audience: 'public' },
    surfaces: [surface(), surface({ id: 'map-fr', locale: 'fr' })],
    handoffs: [handoff({ surfaceIds: ['map-en', 'map-fr'], recipient: 'public-download' })],
  });
}
export function fourProviders() {
  return pack({
    sources: [source(), auaSource(), oglSource(), ltcSource()],
    surfaces: [surface({ mode: 'journey', sourceIds: ['osm-a', 'aua-a', 'ogl-a', 'ltc-a'] })],
    handoffs: [handoff({ sourceIds: ['osm-a', 'aua-a', 'ogl-a', 'ltc-a'] })],
  });
}
