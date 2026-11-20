/**
 * Metadata audit of manual notice-access observations.
 * A PASS means an operator recorded one observation, not conformance.
 */
import {
  UNKNOWN, REVIEW_TECHNIQUES, REVIEW_RESULTS,
  parseAccessReview,
} from './access-review-core.mjs';
import {
  SOURCES,
  METROLINX_AUA_LEGEND,
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
  METROLINX_OGL_NOTICE,
} from './attribution-utils.mjs';

export const ACCESS_REVIEW_MIN_TARGET = 44;
export const ACCESS_REVIEW_KINDS = Object.freeze({
  'ODbL-1.0': ['credit', 'terms'],
  'Metrolinx-AUA': ['aua-legend', 'aua-laws-en', 'aua-laws-fr'],
  'OGL-Ontario-Metrolinx': ['ogl'],
  'LTC-Open-Data-Terms': ['ltc'],
  'OTHER-OPEN': ['terms'],
});
const PROVIDER_LICENCES = Object.freeze({
  osm: ['ODbL-1.0'],
  metrolinx: ['Metrolinx-AUA', 'OGL-Ontario-Metrolinx'],
  ltc: ['LTC-Open-Data-Terms'],
  other: ['OTHER-OPEN'],
});

export function requiredReviewNotices(source, locale) {
  if (source.licence === 'ODbL-1.0') {
    return [
      { kind: 'credit', text: SOURCES.osm.notices.en[0] },
      { kind: 'terms', text: SOURCES.osm.notices.en[1] },
    ];
  }
  if (source.licence === 'Metrolinx-AUA') {
    return [
      { kind: 'aua-legend', text: METROLINX_AUA_LEGEND },
      { kind: 'aua-laws-en', text: METROLINX_AUA_END_USER_LAWS_EN },
      { kind: 'aua-laws-fr', text: METROLINX_AUA_END_USER_LAWS_FR },
    ];
  }
  if (source.licence === 'OGL-Ontario-Metrolinx') return [{ kind: 'ogl', text: METROLINX_OGL_NOTICE }];
  if (source.licence === 'LTC-Open-Data-Terms') return [{ kind: 'ltc', text: SOURCES.ltc.notices[locale][0] }];
  if (source.licence === 'OTHER-OPEN') return [{ kind: 'terms', text: source.notice }];
  return [];
}

