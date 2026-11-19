/** Release-blocking relationship and evidence audit for published claims. */
import {
  CLAIM_UNKNOWN,
  catalogueSource,
} from './claim-trace-core.mjs';
import {
  METROLINX_AUA_LEGEND,
  METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
  SOURCES,
} from './attribution-utils.mjs';

export const TRACE_BLOCK_CODES = Object.freeze([
  'NO_CLAIMS', 'NO_SURFACES', 'CLAIM_ORPHAN', 'CLAIM_SOURCE_MISSING',
  'CLAIM_REFERENCE_MISSING', 'REFERENCE_SOURCE_MISSING', 'REFERENCE_UNLINKED',
  'SOURCE_NOT_INCLUDED', 'SOURCE_PERMISSION_UNKNOWN', 'SOURCE_PERMISSION_DENIED',
  'SOURCE_URL_UNKNOWN', 'SOURCE_LICENCE_UNKNOWN', 'SOURCE_TIER_UNKNOWN',
  'SOURCE_ACQUIRED_UNKNOWN', 'SOURCE_TERMS_UNKNOWN', 'SOURCE_NOTICE_MISSING',
  'SOURCE_FAMILY_INCOMPATIBLE', 'OSM_CREDIT_MISSING', 'OSM_LICENCE_MISSING',
  'AUA_LEGEND_MISSING', 'AUA_LAWS_MISSING', 'OGL_NOTICE_MISSING',
  'LTC_NOTICE_MISSING', 'CROSS_LICENCE_NOTICE', 'CLAIM_UNSUPPORTED',
  'CLAIM_EVIDENCE_MISSING', 'CLAIM_SOURCE_HELD', 'CLAIM_REFERENCE_HELD',
  'CLAIM_REFERENCE_TIER_UNKNOWN', 'CLAIM_REFERENCE_URL_UNKNOWN',
  'CLAIM_REFERENCE_DATE_UNKNOWN', 'CLAIM_LANGUAGE_MISMATCH',
  'CLAIM_SOURCE_UNDISCLOSED', 'SURFACE_SOURCE_MISSING', 'SURFACE_CLAIM_MISSING',
  'SURFACE_CLAIM_HELD', 'SURFACE_LANGUAGE_MISMATCH', 'SURFACE_OFFLINE_UNKNOWN',
  'SURFACE_OFFLINE_NO', 'SURFACE_KEYBOARD_UNKNOWN', 'SURFACE_KEYBOARD_NO',
  'SURFACE_READER_UNKNOWN', 'SURFACE_READER_NO', 'SURFACE_TARGET_UNKNOWN',
  'SURFACE_TARGET_SMALL', 'SURFACE_CREDIT_UNKNOWN', 'SURFACE_CREDIT_NO',
  'SOURCE_UNUSED', 'SURFACE_UNSUPPORTED', 'CLAIM_DATE_MISMATCH',
]);

function finding(code, path, detail, level = 'block', sourceId = null, claimId = null, surfaceId = null) {
  return { code, level, path, detail, sourceId, claimId, surfaceId };
}
function normalized(value) { return value.normalize('NFC').replace(/\s+/gu, ' ').trim().toLowerCase(); }
export function containsNotice(haystack, needle) {
  if (!needle) return false;
  return normalized(haystack).includes(normalized(needle));
}
function isKnown(value) { return value !== CLAIM_UNKNOWN && value !== ''; }
function requireState(value, prefix, path, push, ids) {
  if (value === 'UNKNOWN') push(finding(`${prefix}_UNKNOWN`, path, 'Evidence is UNKNOWN', 'block', ...ids));
  if (value === 'NO') push(finding(`${prefix}_NO`, path, 'Evidence says NO', 'block', ...ids));
}
function latestDay(left, right) {
  if (left === CLAIM_UNKNOWN || right === CLAIM_UNKNOWN) return null;
  return left > right ? left : right;
}

