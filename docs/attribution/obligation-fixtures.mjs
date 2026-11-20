/** Small explicit test builders, not deployed provider data or invented releases. */
import { OBLIGATION_SCHEMA } from './obligation-core.mjs';
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';
export function source(overrides = {}) {
  return {
    id: 'osm-source', provider: 'osm', title: 'Example map source',
    sourceUrl: SOURCES.osm.sourceUrl, licenceUrl: SOURCES.osm.licenceUrl,
    licenceName: 'Open Database License (ODbL) 1.0', licenceId: 'ODbL-1.0',
    permission: 'YES', tier: 'primary', acquiredOn: '2026-01-04',
    datasetAsOf: 'UNKNOWN', termsReviewedOn: '2026-01-03',
    attribution: '© OpenStreetMap contributors\nOpen Database License (ODbL) 1.0',
    state: 'included', ...overrides,
  };
}
export function page(overrides = {}) {
  return {
    id: 'map-en', path: 'pages/map-en.html', locale: 'en', display: 'map',
    sourceIds: ['osm-source'], offline: 'YES', keyboard: 'YES', screenReader: 'YES',
    targetPx: 44, publishedOn: 'UNKNOWN', ...overrides,
  };
}
export function witness(overrides = {}) {
  return {
    id: 'osm-document', sourceId: 'osm-source', url: SOURCES.osm.sourceUrl,
    recordedOn: '2026-01-05', tier: 'primary', type: 'source-document',
    note: 'Manual source terms note', ...overrides,
  };
}
export function placement(overrides = {}) {
  return {
    id: 'map-credit', pageId: 'map-en', sourceId: 'osm-source',
    kind: 'credit', notice: '© OpenStreetMap contributors',
    elementId: 'source-credit', visibility: 'visible', nearMap: 'YES',
    witnessIds: ['osm-document'], ...overrides,
  };
}
export function obligation(overrides = {}) {
  return {
    schema: OBLIGATION_SCHEMA, releaseId: 'release-example',
    sources: [source()], pages: [page()],
    placements: [placement(), placement({ id: 'map-licence', kind: 'licence', elementId: 'source-licence', notice: 'Open Database License (ODbL) 1.0' })],
    witnesses: [witness()], ...overrides,
  };
}
export function frenchPair() {
  const initial = obligation();
  const frPage = page({ id: 'map-fr', locale: 'fr', path: 'pages/map-fr.html' });
  return {
    ...initial,
    pages: [...initial.pages, frPage],
    placements: [...initial.placements,
      placement({ id: 'credit-fr', pageId: 'map-fr', elementId: 'source-credit-fr' }),
      placement({ id: 'licence-fr', pageId: 'map-fr', kind: 'licence', notice: 'Open Database License (ODbL) 1.0', elementId: 'source-licence-fr' }),
    ],
  };
}
export function aua() {
  return source({
    id: 'aua-source', provider: 'metrolinx-aua', title: 'Example agreement source',
    sourceUrl: SOURCES.metrolinx.sourceUrl, licenceUrl: SOURCES.metrolinx.sourceUrl,
    licenceName: 'Metrolinx Access and Use Agreement', licenceId: 'Metrolinx-AUA',
    attribution: [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR].join('\n'),
  });
}
export function ogl() {
  return source({
    id: 'ogl-source', provider: 'metrolinx-ogl', title: 'Example open-government source',
    sourceUrl: SOURCES.metrolinx.sourceUrl, licenceUrl: SOURCES.metrolinx.licenceUrl,
    licenceName: 'Open Government Licence – Ontario – Metrolinx', licenceId: 'OGL-Ontario-Metrolinx',
    attribution: METROLINX_OGL_NOTICE,
  });
}
export function ltc() {
  return source({
    id: 'ltc-source', provider: 'ltc', title: 'Example transit source',
    sourceUrl: SOURCES.ltc.sourceUrl, licenceUrl: SOURCES.ltc.licenceUrl,
    licenceName: 'LTC Open Data Terms of Use', licenceId: 'LTC-Open-Data-Terms',
    attribution: SOURCES.ltc.notices.en[0],
  });
}
export function providerRecord(item, locale = 'en') {
  const kinds = item.provider === 'metrolinx-aua' ? ['terms', 'laws'] : item.provider === 'metrolinx-ogl' ? ['licence'] : item.provider === 'ltc' ? ['credit'] : ['credit', 'licence'];
  const catalogueText = {
    'osm': { credit: '© OpenStreetMap contributors', licence: 'Open Database License (ODbL) 1.0' },
    'metrolinx-aua': { terms: METROLINX_AUA_LEGEND, laws: locale === 'fr' ? METROLINX_AUA_END_USER_LAWS_FR : METROLINX_AUA_END_USER_LAWS_EN },
    'metrolinx-ogl': { licence: METROLINX_OGL_NOTICE },
    'ltc': { credit: SOURCES.ltc.notices[locale][0] },
  };
  const pageId = `page-${item.id}-${locale}`;
  const witnessId = `proof-${item.id}`;
  return {
    schema: OBLIGATION_SCHEMA, releaseId: 'release-providers',
    sources: [item],
    pages: [page({ id: pageId, locale, path: `pages/${pageId}.html`, sourceIds: [item.id], display: item.provider === 'osm' ? 'map' : 'journey' })],
    witnesses: [witness({ id: witnessId, sourceId: item.id, url: item.sourceUrl })],
    placements: kinds.map((kind, index) => placement({
      id: `notice-${index}`, pageId, sourceId: item.id, kind,
      notice: catalogueText[item.provider]?.[kind] ?? item.attribution,
      elementId: `element-${index}`, witnessIds: [witnessId],
    })),
  };
}
