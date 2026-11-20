/** Source-to-output rights audit. Metadata gate, not legal advice. */
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';
import { RIGHTS_SCHEMA, rightsBySource, UNKNOWN } from './rights-core.mjs';
export const RIGHTS_BLOCK = 'block';
export const RIGHTS_NOTE = 'note';
const OSM_NOTICE = SOURCES.osm.notices.en[0];
const ODBL_NOTICE = SOURCES.osm.notices.en[1];
const LTC_EN = SOURCES.ltc.notices.en[0];
const LTC_FR = SOURCES.ltc.notices.fr[0];
const RIGHTS_REQUIREMENTS = Object.freeze({
  osm: ['ODbL-1.0'],
  metrolinx: ['Metrolinx-AUA', 'OGL-Ontario-Metrolinx'],
  ltc: ['LTC-Open-Data-Terms'],
  other: ['OTHER-OPEN'],
});
const CUSTOM_OPEN_RE = /\b(?:CC0|CC-BY(?:-SA)?(?:-\d\.\d)?|ODC-BY|ODbL|Open Government Licen[cs]e)\b/iu;
function normalized(value) { return String(value).normalize('NFC').replace(/\s+/gu, ' ').trim(); }
function contains(haystack, needle) { return normalized(haystack).includes(normalized(needle)); }
function add(findings, code, level, path, detail, sourceId = null, outputId = null) {
  findings.push({code, level, path, detail, sourceId, outputId});
}
function explicitYes(findings, value, path, code, sourceId, outputId) {
  if (value !== 'YES') add(findings, code, RIGHTS_BLOCK, path, value, sourceId, outputId);
}
function sourceRights(findings, source, path) {
  const included = source.publication === 'included';
  if (!included) return;
  if (source.sourceUrl === UNKNOWN) add(findings, 'SOURCE_ORIGIN_UNKNOWN', RIGHTS_BLOCK, `${path}.sourceUrl`, UNKNOWN, source.id);
  if (source.licenceUrl === UNKNOWN) add(findings, 'SOURCE_LICENCE_LINK_UNKNOWN', RIGHTS_BLOCK, `${path}.licenceUrl`, UNKNOWN, source.id);
  if (source.termsUrl === UNKNOWN) add(findings, 'SOURCE_TERMS_LINK_UNKNOWN', RIGHTS_BLOCK, `${path}.termsUrl`, UNKNOWN, source.id);
  if (source.evidenceUrl === UNKNOWN) add(findings, 'SOURCE_EVIDENCE_LINK_UNKNOWN', RIGHTS_BLOCK, `${path}.evidenceUrl`, UNKNOWN, source.id);
  if (source.acquiredOn === UNKNOWN) add(findings, 'SOURCE_ACQUISITION_UNKNOWN', RIGHTS_BLOCK, `${path}.acquiredOn`, UNKNOWN, source.id);
  if (source.termsReviewedOn === UNKNOWN) add(findings, 'SOURCE_TERMS_DATE_UNKNOWN', RIGHTS_BLOCK, `${path}.termsReviewedOn`, UNKNOWN, source.id);
  if (source.datasetAsOf === UNKNOWN) add(findings, 'SOURCE_DATASET_DATE_UNKNOWN', RIGHTS_NOTE, `${path}.datasetAsOf`, UNKNOWN, source.id);
  if (source.evidenceTier === UNKNOWN) add(findings, 'SOURCE_EVIDENCE_TIER_UNKNOWN', RIGHTS_BLOCK, `${path}.evidenceTier`, UNKNOWN, source.id);
  explicitYes(findings, source.permission, `${path}.permission`, 'SOURCE_PERMISSION_MISSING', source.id);
  explicitYes(findings, source.redistribution, `${path}.redistribution`, 'SOURCE_REDISTRIBUTION_MISSING', source.id);
  explicitYes(findings, source.openLicenceEvidence, `${path}.openLicenceEvidence`, 'SOURCE_OPEN_LICENCE_UNSUPPORTED', source.id);
  if (!source.attribution.trim()) add(findings, 'SOURCE_ATTRIBUTION_MISSING', RIGHTS_BLOCK, `${path}.attribution`, UNKNOWN, source.id);
  const allowed = RIGHTS_REQUIREMENTS[source.provider];
  if (!allowed.includes(source.licenceId)) {
    add(findings, 'SOURCE_LICENCE_CONFLICT', RIGHTS_BLOCK, `${path}.licenceId`, source.licenceId, source.id);
  }
  if (source.provider === 'osm') {
    if (!contains(source.attribution, OSM_NOTICE)) add(findings, 'OSM_CREDIT_MISSING', RIGHTS_BLOCK, `${path}.attribution`, OSM_NOTICE, source.id);
    if (!contains(source.attribution, ODBL_NOTICE)) add(findings, 'ODBL_TERMS_MISSING', RIGHTS_BLOCK, `${path}.attribution`, ODBL_NOTICE, source.id);
    if (source.shareAlikeRequired === UNKNOWN) add(findings, 'ODBL_SHARE_ALIKE_UNKNOWN', RIGHTS_BLOCK, `${path}.shareAlikeRequired`, UNKNOWN, source.id);
  }
  if (source.provider === 'metrolinx') {
    if (source.licenceId === 'Metrolinx-AUA') {
      for (const notice of [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR]) {
        if (!contains(source.attribution, notice)) add(findings, 'AUA_NOTICE_MISSING', RIGHTS_BLOCK, `${path}.attribution`, notice, source.id);
      }
      if (contains(source.attribution, METROLINX_OGL_NOTICE)) add(findings, 'AUA_OGL_COMBINED', RIGHTS_BLOCK, `${path}.attribution`, 'Conflicting licence notice', source.id);
    }
    if (source.licenceId === 'OGL-Ontario-Metrolinx') {
      if (!contains(source.attribution, METROLINX_OGL_NOTICE)) add(findings, 'OGL_NOTICE_MISSING', RIGHTS_BLOCK, `${path}.attribution`, METROLINX_OGL_NOTICE, source.id);
      if (contains(source.attribution, METROLINX_AUA_LEGEND)) add(findings, 'OGL_AUA_COMBINED', RIGHTS_BLOCK, `${path}.attribution`, 'Conflicting licence notice', source.id);
    }
  }
  if (source.provider === 'ltc' && !contains(source.attribution, 'London Transit Commission')) {
    add(findings, 'LTC_ATTRIBUTION_MISSING', RIGHTS_BLOCK, `${path}.attribution`, 'London Transit Commission', source.id);
  }
  if (source.provider === 'other' && !CUSTOM_OPEN_RE.test(source.licenceName)) {
    add(findings, 'OTHER_LICENCE_NOT_IDENTIFIED', RIGHTS_BLOCK, `${path}.licenceName`, source.licenceName, source.id);
  }
}
function outputRights(findings, output, path, sources) {
  if (output.state !== 'included') return;
  if (output.sourceIds.length === 0) add(findings, 'OUTPUT_NO_SOURCES', RIGHTS_BLOCK, `${path}.sourceIds`, UNKNOWN, null, output.id);
  if (output.minimumTargetPx === UNKNOWN || output.minimumTargetPx < 44) {
    add(findings, 'OUTPUT_TARGET_SMALL', RIGHTS_BLOCK, `${path}.minimumTargetPx`, String(output.minimumTargetPx), null, output.id);
  }
  for (const [key, code] of [
    ['keyboardAccessible', 'OUTPUT_KEYBOARD_MISSING'],
    ['screenReaderLabelled', 'OUTPUT_SCREEN_READER_MISSING'],
    ['licenceLink', 'OUTPUT_LICENCE_LINK_MISSING'],
  ]) explicitYes(findings, output[key], `${path}.${key}`, code, null, output.id);
  if (output.distribution !== 'online') {
    explicitYes(findings, output.offlineAvailable, `${path}.offlineAvailable`, 'OUTPUT_OFFLINE_UNKNOWN', null, output.id);
  }
  if (output.publishedOn === UNKNOWN) add(findings, 'OUTPUT_DATE_UNKNOWN', RIGHTS_NOTE, `${path}.publishedOn`, UNKNOWN, null, output.id);
  const included = [];
  for (const [index, sourceId] of output.sourceIds.entries()) {
    const source = sources.get(sourceId);
    if (!source) {
      add(findings, 'OUTPUT_SOURCE_ABSENT', RIGHTS_BLOCK, `${path}.sourceIds[${index}]`, sourceId, sourceId, output.id);
      continue;
    }
    if (source.publication !== 'included') {
      add(findings, 'OUTPUT_SOURCE_NOT_INCLUDED', RIGHTS_BLOCK, `${path}.sourceIds[${index}]`, source.publication, source.id, output.id);
      continue;
    }
    included.push(source);
    if (source.attribution.trim() && !contains(output.attribution, source.attribution)) {
      add(findings, 'OUTPUT_SOURCE_NOTICE_MISSING', RIGHTS_BLOCK, `${path}.attribution`, source.id, source.id, output.id);
    }
    if (source.redistribution !== 'YES') add(findings, 'OUTPUT_REDISTRIBUTION_UNSUPPORTED', RIGHTS_BLOCK, `${path}.sourceIds`, sourceId, sourceId, output.id);
    if (output.transformation !== 'unaltered' && source.derivativeUse !== 'YES') {
      add(findings, 'OUTPUT_DERIVATIVE_UNSUPPORTED', RIGHTS_BLOCK, `${path}.transformation`, source.derivativeUse, source.id, output.id);
    }
    if (source.shareAlikeRequired === 'YES' && output.transformation !== 'unaltered') {
      explicitYes(findings, output.shareAlikePublished, `${path}.shareAlikePublished`, 'OUTPUT_SHARE_ALIKE_MISSING', source.id, output.id);
    }
    if (source.provider === 'osm' && output.kind === 'map') {
      explicitYes(findings, output.mapCredit, `${path}.mapCredit`, 'OUTPUT_MAP_CREDIT_MISSING', source.id, output.id);
    }
  }
  const odbl = included.some(source => source.licenceId === 'ODbL-1.0');
  const other = included.some(source => source.licenceId !== 'ODbL-1.0');
  if (odbl && other && output.transformation === 'combined') {
    explicitYes(findings, output.separatedDatasets, `${path}.separatedDatasets`, 'OUTPUT_MIXED_LICENCE_UNRESOLVED', null, output.id);
  }
  if (included.some(source => source.licenceId === 'Metrolinx-AUA')) {
    explicitYes(findings, output.redistributionNotice, `${path}.redistributionNotice`, 'OUTPUT_AUA_NOTICE_MISSING', null, output.id);
  }
}
function exceptionFindings(findings, matrix, sources, outputs) {
  const seen = new Set();
  for (const [index, item] of matrix.exceptions.entries()) {
    const path = `exceptions[${index}]`;
    if (!sources.has(item.sourceId)) add(findings, 'EXCEPTION_SOURCE_ABSENT', RIGHTS_BLOCK, `${path}.sourceId`, item.sourceId, item.sourceId, item.outputId);
    if (!outputs.has(item.outputId)) add(findings, 'EXCEPTION_OUTPUT_ABSENT', RIGHTS_BLOCK, `${path}.outputId`, item.outputId, item.sourceId, item.outputId);
    const output = outputs.get(item.outputId);
    if (output && !output.sourceIds.includes(item.sourceId)) {
      add(findings, 'EXCEPTION_NOT_LINKED', RIGHTS_BLOCK, `${path}.sourceId`, item.sourceId, item.sourceId, item.outputId);
    }
    if (item.disposition === 'open' && output?.state === 'included') {
      add(findings, 'EXCEPTION_UNRESOLVED', RIGHTS_BLOCK, `${path}.disposition`, item.issue, item.sourceId, item.outputId);
    }
    if (item.disposition === 'resolved' && (item.evidenceUrl === UNKNOWN || item.recordedOn === UNKNOWN || !item.reason.trim())) {
      add(findings, 'EXCEPTION_RESOLUTION_EVIDENCE_MISSING', RIGHTS_BLOCK, `${path}.evidenceUrl`, item.issue, item.sourceId, item.outputId);
    }
    const key = `${item.sourceId}/${item.outputId}/${item.issue}`;
    if (seen.has(key)) add(findings, 'EXCEPTION_DUPLICATED', RIGHTS_NOTE, path, key, item.sourceId, item.outputId);
    seen.add(key);
  }
}
export function auditRightsMatrix(matrix) {
  if (!matrix || matrix.schema !== RIGHTS_SCHEMA) throw new TypeError('Parsed rights matrix is required');
  const findings = [];
  const sources = new Map(matrix.sources.map(source => [source.id, source]));
  const outputs = new Map(matrix.outputs.map(output => [output.id, output]));
  for (const [i, source] of matrix.sources.entries()) sourceRights(findings, source, `sources[${i}]`);
  for (const [i, output] of matrix.outputs.entries()) outputRights(findings, output, `outputs[${i}]`, sources);
  exceptionFindings(findings, matrix, sources, outputs);
  if (matrix.sources.length === 0) add(findings, 'RELEASE_NO_SOURCES', RIGHTS_BLOCK, 'sources', UNKNOWN);
  if (matrix.outputs.length === 0) add(findings, 'RELEASE_NO_OUTPUTS', RIGHTS_BLOCK, 'outputs', UNKNOWN);
  const used = new Set(matrix.outputs.filter(output => output.state === 'included').flatMap(output => output.sourceIds));
  for (const source of matrix.sources) {
    if (source.publication === 'included' && !used.has(source.id)) {
      add(findings, 'SOURCE_UNUSED', RIGHTS_NOTE, `sources.${source.id}`, source.id, source.id);
    }
  }
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  return {
    releaseId: matrix.releaseId,
    blocked: findings.some(item => item.level === RIGHTS_BLOCK),
    blockingCount: findings.filter(item => item.level === RIGHTS_BLOCK).length,
    noteCount: findings.filter(item => item.level === RIGHTS_NOTE).length,
    findings,
    sourceToOutputs: rightsBySource(matrix),
  };
}