export function auditClaimTrace(trace, options = {}) {
  const findings = [];
  const add = (item) => findings.push(item);
  const sources = new Map(trace.sources.map((s) => [s.id, s]));
  const references = new Map(trace.references.map((r) => [r.id, r]));
  const claims = new Map(trace.claims.map((c) => [c.id, c]));
  const referencedSources = new Set();
  const referencedClaims = new Set();
  const requireOffline = options.requireOffline !== false;
  const minTargetPx = Number.isInteger(options.minimumTargetPx) && options.minimumTargetPx >= 44 ? options.minimumTargetPx : 44;
  if (!trace.claims.some((c) => c.status === 'included')) add(finding('NO_CLAIMS', 'claims', 'No included claims'));
  if (!trace.surfaces.length) add(finding('NO_SURFACES', 'surfaces', 'No publication surfaces'));

  for (const source of trace.sources) {
    if (source.state !== 'included') continue;
    const path = `sources.${source.id}`;
    if (source.permission === 'UNKNOWN') add(finding('SOURCE_PERMISSION_UNKNOWN', `${path}.permission`, 'Redistribution permission is UNKNOWN', 'block', source.id));
    if (source.permission === 'NO') add(finding('SOURCE_PERMISSION_DENIED', `${path}.permission`, 'Redistribution permission is NO', 'block', source.id));
    if (!isKnown(source.url)) add(finding('SOURCE_URL_UNKNOWN', `${path}.url`, 'Source URL UNKNOWN', 'block', source.id));
    if (!isKnown(source.licenceUrl) || !isKnown(source.licence) || !/\b(?:odbl|open government licence|open data terms|access and use agreement|cc[- ]by|creative commons|mit|apache|bsd)\b/iu.test(source.licence)) {
      add(finding('SOURCE_LICENCE_UNKNOWN', `${path}.licence`, 'Open licence terms require explicit evidence', 'block', source.id));
    }
    if (source.tier === 'UNKNOWN') add(finding('SOURCE_TIER_UNKNOWN', `${path}.tier`, 'Evidence tier UNKNOWN', 'block', source.id));
    if (source.acquiredDate === CLAIM_UNKNOWN) add(finding('SOURCE_ACQUIRED_UNKNOWN', `${path}.acquiredDate`, 'Acquisition date UNKNOWN', 'block', source.id));
    if (source.termsDate === CLAIM_UNKNOWN) add(finding('SOURCE_TERMS_UNKNOWN', `${path}.termsDate`, 'Terms date UNKNOWN', 'block', source.id));
    if (!source.notice.trim()) add(finding('SOURCE_NOTICE_MISSING', `${path}.notice`, 'Attribution notice absent', 'block', source.id));
    const known = catalogueSource(source.provider);
    if (known && ((source.provider === 'osm' && source.family !== 'osm') ||
        (source.provider === 'ltc' && source.family !== 'ltc') ||
        (source.provider === 'metrolinx' && !source.family.startsWith('metrolinx-')))) {
      add(finding('SOURCE_FAMILY_INCOMPATIBLE', `${path}.family`, 'Provider and licence family disagree', 'block', source.id));
    }
    if (source.family === 'osm') {
      if (!containsNotice(source.notice, SOURCES.osm.notices.en[0])) add(finding('OSM_CREDIT_MISSING', `${path}.notice`, 'Map credit absent', 'block', source.id));
      if (!containsNotice(source.notice, SOURCES.osm.notices.en[1]) || !/odbl/iu.test(source.licence)) add(finding('OSM_LICENCE_MISSING', `${path}.licence`, 'ODbL terms absent', 'block', source.id));
    }
    if (source.family === 'metrolinx-aua') {
      if (!containsNotice(source.notice, METROLINX_AUA_LEGEND)) add(finding('AUA_LEGEND_MISSING', `${path}.notice`, 'AUA section 3 legend absent', 'block', source.id));
      if (!containsNotice(source.notice, METROLINX_AUA_END_USER_LAWS_EN) || !containsNotice(source.notice, METROLINX_AUA_END_USER_LAWS_FR)) {
        add(finding('AUA_LAWS_MISSING', `${path}.notice`, 'Applicable-laws notices absent', 'block', source.id));
      }
      if (containsNotice(source.notice, METROLINX_OGL_NOTICE)) add(finding('CROSS_LICENCE_NOTICE', `${path}.notice`, 'OGL notice mixed with AUA record', 'block', source.id));
    }
    if (source.family === 'metrolinx-ogl') {
      if (!containsNotice(source.notice, METROLINX_OGL_NOTICE)) add(finding('OGL_NOTICE_MISSING', `${path}.notice`, 'OGL notice absent', 'block', source.id));
      if (containsNotice(source.notice, METROLINX_AUA_LEGEND)) add(finding('CROSS_LICENCE_NOTICE', `${path}.notice`, 'AUA legend mixed with OGL record', 'block', source.id));
    }
    if (source.family === 'ltc' && !/london transit commission|\bltc\b/iu.test(source.notice)) add(finding('LTC_NOTICE_MISSING', `${path}.notice`, 'LTC source acknowledgement absent', 'block', source.id));
    if (source.datasetDate === CLAIM_UNKNOWN) add(finding('DATASET_DATE_UNKNOWN', `${path}.datasetDate`, 'Date remains UNKNOWN', 'info', source.id));
  }

  for (const ref of trace.references) {
    if (!sources.has(ref.sourceId)) add(finding('REFERENCE_SOURCE_MISSING', `references.${ref.id}.sourceId`, ref.sourceId, 'block', ref.sourceId));
  }

  for (const claim of trace.claims) {
    if (claim.status !== 'included') continue;
    const path = `claims.${claim.id}`;
    if (claim.disclosure === 'unsupported') add(finding('CLAIM_UNSUPPORTED', `${path}.disclosure`, 'Claim lacks evidence', 'block', null, claim.id));
    if (claim.disclosure !== 'evidence' || claim.sourceIds.length === 0 || claim.referenceIds.length === 0) {
      add(finding('CLAIM_EVIDENCE_MISSING', `${path}.disclosure`, 'Explicit evidence is required', 'block', null, claim.id));
    }
    for (const sid of claim.sourceIds) {
      referencedSources.add(sid);
      const source = sources.get(sid);
      if (!source) add(finding('CLAIM_SOURCE_MISSING', `${path}.sourceIds`, sid, 'block', sid, claim.id));
      else if (source.state !== 'included') add(finding('CLAIM_SOURCE_HELD', `${path}.sourceIds`, sid, 'block', sid, claim.id));
      if (source && claim.observedDate !== CLAIM_UNKNOWN && source.datasetDate !== CLAIM_UNKNOWN && claim.observedDate < source.datasetDate) {
        add(finding('CLAIM_DATE_MISMATCH', `${path}.observedDate`, 'Observation predates dataset', 'block', sid, claim.id));
      }
    }
    for (const rid of claim.referenceIds) {
      const ref = references.get(rid);
      if (!ref) { add(finding('CLAIM_REFERENCE_MISSING', `${path}.referenceIds`, rid, 'block', null, claim.id)); continue; }
      if (!claim.sourceIds.includes(ref.sourceId)) add(finding('REFERENCE_UNLINKED', `${path}.referenceIds`, rid, 'block', ref.sourceId, claim.id));
      if (ref.tier === CLAIM_UNKNOWN) add(finding('CLAIM_REFERENCE_TIER_UNKNOWN', `${path}.referenceIds`, rid, 'block', ref.sourceId, claim.id));
      if (ref.url === CLAIM_UNKNOWN) add(finding('CLAIM_REFERENCE_URL_UNKNOWN', `${path}.referenceIds`, rid, 'block', ref.sourceId, claim.id));
      if (ref.date === CLAIM_UNKNOWN) add(finding('CLAIM_REFERENCE_DATE_UNKNOWN', `${path}.referenceIds`, rid, 'block', ref.sourceId, claim.id));
      if (ref.language !== CLAIM_UNKNOWN && ref.language !== claim.language) add(finding('CLAIM_LANGUAGE_MISMATCH', `${path}.language`, rid, 'block', ref.sourceId, claim.id));
    }
    if (claim.observedDate === CLAIM_UNKNOWN) add(finding('CLAIM_OBSERVED_UNKNOWN', `${path}.observedDate`, 'Observation date UNKNOWN', 'info', null, claim.id));
  }

  for (const surface of trace.surfaces) {
    const path = `surfaces.${surface.id}`;
    const linked = new Set(surface.sourceIds);
    if (!surface.claimIds.length) add(finding('SURFACE_UNSUPPORTED', `${path}.claimIds`, 'Surface has no claims', 'block', null, null, surface.id));
    if (requireOffline) requireState(surface.offline, 'SURFACE_OFFLINE', `${path}.offline`, add, [null, null, surface.id]);
    requireState(surface.keyboard, 'SURFACE_KEYBOARD', `${path}.keyboard`, add, [null, null, surface.id]);
    requireState(surface.screenReader, 'SURFACE_READER', `${path}.screenReader`, add, [null, null, surface.id]);
    if (surface.targetPx === CLAIM_UNKNOWN) add(finding('SURFACE_TARGET_UNKNOWN', `${path}.targetPx`, 'Target dimension UNKNOWN', 'block', null, null, surface.id));
    else if (surface.targetPx < minTargetPx) add(finding('SURFACE_TARGET_SMALL', `${path}.targetPx`, `Target below ${minTargetPx}px`, 'block', null, null, surface.id));
    for (const sid of surface.sourceIds) if (!sources.has(sid)) add(finding('SURFACE_SOURCE_MISSING', `${path}.sourceIds`, sid, 'block', sid, null, surface.id));
    for (const cid of surface.claimIds) {
      referencedClaims.add(cid);
      const claim = claims.get(cid);
      if (!claim) { add(finding('SURFACE_CLAIM_MISSING', `${path}.claimIds`, cid, 'block', null, cid, surface.id)); continue; }
      if (claim.status !== 'included') add(finding('SURFACE_CLAIM_HELD', `${path}.claimIds`, cid, 'block', null, cid, surface.id));
      if (claim.language !== surface.language) add(finding('SURFACE_LANGUAGE_MISMATCH', `${path}.language`, cid, 'block', null, cid, surface.id));
      for (const sid of claim.sourceIds) if (!linked.has(sid)) add(finding('CLAIM_SOURCE_UNDISCLOSED', `${path}.sourceIds`, sid, 'block', sid, cid, surface.id));
    }
    if (surface.claimIds.some((cid) => claims.get(cid)?.sourceIds.some((sid) => sources.get(sid)?.family === 'osm'))) {
      requireState(surface.mapCredit, 'SURFACE_CREDIT', `${path}.mapCredit`, add, [null, null, surface.id]);
    }
    if (surface.publishedDate === CLAIM_UNKNOWN) add(finding('SURFACE_DATE_UNKNOWN', `${path}.publishedDate`, 'Publication date UNKNOWN', 'info', null, null, surface.id));
  }
  for (const claim of trace.claims) if (claim.status === 'included' && !referencedClaims.has(claim.id)) add(finding('CLAIM_ORPHAN', `claims.${claim.id}`, 'Claim has no published surface', 'block', null, claim.id));
  for (const source of trace.sources) if (source.state === 'included' && !referencedSources.has(source.id)) add(finding('SOURCE_UNUSED', `sources.${source.id}`, 'Source not linked to a published claim', 'attention', source.id));
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  return {
    schema: 'attribution-claim-audit/1', releaseId: trace.releaseId,
    blocked: findings.some((item) => item.level === 'block'),
    blockingCount: findings.filter((item) => item.level === 'block').length,
    attentionCount: findings.filter((item) => item.level === 'attention').length,
    informationCount: findings.filter((item) => item.level === 'info').length,
    sourceCount: trace.sources.length, claimCount: trace.claims.length,
    surfaceCount: trace.surfaces.length, referenceCount: trace.references.length,
    findings,
  };
}