function normalizeNotice(value) {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}
export function textContainsNotice(text, notice) {
  return normalizeNotice(text).includes(normalizeNotice(notice)) && normalizeNotice(notice).length > 0;
}
export function auditAccessReview(input, options = {}) {
  const release = parseAccessReview(input);
  const findings = [];
  const sourceById = new Map(release.sources.map(source => [source.id, source]));
  const surfaceById = new Map(release.surfaces.map(surface => [surface.id, surface]));
  const add = (code, level, path, detail, sourceId = null, surfaceId = null) => {
    findings.push({ code, level, path, detail, sourceId, surfaceId });
  };
  const requireOffline = options.requireOffline === true;
  const requirePaired = options.requirePaired === true;
  const requireEvidenceUrls = options.requireEvidenceUrls === true;
  const requiredTechniques = Array.isArray(options.requiredTechniques)
    ? [...new Set(options.requiredTechniques.filter(item => REVIEW_TECHNIQUES.includes(item)))]
    : [...REVIEW_TECHNIQUES];
  const minimumTarget = Number.isInteger(options.minimumTargetPx) && options.minimumTargetPx >= 44 && options.minimumTargetPx <= 1000
    ? options.minimumTargetPx : ACCESS_REVIEW_MIN_TARGET;

  if (!release.sources.length) add('NO_SOURCES', 'block', 'sources', 'No source records');
  if (!release.surfaces.length) add('NO_SURFACES', 'block', 'surfaces', 'No publication surfaces');

  for (const source of release.sources) {
    const path = `sources.${source.id}`;
    if (source.status !== 'included') continue;
    if (source.permission !== 'YES') add('PERMISSION_NOT_YES', 'block', `${path}.permission`, source.permission, source.id);
    if (source.licence === UNKNOWN) add('LICENCE_UNKNOWN', 'block', `${path}.licence`, UNKNOWN, source.id);
    if (source.licence === 'OTHER-OPEN') add('OPEN_LICENCE_ID_UNSPECIFIED', 'block', `${path}.licence`, source.licence, source.id);
    if (source.tier === UNKNOWN) add('TIER_UNKNOWN', 'block', `${path}.tier`, UNKNOWN, source.id);
    if (source.sourceUrl === UNKNOWN) add('SOURCE_URL_UNKNOWN', 'block', `${path}.sourceUrl`, UNKNOWN, source.id);
    if (source.licenceUrl === UNKNOWN) add('LICENCE_URL_UNKNOWN', 'block', `${path}.licenceUrl`, UNKNOWN, source.id);
    if (source.acquiredDate === UNKNOWN) add('ACQUIRED_DATE_UNKNOWN', 'block', `${path}.acquiredDate`, UNKNOWN, source.id);
    if (source.termsDate === UNKNOWN) add('TERMS_DATE_UNKNOWN', 'block', `${path}.termsDate`, UNKNOWN, source.id);
    if (source.datasetDate === UNKNOWN) add('DATASET_DATE_UNKNOWN', 'info', `${path}.datasetDate`, UNKNOWN, source.id);
    const allowed = PROVIDER_LICENCES[source.provider] ?? [];
    if (!allowed.includes(source.licence)) add('LICENCE_PROVIDER_MISMATCH', 'block', `${path}.licence`, source.licence, source.id);
    if (!source.notice.trim()) add('SOURCE_NOTICE_MISSING', 'block', `${path}.notice`, UNKNOWN, source.id);
    if (source.acquiredDate !== UNKNOWN && source.termsDate !== UNKNOWN && source.acquiredDate < source.termsDate) {
      add('ACQUIRED_BEFORE_TERMS', 'info', `${path}.acquiredDate`, source.acquiredDate, source.id);
    }
    const prescribed = source.licence === 'LTC-Open-Data-Terms' && textContainsNotice(source.notice, SOURCES.ltc.notices.fr[0])
      ? requiredReviewNotices(source, 'fr') : requiredReviewNotices(source, 'en');
    for (const rule of prescribed) {
      if (!textContainsNotice(source.notice, rule.text)) add('SOURCE_NOTICE_INCOMPLETE', 'block', `${path}.notice`, rule.kind, source.id);
    }
    // A known provider must never be treated as having two simultaneous Metrolinx terms without explicit separate source records.
    if (source.licence === 'Metrolinx-AUA' && textContainsNotice(source.notice, METROLINX_OGL_NOTICE)) {
      add('MIXED_METROLINX_NOTICES', 'block', `${path}.notice`, 'AUA/OGL', source.id);
    }
    if (source.licence === 'OGL-Ontario-Metrolinx' && textContainsNotice(source.notice, METROLINX_AUA_LEGEND)) {
      add('MIXED_METROLINX_NOTICES', 'block', `${path}.notice`, 'OGL/AUA', source.id);
    }
  }

  const usedSources = new Set();
  for (const surface of release.surfaces) {
    const path = `surfaces.${surface.id}`;
    if (surface.status !== 'included') continue;
    if (!surface.sourceIds.length) add('SURFACE_WITHOUT_SOURCES', 'block', `${path}.sourceIds`, UNKNOWN, null, surface.id);
    if (requireOffline && surface.offline !== 'YES') add('OFFLINE_UNCONFIRMED', 'block', `${path}.offline`, surface.offline, null, surface.id);
    if (!requireOffline && surface.offline === UNKNOWN) add('OFFLINE_UNKNOWN', 'info', `${path}.offline`, UNKNOWN, null, surface.id);
    for (const sourceId of surface.sourceIds) {
      usedSources.add(sourceId);
      const source = sourceById.get(sourceId);
      if (!source) { add('SURFACE_SOURCE_MISSING', 'block', `${path}.sourceIds`, sourceId, sourceId, surface.id); continue; }
      if (source.status !== 'included') add('SURFACE_SOURCE_HELD', 'block', `${path}.sourceIds`, source.status, sourceId, surface.id);
      const targets = surface.targets.filter(target => target.sourceId === sourceId);
      const required = requiredReviewNotices(source, surface.locale);
      for (const rule of required) {
        if (!targets.some(target => target.kind === rule.kind && textContainsNotice(target.text, rule.text))) {
          add('SURFACE_NOTICE_MISSING', 'block', `${path}.targets`, rule.kind, sourceId, surface.id);
        }
      }
      for (const target of targets) {
        const targetPath = `${path}.targets.${target.id}`;
        const expected = required.find(rule => rule.kind === target.kind);
        if (!expected) add('NOTICE_KIND_UNEXPECTED', 'block', `${targetPath}.kind`, target.kind, sourceId, surface.id);
        else if (!textContainsNotice(target.text, expected.text)) add('NOTICE_TEXT_CHANGED', 'block', `${targetPath}.text`, target.kind, sourceId, surface.id);
      }
    }
    for (const target of surface.targets) {
      const targetPath = `${path}.targets.${target.id}`;
      if (!surface.sourceIds.includes(target.sourceId)) add('TARGET_SOURCE_UNDECLARED', 'block', `${targetPath}.sourceId`, target.sourceId, target.sourceId, surface.id);
      for (const [field, code] of [
        ['visible', 'NOTICE_HIDDEN'],
        ['keyboard', 'KEYBOARD_UNKNOWN_OR_NO'],
        ['focusVisible', 'FOCUS_UNKNOWN_OR_NO'],
        ['screenReader', 'LABEL_UNKNOWN_OR_NO'],
      ]) {
        if (target[field] !== 'YES') add(code, 'block', `${targetPath}.${field}`, target[field], target.sourceId, surface.id);
      }
      if (target.widthPx === UNKNOWN || target.heightPx === UNKNOWN) add('TARGET_DIMENSIONS_UNKNOWN', 'block', targetPath, UNKNOWN, target.sourceId, surface.id);
      else if (target.widthPx < minimumTarget || target.heightPx < minimumTarget) add('TARGET_TOO_SMALL', 'block', targetPath, `${target.widthPx}x${target.heightPx}`, target.sourceId, surface.id);
      if (target.testedDate === UNKNOWN) add('REVIEW_DATE_UNKNOWN', 'block', `${targetPath}.testedDate`, UNKNOWN, target.sourceId, surface.id);
      if (requireEvidenceUrls && target.evidenceUrl === UNKNOWN) add('REVIEW_EVIDENCE_UNKNOWN', 'block', `${targetPath}.evidenceUrl`, UNKNOWN, target.sourceId, surface.id);
      const observations = new Map(target.observations.map(o => [o.technique, o]));
      for (const technique of requiredTechniques) {
        const observed = observations.get(technique);
        if (!observed) { add('OBSERVATION_MISSING', 'block', `${targetPath}.observations`, technique, target.sourceId, surface.id); continue; }
        if (observed.result !== 'PASS') add('OBSERVATION_NOT_PASS', 'block', `${targetPath}.observations.${technique}`, observed.result, target.sourceId, surface.id);
        if (observed.date === UNKNOWN) add('OBSERVATION_DATE_UNKNOWN', 'block', `${targetPath}.observations.${technique}.date`, UNKNOWN, target.sourceId, surface.id);
        if (observed.date !== UNKNOWN && target.testedDate !== UNKNOWN && observed.date > target.testedDate) {
          add('OBSERVATION_AFTER_REVIEW', 'attention', `${targetPath}.observations.${technique}.date`, observed.date, target.sourceId, surface.id);
        }
      }
    }
  }
  for (const source of release.sources) {
    if (source.status === 'included' && !usedSources.has(source.id)) add('INCLUDED_SOURCE_UNUSED', 'attention', `sources.${source.id}`, source.id, source.id);
  }
  if (requirePaired) {
    for (const surface of release.surfaces) {
      if (surface.status !== 'included') continue;
      const counterpart = [...surfaceById.values()].some(other => other.status === 'included' && other.locale !== surface.locale && other.sourceIds.length === surface.sourceIds.length && other.sourceIds.every(id => surface.sourceIds.includes(id)));
      if (!counterpart) add('LOCALE_COMPANION_MISSING', 'block', `surfaces.${surface.id}`, surface.locale, null, surface.id);
    }
  }
  const severity = { block: 0, attention: 1, info: 2 };
  findings.sort((a, b) => severity[a.level] - severity[b.level] || a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  return {
    releaseId: release.releaseId,
    blocked: findings.some(item => item.level === 'block'),
    findings,
    blockingCount: findings.filter(item => item.level === 'block').length,
    attentionCount: findings.filter(item => item.level === 'attention').length,
    informationCount: findings.filter(item => item.level === 'info').length,
    sourceCount: release.sources.length,
    surfaceCount: release.surfaces.length,
    reviewedTargets: release.surfaces.filter(x => x.status === 'included').reduce((n, x) => n + x.targets.length, 0),
  };
}

export function surfaceReviewFindings(audit, surfaceId) {
  return audit.findings.filter(item => item.surfaceId === surfaceId);
}
export function sourceReviewFindings(audit, sourceId) {
  return audit.findings.filter(item => item.sourceId === sourceId);
}
export function reviewCoverageByTechnique(input) {
  const release = parseAccessReview(input);
  const targets = release.surfaces.filter(item => item.status === 'included').flatMap(surface => surface.targets);
  return REVIEW_TECHNIQUES.map(technique => ({
    technique,
    targetCount: targets.length,
    recordedCount: targets.filter(target => target.observations.some(item => item.technique === technique)).length,
    passCount: targets.filter(target => target.observations.some(item => item.technique === technique && item.result === 'PASS')).length,
    failCount: targets.filter(target => target.observations.some(item => item.technique === technique && item.result === 'FAIL')).length,
    unknownCount: targets.filter(target => !target.observations.some(item => item.technique === technique) || target.observations.some(item => item.technique === technique && item.result === UNKNOWN)).length,
  }));
}

export function sourceReviewImpact(input, sourceId) {
  const release = parseAccessReview(input);
  return release.surfaces.filter(surface => surface.sourceIds.includes(sourceId)).map(surface => ({ id: surface.id, route: surface.route, locale: surface.locale, targetIds: surface.targets.filter(t => t.sourceId === sourceId).map(t => t.id) }));
}
