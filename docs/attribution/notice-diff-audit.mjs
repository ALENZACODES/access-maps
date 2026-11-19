/** Evidence audit. Only the explicitly provided release is inspected. */
import { UNKNOWN, LEGAL_NOTICES, hasFullNotice, licenceMatchesProvider } from './notice-diff-core.mjs';

export const ISSUE_LEVELS = Object.freeze(['block', 'attention', 'information']);
export const ISSUE_CODES = Object.freeze([
  'NO_SOURCES', 'NO_SURFACES', 'EMPTY_SURFACE', 'SOURCE_MISSING', 'SOURCE_HELD',
  'SOURCE_EXCLUDED', 'SOURCE_URL_UNKNOWN', 'LICENCE_URL_UNKNOWN', 'LICENCE_EVIDENCE_UNKNOWN',
  'LICENCE_EVIDENCE_NO', 'PERMISSION_UNKNOWN', 'PERMISSION_NO', 'TIER_UNKNOWN',
  'ACQUISITION_UNKNOWN', 'TERMS_DATE_UNKNOWN', 'DATASET_DATE_UNKNOWN',
  'PROVIDER_LICENCE_MISMATCH', 'UNKNOWN_LICENCE', 'NOTICE_MISSING',
  'NOTICE_SOURCE_MISMATCH', 'NOTICE_LANGUAGE_MISMATCH', 'NOTICE_NOT_VISIBLE',
  'NOTICE_VISIBILITY_UNKNOWN', 'NOTICE_TERMS_MISSING', 'NOTICE_DATE_UNKNOWN',
  'OSM_CREDIT_MISSING', 'OSM_ODBL_MISSING', 'OSM_MAP_CREDIT_MISSING',
  'OSM_MAP_CREDIT_UNKNOWN', 'AUA_LEGEND_MISSING', 'AUA_LAWS_MISSING',
  'OGL_NOTICE_MISSING', 'LTC_NOTICE_MISSING', 'INCOMPATIBLE_LICENCE_NOTICE',
  'NO_EN_NOTICE', 'NO_FR_NOTICE', 'OFFLINE_MISSING', 'OFFLINE_UNKNOWN',
  'KEYBOARD_MISSING', 'KEYBOARD_UNKNOWN', 'SCREEN_READER_MISSING',
  'SCREEN_READER_UNKNOWN', 'TARGET_TOO_SMALL', 'TARGET_UNKNOWN', 'DATE_ORDER',
  'DATE_FUTURE', 'SOURCE_UNUSED', 'NOTICE_UNUSED', 'LANGUAGE_PAIR_MISSING',
  'ROUTE_LANGUAGE_MISMATCH', 'NOTICE_CREDIT_TOO_FAR', 'SURFACE_DATE_UNKNOWN',
]);
function issue(code, level, path, detail, sourceId = null, surfaceId = null) {
  return Object.freeze({ code, level, path, detail, sourceId, surfaceId });
}
function sink() {
  const findings = [];
  return { findings, add(code, level, path, detail, sourceId = null, surfaceId = null) {
    findings.push(issue(code, level, path, detail, sourceId, surfaceId));
  } };
}
function checkState(s, value, path, unknownCode, noCode, sourceId = null, surfaceId = null) {
  if (value === UNKNOWN) s.add(unknownCode, 'block', path, 'Evidence remains UNKNOWN', sourceId, surfaceId);
  else if (value === 'NO') s.add(noCode, 'block', path, 'Evidence records NO', sourceId, surfaceId);
}
function checkDateOrder(s, source, index) {
  if (source.datasetDate !== UNKNOWN && source.acquiredDate !== UNKNOWN && source.acquiredDate < source.datasetDate) {
    s.add('DATE_ORDER', 'attention', `sources[${index}].acquiredDate`, 'Acquisition precedes dataset date', source.id);
  }
  if (source.termsDate !== UNKNOWN && source.acquiredDate !== UNKNOWN && source.termsDate > source.acquiredDate) {
    s.add('DATE_ORDER', 'attention', `sources[${index}].termsDate`, 'Terms review follows acquisition', source.id);
  }
}
function checkSource(s, source, index, options) {
  const at = `sources[${index}]`;
  if (source.state !== 'included') return;
  if (source.sourceUrl === UNKNOWN) s.add('SOURCE_URL_UNKNOWN', 'block', `${at}.sourceUrl`, 'Source link missing', source.id);
  if (source.licenceUrl === UNKNOWN) s.add('LICENCE_URL_UNKNOWN', 'block', `${at}.licenceUrl`, 'Licence link missing', source.id);
  checkState(s, source.permission, `${at}.permission`, 'PERMISSION_UNKNOWN', 'PERMISSION_NO', source.id);
  checkState(s, source.licenceEvidence, `${at}.licenceEvidence`, 'LICENCE_EVIDENCE_UNKNOWN', 'LICENCE_EVIDENCE_NO', source.id);
  if (source.tier === UNKNOWN) s.add('TIER_UNKNOWN', 'block', `${at}.tier`, 'Evidence tier not supplied', source.id);
  if (source.licence === UNKNOWN) s.add('UNKNOWN_LICENCE', 'block', `${at}.licence`, 'Licence not recorded', source.id);
  if (!licenceMatchesProvider(source)) s.add('PROVIDER_LICENCE_MISMATCH', 'block', `${at}.licence`, 'Provider and recorded licence differ', source.id);
  if (source.acquiredDate === UNKNOWN) s.add('ACQUISITION_UNKNOWN', 'block', `${at}.acquiredDate`, 'Acquisition date absent', source.id);
  if (source.termsDate === UNKNOWN) s.add('TERMS_DATE_UNKNOWN', 'block', `${at}.termsDate`, 'Terms review date absent', source.id);
  if (source.datasetDate === UNKNOWN) s.add('DATASET_DATE_UNKNOWN', 'information', `${at}.datasetDate`, 'Dataset date remains UNKNOWN', source.id);
  checkDateOrder(s, source, index);
  if (options.today !== UNKNOWN) {
    for (const field of ['acquiredDate', 'termsDate', 'datasetDate']) {
      if (source[field] !== UNKNOWN && source[field] > options.today) {
        s.add('DATE_FUTURE', 'block', `${at}.${field}`, 'Recorded date is after the supplied reference date', source.id);
      }
    }
  }
}
function relevantNotices(surface, source, notices, byId) {
  return surface.noticeIds.map(id => byId.get(id)).filter(n => n && n.sourceId === source.id && n.locale === surface.locale);
}
function hasNotice(notices, phrase) {
  return notices.some(n => n.visible === 'YES' && hasFullNotice(n.text, phrase));
}
function checkLegal(s, surface, source, notices) {
  const at = `surfaces.${surface.id}.source.${source.id}`;
  if (source.provider === 'osm') {
    if (!hasNotice(notices, LEGAL_NOTICES.osmCredit)) s.add('OSM_CREDIT_MISSING', 'block', at, 'Map source credit not visible', source.id, surface.id);
    if (!hasNotice(notices, LEGAL_NOTICES.osmLicence)) s.add('OSM_ODBL_MISSING', 'block', at, 'ODbL licence text not visible', source.id, surface.id);
    if (surface.mode === 'map') {
      const credits = notices.filter(n => n.kind === 'credit' && hasFullNotice(n.text, LEGAL_NOTICES.osmCredit));
      if (!credits.some(n => n.nearMap === 'YES' && n.visible === 'YES')) {
        const unknown = credits.some(n => n.nearMap === UNKNOWN);
        s.add(unknown ? 'OSM_MAP_CREDIT_UNKNOWN' : 'OSM_MAP_CREDIT_MISSING', 'block', at, 'Map credit proximity not explicitly YES', source.id, surface.id);
      }
    }
  }
  if (source.provider === 'metrolinx') {
    if (source.licence === 'Metrolinx-AUA') {
      if (!hasNotice(notices, LEGAL_NOTICES.aua[0])) s.add('AUA_LEGEND_MISSING', 'block', at, 'Section 3 legend missing', source.id, surface.id);
      if (!hasNotice(notices, LEGAL_NOTICES.aua[1]) || !hasNotice(notices, LEGAL_NOTICES.aua[2])) {
        s.add('AUA_LAWS_MISSING', 'block', at, 'Applicable-laws lines missing', source.id, surface.id);
      }
      if (hasNotice(notices, LEGAL_NOTICES.ogl)) s.add('INCOMPATIBLE_LICENCE_NOTICE', 'block', at, 'OGL notice is not evidence of an AUA feed', source.id, surface.id);
    }
    if (source.licence === 'Metrolinx-OGL') {
      if (!hasNotice(notices, LEGAL_NOTICES.ogl)) s.add('OGL_NOTICE_MISSING', 'block', at, 'OGL notice missing', source.id, surface.id);
      if (hasNotice(notices, LEGAL_NOTICES.aua[0])) s.add('INCOMPATIBLE_LICENCE_NOTICE', 'block', at, 'AUA notice is not evidence of OGL terms', source.id, surface.id);
    }
  }
  if (source.provider === 'ltc') {
    const required = surface.locale === 'fr' ? LEGAL_NOTICES.ltcFr : LEGAL_NOTICES.ltcEn;
    if (!hasNotice(notices, required)) s.add('LTC_NOTICE_MISSING', 'block', at, 'LTC source notice missing', source.id, surface.id);
  }
}
function checkNotice(s, notice, i, bySource) {
  const at = `notices[${i}]`;
  if (!bySource.has(notice.sourceId)) s.add('NOTICE_SOURCE_MISMATCH', 'block', `${at}.sourceId`, 'Referenced source absent', notice.sourceId);
  if (notice.visible === 'NO') s.add('NOTICE_NOT_VISIBLE', 'block', `${at}.visible`, 'Notice explicitly hidden', notice.sourceId);
  if (notice.visible === UNKNOWN) s.add('NOTICE_VISIBILITY_UNKNOWN', 'block', `${at}.visible`, 'Notice visibility UNKNOWN', notice.sourceId);
  if (notice.termsUrl === UNKNOWN) s.add('NOTICE_TERMS_MISSING', 'block', `${at}.termsUrl`, 'Notice terms URL absent', notice.sourceId);
  if (notice.recordedDate === UNKNOWN) s.add('NOTICE_DATE_UNKNOWN', 'attention', `${at}.recordedDate`, 'Notice record date UNKNOWN', notice.sourceId);
}
function checkSurface(s, surface, i, bySource, byNotice, options) {
  const at = `surfaces[${i}]`;
  if (surface.sourceIds.length === 0) s.add('EMPTY_SURFACE', 'block', `${at}.sourceIds`, 'Surface has no attributed sources', null, surface.id);
  for (const [key, negative, unknown] of [
    ['offline', 'OFFLINE_MISSING', 'OFFLINE_UNKNOWN'],
    ['keyboard', 'KEYBOARD_MISSING', 'KEYBOARD_UNKNOWN'],
    ['screenReader', 'SCREEN_READER_MISSING', 'SCREEN_READER_UNKNOWN'],
  ]) {
    if (surface[key] === 'NO' && (key !== 'offline' || options.requireOffline)) s.add(negative, 'block', `${at}.${key}`, `${key} recorded NO`, null, surface.id);
    if (surface[key] === UNKNOWN && (key !== 'offline' || options.requireOffline)) s.add(unknown, 'block', `${at}.${key}`, `${key} remains UNKNOWN`, null, surface.id);
  }
  if (surface.targetPx === UNKNOWN) s.add('TARGET_UNKNOWN', 'block', `${at}.targetPx`, 'Target size UNKNOWN', null, surface.id);
  else if (surface.targetPx < options.minimumTargetPx) s.add('TARGET_TOO_SMALL', 'block', `${at}.targetPx`, 'Target below required minimum', null, surface.id);
  if (surface.publishedDate === UNKNOWN) s.add('SURFACE_DATE_UNKNOWN', 'information', `${at}.publishedDate`, 'Publication date UNKNOWN', null, surface.id);
  for (const sourceId of surface.sourceIds) {
    const source = bySource.get(sourceId);
    if (!source) {
      s.add('SOURCE_MISSING', 'block', `${at}.sourceIds`, 'Referenced source not supplied', sourceId, surface.id);
      continue;
    }
    if (source.state !== 'included') s.add(source.state === 'held' ? 'SOURCE_HELD' : 'SOURCE_EXCLUDED', 'block', `${at}.sourceIds`, 'Source not included', sourceId, surface.id);
    const notices = relevantNotices(surface, source, surface.noticeIds, byNotice);
    if (!notices.length) s.add('NOTICE_MISSING', 'block', `${at}.noticeIds`, 'Source has no matching notice', sourceId, surface.id);
    checkLegal(s, surface, source, notices);
  }
  for (const noticeId of surface.noticeIds) {
    const notice = byNotice.get(noticeId);
    if (!notice) { s.add('NOTICE_MISSING', 'block', `${at}.noticeIds`, 'Notice ID not supplied', null, surface.id); continue; }
    if (!surface.sourceIds.includes(notice.sourceId)) s.add('NOTICE_SOURCE_MISMATCH', 'block', `${at}.noticeIds`, 'Notice source not on surface', notice.sourceId, surface.id);
    if (notice.locale !== surface.locale) s.add('NOTICE_LANGUAGE_MISMATCH', 'block', `${at}.noticeIds`, 'Notice language differs from surface', notice.sourceId, surface.id);
  }
}
function checkLanguagePairs(s, release) {
  const base = new Map();
  for (const surface of release.surfaces) {
    const key = surface.route.replace(/(?:[-_.](?:en|fr))(?=\.[a-z]+$)/u, '');
    const group = base.get(key) ?? new Set();
    group.add(surface.locale);
    base.set(key, group);
  }
  for (const [key, languages] of base) {
    if (!languages.has('en') || !languages.has('fr')) s.add('LANGUAGE_PAIR_MISSING', 'block', key, 'An explicit paired language route was not supplied');
  }
}
function checkUnused(s, release) {
  const usedSource = new Set(release.surfaces.flatMap(v => v.sourceIds));
  const usedNotices = new Set(release.surfaces.flatMap(v => v.noticeIds));
  for (const src of release.sources) {
    if (src.state === 'included' && !usedSource.has(src.id)) s.add('SOURCE_UNUSED', 'attention', `sources.${src.id}`, 'Included source not shown on a surface', src.id);
  }
  for (const notice of release.notices) {
    if (!usedNotices.has(notice.id)) s.add('NOTICE_UNUSED', 'attention', `notices.${notice.id}`, 'Notice not displayed on a surface', notice.sourceId);
  }
}
export function auditNoticeRelease(release, options = {}) {
  const config = {
    today: options.today ?? UNKNOWN,
    requireOffline: options.requireOffline ?? true,
    minimumTargetPx: options.minimumTargetPx ?? 44,
    requireLanguagePairs: options.requireLanguagePairs ?? false,
  };
  if (config.today !== UNKNOWN && !/^\d{4}-\d{2}-\d{2}$/u.test(config.today)) throw new Error('today must be ISO date or UNKNOWN');
  if (!Number.isSafeInteger(config.minimumTargetPx) || config.minimumTargetPx < 44 || config.minimumTargetPx > 500) throw new Error('Invalid minimum target');
  const s = sink();
  if (release.sources.length === 0) s.add('NO_SOURCES', 'block', 'sources', 'No sources provided');
  if (release.surfaces.length === 0) s.add('NO_SURFACES', 'block', 'surfaces', 'No publication surfaces provided');
  const bySource = new Map(release.sources.map(v => [v.id, v]));
  const byNotice = new Map(release.notices.map(v => [v.id, v]));
  release.sources.forEach((source, i) => checkSource(s, source, i, config));
  release.notices.forEach((notice, i) => checkNotice(s, notice, i, bySource));
  release.surfaces.forEach((surface, i) => checkSurface(s, surface, i, bySource, byNotice, config));
  if (config.requireLanguagePairs) checkLanguagePairs(s, release);
  checkUnused(s, release);
  s.findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || (a.sourceId ?? '').localeCompare(b.sourceId ?? ''));
  return Object.freeze({
    releaseId: release.releaseId, blocked: s.findings.some(v => v.level === 'block'),
    blockingCount: s.findings.filter(v => v.level === 'block').length,
    attentionCount: s.findings.filter(v => v.level === 'attention').length,
    informationCount: s.findings.filter(v => v.level === 'information').length,
    sourceCount: release.sources.length, noticeCount: release.notices.length,
    surfaceCount: release.surfaces.length, findings: Object.freeze(s.findings),
  });
}
