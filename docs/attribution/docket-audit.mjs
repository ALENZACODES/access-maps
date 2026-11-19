/** Fail-closed licence evidence review, using the merged attribution catalogue. */
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';
import { UNKNOWN } from './docket-core.mjs';

const LICENCE_PROVIDER = Object.freeze({
  'ODbL-1.0': 'osm',
  'Metrolinx-AUA': 'metrolinx',
  'OGL-Ontario-Metrolinx': 'metrolinx',
  'LTC-Open-Data-Terms': 'ltc',
});
const noticeMatch = (value, fragment) => value.normalize('NFC').replace(/\s+/gu, ' ').includes(fragment.normalize('NFC').replace(/\s+/gu, ' '));
export const SEVERITIES = Object.freeze(['block', 'attention', 'info']);
function emit(findings, code, severity, path, subject, detail) {
  findings.push({ code, severity, path, subject, detail });
}
const findingSort = (a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject);
function dateAfter(first, second) { return first !== UNKNOWN && second !== UNKNOWN && first > second; }
function dateBefore(first, second) { return first !== UNKNOWN && second !== UNKNOWN && first < second; }
function needsConsent(value, findings, code, path, id) {
  if (value !== 'YES') emit(findings, code, 'block', path, id,
    value === UNKNOWN ? 'Missing evidence' : 'Negative evidence');
}
function sourceNotice(source, findings, at) {
  const licence = source.licence;
  if (licence === 'ODbL-1.0') {
    if (!noticeMatch(source.notice, SOURCES.osm.notices.en[0])) {
      emit(findings, 'OSM_CREDIT_MISSING', 'block', at, source.id, 'Map credit absent');
    }
    if (!noticeMatch(source.notice, 'Open Database License (ODbL) 1.0')) {
      emit(findings, 'ODBL_TERMS_MISSING', 'block', at, source.id, 'Data terms absent');
    }
  } else if (licence === 'Metrolinx-AUA') {
    for (const [code, line] of [
      ['AUA_LEGEND_MISSING', METROLINX_AUA_LEGEND],
      ['AUA_LAWS_EN_MISSING', METROLINX_AUA_END_USER_LAWS_EN],
      ['AUA_LAWS_FR_MISSING', METROLINX_AUA_END_USER_LAWS_FR],
    ]) {
      if (!noticeMatch(source.notice, line)) emit(findings, code, 'block', at, source.id, 'AUA notice incomplete');
    }
    if (noticeMatch(source.notice, METROLINX_OGL_NOTICE)) {
      emit(findings, 'AUA_OGL_MIXED', 'block', at, source.id, 'Separate licence notices are combined');
    }
  } else if (licence === 'OGL-Ontario-Metrolinx') {
    if (!noticeMatch(source.notice, METROLINX_OGL_NOTICE)) {
      emit(findings, 'OGL_NOTICE_MISSING', 'block', at, source.id, 'OGL notice absent');
    }
    if (noticeMatch(source.notice, METROLINX_AUA_LEGEND)) {
      emit(findings, 'OGL_AUA_MIXED', 'block', at, source.id, 'Separate licence notices are combined');
    }
  } else if (licence === 'LTC-Open-Data-Terms') {
    if (!noticeMatch(source.notice, 'London Transit Commission')) {
      emit(findings, 'LTC_CREDIT_MISSING', 'block', at, source.id, 'Source acknowledgement absent');
    }
  } else if (licence === 'OTHER-OPEN') {
    if (source.licenceName === UNKNOWN || !/\b(?:MIT|Apache|BSD|ODbL|CC BY|Open Government Licence|Open Data Commons)\b/iu.test(source.licenceName)) {
      emit(findings, 'OPEN_LICENCE_UNSPECIFIED', 'block', at, source.id, 'Open licence identifier absent');
    }
    if (!source.notice.trim()) emit(findings, 'OTHER_CREDIT_MISSING', 'block', at, source.id, 'Attribution absent');
  } else {
    emit(findings, 'LICENCE_UNKNOWN', 'block', at, source.id, 'Licence not recorded');
  }
}
export function auditDocket(docket, options = {}) {
  const findings = [];
  const now = options.asOf ?? docket.asOf;
  const sourcesById = new Map(docket.sources.map((source) => [source.id, source]));
  const evidenceById = new Map(docket.evidence.map((item) => [item.id, item]));
  const decisionsBySource = new Map();
  if (docket.sources.length === 0) emit(findings, 'NO_SOURCES', 'block', 'sources', docket.releaseId, 'No source records');
  if (docket.surfaces.length === 0) emit(findings, 'NO_SURFACES', 'block', 'surfaces', docket.releaseId, 'No publication views');
  if (now === UNKNOWN) emit(findings, 'AS_OF_UNKNOWN', 'attention', 'asOf', docket.releaseId, 'Review date is UNKNOWN');
  for (const decision of docket.decisions) {
    const at = `decisions.${decision.id}`;
    if (!sourcesById.has(decision.sourceId)) {
      emit(findings, 'DECISION_SOURCE_MISSING', 'block', at, decision.id, 'Decision has no source');
    }
    const entries = decisionsBySource.get(decision.sourceId) ?? [];
    entries.push(decision);
    decisionsBySource.set(decision.sourceId, entries);
    if (decision.state === 'accepted' && (!decision.reason.trim() || decision.decidedOn === UNKNOWN)) {
      emit(findings, 'DECISION_RATIONALE_MISSING', 'block', at, decision.id, 'Accepted decision lacks rationale or date');
    }
    for (const evidenceId of decision.evidenceIds) {
      const item = evidenceById.get(evidenceId);
      if (!item) emit(findings, 'DECISION_EVIDENCE_MISSING', 'block', at, decision.id, evidenceId);
      else if (item.sourceId !== decision.sourceId) {
        emit(findings, 'DECISION_EVIDENCE_MISMATCH', 'block', at, decision.id, evidenceId);
      }
    }
    if (dateAfter(decision.decidedOn, now)) emit(findings, 'DECISION_IN_FUTURE', 'block', at, decision.id, 'Date after review date');
  }
  for (const evidence of docket.evidence) {
    const at = `evidence.${evidence.id}`;
    if (!sourcesById.has(evidence.sourceId)) emit(findings, 'ORPHAN_EVIDENCE', 'block', at, evidence.id, evidence.sourceId);
    if (evidence.url === UNKNOWN) emit(findings, 'EVIDENCE_URL_UNKNOWN', 'attention', at, evidence.id, 'Reference link absent');
    if (evidence.tier === UNKNOWN) emit(findings, 'EVIDENCE_TIER_UNKNOWN', 'attention', at, evidence.id, 'Evidence tier UNKNOWN');
    if (dateAfter(evidence.recordedOn, now) || dateAfter(evidence.observedOn, now)) {
      emit(findings, 'EVIDENCE_IN_FUTURE', 'block', at, evidence.id, 'Date after review date');
    }
    if (dateAfter(evidence.observedOn, evidence.recordedOn)) {
      emit(findings, 'EVIDENCE_DATE_ORDER', 'block', at, evidence.id, 'Observed after recorded');
    }
  }
  for (const source of docket.sources) {
    const at = `sources.${source.id}`;
    const linked = source.evidenceIds.map((evidenceId) => evidenceById.get(evidenceId));
    for (let n = 0; n < source.evidenceIds.length; n += 1) {
      const item = linked[n];
      if (!item) emit(findings, 'SOURCE_EVIDENCE_MISSING', 'block', at, source.id, source.evidenceIds[n]);
      else if (item.sourceId !== source.id) emit(findings, 'SOURCE_EVIDENCE_MISMATCH', 'block', at, source.id, item.id);
    }
    const decisions = decisionsBySource.get(source.id) ?? [];
    const accepted = decisions.filter((decision) => decision.state === 'accepted');
    if (accepted.length > 1) emit(findings, 'MULTIPLE_ACCEPTED_DECISIONS', 'block', at, source.id, 'More than one accepted decision');
    if (decisions.some((decision) => decision.state === 'rejected') && accepted.length) {
      emit(findings, 'DECISION_CONFLICT', 'block', at, source.id, 'Conflicting decisions');
    }
    if (source.state !== 'included') continue;
    if (source.sourceUrl === UNKNOWN) emit(findings, 'SOURCE_URL_UNKNOWN', 'block', at, source.id, 'Source URL missing');
    if (source.licenceUrl === UNKNOWN) emit(findings, 'LICENCE_URL_UNKNOWN', 'block', at, source.id, 'Licence URL missing');
    needsConsent(source.permission, findings, 'PERMISSION_NOT_YES', at, source.id);
    needsConsent(source.licenceEvidence, findings, 'LICENCE_EVIDENCE_NOT_YES', at, source.id);
    if (source.tier === UNKNOWN) emit(findings, 'TIER_UNKNOWN', 'block', at, source.id, 'Evidence tier not recorded');
    if (source.acquiredOn === UNKNOWN) emit(findings, 'ACQUISITION_UNKNOWN', 'block', at, source.id, 'Acquisition date missing');
    if (source.termsReviewedOn === UNKNOWN) emit(findings, 'TERMS_DATE_UNKNOWN', 'block', at, source.id, 'Terms review date missing');
    if (source.datasetDate === UNKNOWN) emit(findings, 'DATASET_DATE_UNKNOWN', 'info', at, source.id, 'Dataset date UNKNOWN');
    if (source.reviewDueOn === UNKNOWN) emit(findings, 'REVIEW_DUE_UNKNOWN', 'attention', at, source.id, 'No recorded recheck date');
    else if (dateBefore(source.reviewDueOn, now)) emit(findings, 'REVIEW_OVERDUE', 'block', at, source.id, 'Review date passed');
    else if (source.reviewDueOn === now) emit(findings, 'REVIEW_DUE', 'attention', at, source.id, 'Review date reached');
    if (dateAfter(source.termsReviewedOn, now) || dateAfter(source.acquiredOn, now)) {
      emit(findings, 'SOURCE_DATE_FUTURE', 'block', at, source.id, 'Recorded date after review date');
    }
    if (dateAfter(source.datasetDate, source.acquiredOn)) emit(findings, 'DATASET_AFTER_ACQUISITION', 'attention', at, source.id, 'Dataset date exceeds acquisition date');
    if (!linked.length) emit(findings, 'SOURCE_NO_EVIDENCE', 'block', at, source.id, 'No reference evidence');
    if (!accepted.length) emit(findings, 'SOURCE_NO_ACCEPTANCE', 'block', at, source.id, 'No accepted review decision');
    else if (!accepted[0].evidenceIds.length) emit(findings, 'ACCEPTANCE_NO_EVIDENCE', 'block', at, source.id, 'Decision lacks evidence');
    const expected = LICENCE_PROVIDER[source.licence];
    if (expected && expected !== source.provider) emit(findings, 'PROVIDER_LICENCE_MISMATCH', 'block', at, source.id, 'Licence/provider mismatch');
    if (source.provider === 'other' && source.licence !== 'OTHER-OPEN') emit(findings, 'OTHER_LICENCE_MISMATCH', 'block', at, source.id, 'Other provider requires named open licence');
    sourceNotice(source, findings, at);
  }
  const touched = new Set();
  for (const surface of docket.surfaces) {
    const at = `surfaces.${surface.id}`;
    if (!surface.sourceIds.length) emit(findings, 'SURFACE_NO_SOURCES', 'block', at, surface.id, 'No source links');
    for (const id of surface.sourceIds) {
      touched.add(id);
      const source = sourcesById.get(id);
      if (!source) emit(findings, 'SURFACE_SOURCE_MISSING', 'block', at, surface.id, id);
      else if (source.state !== 'included') emit(findings, 'SURFACE_SOURCE_NOT_INCLUDED', 'block', at, surface.id, id);
      if (surface.kind === 'map' && source?.provider === 'osm') {
        needsConsent(surface.mapCredit, findings, 'MAP_CREDIT_NOT_YES', at, surface.id);
      }
    }
    needsConsent(surface.keyboard, findings, 'KEYBOARD_NOT_YES', at, surface.id);
    needsConsent(surface.screenReader, findings, 'SCREEN_READER_NOT_YES', at, surface.id);
    if (surface.offline !== 'YES') emit(findings, 'OFFLINE_NOT_YES', 'block', at, surface.id, 'Offline evidence absent');
    if (surface.targetPx === UNKNOWN) emit(findings, 'TARGET_UNKNOWN', 'block', at, surface.id, 'Target size UNKNOWN');
    else if (surface.targetPx < 44) emit(findings, 'TARGET_TOO_SMALL', 'block', at, surface.id, 'Target smaller than 44 px');
    if (dateAfter(surface.publishedOn, now)) emit(findings, 'SURFACE_IN_FUTURE', 'block', at, surface.id, 'Publication after review date');
  }
  for (const source of docket.sources) {
    if (source.state === 'included' && !touched.has(source.id)) {
      emit(findings, 'INCLUDED_SOURCE_UNUSED', 'attention', `sources.${source.id}`, source.id, 'No published surface uses source');
    }
  }
  findings.sort(findingSort);
  const blocked = findings.some((item) => item.severity === 'block');
  return { releaseId: docket.releaseId, asOf: now, blocked, findings,
    counts: { sources: docket.sources.length, evidence: docket.evidence.length,
      surfaces: docket.surfaces.length, decisions: docket.decisions.length,
      block: findings.filter((f) => f.severity === 'block').length,
      attention: findings.filter((f) => f.severity === 'attention').length,
      info: findings.filter((f) => f.severity === 'info').length } };
}
