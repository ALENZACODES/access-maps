/** Deterministic publication gate. All decisions use explicit records. */
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR, UNKNOWN } from './attribution-utils.mjs';
import { sourcesById, includedSources, includedViews } from './coverage-core.mjs';

export const LEVELS = Object.freeze(['block', 'attention', 'info']);
export const FINDINGS = Object.freeze({
  NO_VIEWS: 'NO_VIEWS', NO_SOURCES: 'NO_SOURCES', SOURCE_UNUSED: 'SOURCE_UNUSED',
  SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND', SOURCE_NOT_INCLUDED: 'SOURCE_NOT_INCLUDED',
  VIEW_WITHOUT_SOURCE: 'VIEW_WITHOUT_SOURCE', SOURCE_URL_UNKNOWN: 'SOURCE_URL_UNKNOWN',
  LICENCE_URL_UNKNOWN: 'LICENCE_URL_UNKNOWN', LICENCE_UNKNOWN: 'LICENCE_UNKNOWN',
  LICENCE_NOT_OPEN: 'LICENCE_NOT_OPEN', PERMISSION_UNKNOWN: 'PERMISSION_UNKNOWN',
  PERMISSION_DENIED: 'PERMISSION_DENIED', TIER_UNKNOWN: 'TIER_UNKNOWN',
  ACQUISITION_UNKNOWN: 'ACQUISITION_UNKNOWN', DATASET_DATE_UNKNOWN: 'DATASET_DATE_UNKNOWN',
  TERMS_DATE_UNKNOWN: 'TERMS_DATE_UNKNOWN', SOURCE_NOTICE_MISSING: 'SOURCE_NOTICE_MISSING',
  SOURCE_NOTICE_MISMATCH: 'SOURCE_NOTICE_MISMATCH', OSM_CREDIT_MISSING: 'OSM_CREDIT_MISSING',
  OSM_ODBL_MISSING: 'OSM_ODBL_MISSING', AUA_LEGEND_MISSING: 'AUA_LEGEND_MISSING',
  AUA_LAWS_MISSING: 'AUA_LAWS_MISSING', OGL_NOTICE_MISSING: 'OGL_NOTICE_MISSING',
  MIXED_METROLINX_TERMS: 'MIXED_METROLINX_TERMS', LTC_NOTICE_MISSING: 'LTC_NOTICE_MISSING',
  PROVIDER_LICENCE_MISMATCH: 'PROVIDER_LICENCE_MISMATCH', MAP_CREDIT_UNKNOWN: 'MAP_CREDIT_UNKNOWN',
  MAP_CREDIT_DENIED: 'MAP_CREDIT_DENIED', KEYBOARD_UNKNOWN: 'KEYBOARD_UNKNOWN',
  KEYBOARD_DENIED: 'KEYBOARD_DENIED', SCREEN_READER_UNKNOWN: 'SCREEN_READER_UNKNOWN',
  SCREEN_READER_DENIED: 'SCREEN_READER_DENIED', OFFLINE_UNKNOWN: 'OFFLINE_UNKNOWN',
  OFFLINE_DENIED: 'OFFLINE_DENIED', TARGET_UNKNOWN: 'TARGET_UNKNOWN',
  TARGET_SMALL: 'TARGET_SMALL', VIEW_DATE_UNKNOWN: 'VIEW_DATE_UNKNOWN',
  FUTURE_ACQUISITION: 'FUTURE_ACQUISITION', FUTURE_TERMS: 'FUTURE_TERMS',
  FUTURE_PUBLICATION: 'FUTURE_PUBLICATION', DATASET_AFTER_ACQUISITION: 'DATASET_AFTER_ACQUISITION',
  PUBLICATION_BEFORE_ACQUISITION: 'PUBLICATION_BEFORE_ACQUISITION',
  UNRELATED_MAP_CREDIT: 'UNRELATED_MAP_CREDIT',
});

