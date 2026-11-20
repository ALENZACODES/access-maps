/** Local test fixtures: invented records only, not a provider dataset. */
import { REVIEW_SCHEMA, UNKNOWN, REVIEW_TECHNIQUES } from './access-review-core.mjs';
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR, METROLINX_OGL_NOTICE,
} from './attribution-utils.mjs';
export const REVIEW_FIXTURE_DATE = '2026-11-12';
export function reviewObservation(technique = 'keyboard', changes = {}) {
  return {
    technique, result: 'PASS', note: 'Recorded in a local manual session',
    date: REVIEW_FIXTURE_DATE, referenceUrl: 'https://example.org/evidence/session',
    ...changes,
  };
}
export function reviewTarget(kind = 'credit', text = SOURCES.osm.notices.en[0], changes = {}) {
  return {
    id: `notice-${kind}`, sourceId: 'osm-record', kind, text,
    visible: 'YES', keyboard: 'YES', focusVisible: 'YES', screenReader: 'YES',
    widthPx: 44, heightPx: 44, testedDate: REVIEW_FIXTURE_DATE,
    evidenceUrl: 'https://example.org/evidence/notice',
    observations: REVIEW_TECHNIQUES.map(technique => reviewObservation(technique)),
    ...changes,
  };
}
export function reviewSource(changes = {}) {
  return {
    id: 'osm-record', provider: 'osm', licence: 'ODbL-1.0',
    sourceUrl: SOURCES.osm.sourceUrl, licenceUrl: SOURCES.osm.licenceUrl,
    datasetDate: UNKNOWN, acquiredDate: REVIEW_FIXTURE_DATE, termsDate: '2026-11-11',
    permission: 'YES', tier: 'primary',
    notice: SOURCES.osm.notices.en.join('\n'), status: 'included',
    ...changes,
  };
}
export function reviewSurface(changes = {}) {
  return {
    id: 'map-en', route: 'pages/map-en.html', locale: 'en',
    sourceIds: ['osm-record'], offline: 'YES', status: 'included',
    targets: [
      reviewTarget('credit', SOURCES.osm.notices.en[0]),
      reviewTarget('terms', SOURCES.osm.notices.en[1]),
    ],
    ...changes,
  };
}
export function reviewRelease(changes = {}) {
  return { schema: REVIEW_SCHEMA, releaseId: 'release-one', sources: [reviewSource()], surfaces: [reviewSurface()], ...changes };
}
export function cloneReview(value) { return JSON.parse(JSON.stringify(value)); }
export function addReviewSource(release, source, targets, locale = 'en') {
  const next = cloneReview(release);
  next.sources.push(source);
  next.surfaces[0].sourceIds.push(source.id);
  next.surfaces[0].targets.push(...targets);
  next.surfaces[0].locale = locale;
  return next;
}
export function metrolinxReviewSource(licence = 'Metrolinx-AUA', changes = {}) {
  const notice = licence === 'Metrolinx-AUA'
    ? [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR].join('\n')
    : METROLINX_OGL_NOTICE;
  return reviewSource({ id: `metrolinx-${licence === 'Metrolinx-AUA' ? 'aua' : 'ogl'}`, provider: 'metrolinx', licence,
    sourceUrl: SOURCES.metrolinx.sourceUrl, licenceUrl: SOURCES.metrolinx.licenceUrl,
    notice, ...changes });
}
export function metrolinxReviewTargets(licence = 'Metrolinx-AUA') {
  const id = `metrolinx-${licence === 'Metrolinx-AUA' ? 'aua' : 'ogl'}`;
  const rules = licence === 'Metrolinx-AUA'
    ? [['aua-legend', METROLINX_AUA_LEGEND], ['aua-laws-en', METROLINX_AUA_END_USER_LAWS_EN], ['aua-laws-fr', METROLINX_AUA_END_USER_LAWS_FR]]
    : [['ogl', METROLINX_OGL_NOTICE]];
  return rules.map(([kind, text]) => reviewTarget(kind, text, { id: `${id}-${kind}`, sourceId: id }));
}
export function ltcReviewSource(locale = 'en') {
  return reviewSource({ id: 'ltc-record', provider: 'ltc', licence: 'LTC-Open-Data-Terms',
    sourceUrl: SOURCES.ltc.sourceUrl, licenceUrl: SOURCES.ltc.licenceUrl,
    notice: SOURCES.ltc.notices[locale][0] });
}
export function ltcReviewTargets(locale = 'en') {
  return [reviewTarget('ltc', SOURCES.ltc.notices[locale][0], { id: 'ltc-notice', sourceId: 'ltc-record' })];
}
