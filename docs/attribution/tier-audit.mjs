/** Fail-closed audits for release records and their publication surfaces. */
import { METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR, SOURCES } from './attribution-utils.mjs';
import { UNKNOWN, parseTierLedger, surfaceRecordIndex } from './tier-ledger.mjs';

export const MIN_TARGET_PX = 44;
const REQUIRED_OSM = '© OpenStreetMap contributors';
const FAMILY_LICENCES = Object.freeze({
  osm: /\bODbL\b|Open Database License/iu,
  'metrolinx-aua': /Access and Use Agreement|Metrolinx-AUA/iu,
  'metrolinx-ogl': /Open Government Licence|OGL-Ontario/iu,
  ltc: /LTC|London Transit Commission/iu,
});
const LEVELS = Object.freeze(['block', 'attention', 'info']);
function norm(text) { return text.normalize('NFC').replace(/\s+/gu, ' ').trim(); }
function includesNotice(haystack, needle) { return norm(haystack).includes(norm(needle)); }
function finding(code, level, entity, path, detail) {
  return Object.freeze({code, level, entity, path, detail});
}
function add(out, code, level, entity, path, detail) {
  out.push(finding(code, level, entity, path, detail));
}
function dateOrder(a, b) { return a !== UNKNOWN && b !== UNKNOWN && a > b; }
function auditRecord(record, output, context) {
  const path = `records.${record.id}`;
  if (record.state !== 'included') return;
  for (const [field, code] of [['sourceUrl', 'SOURCE_LINK_UNKNOWN'], ['licenceUrl', 'LICENCE_LINK_UNKNOWN'], ['evidenceUrl', 'EVIDENCE_LINK_UNKNOWN']]) {
    if (record[field] === UNKNOWN) add(output, code, 'block', record.id, `${path}.${field}`, 'Link is UNKNOWN');
  }
  for (const [field, code] of [['acquiredOn', 'ACQUISITION_UNKNOWN'], ['termsReviewedOn', 'TERMS_DATE_UNKNOWN']]) {
    if (record[field] === UNKNOWN) add(output, code, 'block', record.id, `${path}.${field}`, 'Date is UNKNOWN');
  }
  if (record.sourceDate === UNKNOWN) add(output, 'SOURCE_DATE_UNKNOWN', 'attention', record.id, `${path}.sourceDate`, 'Dataset date remains UNKNOWN');
  if (record.tier === UNKNOWN) add(output, 'TIER_UNKNOWN', 'block', record.id, `${path}.tier`, 'Evidence tier is UNKNOWN');
  if (record.permission !== 'YES') add(output, record.permission === UNKNOWN ? 'PERMISSION_UNKNOWN' : 'PERMISSION_DENIED', 'block', record.id, `${path}.permission`, `Permission ${record.permission}`);
  if (!record.attribution.trim()) add(output, 'NOTICE_EMPTY', 'block', record.id, `${path}.attribution`, 'Attribution is empty');
  if (dateOrder(record.acquiredOn, record.termsReviewedOn)) add(output, 'TERMS_REVIEW_BEFORE_ACQUISITION', 'attention', record.id, path, 'Dates require inspection');
  if (dateOrder(record.sourceDate, record.acquiredOn)) add(output, 'SOURCE_AFTER_ACQUISITION', 'attention', record.id, path, 'Dataset date after acquisition');
  if (context.asOf !== UNKNOWN) {
    for (const field of ['acquiredOn', 'termsReviewedOn', 'sourceDate']) {
      if (dateOrder(record[field], context.asOf)) add(output, 'FUTURE_DATE', 'block', record.id, `${path}.${field}`, 'Date exceeds review date');
    }
  }
  const expectedLicence = FAMILY_LICENCES[record.family];
  if (expectedLicence && !expectedLicence.test(record.licenceName)) {
    add(output, 'LICENCE_FAMILY_MISMATCH', 'block', record.id, `${path}.licenceName`, 'Licence and recorded source family differ');
  }
  if (record.family === 'osm') {
    if (!includesNotice(record.attribution, REQUIRED_OSM)) add(output, 'OSM_CREDIT_MISSING', 'block', record.id, path, 'OSM map credit absent');
    if (!FAMILY_LICENCES.osm.test(record.licenceName)) add(output, 'OSM_ODBL_MISSING', 'block', record.id, path, 'ODbL evidence absent');
    if (record.sourceUrl !== UNKNOWN && record.sourceUrl !== SOURCES.osm.sourceUrl) {
      add(output, 'OSM_NONCATALOGUE_URL', 'attention', record.id, path, 'Source link differs from catalogue reference');
    }
  }
  if (record.family === 'metrolinx-aua') {
    for (const [code, notice] of [['AUA_LEGEND_MISSING', METROLINX_AUA_LEGEND], ['AUA_LAWS_EN_MISSING', METROLINX_AUA_END_USER_LAWS_EN], ['AUA_LAWS_FR_MISSING', METROLINX_AUA_END_USER_LAWS_FR]]) {
      if (!includesNotice(record.attribution, notice)) add(output, code, 'block', record.id, path, 'AUA notice incomplete');
    }
    if (includesNotice(record.attribution, METROLINX_OGL_NOTICE)) add(output, 'AUA_OGL_MIXED', 'block', record.id, path, 'Other Metrolinx licence line included');
  }
  if (record.family === 'metrolinx-ogl') {
    if (!includesNotice(record.attribution, METROLINX_OGL_NOTICE)) add(output, 'OGL_NOTICE_MISSING', 'block', record.id, path, 'OGL notice missing');
    if (includesNotice(record.attribution, METROLINX_AUA_LEGEND)) add(output, 'OGL_AUA_MIXED', 'block', record.id, path, 'Other Metrolinx licence legend included');
  }
  if (record.family === 'ltc' && !/London Transit Commission|\bLTC\b/iu.test(record.attribution)) {
    add(output, 'LTC_NOTICE_MISSING', 'block', record.id, path, 'LTC attribution absent');
  }
  if (record.family === 'other' && /\b(?:unknown|unspecified)\b/iu.test(record.licenceName)) {
    add(output, 'OTHER_LICENCE_UNCLEAR', 'block', record.id, path, 'Open licence is not established');
  }
}
function auditSurface(surface, recordsById, output, context) {
  const path = `surfaces.${surface.id}`;
  if (surface.recordIds.length === 0) add(output, 'SURFACE_NO_RECORDS', 'block', surface.id, path, 'No referenced record');
  if (surface.offline !== 'YES' && context.requireOffline) add(output, 'OFFLINE_NOT_ESTABLISHED', 'block', surface.id, `${path}.offline`, 'Offline availability not established');
  if (surface.targetPx === UNKNOWN) add(output, 'TARGET_UNKNOWN', 'block', surface.id, `${path}.targetPx`, 'Target size is UNKNOWN');
  else if (surface.targetPx < MIN_TARGET_PX) add(output, 'TARGET_TOO_SMALL', 'block', surface.id, `${path}.targetPx`, 'Target smaller than 44 px');
  if (surface.labelled !== 'YES') add(output, 'LABEL_EVIDENCE_MISSING', 'block', surface.id, `${path}.labelled`, 'Accessible label evidence absent');
  if (surface.keyboard !== 'YES') add(output, 'KEYBOARD_EVIDENCE_MISSING', 'block', surface.id, `${path}.keyboard`, 'Keyboard evidence absent');
  if (surface.publicationDate === UNKNOWN) add(output, 'PUBLICATION_DATE_UNKNOWN', 'attention', surface.id, `${path}.publicationDate`, 'Publication date is UNKNOWN');
  if (context.asOf !== UNKNOWN && dateOrder(surface.publicationDate, context.asOf)) add(output, 'FUTURE_PUBLICATION', 'block', surface.id, path, 'Publication date is after review date');
  for (const id of surface.recordIds) {
    const record = recordsById.get(id);
    if (!record) { add(output, 'RECORD_NOT_FOUND', 'block', surface.id, path, `Record ${id} does not exist`); continue; }
    if (record.state !== 'included') add(output, 'RECORD_NOT_INCLUDED', 'block', surface.id, path, `Record ${id} is not included`);
    if (surface.mode === 'map' && record.family === 'osm' && surface.mapCredit !== 'YES') {
      add(output, 'MAP_CREDIT_NOT_ESTABLISHED', 'block', surface.id, `${path}.mapCredit`, 'OSM map credit near map is not established');
    }
  }
}
export function auditTierLedger(input, options = {}) {
  const ledger = parseTierLedger(input);
  const asOf = options.asOf ?? UNKNOWN;
  if (asOf !== UNKNOWN && (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(asOf))) throw new TypeError('Invalid asOf date');
  const context = {asOf, requireOffline: options.requireOffline !== false};
  const output = [];
  const recordsById = new Map(ledger.records.map((record) => [record.id, record]));
  if (!ledger.records.length) add(output, 'LEDGER_EMPTY', 'block', ledger.release, 'ledger.records', 'No records supplied');
  if (!ledger.surfaces.length) add(output, 'SURFACES_EMPTY', 'block', ledger.release, 'ledger.surfaces', 'No surfaces supplied');
  for (const record of ledger.records) auditRecord(record, output, context);
  for (const surface of ledger.surfaces) auditSurface(surface, recordsById, output, context);
  const used = surfaceRecordIndex(ledger);
  for (const record of ledger.records) {
    if (record.state === 'included' && !used.get(record.id)?.length) add(output, 'INCLUDED_RECORD_UNUSED', 'attention', record.id, `records.${record.id}`, 'Included record has no surface');
  }
  output.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.entity.localeCompare(b.entity));
  const counts = Object.fromEntries(LEVELS.map((level) => [level, output.filter((item) => item.level === level).length]));
  return Object.freeze({release: ledger.release, blocked: counts.block > 0, findings: Object.freeze(output), counts: Object.freeze(counts), records: ledger.records.length, surfaces: ledger.surfaces.length, asOf});
}
function indexById(list) { return new Map(list.map((item) => [item.id, item])); }
const HIGH_RISK_FIELDS = new Set(['permission', 'tier', 'family', 'licenceUrl', 'licenceName', 'sourceUrl', 'attribution', 'state', 'sourceDate', 'acquiredOn', 'termsReviewedOn', 'evidenceUrl']);
export function compareTierLedgers(previousInput, currentInput, options = {}) {
  const previous = parseTierLedger(previousInput);
  const current = parseTierLedger(currentInput);
  const changes = [];
  const addChange = (kind, severity, id, field, before, after) => changes.push(Object.freeze({kind, severity, id, field, before, after}));
  for (const category of ['records', 'surfaces']) {
    const before = indexById(previous[category]);
    const after = indexById(current[category]);
    for (const [id, item] of before) {
      if (!after.has(id)) { addChange(`${category}-removed`, 'block', id, '', item, null); continue; }
      const next = after.get(id);
      for (const field of Object.keys(item)) {
        if (JSON.stringify(item[field]) !== JSON.stringify(next[field])) {
          let severity = category === 'records' && HIGH_RISK_FIELDS.has(field) ? 'block' : 'attention';
          if (category === 'surfaces' && ['recordIds', 'offline', 'targetPx', 'mapCredit', 'labelled', 'keyboard', 'locale', 'mode'].includes(field)) severity = 'block';
          addChange(`${category}-changed`, severity, id, field, item[field], next[field]);
        }
      }
    }
    for (const [id, item] of after) if (!before.has(id)) addChange(`${category}-added`, 'attention', id, '', null, item);
  }
  changes.sort((a, b) => a.id.localeCompare(b.id) || a.field.localeCompare(b.field));
  const audit = auditTierLedger(current, options);
  return Object.freeze({before: previous.release, after: current.release, blocked: audit.blocked || changes.some((change) => change.severity === 'block'), changes: Object.freeze(changes), audit});
}
