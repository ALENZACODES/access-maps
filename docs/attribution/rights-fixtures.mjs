/** Test-only, explicit records. No provider feeds or licence decisions inferred. */
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';
import { RIGHTS_SCHEMA } from './rights-core.mjs';
const BASE_URL = 'https://example.org/rights';
export function source(overrides = {}) {
  return {
    id: 'osm-base', provider: 'osm', name: 'OSM local map subset',
    licenceId: 'ODbL-1.0', licenceName: 'Open Database License (ODbL) 1.0',
    sourceUrl: SOURCES.osm.sourceUrl, licenceUrl: SOURCES.osm.licenceUrl,
    termsUrl: SOURCES.osm.sourceUrl, acquiredOn: '2026-05-01',
    datasetAsOf: 'UNKNOWN', termsReviewedOn: '2026-04-21',
    evidenceTier: 'primary', evidenceUrl: `${BASE_URL}/osm`,
    permission: 'YES', redistribution: 'YES', derivativeUse: 'YES',
    openLicenceEvidence: 'YES', shareAlikeRequired: 'YES',
    attribution: SOURCES.osm.notices.en.join('\n'), publication: 'included',
    ...overrides,
  };
}
export function auaSource(overrides = {}) {
  return source({
    id: 'transit-aua', provider: 'metrolinx', name: 'Transit source record',
    licenceId: 'Metrolinx-AUA', licenceName: 'Metrolinx Access and Use Agreement',
    sourceUrl: SOURCES.metrolinx.sourceUrl, licenceUrl: SOURCES.metrolinx.sourceUrl,
    termsUrl: SOURCES.metrolinx.sourceUrl, evidenceUrl: `${BASE_URL}/aua`,
    shareAlikeRequired: 'NO',
    attribution: [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN,
      METROLINX_AUA_END_USER_LAWS_FR].join('\n'),
    ...overrides,
  });
}
export function oglSource(overrides = {}) {
  return source({
    id: 'transit-ogl', provider: 'metrolinx', name: 'Open licensed transit source',
    licenceId: 'OGL-Ontario-Metrolinx', licenceName: 'Open Government Licence – Ontario – Metrolinx',
    sourceUrl: SOURCES.metrolinx.sourceUrl, licenceUrl: SOURCES.metrolinx.licenceUrl,
    termsUrl: SOURCES.metrolinx.licenceUrl, evidenceUrl: `${BASE_URL}/ogl`,
    shareAlikeRequired: 'NO', attribution: METROLINX_OGL_NOTICE,
    ...overrides,
  });
}
export function ltcSource(overrides = {}) {
  return source({
    id: 'ltc-base', provider: 'ltc', name: 'Local transit source',
    licenceId: 'LTC-Open-Data-Terms', licenceName: 'LTC Open Data Terms of Use',
    sourceUrl: SOURCES.ltc.sourceUrl, licenceUrl: SOURCES.ltc.licenceUrl,
    termsUrl: SOURCES.ltc.licenceUrl, evidenceUrl: `${BASE_URL}/ltc`,
    shareAlikeRequired: 'NO', attribution: SOURCES.ltc.notices.en[0],
    ...overrides,
  });
}
export function otherSource(overrides = {}) {
  return source({
    id: 'independent-open', provider: 'other', name: 'Published open source',
    licenceId: 'OTHER-OPEN', licenceName: 'CC-BY-4.0',
    sourceUrl: `${BASE_URL}/independent`, licenceUrl: `${BASE_URL}/licence`,
    termsUrl: `${BASE_URL}/terms`, evidenceUrl: `${BASE_URL}/evidence`,
    shareAlikeRequired: 'NO', attribution: '© Independent data contributors — CC-BY-4.0',
    ...overrides,
  });
}
export function output(overrides = {}) {
  return {
    id: 'map-en', name: 'Offline map page', locale: 'en', kind: 'map',
    distribution: 'offline', transformation: 'unaltered', sourceIds: ['osm-base'],
    route: 'pages/map-en.html', state: 'included',
    attribution: source().attribution, mapCredit: 'YES', licenceLink: 'YES',
    redistributionNotice: 'YES', shareAlikePublished: 'YES',
    separatedDatasets: 'YES', offlineAvailable: 'YES',
    keyboardAccessible: 'YES', screenReaderLabelled: 'YES',
    minimumTargetPx: 44, publishedOn: 'UNKNOWN',
    ...overrides,
  };
}
export function exception(overrides = {}) {
  return {
    id: 'decision-one', sourceId: 'osm-base', outputId: 'map-en',
    issue: 'Source rights assessment pending',
    evidenceUrl: `${BASE_URL}/decision`, recordedOn: '2026-05-04',
    reviewer: 'Local editorial reviewer', disposition: 'resolved',
    reason: 'Primary rights documentation attached to the record',
    ...overrides,
  };
}
export function matrix(overrides = {}) {
  return {schema: RIGHTS_SCHEMA, releaseId: 'release-one',
    sources: [source()], outputs: [output()], exceptions: [], ...overrides};
}
export function withSources(items, overrides = {}) {
  const outputs = items.map((item, index) => output({
    id: `page-${index}`, name: `Source page ${index}`, kind: 'list',
    locale: index % 2 === 0 ? 'en' : 'fr', route: `pages/source-${index}.html`,
    sourceIds: [item.id], attribution: item.attribution, mapCredit: 'YES',
  }));
  return matrix({sources: items, outputs, ...overrides});
}
