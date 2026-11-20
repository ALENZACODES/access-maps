/** Deterministic test builders. No production provider datasets are shipped. */
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';
import { LOCALE_QA_SCHEMA, UNKNOWN } from './locale-qa-core.mjs';

export function fixtureSource(overrides = {}) {
  return {
    id: 'osm-source', provider: 'osm', terms: 'ODbL-1.0',
    name: 'OpenStreetMap data',
    sourceUrl: SOURCES.osm.sourceUrl,
    licenceUrl: SOURCES.osm.licenceUrl,
    licenceName: SOURCES.osm.licence,
    permission: 'YES', licenceEvidence: 'YES',
    acquiredDate: '2026-02-12', datasetDate: UNKNOWN,
    termsDate: '2026-02-11', evidenceTier: 'primary',
    status: 'included', ...overrides,
  };
}
export function fixtureNotice(overrides = {}) {
  return {
    id: 'osm-credit', sourceId: 'osm-source', kind: 'credit',
    text: '© OpenStreetMap contributors',
    licenceUrl: SOURCES.osm.licenceUrl,
    visible: 'YES', nearContent: 'YES', targetPx: 44,
    keyboard: 'YES', screenReader: 'YES', contrast: 'YES',
    review: 'accepted', reviewDate: '2026-02-12',
    evidenceUrl: 'https://example.org/evidence/credit',
    evidenceNote: 'Manual review of the local publication page',
    ...overrides,
  };
}
export function fixtureLicenceNotice(overrides = {}) {
  return fixtureNotice({
    id: 'osm-licence', kind: 'licence',
    text: 'Open Database License (ODbL) 1.0',
    evidenceUrl: 'https://example.org/evidence/odbl',
    ...overrides,
  });
}
export function fixturePage(overrides = {}) {
  return {
    id: 'page-en', pairId: 'map-attribution', locale: 'en',
    route: 'pages/map-en.html', display: 'map',
    sourceIds: ['osm-source'],
    notices: [fixtureNotice(), fixtureLicenceNotice()],
    offline: 'YES', targetPx: 44, publishedDate: '2026-02-13',
    publicStatus: 'included', ...overrides,
  };
}
export function fixtureRelease(overrides = {}) {
  return {
    schema: LOCALE_QA_SCHEMA, releaseId: 'release-one', requireBilingual: true,
    sources: [fixtureSource()],
    pages: [fixturePage(), fixturePage({
      id: 'page-fr', locale: 'fr', route: 'pages/map-fr.html',
      notices: [
        fixtureNotice({ id: 'credit-fr', evidenceUrl: 'https://example.org/evidence/credit-fr' }),
        fixtureLicenceNotice({ id: 'licence-fr', evidenceUrl: 'https://example.org/evidence/odbl-fr' }),
      ],
    })],
    ...overrides,
  };
}
export function copyFixture(value) { return JSON.parse(JSON.stringify(value)); }
export function withSource(release, changes) {
  const next = copyFixture(release);
  next.sources[0] = { ...next.sources[0], ...changes };
  return next;
}
export function withPage(release, pageId, changes) {
  const next = copyFixture(release);
  const index = next.pages.findIndex(p => p.id === pageId);
  if (index < 0) throw new Error(`Unknown test page: ${pageId}`);
  next.pages[index] = { ...next.pages[index], ...changes };
  return next;
}
export function withNotice(release, pageId, noticeId, changes) {
  const next = copyFixture(release);
  const page = next.pages.find(p => p.id === pageId);
  if (!page) throw new Error(`Unknown test page: ${pageId}`);
  const index = page.notices.findIndex(n => n.id === noticeId);
  if (index < 0) throw new Error(`Unknown test notice: ${noticeId}`);
  page.notices[index] = { ...page.notices[index], ...changes };
  return next;
}
export function metrolinxSource(kind = 'AUA', overrides = {}) {
  const aua = kind === 'AUA';
  return fixtureSource({
    id: 'metrolinx-feed', provider: 'metrolinx',
    terms: aua ? 'Metrolinx-AUA' : 'Metrolinx-OGL',
    name: 'Recorded transit feed',
    sourceUrl: SOURCES.metrolinx.sourceUrl,
    licenceUrl: aua ? SOURCES.metrolinx.sourceUrl : SOURCES.metrolinx.licenceUrl,
    licenceName: aua ? 'Metrolinx Access and Use Agreement' : 'Open Government Licence – Ontario – Metrolinx',
    ...overrides,
  });
}
function noticeFor(source, id, kind, content, evidenceId) {
  return fixtureNotice({
    id, sourceId: source.id, kind, text: content,
    licenceUrl: source.licenceUrl,
    evidenceUrl: `https://example.org/evidence/${evidenceId}`,
  });
}
export function metrolinxNotices(kind = 'AUA') {
  const source = metrolinxSource(kind);
  if (kind === 'AUA') {
    return [
      noticeFor(source, 'aua-legend', 'disclaimer', METROLINX_AUA_LEGEND, 'aua-legend'),
      noticeFor(source, 'aua-laws-en', 'laws', METROLINX_AUA_END_USER_LAWS_EN, 'aua-laws-en'),
      noticeFor(source, 'aua-laws-fr', 'laws', METROLINX_AUA_END_USER_LAWS_FR, 'aua-laws-fr'),
    ];
  }
  return [noticeFor(source, 'ogl-licence', 'licence', METROLINX_OGL_NOTICE, 'ogl-licence')];
}
export function metrolinxRelease(kind = 'AUA', overrides = {}) {
  const source = metrolinxSource(kind);
  const notices = metrolinxNotices(kind);
  const previous = fixtureRelease();
  return {
    ...previous, sources: [source],
    pages: previous.pages.map(p => ({
      ...p, sourceIds: [source.id], display: 'journey',
      notices: notices.map(n => ({ ...n, id: `${n.id}-${p.locale}` })),
    })),
    ...overrides,
  };
}
export function ltcSource(overrides = {}) {
  return fixtureSource({
    id: 'ltc-feed', provider: 'ltc', terms: 'LTC-Terms',
    name: 'London Transit Commission data',
    sourceUrl: SOURCES.ltc.sourceUrl,
    licenceUrl: SOURCES.ltc.licenceUrl,
    licenceName: SOURCES.ltc.licence,
    ...overrides,
  });
}
export function ltcRelease(overrides = {}) {
  const source = ltcSource();
  const previous = fixtureRelease();
  return {
    ...previous, sources: [source],
    pages: previous.pages.map(p => ({ ...p, display: 'journey', sourceIds: [source.id], notices: [
      noticeFor(source, `ltc-${p.locale}`, 'credit', SOURCES.ltc.notices[p.locale][0], `ltc-${p.locale}`),
    ] })),
    ...overrides,
  };
}
export function otherOpenRelease(overrides = {}) {
  const source = fixtureSource({
    id: 'other-feed', provider: 'other', terms: 'OTHER-OPEN',
    name: 'Community-provided open data',
    sourceUrl: 'https://example.org/data',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    licenceName: 'Creative Commons Attribution 4.0 International',
  });
  const previous = fixtureRelease();
  return {
    ...previous, sources: [source],
    pages: previous.pages.map(p => ({ ...p, display: 'results', sourceIds: [source.id], notices: [
      noticeFor(source, `other-${p.locale}`, 'licence', source.licenceName, `other-${p.locale}`),
    ] })),
    ...overrides,
  };
}
