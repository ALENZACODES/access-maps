/** Minimal known-good review materials for tests; never published as provider data. */
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';
import { DOCKET_SCHEMA } from './docket-core.mjs';
export function fixtureEvidence(overrides = {}) {
  return {
    id: 'osm-proof', sourceId: 'osm-source', title: 'Documented source terms',
    url: 'https://example.org/evidence/terms', tier: 'primary',
    observedOn: '2026-09-10', recordedOn: '2026-09-11',
    licenceUrl: SOURCES.osm.licenceUrl, summary: 'Public source terms inspected by an operator',
    ...overrides,
  };
}
export function fixtureSource(overrides = {}) {
  return {
    id: 'osm-source', provider: 'osm', name: 'OpenStreetMap map source',
    licence: 'ODbL-1.0', licenceName: 'Open Database License (ODbL) 1.0',
    sourceUrl: SOURCES.osm.sourceUrl, licenceUrl: SOURCES.osm.licenceUrl,
    permission: 'YES', licenceEvidence: 'YES', datasetDate: 'UNKNOWN',
    acquiredOn: '2026-09-11', termsReviewedOn: '2026-09-10', reviewDueOn: '2026-12-10',
    notice: SOURCES.osm.notices.en.join('\n'), tier: 'primary',
    state: 'included', evidenceIds: ['osm-proof'], ...overrides,
  };
}
export function fixtureSurface(overrides = {}) {
  return {
    id: 'map-en', title: 'Map view', locale: 'en', kind: 'map',
    sourceIds: ['osm-source'], offline: 'YES', mapCredit: 'YES',
    keyboard: 'YES', screenReader: 'YES', targetPx: 44,
    publishedOn: '2026-09-12', ...overrides,
  };
}
export function fixtureDecision(overrides = {}) {
  return {
    id: 'osm-decision', sourceId: 'osm-source', state: 'accepted',
    decidedOn: '2026-09-12', reason: 'Terms and attribution recorded',
    evidenceIds: ['osm-proof'], actorRole: 'Editorial reviewer', ...overrides,
  };
}
export function fixtureDocket(overrides = {}) {
  return {
    schema: DOCKET_SCHEMA, releaseId: 'release-one', asOf: '2026-11-19',
    sources: [fixtureSource()], evidence: [fixtureEvidence()],
    surfaces: [fixtureSurface()], decisions: [fixtureDecision()], ...overrides,
  };
}
export function licenceVariant(kind) {
  const config = {
    aua: {
      id: 'aua-source', provider: 'metrolinx', licence: 'Metrolinx-AUA',
      licenceName: 'Metrolinx Access and Use Agreement',
      notice: [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR].join('\n'),
      sourceUrl: SOURCES.metrolinx.sourceUrl, licenceUrl: SOURCES.metrolinx.sourceUrl,
    },
    ogl: {
      id: 'ogl-source', provider: 'metrolinx', licence: 'OGL-Ontario-Metrolinx',
      licenceName: 'Open Government Licence - Ontario - Metrolinx',
      notice: METROLINX_OGL_NOTICE,
      sourceUrl: SOURCES.metrolinx.sourceUrl, licenceUrl: SOURCES.metrolinx.licenceUrl,
    },
    ltc: {
      id: 'ltc-source', provider: 'ltc', licence: 'LTC-Open-Data-Terms',
      licenceName: 'LTC Open Data Terms of Use',
      notice: SOURCES.ltc.notices.en[0],
      sourceUrl: SOURCES.ltc.sourceUrl, licenceUrl: SOURCES.ltc.licenceUrl,
    },
    other: {
      id: 'other-source', provider: 'other', licence: 'OTHER-OPEN',
      licenceName: 'MIT', notice: 'Copyright contributors',
      sourceUrl: 'https://example.org/source', licenceUrl: 'https://example.org/licence',
    },
  }[kind];
  if (!config) throw new Error('Unsupported fixture type');
  const id = config.id;
  return {
    source: fixtureSource({ ...config, evidenceIds: [`${id}-proof`] }),
    evidence: fixtureEvidence({ id: `${id}-proof`, sourceId: id, licenceUrl: config.licenceUrl }),
    decision: fixtureDecision({ id: `${id}-decision`, sourceId: id, evidenceIds: [`${id}-proof`] }),
    surface: fixtureSurface({ id: `${id}-view`, kind: kind === 'other' ? 'list' : 'journey', sourceIds: [id] }),
  };
}
export function docketFromVariants(...kinds) {
  const variants = kinds.map(licenceVariant);
  return fixtureDocket({
    sources: variants.map((x) => x.source), evidence: variants.map((x) => x.evidence),
    decisions: variants.map((x) => x.decision), surfaces: variants.map((x) => x.surface),
  });
}
