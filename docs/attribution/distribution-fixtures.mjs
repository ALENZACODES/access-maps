/** Bounded synthetic test documents; not a bundled provider inventory. */
import { DISTRIBUTION_SCHEMA, UNKNOWN } from './distribution-core.mjs';
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
export const DEFAULT_HASH = 'a'.repeat(64);
export const DEFAULT_DATE = '2026-01-12';
export function source(overrides = {}) {
  return {
    id: 'source-osm', provider: 'osm', name: 'OpenStreetMap',
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    licenceName: 'Open Database License (ODbL) 1.0',
    licenceUrl: 'https://www.openstreetmap.org/copyright',
    permission: 'YES', licenceEvidence: 'YES', tier: 'primary',
    datasetDate: UNKNOWN, acquiredDate: DEFAULT_DATE, termsDate: DEFAULT_DATE,
    notice: SOURCES.osm.notices.en.join('\n'), state: 'included', ...overrides,
  };
}
export function metrolinxAua(overrides = {}) {
  return source({
    id: 'source-aua', provider: 'metrolinx-aua', name: 'Transit timetable',
    sourceUrl: 'https://www.gotransit.com/en/partner-with-us/software-developers',
    licenceName: 'Metrolinx Access and Use Agreement',
    licenceUrl: 'https://www.gotransit.com/en/partner-with-us/software-developers',
    notice: [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR].join('\n'),
    ...overrides,
  });
}
export function metrolinxOgl(overrides = {}) {
  return source({
    id: 'source-ogl', provider: 'metrolinx-ogl', name: 'Transit open data',
    sourceUrl: 'https://www.gotransit.com/en/partner-with-us/software-developers',
    licenceName: 'Open Government Licence - Ontario - Metrolinx',
    licenceUrl: 'https://assets.metrolinx.com/licence.pdf',
    notice: METROLINX_OGL_NOTICE,
    ...overrides,
  });
}
export function ltc(overrides = {}) {
  return source({
    id: 'source-ltc', provider: 'ltc', name: 'London Transit',
    sourceUrl: 'https://www.londontransit.ca/open-data/',
    licenceName: 'LTC Open Data Terms of Use',
    licenceUrl: 'https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/',
    notice: SOURCES.ltc.notices.en[0], ...overrides,
  });
}
export function asset(overrides = {}) {
  return { id: 'data-asset', path: 'assets/data.json', kind: 'data', bytes: 128,
    sha256: DEFAULT_HASH, sourceIds: ['source-osm'], dependencyIds: [], state: 'included', ...overrides };
}
export function view(overrides = {}) {
  return { id: 'map-en', path: 'pages/map-en.html', locale: 'en', assetIds: ['data-asset'],
    sourceIds: ['source-osm'], noticeText: SOURCES.osm.notices.en.join('\n'),
    noticeVisible: 'YES', offline: 'YES', keyboard: 'YES', screenReader: 'YES',
    targetPx: 44, publishedDate: DEFAULT_DATE, ...overrides };
}
export function manifest(overrides = {}) {
  return { schema: DISTRIBUTION_SCHEMA, releaseId: 'release-one', sources: [source()],
    assets: [asset()], views: [view()], ...overrides };
}
export function withEnglishFrenchPair(overrides = {}) {
  const base = manifest();
  return manifest({
    views: [view(), view({id:'map-fr',path:'pages/map-fr.html',locale:'fr'})],
    ...overrides,
  });
}
export function deepCopy(input) { return JSON.parse(JSON.stringify(input)); }
export function withDependencies(depth = 4) {
  const assets = [asset()];
  for (let i = 1; i < depth; i += 1) assets.push(asset({id:`asset-${i}`,path:`assets/part-${i}.js`,kind:'javascript',sourceIds:[],dependencyIds:[assets[i-1].id]}));
  return manifest({assets,views:[view({assetIds:[assets.at(-1).id]})]});
}
