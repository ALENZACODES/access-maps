/** Release-blocking checks for a local, deliberately scoped attribution handoff. */
import {
  METROLINX_AUA_LEGEND,
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
  METROLINX_OGL_NOTICE,
  SOURCES,
} from './attribution-utils.mjs';
import { reachableSources, sourceById, surfaceById, UNKNOWN } from './handoff-core.mjs';

export const LEVELS = Object.freeze(['block', 'attention', 'information']);
export const CODES = Object.freeze([
  'NO_SOURCES', 'NO_SURFACES', 'NO_HANDOFFS', 'POLICY_AUDIENCE_UNKNOWN',
  'POLICY_RETENTION_UNKNOWN', 'POLICY_DATE_UNKNOWN', 'SOURCE_NOT_USED',
  'SOURCE_NOT_FOUND', 'SURFACE_NOT_FOUND', 'SOURCE_NOT_INCLUDED',
  'SOURCE_URL_UNKNOWN', 'LICENCE_URL_UNKNOWN', 'LICENCE_NAME_UNKNOWN',
  'PERMISSION_UNKNOWN', 'PERMISSION_DENIED', 'SOURCE_TIER_UNKNOWN',
  'SOURCE_EVIDENCE_UNKNOWN', 'SOURCE_DATE_UNKNOWN', 'SOURCE_ACQUIRED_UNKNOWN',
  'SOURCE_TERMS_UNKNOWN', 'NOTICE_MISSING', 'OSM_CREDIT_MISSING',
  'ODBL_NAME_MISSING', 'AUA_LEGEND_MISSING', 'AUA_LAWS_MISSING',
  'OGL_NOTICE_MISSING', 'LTC_NOTICE_MISSING', 'TERMS_MIXED',
  'PUBLIC_DELIVERY_WITHOUT_APPROVAL', 'PUBLIC_DELIVERY_SCOPE_UNKNOWN',
  'DELIVERY_PERMISSION_UNKNOWN', 'DELIVERY_PERMISSION_DENIED',
  'DELIVERY_DATE_UNKNOWN', 'DELIVERY_EXPIRY_UNKNOWN', 'DELIVERY_EXPIRED',
  'DELIVERY_DATE_ORDER', 'DELIVERY_DIGEST_UNKNOWN', 'DELIVERY_RECIPIENT_UNKNOWN',
  'DELIVERY_SCOPE_UNKNOWN', 'DELIVERY_UNUSED_SOURCE', 'DELIVERY_MISSING_SOURCE',
  'DELIVERY_MISSING_SURFACE', 'DELIVERY_UNLINKED_SOURCE', 'DELIVERY_EMPTY',
  'SURFACE_OFFLINE_UNKNOWN', 'SURFACE_OFFLINE_DENIED',
  'SURFACE_KEYBOARD_UNKNOWN', 'SURFACE_KEYBOARD_DENIED',
  'SURFACE_READER_UNKNOWN', 'SURFACE_READER_DENIED',
  'SURFACE_TARGET_UNKNOWN', 'SURFACE_TARGET_SMALL', 'SURFACE_DATE_UNKNOWN',
  'SURFACE_MAP_CREDIT_UNKNOWN', 'SURFACE_MAP_CREDIT_DENIED',
  'PUBLIC_CONTACT_REQUIRES_REVIEW', 'DATE_AFTER_REVIEW',
  'HANDOFF_PURPOSE_NOT_DISCLOSED', 'SOURCE_DATE_AFTER_ACQUISITION',
  'SOURCE_TERMS_AFTER_APPROVAL', 'HANDED_OFF_HELD_RECORD',
  'DUPLICATE_DELIVERY_SCOPE', 'ALTERNATE_LANGUAGE_MISSING',
]);
export function finding(code, level, path, detail, sourceId = null, handoffId = null) {
  return { code, level, path, detail, sourceId, handoffId };
}
function normalize(value) { return value.normalize('NFC').replace(/\s+/gu, ' ').trim(); }
function includesNotice(text, notice) { return normalize(text).includes(normalize(notice)); }
function dateAfter(a, b) { return a !== UNKNOWN && b !== UNKNOWN && a > b; }
function checkState(add, state, path, unknownCode, deniedCode, sourceId = null, handoffId = null) {
  if (state === UNKNOWN) add(unknownCode, 'block', path, 'Evidence state UNKNOWN', sourceId, handoffId);
  if (state === 'NO') add(deniedCode, 'block', path, 'Evidence state NO', sourceId, handoffId);
}
function providerNotices(source, add) {
  const value = source.notice;
  const p = `sources.${source.id}`;
  if (!value.trim()) add('NOTICE_MISSING', 'block', `${p}.notice`, 'Attribution is missing', source.id);
  if (source.provider === 'osm') {
    if (!includesNotice(value, '© OpenStreetMap contributors')) {
      add('OSM_CREDIT_MISSING', 'block', `${p}.notice`, 'Map credit missing', source.id);
    }
    if (!includesNotice(source.licenceName, 'ODbL') && !includesNotice(source.licenceName, 'Open Database License')) {
      add('ODBL_NAME_MISSING', 'block', `${p}.licenceName`, 'Data licence missing', source.id);
    }
  }
  if (source.provider === 'metrolinx-aua') {
    if (!includesNotice(value, METROLINX_AUA_LEGEND)) {
      add('AUA_LEGEND_MISSING', 'block', `${p}.notice`, 'Section 3 legend missing', source.id);
    }
    if (!includesNotice(value, METROLINX_AUA_END_USER_LAWS_EN) ||
        !includesNotice(value, METROLINX_AUA_END_USER_LAWS_FR)) {
      add('AUA_LAWS_MISSING', 'block', `${p}.notice`, 'Applicable-law lines missing', source.id);
    }
    if (includesNotice(value, METROLINX_OGL_NOTICE)) {
      add('TERMS_MIXED', 'block', `${p}.notice`, 'Different licence statement included', source.id);
    }
  }
  if (source.provider === 'metrolinx-ogl') {
    if (!includesNotice(value, METROLINX_OGL_NOTICE)) {
      add('OGL_NOTICE_MISSING', 'block', `${p}.notice`, 'Open-government notice missing', source.id);
    }
    if (includesNotice(value, METROLINX_AUA_LEGEND)) {
      add('TERMS_MIXED', 'block', `${p}.notice`, 'Different agreement statement included', source.id);
    }
  }
  if (source.provider === 'ltc') {
    if (!/London Transit Commission|\bLTC\b/iu.test(value)) {
      add('LTC_NOTICE_MISSING', 'block', `${p}.notice`, 'Provider source notice missing', source.id);
    }
  }
  if (source.provider === 'other' && !source.licenceName.trim()) {
    add('LICENCE_NAME_UNKNOWN', 'block', `${p}.licenceName`, 'Licence name missing', source.id);
  }
  if (source.provider === 'osm' && SOURCES.osm.id !== 'osm') {
    throw new Error('Authoritative attribution catalogue is unavailable');
  }
}
function checkSource(source, add) {
  const p = `sources.${source.id}`;
  if (source.status !== 'included') return;
  if (source.sourceUrl === UNKNOWN) add('SOURCE_URL_UNKNOWN', 'block', `${p}.sourceUrl`, 'Source URL UNKNOWN', source.id);
  if (source.licenceUrl === UNKNOWN) add('LICENCE_URL_UNKNOWN', 'block', `${p}.licenceUrl`, 'Licence URL UNKNOWN', source.id);
  if (source.evidenceUrl === UNKNOWN) add('SOURCE_EVIDENCE_UNKNOWN', 'block', `${p}.evidenceUrl`, 'Source evidence UNKNOWN', source.id);
  if (source.licenceName === UNKNOWN) add('LICENCE_NAME_UNKNOWN', 'block', `${p}.licenceName`, 'Licence name UNKNOWN', source.id);
  if (source.tier === UNKNOWN) add('SOURCE_TIER_UNKNOWN', 'block', `${p}.tier`, 'Evidence tier UNKNOWN', source.id);
  checkState(add, source.permission, `${p}.permission`, 'PERMISSION_UNKNOWN', 'PERMISSION_DENIED', source.id);
  if (source.acquiredDate === UNKNOWN) add('SOURCE_ACQUIRED_UNKNOWN', 'block', `${p}.acquiredDate`, 'Acquisition date UNKNOWN', source.id);
  if (source.termsDate === UNKNOWN) add('SOURCE_TERMS_UNKNOWN', 'block', `${p}.termsDate`, 'Terms date UNKNOWN', source.id);
  if (source.datasetDate === UNKNOWN) add('SOURCE_DATE_UNKNOWN', 'information', `${p}.datasetDate`, 'Dataset date UNKNOWN', source.id);
  if (dateAfter(source.datasetDate, source.acquiredDate)) {
    add('SOURCE_DATE_AFTER_ACQUISITION', 'attention', p, 'Dataset date is later than acquisition', source.id);
  }
  providerNotices(source, add);
}
function checkSurface(surface, add) {
  const p = `surfaces.${surface.id}`;
  checkState(add, surface.offline, `${p}.offline`, 'SURFACE_OFFLINE_UNKNOWN', 'SURFACE_OFFLINE_DENIED');
  checkState(add, surface.keyboard, `${p}.keyboard`, 'SURFACE_KEYBOARD_UNKNOWN', 'SURFACE_KEYBOARD_DENIED');
  checkState(add, surface.screenReader, `${p}.screenReader`, 'SURFACE_READER_UNKNOWN', 'SURFACE_READER_DENIED');
  if (surface.targetPx === UNKNOWN) add('SURFACE_TARGET_UNKNOWN', 'block', `${p}.targetPx`, 'Target size UNKNOWN');
  else if (surface.targetPx < 44) add('SURFACE_TARGET_SMALL', 'block', `${p}.targetPx`, 'Target below 44px');
  if (surface.publicationDate === UNKNOWN) add('SURFACE_DATE_UNKNOWN', 'information', `${p}.publicationDate`, 'Publication date UNKNOWN');
  if (surface.mode === 'map') {
    checkState(add, surface.mapCredit, `${p}.mapCredit`, 'SURFACE_MAP_CREDIT_UNKNOWN', 'SURFACE_MAP_CREDIT_DENIED');
  }
}
export function auditHandoffPack(pack, options = {}) {
  const findings = [];
  const add = (...args) => findings.push(finding(...args));
  const referenceDate = options.referenceDate ?? UNKNOWN;
  if (referenceDate !== UNKNOWN && !/^\d{4}-\d{2}-\d{2}$/u.test(referenceDate)) {
    throw new Error('referenceDate must be an ISO date or UNKNOWN');
  }
  if (!pack.sources.length) add('NO_SOURCES', 'block', 'sources', 'No source records');
  if (!pack.surfaces.length) add('NO_SURFACES', 'block', 'surfaces', 'No publication surfaces');
  if (!pack.handoffs.length) add('NO_HANDOFFS', 'block', 'handoffs', 'No handoff records');
  if (pack.policy.audience === UNKNOWN) add('POLICY_AUDIENCE_UNKNOWN', 'block', 'policy.audience', 'Audience UNKNOWN');
  if (pack.policy.retention === UNKNOWN) add('POLICY_RETENTION_UNKNOWN', 'block', 'policy.retention', 'Retention UNKNOWN');
  if (pack.policy.reviewDate === UNKNOWN) add('POLICY_DATE_UNKNOWN', 'attention', 'policy.reviewDate', 'Review date UNKNOWN');
  if (pack.policy.contact === 'public-source-link' && pack.policy.audience === 'public') {
    add('PUBLIC_CONTACT_REQUIRES_REVIEW', 'attention', 'policy.contact', 'Public source contact setting');
  }
  for (const source of pack.sources) checkSource(source, add);
  for (const surface of pack.surfaces) {
    checkSurface(surface, add);
    for (const sourceId of surface.sourceIds) {
      const source = sourceById(pack, sourceId);
      if (!source) add('SOURCE_NOT_FOUND', 'block', `surfaces.${surface.id}.sourceIds`, sourceId);
      else if (source.status !== 'included') add('SOURCE_NOT_INCLUDED', 'block', `surfaces.${surface.id}.sourceIds`, sourceId, sourceId);
    }
  }
  const usedSources = new Set();
  const duplicates = new Set();
  for (const handoff of pack.handoffs) {
    const p = `handoffs.${handoff.id}`;
    if (!handoff.surfaceIds.length || !handoff.sourceIds.length) {
      add('DELIVERY_EMPTY', 'block', p, 'Handoff needs surfaces and source declarations', null, handoff.id);
    }
    const signature = `${[...handoff.surfaceIds].sort().join(',')}|${handoff.recipient}|${handoff.format}|${handoff.scope}`;
    if (duplicates.has(signature)) add('DUPLICATE_DELIVERY_SCOPE', 'attention', p, 'Repeated delivery scope', null, handoff.id);
    duplicates.add(signature);
    if (handoff.recipient === UNKNOWN) add('DELIVERY_RECIPIENT_UNKNOWN', 'block', `${p}.recipient`, 'Recipient UNKNOWN', null, handoff.id);
    if (handoff.scope === UNKNOWN) add('DELIVERY_SCOPE_UNKNOWN', 'block', `${p}.scope`, 'Scope UNKNOWN', null, handoff.id);
    if (handoff.digest === UNKNOWN) add('DELIVERY_DIGEST_UNKNOWN', 'block', `${p}.digest`, 'Digest UNKNOWN', null, handoff.id);
    checkState(add, handoff.approval, `${p}.approval`, 'DELIVERY_PERMISSION_UNKNOWN', 'DELIVERY_PERMISSION_DENIED', null, handoff.id);
    if (handoff.approvedDate === UNKNOWN) add('DELIVERY_DATE_UNKNOWN', 'block', `${p}.approvedDate`, 'Approval date UNKNOWN', null, handoff.id);
    if (handoff.expiresDate === UNKNOWN) add('DELIVERY_EXPIRY_UNKNOWN', 'attention', `${p}.expiresDate`, 'Expiry date UNKNOWN', null, handoff.id);
    if (dateAfter(handoff.approvedDate, handoff.expiresDate)) add('DELIVERY_DATE_ORDER', 'block', p, 'Approval after expiry', null, handoff.id);
    if (dateAfter(referenceDate, handoff.expiresDate)) add('DELIVERY_EXPIRED', 'block', p, 'Delivery expired', null, handoff.id);
    if (handoff.recipient === 'public-download' && handoff.approval !== 'YES') {
      add('PUBLIC_DELIVERY_WITHOUT_APPROVAL', 'block', p, 'Public delivery has no approval', null, handoff.id);
    }
    if (handoff.recipient === 'public-download' && handoff.scope !== 'attribution-only') {
      add('PUBLIC_DELIVERY_SCOPE_UNKNOWN', 'block', p, 'Public delivery scope is not attribution-only', null, handoff.id);
    }
    if (handoff.purpose.trim().length < 8) add('HANDOFF_PURPOSE_NOT_DISCLOSED', 'attention', p, 'Handoff purpose is brief', null, handoff.id);
    for (const surfaceId of handoff.surfaceIds) {
      if (!surfaceById(pack, surfaceId)) add('DELIVERY_MISSING_SURFACE', 'block', `${p}.surfaceIds`, surfaceId, null, handoff.id);
    }
    const needed = reachableSources(pack, handoff);
    for (const sourceId of needed) {
      const source = sourceById(pack, sourceId);
      if (!source) add('DELIVERY_MISSING_SOURCE', 'block', `${p}.sourceIds`, sourceId, sourceId, handoff.id);
      else if (source.status !== 'included') add('HANDED_OFF_HELD_RECORD', 'block', `${p}.sourceIds`, sourceId, sourceId, handoff.id);
      else usedSources.add(sourceId);
      if (!handoff.sourceIds.includes(sourceId)) {
        add('DELIVERY_UNLINKED_SOURCE', 'block', `${p}.sourceIds`, sourceId, sourceId, handoff.id);
      }
    }
    for (const sourceId of handoff.sourceIds) {
      if (!needed.includes(sourceId)) add('DELIVERY_UNUSED_SOURCE', 'attention', `${p}.sourceIds`, sourceId, sourceId, handoff.id);
      const source = sourceById(pack, sourceId);
      if (source && dateAfter(source.termsDate, handoff.approvedDate)) {
        add('SOURCE_TERMS_AFTER_APPROVAL', 'block', p, sourceId, sourceId, handoff.id);
      }
    }
  }
  for (const source of pack.sources) {
    if (source.status === 'included' && !usedSources.has(source.id)) {
      add('SOURCE_NOT_USED', 'information', `sources.${source.id}`, 'Not present in any handoff', source.id);
    }
  }
  // A single-language release remains a supported local draft. Public two-language exports
  // require explicit paired surface metadata; never infer a translation.
  const publicRecords = pack.handoffs.filter((handoff) => handoff.recipient === 'public-download');
  const publicSurfaceIds = new Set(publicRecords.flatMap((handoff) => handoff.surfaceIds));
  for (const surface of pack.surfaces) {
    if (!publicSurfaceIds.has(surface.id)) continue;
    const companion = pack.surfaces.find((entry) => entry.id !== surface.id &&
      entry.mode === surface.mode && entry.locale !== surface.locale &&
      entry.sourceIds.length === surface.sourceIds.length &&
      entry.sourceIds.every((id) => surface.sourceIds.includes(id)));
    if (!companion) add('ALTERNATE_LANGUAGE_MISSING', 'block', `surfaces.${surface.id}`, 'No paired EN/FR surface');
  }
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  const blockingCount = findings.filter((entry) => entry.level === 'block').length;
  return {
    releaseId: pack.releaseId,
    blocked: blockingCount > 0,
    findings,
    blockingCount,
    attentionCount: findings.filter((entry) => entry.level === 'attention').length,
    informationCount: findings.filter((entry) => entry.level === 'information').length,
    sourceCount: pack.sources.length,
    surfaceCount: pack.surfaces.length,
    handoffCount: pack.handoffs.length,
  };
}