export function traceClaim(trace, claimId) {
  const claim = trace.claims.find((item) => item.id === claimId);
  if (!claim) return null;
  const sourceById = new Map(trace.sources.map((item) => [item.id, item]));
  const refById = new Map(trace.references.map((item) => [item.id, item]));
  return {
    claim,
    sources: claim.sourceIds.map((id) => sourceById.get(id) ?? null),
    references: claim.referenceIds.map((id) => refById.get(id) ?? null),
    surfaces: trace.surfaces.filter((surface) => surface.claimIds.includes(claimId)),
  };
}

export function claimDateRange(trace, claimId) {
  const traced = traceClaim(trace, claimId);
  if (!traced) return null;
  let first = null;
  let last = null;
  for (const ref of traced.references) {
    if (!ref || ref.date === CLAIM_UNKNOWN) continue;
    first = first === null || ref.date < first ? ref.date : first;
    last = last === null || ref.date > last ? ref.date : last;
  }
  for (const source of traced.sources) {
    if (!source) continue;
    for (const date of [source.acquiredDate, source.termsDate]) {
      if (date === CLAIM_UNKNOWN) continue;
      first = first === null || date < first ? date : first;
      last = last === null || date > last ? date : last;
    }
  }
  return { first: first ?? CLAIM_UNKNOWN, last: last ?? CLAIM_UNKNOWN };
}
