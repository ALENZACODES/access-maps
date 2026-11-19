/** Deterministic release gate for separately recorded attribution placements. */
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';
import { OBLIGATION_UNKNOWN, sourcePageIndex } from './obligation-core.mjs';

export const OBLIGATION_MIN_TARGET = 44;
const BLOCK = 'block';
const NOTICE = 'attention';
const INFO = 'info';

function normalize(value) { return value.normalize('NFC').replace(/\s+/gu, ' ').trim(); }
function has(haystack, needle) { return normalize(haystack).includes(normalize(needle)); }
function issue(code, level, path, detail, sourceId = null, pageId = null) {
  return { code, level, path, detail, sourceId, pageId };
}
function add(issues, code, level, path, detail, sourceId = null, pageId = null) {
  issues.push(issue(code, level, path, detail, sourceId, pageId));
}
function known(value) { return value !== OBLIGATION_UNKNOWN && value !== ''; }
function expectedNotice(source, kind, locale) {
  switch (source.provider) {
    case 'osm':
      if (kind === 'credit') return '© OpenStreetMap contributors';
      if (kind === 'licence') return 'Open Database License (ODbL) 1.0';
      return null;
    case 'metrolinx-aua':
      if (kind === 'terms') return METROLINX_AUA_LEGEND;
      if (kind === 'laws') return locale === 'fr' ? METROLINX_AUA_END_USER_LAWS_FR : METROLINX_AUA_END_USER_LAWS_EN;
      return null;
    case 'metrolinx-ogl':
      if (kind === 'licence') return METROLINX_OGL_NOTICE;
      return null;
    case 'ltc':
      if (kind === 'credit') return SOURCES.ltc.notices[locale][0];
      return null;
    default:
      return null;
  }
}
export function requiredKinds(source) {
  switch (source.provider) {
    case 'osm': return ['credit', 'licence'];
    case 'metrolinx-aua': return ['terms', 'laws'];
    case 'metrolinx-ogl': return ['licence'];
    case 'ltc': return ['credit'];
    default: return ['credit', 'licence'];
  }
}
function matchLicence(source) {
  if (source.provider === 'osm') return source.licenceId === 'ODbL-1.0' && /ODbL/u.test(source.licenceName);
  if (source.provider === 'metrolinx-aua') return source.licenceId === 'Metrolinx-AUA';
  if (source.provider === 'metrolinx-ogl') return source.licenceId === 'OGL-Ontario-Metrolinx';
  if (source.provider === 'ltc') return source.licenceId === 'LTC-Open-Data-Terms';
  return source.licenceId !== OBLIGATION_UNKNOWN && /(?:ODbL|Open Government Licence|Creative Commons|CC BY|CC0|Open Data Commons|Open Database License)/iu.test(source.licenceName);
}
function inspectSource(source, issues) {
  const at = `sources.${source.id}`;
  if (source.state !== 'included') return;
  if (source.permission !== 'YES') add(issues, 'PERMISSION_NOT_GRANTED', BLOCK, `${at}.permission`, source.permission, source.id);
  if (!known(source.sourceUrl)) add(issues, 'SOURCE_URL_UNKNOWN', BLOCK, `${at}.sourceUrl`, 'Source URL not supplied', source.id);
  if (!known(source.licenceUrl)) add(issues, 'LICENCE_URL_UNKNOWN', BLOCK, `${at}.licenceUrl`, 'Licence URL not supplied', source.id);
  if (!matchLicence(source)) add(issues, 'LICENCE_UNSUPPORTED', BLOCK, `${at}.licenceId`, 'Licence code or open-licence evidence is insufficient', source.id);
  if (!source.attribution.trim()) add(issues, 'ATTRIBUTION_EMPTY', BLOCK, `${at}.attribution`, 'Source notice absent', source.id);
  if (!known(source.acquiredOn)) add(issues, 'ACQUISITION_UNKNOWN', BLOCK, `${at}.acquiredOn`, 'Acquisition date absent', source.id);
  if (!known(source.termsReviewedOn)) add(issues, 'TERMS_REVIEW_UNKNOWN', BLOCK, `${at}.termsReviewedOn`, 'Terms review date absent', source.id);
  if (!known(source.datasetAsOf)) add(issues, 'DATASET_DATE_UNKNOWN', INFO, `${at}.datasetAsOf`, OBLIGATION_UNKNOWN, source.id);
  if (!known(source.tier)) add(issues, 'EVIDENCE_TIER_UNKNOWN', BLOCK, `${at}.tier`, OBLIGATION_UNKNOWN, source.id);
  if (known(source.datasetAsOf) && known(source.acquiredOn) && source.datasetAsOf > source.acquiredOn) {
    add(issues, 'DATE_ORDER', NOTICE, `${at}.datasetAsOf`, 'Dataset date follows acquisition date', source.id);
  }
  if (known(source.termsReviewedOn) && known(source.acquiredOn) && source.termsReviewedOn > source.acquiredOn) {
    add(issues, 'TERMS_AFTER_ACQUISITION', NOTICE, `${at}.termsReviewedOn`, 'Terms were reviewed after acquisition', source.id);
  }
}
function inspectPage(page, issues) {
  const at = `pages.${page.id}`;
  if (page.offline !== 'YES') add(issues, 'OFFLINE_NOT_RECORDED', BLOCK, `${at}.offline`, page.offline, null, page.id);
  if (page.keyboard !== 'YES') add(issues, 'KEYBOARD_NOT_RECORDED', BLOCK, `${at}.keyboard`, page.keyboard, null, page.id);
  if (page.screenReader !== 'YES') add(issues, 'LABELS_NOT_RECORDED', BLOCK, `${at}.screenReader`, page.screenReader, null, page.id);
  if (page.targetPx === OBLIGATION_UNKNOWN) add(issues, 'TARGET_UNKNOWN', BLOCK, `${at}.targetPx`, OBLIGATION_UNKNOWN, null, page.id);
  else if (page.targetPx < OBLIGATION_MIN_TARGET) add(issues, 'TARGET_BELOW_MINIMUM', BLOCK, `${at}.targetPx`, String(page.targetPx), null, page.id);
  if (!known(page.publishedOn)) add(issues, 'PUBLICATION_DATE_UNKNOWN', INFO, `${at}.publishedOn`, OBLIGATION_UNKNOWN, null, page.id);
  if (page.sourceIds.length === 0) add(issues, 'PAGE_SOURCE_EMPTY', BLOCK, `${at}.sourceIds`, 'No source inventory for this page', null, page.id);
}
function inspectPlacement(placement, sources, pages, witnesses, issues) {
  const at = `placements.${placement.id}`;
  const page = pages.get(placement.pageId);
  const source = sources.get(placement.sourceId);
  if (!page) add(issues, 'PLACEMENT_PAGE_MISSING', BLOCK, `${at}.pageId`, placement.pageId, placement.sourceId, placement.pageId);
  if (!source) add(issues, 'PLACEMENT_SOURCE_MISSING', BLOCK, `${at}.sourceId`, placement.sourceId, placement.sourceId, placement.pageId);
  if (!page || !source) return;
  if (!page.sourceIds.includes(source.id)) add(issues, 'PLACEMENT_UNDECLARED_SOURCE', BLOCK, `${at}.sourceId`, source.id, source.id, page.id);
  if (source.state !== 'included') add(issues, 'PLACEMENT_NON_INCLUDED_SOURCE', BLOCK, `${at}.sourceId`, source.state, source.id, page.id);
  if (placement.visibility !== 'visible') add(issues, 'NOTICE_NOT_VISIBLE', BLOCK, `${at}.visibility`, placement.visibility, source.id, page.id);
  if (!placement.notice.trim()) add(issues, 'NOTICE_EMPTY', BLOCK, `${at}.notice`, 'Notice text absent', source.id, page.id);
  const expected = expectedNotice(source, placement.kind, page.locale);
  if (expected !== null && !has(placement.notice, expected)) {
    add(issues, 'NOTICE_TEXT_MISMATCH', BLOCK, `${at}.notice`, `Required ${placement.kind} notice missing`, source.id, page.id);
  }
  if (placement.kind === 'credit' && source.provider === 'osm' && page.display === 'map' && placement.nearMap !== 'YES') {
    add(issues, 'MAP_CREDIT_NOT_NEAR_MAP', BLOCK, `${at}.nearMap`, placement.nearMap, source.id, page.id);
  }
  if (placement.witnessIds.length === 0) add(issues, 'PLACEMENT_WITNESS_EMPTY', BLOCK, `${at}.witnessIds`, 'Evidence for displayed notice absent', source.id, page.id);
  for (const witnessId of placement.witnessIds) {
    const witness = witnesses.get(witnessId);
    if (!witness) add(issues, 'PLACEMENT_WITNESS_MISSING', BLOCK, `${at}.witnessIds`, witnessId, source.id, page.id);
    else if (witness.sourceId !== source.id) add(issues, 'PLACEMENT_WITNESS_WRONG_SOURCE', BLOCK, `${at}.witnessIds`, witnessId, source.id, page.id);
  }
  if (source.provider === 'metrolinx-aua' && placement.kind === 'licence' && has(placement.notice, METROLINX_OGL_NOTICE)) {
    add(issues, 'AUA_OGL_CONFUSION', BLOCK, `${at}.notice`, 'Separate licence variants', source.id, page.id);
  }
  if (source.provider === 'metrolinx-ogl' && placement.kind === 'terms' && has(placement.notice, METROLINX_AUA_LEGEND)) {
    add(issues, 'OGL_AUA_CONFUSION', BLOCK, `${at}.notice`, 'Separate licence variants', source.id, page.id);
  }
}
function inspectWitness(witness, sources, issues) {
  const at = `witnesses.${witness.id}`;
  const source = sources.get(witness.sourceId);
  if (!source) add(issues, 'WITNESS_SOURCE_MISSING', BLOCK, `${at}.sourceId`, witness.sourceId, witness.sourceId);
  if (!known(witness.recordedOn)) add(issues, 'WITNESS_DATE_UNKNOWN', BLOCK, `${at}.recordedOn`, OBLIGATION_UNKNOWN, witness.sourceId);
  if (!known(witness.tier)) add(issues, 'WITNESS_TIER_UNKNOWN', BLOCK, `${at}.tier`, OBLIGATION_UNKNOWN, witness.sourceId);
  if (witness.type === 'source-document' && !known(witness.url)) {
    add(issues, 'WITNESS_URL_UNKNOWN', BLOCK, `${at}.url`, OBLIGATION_UNKNOWN, witness.sourceId);
  }
  if (source && known(source.acquiredOn) && known(witness.recordedOn) && witness.recordedOn < source.acquiredOn) {
    add(issues, 'WITNESS_BEFORE_ACQUISITION', NOTICE, `${at}.recordedOn`, witness.recordedOn, witness.sourceId);
  }
}
function inspectRequiredPlacements(register, issues) {
  const sources = new Map(register.sources.map(x => [x.id, x]));
  for (const page of register.pages) {
    for (const sourceId of page.sourceIds) {
      const source = sources.get(sourceId);
      if (!source) {
        add(issues, 'PAGE_SOURCE_MISSING', BLOCK, `pages.${page.id}.sourceIds`, sourceId, sourceId, page.id);
        continue;
      }
      if (source.state !== 'included') {
        add(issues, 'PAGE_SOURCE_NOT_INCLUDED', BLOCK, `pages.${page.id}.sourceIds`, source.state, sourceId, page.id);
        continue;
      }
      const placements = register.placements.filter(x => x.pageId === page.id && x.sourceId === source.id);
      for (const kind of requiredKinds(source)) {
        const matches = placements.filter(x => x.kind === kind);
        if (matches.length === 0) {
          add(issues, 'REQUIRED_NOTICE_MISSING', BLOCK, `pages.${page.id}.sourceIds`, `${sourceId}: ${kind}`, sourceId, page.id);
        } else if (matches.length > 1) {
          add(issues, 'DUPLICATE_NOTICE_PLACEMENT', NOTICE, `pages.${page.id}.sourceIds`, `${sourceId}: ${kind}`, sourceId, page.id);
        }
      }
    }
  }
}
function inspectLanguagePairs(register, issues, requirePairs) {
  if (!requirePairs) return;
  const groups = new Map();
  for (const page of register.pages) {
    const basename = page.path.replace(/(?:-en|-fr)(?=\.)/u, '');
    const key = `${page.display}:${basename}`;
    const group = groups.get(key) ?? [];
    group.push(page);
    groups.set(key, group);
  }
  for (const [groupId, group] of groups) {
    const en = group.find(x => x.locale === 'en');
    const fr = group.find(x => x.locale === 'fr');
    if (!en || !fr) {
      add(issues, 'LANGUAGE_COMPANION_MISSING', BLOCK, `pairs.${groupId}`, 'EN/FR pair absent');
      continue;
    }
    if (en.sourceIds.length !== fr.sourceIds.length || en.sourceIds.some(x => !fr.sourceIds.includes(x))) {
      add(issues, 'LANGUAGE_SOURCE_MISMATCH', BLOCK, `pairs.${groupId}`, 'EN/FR source lists differ');
    }
  }
}
export function auditObligationRegister(register, options = {}) {
  const issues = [];
  const sources = new Map(register.sources.map(x => [x.id, x]));
  const pages = new Map(register.pages.map(x => [x.id, x]));
  const witnesses = new Map(register.witnesses.map(x => [x.id, x]));
  if (register.sources.length === 0) add(issues, 'NO_SOURCES', BLOCK, 'sources', 'No source register');
  if (register.pages.length === 0) add(issues, 'NO_PAGES', BLOCK, 'pages', 'No published pages');
  for (const source of register.sources) inspectSource(source, issues);
  for (const page of register.pages) inspectPage(page, issues);
  for (const witness of register.witnesses) inspectWitness(witness, sources, issues);
  for (const placement of register.placements) inspectPlacement(placement, sources, pages, witnesses, issues);
  inspectRequiredPlacements(register, issues);
  inspectLanguagePairs(register, issues, options.requirePairs === true);
  const references = new Set(register.placements.flatMap(x => x.witnessIds));
  for (const witness of register.witnesses) {
    if (!references.has(witness.id)) add(issues, 'WITNESS_UNUSED', INFO, `witnesses.${witness.id}`, 'No placement uses this witness', witness.sourceId);
  }
  const sourcePages = sourcePageIndex(register);
  for (const source of register.sources) {
    if (source.state === 'included' && (sourcePages[source.id] ?? []).length === 0) {
      add(issues, 'SOURCE_UNUSED', NOTICE, `sources.${source.id}`, 'Included source not linked to a page', source.id);
    }
  }
  issues.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  const blocking = issues.filter(x => x.level === BLOCK).length;
  return {
    releaseId: register.releaseId,
    blocked: blocking !== 0,
    blocking,
    attention: issues.filter(x => x.level === NOTICE).length,
    information: issues.filter(x => x.level === INFO).length,
    findings: issues,
    counts: { sources: register.sources.length, pages: register.pages.length, placements: register.placements.length, witnesses: register.witnesses.length },
    sourcePages,
  };
}
export function buildObligationChecklist(register, audit = auditObligationRegister(register)) {
  const actions = [];
  const seen = new Set();
  for (const finding of audit.findings) {
    if (finding.level !== BLOCK) continue;
    const key = `${finding.pageId ?? 'all'}:${finding.sourceId ?? 'all'}:${finding.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push({
      id: key,
      code: finding.code,
      pageId: finding.pageId,
      sourceId: finding.sourceId,
      context: finding.path,
      detail: finding.detail,
      status: 'open',
    });
  }
  return actions.sort((a, b) => a.id.localeCompare(b.id));
}