const KNOWN_LICENCES = Object.freeze({odbl: 'osm', 'metrolinx-aua': 'metrolinx', 'metrolinx-ogl': 'metrolinx', 'ltc-terms': 'ltc'});
const OPEN_LICENCE_NAMES = new Set([
  'Creative Commons Attribution 4.0 International',
  'Creative Commons Attribution 4.0',
  'Creative Commons CC0 1.0 Universal',
  'Open Data Commons Public Domain Dedication and Licence (PDDL) 1.0',
  'Open Government Licence – Canada',
  'Open Government Licence - Canada',
]);
const normalized = (value) => value.normalize('NFC').replace(/\s+/gu, ' ').toLowerCase().trim();
const contains = (haystack, needle) => normalized(haystack).includes(normalized(needle));

export function auditCoverage(register, options = {}) {
  const minimumTargetPx = options.minimumTargetPx ?? 44;
  const requireOffline = options.requireOffline ?? true;
  const today = options.today ?? UNKNOWN;
  if (!Number.isInteger(minimumTargetPx) || minimumTargetPx < 44 || minimumTargetPx > 1000) throw new RangeError('minimumTargetPx must be >= 44');
  if (typeof requireOffline !== 'boolean') throw new TypeError('requireOffline must be boolean');
  if (today !== UNKNOWN && (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(today))) throw new TypeError('today must be ISO date or UNKNOWN');
  const findings = [];
  const add = (code, level, path, detail, sourceId = null, viewId = null) => {
    findings.push(Object.freeze({code, level, path, detail, sourceId, viewId}));
  };
  const sources = sourcesById(register);
  const activeSources = includedSources(register);
  const activeViews = includedViews(register);
  if (!activeViews.length) add(FINDINGS.NO_VIEWS, 'block', 'views', 'No included views');
  if (!activeSources.length) add(FINDINGS.NO_SOURCES, 'block', 'sources', 'No included sources');
  const used = new Set();

  for (const source of activeSources) {
    const path = `sources.${source.id}`;
    const fail = (code, level, detail) => add(code, level, path, detail, source.id);
    if (source.sourceUrl === UNKNOWN) fail(FINDINGS.SOURCE_URL_UNKNOWN, 'block', 'Origin URL absent');
    if (source.licenceUrl === UNKNOWN) fail(FINDINGS.LICENCE_URL_UNKNOWN, 'block', 'Licence URL absent');
    if (source.licenceKind === UNKNOWN) fail(FINDINGS.LICENCE_UNKNOWN, 'block', 'Licence absent');
    if (source.licenceKind === 'other-open' && !OPEN_LICENCE_NAMES.has(source.licenceName)) {
      fail(FINDINGS.LICENCE_NOT_OPEN, 'block', 'Licence name does not identify an open licence');
    }
    if (source.permission === UNKNOWN) fail(FINDINGS.PERMISSION_UNKNOWN, 'block', 'Permission evidence unknown');
    else if (source.permission === 'NO') fail(FINDINGS.PERMISSION_DENIED, 'block', 'Permission explicitly denied');
    if (source.evidenceTier === UNKNOWN) fail(FINDINGS.TIER_UNKNOWN, 'block', 'Evidence tier absent');
    if (source.acquiredOn === UNKNOWN) fail(FINDINGS.ACQUISITION_UNKNOWN, 'block', 'Acquisition date absent');
    if (source.termsReviewedOn === UNKNOWN) fail(FINDINGS.TERMS_DATE_UNKNOWN, 'block', 'Terms review date absent');
    if (source.datasetAsOf === UNKNOWN) fail(FINDINGS.DATASET_DATE_UNKNOWN, 'info', 'Dataset date UNKNOWN');
    if (!source.attribution.trim()) fail(FINDINGS.SOURCE_NOTICE_MISSING, 'block', 'Attribution missing');
    if (source.acquiredOn !== UNKNOWN && today !== UNKNOWN && source.acquiredOn > today) fail(FINDINGS.FUTURE_ACQUISITION, 'block', 'Acquired after supplied reference date');
    if (source.termsReviewedOn !== UNKNOWN && today !== UNKNOWN && source.termsReviewedOn > today) fail(FINDINGS.FUTURE_TERMS, 'block', 'Terms reviewed after supplied reference date');
    if (source.datasetAsOf !== UNKNOWN && source.acquiredOn !== UNKNOWN && source.datasetAsOf > source.acquiredOn) {
      fail(FINDINGS.DATASET_AFTER_ACQUISITION, 'attention', 'Dataset date is later than acquisition');
    }
    const expected = KNOWN_LICENCES[source.licenceKind];
    if (expected && source.provider !== expected) fail(FINDINGS.PROVIDER_LICENCE_MISMATCH, 'block', 'Provider and licence kind conflict');
    if (source.provider === 'osm') {
      if (source.licenceKind !== 'odbl') fail(FINDINGS.OSM_ODBL_MISSING, 'block', 'ODbL identity required for OSM');
      if (!contains(source.attribution, SOURCES.osm.notices.en[0])) fail(FINDINGS.OSM_CREDIT_MISSING, 'block', 'Map credit absent');
    }
    if (source.licenceKind === 'metrolinx-aua') {
      if (!contains(source.attribution, METROLINX_AUA_LEGEND)) fail(FINDINGS.AUA_LEGEND_MISSING, 'block', 'Section 3 legend absent');
      if (!contains(source.attribution, METROLINX_AUA_END_USER_LAWS_EN) || !contains(source.attribution, METROLINX_AUA_END_USER_LAWS_FR)) {
        fail(FINDINGS.AUA_LAWS_MISSING, 'block', 'Applicable-law lines absent');
      }
      if (contains(source.attribution, METROLINX_OGL_NOTICE)) fail(FINDINGS.MIXED_METROLINX_TERMS, 'block', 'Distinct OGL notice mixed into AUA record');
    }
    if (source.licenceKind === 'metrolinx-ogl') {
      if (!contains(source.attribution, METROLINX_OGL_NOTICE)) fail(FINDINGS.OGL_NOTICE_MISSING, 'block', 'OGL notice absent');
      if (contains(source.attribution, METROLINX_AUA_LEGEND)) fail(FINDINGS.MIXED_METROLINX_TERMS, 'block', 'Distinct AUA legend mixed into OGL record');
    }
    if (source.provider === 'ltc' && !contains(source.attribution, 'London Transit Commission')) {
      fail(FINDINGS.LTC_NOTICE_MISSING, 'block', 'Provider acknowledgement absent');
    }
  }
  for (const view of activeViews) {
    const path = `views.${view.id}`;
    const fail = (code, level, detail) => add(code, level, path, detail, null, view.id);
    if (!view.sourceIds.length) fail(FINDINGS.VIEW_WITHOUT_SOURCE, 'block', 'No declared sources');
    for (const sourceId of view.sourceIds) {
      const source = sources.get(sourceId);
      if (!source) add(FINDINGS.SOURCE_NOT_FOUND, 'block', path, `Missing source ${sourceId}`, sourceId, view.id);
      else if (source.state !== 'included') add(FINDINGS.SOURCE_NOT_INCLUDED, 'block', path, `Source ${sourceId} not included`, sourceId, view.id);
      else used.add(sourceId);
    }
    if (requireOffline && view.offline !== 'YES') fail(view.offline === UNKNOWN ? FINDINGS.OFFLINE_UNKNOWN : FINDINGS.OFFLINE_DENIED, 'block', 'Offline evidence missing');
    if (view.keyboard !== 'YES') fail(view.keyboard === UNKNOWN ? FINDINGS.KEYBOARD_UNKNOWN : FINDINGS.KEYBOARD_DENIED, 'block', 'Keyboard assessment absent');
    if (view.screenReader !== 'YES') fail(view.screenReader === UNKNOWN ? FINDINGS.SCREEN_READER_UNKNOWN : FINDINGS.SCREEN_READER_DENIED, 'block', 'Screen-reader assessment absent');
    if (view.minimumTargetPx === UNKNOWN) fail(FINDINGS.TARGET_UNKNOWN, 'block', 'Target dimension absent');
    else if (view.minimumTargetPx < minimumTargetPx) fail(FINDINGS.TARGET_SMALL, 'block', 'Target smaller than minimum');
    if (view.publishedOn === UNKNOWN) fail(FINDINGS.VIEW_DATE_UNKNOWN, 'attention', 'Publication date UNKNOWN');
    if (view.publishedOn !== UNKNOWN && today !== UNKNOWN && view.publishedOn > today) fail(FINDINGS.FUTURE_PUBLICATION, 'block', 'Publication after reference date');
    const linked = view.sourceIds.map((sourceId) => sources.get(sourceId)).filter(Boolean);
    const osmUsed = linked.some((source) => source.provider === 'osm');
    if (view.kind === 'map' && osmUsed && view.mapCredit !== 'YES') {
      fail(view.mapCredit === UNKNOWN ? FINDINGS.MAP_CREDIT_UNKNOWN : FINDINGS.MAP_CREDIT_DENIED, 'block', 'Map credit display evidence missing');
    }
    if (view.kind === 'map' && !osmUsed && view.mapCredit === 'YES') fail(FINDINGS.UNRELATED_MAP_CREDIT, 'info', 'Map credit claimed without linked OSM record');
    const acquired = linked.filter((source) => source.acquiredOn !== UNKNOWN).map((source) => source.acquiredOn);
    if (view.publishedOn !== UNKNOWN && acquired.some((value) => value > view.publishedOn)) {
      fail(FINDINGS.PUBLICATION_BEFORE_ACQUISITION, 'block', 'View published before source acquisition');
    }
  }
  for (const source of activeSources) {
    if (!used.has(source.id)) add(FINDINGS.SOURCE_UNUSED, 'attention', `sources.${source.id}`, 'Included source has no included view', source.id);
  }
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || (a.sourceId ?? '').localeCompare(b.sourceId ?? ''));
  return Object.freeze({releaseId: register.releaseId, blocked: findings.some((item) => item.level === 'block'),
    sources: activeSources.length, views: activeViews.length,
    blocks: findings.filter((item) => item.level === 'block').length,
    attention: findings.filter((item) => item.level === 'attention').length,
    info: findings.filter((item) => item.level === 'info').length,
    findings: Object.freeze(findings)});
}

export function coverageCountsByProvider(register) {
  const rows = Object.create(null);
  for (const source of register.sources) {
    const key = source.provider;
    const row = rows[key] ?? {provider: key, sources: 0, included: 0, views: new Set()};
    row.sources++;
    if (source.state === 'included') row.included++;
    for (const view of register.views) if (view.sourceIds.includes(source.id)) row.views.add(view.id);
    rows[key] = row;
  }
  return Object.values(rows).map((row) => ({provider: row.provider, sources: row.sources, included: row.included, views: row.views.size}));
}

export function coverageMatrix(register) {
  return register.views.map((view) => Object.freeze({viewId: view.id, language: view.language,
    kind: view.kind, state: view.state,
    sources: Object.freeze(view.sourceIds.map((sourceId) => {
      const source = register.sources.find((item) => item.id === sourceId);
      return Object.freeze({id: sourceId, provider: source?.provider ?? UNKNOWN,
        licence: source?.licenceKind ?? UNKNOWN, permission: source?.permission ?? UNKNOWN,
        tier: source?.evidenceTier ?? UNKNOWN, date: source?.datasetAsOf ?? UNKNOWN});
    }))}));
}
