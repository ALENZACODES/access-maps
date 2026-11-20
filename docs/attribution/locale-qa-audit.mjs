/** Source-backed publication QA, not a statement about the accessibility of a place. */
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
import { UNKNOWN, pairedPages, sourcesUsedByPages } from './locale-qa-core.mjs';

export const LEVEL = Object.freeze({ block: 'block', review: 'review', info: 'info' });
export const MIN_TARGET_PX = 44;
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const ODBL_NAME = 'Open Database License (ODbL) 1.0';
export const FR_NBSP = '\u00a0';
export const FR_NNBSP = '\u202f';
const FR_PUNCTUATION = /(?:[ \t]+)([:;!?])/gu;
const FR_ASCII_APOSTROPHE = /\b[cdjlmnst]'(?=[A-Za-zÀ-ÿ])/giu;

function normal(value) { return String(value).normalize('NFC').replace(/\s+/gu, ' ').trim(); }
function contains(text, required) { return normal(text).includes(normal(required)); }
function add(findings, code, severity, path, detail, pageId = null, sourceId = null) {
  findings.push({ code, severity, path, detail, pageId, sourceId });
}
function hasNotice(page, id, kind, required) {
  return page.notices.some(n => n.sourceId === id && n.kind === kind && n.visible === 'YES' && contains(n.text, required));
}
function kinds(page, id) { return new Set(page.notices.filter(n => n.sourceId === id).map(n => n.kind)); }
function requireLegal(findings, page, source, kind, content, code) {
  if (!hasNotice(page, source.id, kind, content)) add(findings, code, 'block', `pages.${page.id}.notices`, content.slice(0, 80), page.id, source.id);
}
function legalChecks(findings, page, source) {
  const id = source.id;
  const base = `pages.${page.id}.notices`;
  const noticeList = page.notices.filter(n => n.sourceId === id && n.visible === 'YES');
  const joined = noticeList.map(n => n.text).join('\n');
  switch (source.terms) {
    case 'ODbL-1.0':
      if (source.provider !== 'osm') add(findings, 'ODBL_PROVIDER_MISMATCH', 'block', base, 'ODbL provider differs from the catalogue', page.id, id);
      requireLegal(findings, page, source, 'credit', OSM_CREDIT, 'OSM_CREDIT_MISSING');
      requireLegal(findings, page, source, 'licence', ODBL_NAME, 'ODBL_TERMS_MISSING');
      if (page.display === 'map' && !page.notices.some(n => n.sourceId === id && n.kind === 'credit' && n.nearContent === 'YES')) add(findings, 'MAP_CREDIT_NOT_NEAR_MAP', 'block', base, 'Map credit location is missing', page.id, id);
      break;
    case 'Metrolinx-AUA':
      if (source.provider !== 'metrolinx') add(findings, 'AUA_PROVIDER_MISMATCH', 'block', base, 'Provider differs from terms', page.id, id);
      requireLegal(findings, page, source, 'disclaimer', METROLINX_AUA_LEGEND, 'AUA_LEGEND_MISSING');
      requireLegal(findings, page, source, 'laws', METROLINX_AUA_END_USER_LAWS_EN, 'AUA_EN_LAWS_MISSING');
      requireLegal(findings, page, source, 'laws', METROLINX_AUA_END_USER_LAWS_FR, 'AUA_FR_LAWS_MISSING');
      if (contains(joined, METROLINX_OGL_NOTICE)) add(findings, 'AUA_OGL_MIXED', 'block', base, 'OGL notice is not a substitute for AUA terms', page.id, id);
      break;
    case 'Metrolinx-OGL':
      if (source.provider !== 'metrolinx') add(findings, 'OGL_PROVIDER_MISMATCH', 'block', base, 'Provider differs from terms', page.id, id);
      requireLegal(findings, page, source, 'licence', METROLINX_OGL_NOTICE, 'OGL_NOTICE_MISSING');
      if (contains(joined, METROLINX_AUA_LEGEND)) add(findings, 'OGL_AUA_MIXED', 'block', base, 'AUA is a separate feed agreement', page.id, id);
      break;
    case 'LTC-Terms':
      if (source.provider !== 'ltc') add(findings, 'LTC_PROVIDER_MISMATCH', 'block', base, 'Provider differs from terms', page.id, id);
      requireLegal(findings, page, source, 'credit', SOURCES.ltc.notices[page.locale][0], 'LTC_CREDIT_MISSING');
      break;
    case 'OTHER-OPEN':
      if (source.provider !== 'other') add(findings, 'OTHER_PROVIDER_MISMATCH', 'block', base, 'Other terms with a known provider', page.id, id);
      if (/^(?:open|other(?:\s+open)?|unknown|unspecified|proprietary)(?:\s+(?:data|licen[cs]e|terms)){0,2}$/iu.test(source.licenceName)) add(findings, 'OTHER_LICENCE_UNSPECIFIED', 'block', base, 'A specific open licence name is required', page.id, id);
      if (!kinds(page, id).has('licence')) add(findings, 'OTHER_LICENCE_MISSING', 'block', base, 'Custom open licence notice is absent', page.id, id);
      break;
    default:
      add(findings, 'TERMS_UNRECOGNISED', 'block', base, 'Terms not recognized', page.id, id);
  }
}
function frenchChecks(findings, page, notice) {
  if (page.locale !== 'fr') return;
  const path = `pages.${page.id}.notices.${notice.id}`;
  const content = notice.text;
  if (FR_ASCII_APOSTROPHE.test(content)) add(findings, 'FR_APOSTROPHE', 'block', path, 'Use the typographic apostrophe', page.id, notice.sourceId);
  FR_ASCII_APOSTROPHE.lastIndex = 0;
  for (const match of content.matchAll(FR_PUNCTUATION)) {
    const punc = match[1];
    const gap = match[0].slice(0, -1);
    if (punc === ':' && gap !== FR_NBSP) add(findings, 'FR_COLON_SPACE', 'block', path, 'Use U+00A0 before colon', page.id, notice.sourceId);
    if (punc !== ':' && gap !== FR_NNBSP) add(findings, 'FR_PUNCTUATION_SPACE', 'block', path, 'Use U+202F before ; ! ?', page.id, notice.sourceId);
  }
  if (/\s+»/u.test(content) && !content.includes(`${FR_NNBSP}»`)) add(findings, 'FR_GUILLEMET_CLOSE', 'block', path, 'Use U+202F inside French guillemets', page.id, notice.sourceId);
  if (/«\s+/u.test(content) && !content.includes(`«${FR_NNBSP}`)) add(findings, 'FR_GUILLEMET_OPEN', 'block', path, 'Use U+202F inside French guillemets', page.id, notice.sourceId);
}
function sourceChecks(findings, source, index) {
  if (source.status !== 'included') return;
  const path = `sources.${index}`;
  if (source.permission !== 'YES') add(findings, 'SOURCE_PERMISSION_MISSING', 'block', `${path}.permission`, 'Redistribution permission is not affirmative', null, source.id);
  if (source.licenceEvidence !== 'YES') add(findings, 'LICENCE_EVIDENCE_MISSING', 'block', `${path}.licenceEvidence`, 'Licence terms are not evidenced', null, source.id);
  if (source.sourceUrl === UNKNOWN) add(findings, 'SOURCE_URL_UNKNOWN', 'block', `${path}.sourceUrl`, 'Source origin is UNKNOWN', null, source.id);
  if (source.licenceUrl === UNKNOWN) add(findings, 'LICENCE_URL_UNKNOWN', 'block', `${path}.licenceUrl`, 'Licence link is UNKNOWN', null, source.id);
  if (source.acquiredDate === UNKNOWN) add(findings, 'ACQUISITION_DATE_UNKNOWN', 'block', `${path}.acquiredDate`, 'Acquisition date is UNKNOWN', null, source.id);
  if (source.termsDate === UNKNOWN) add(findings, 'TERMS_DATE_UNKNOWN', 'block', `${path}.termsDate`, 'Terms review date is UNKNOWN', null, source.id);
  if (source.evidenceTier === UNKNOWN) add(findings, 'EVIDENCE_TIER_UNKNOWN', 'block', `${path}.evidenceTier`, 'Evidence tier is UNKNOWN', null, source.id);
  if (source.datasetDate === UNKNOWN) add(findings, 'DATASET_DATE_UNKNOWN', 'info', `${path}.datasetDate`, 'Dataset date remains UNKNOWN', null, source.id);
  if (source.datasetDate !== UNKNOWN && source.acquiredDate !== UNKNOWN && source.datasetDate > source.acquiredDate) add(findings, 'DATASET_DATE_AFTER_ACQUISITION', 'review', `${path}.datasetDate`, 'Recorded dataset date follows acquisition', null, source.id);
  if (source.termsDate !== UNKNOWN && source.acquiredDate !== UNKNOWN && source.termsDate > source.acquiredDate) add(findings, 'TERMS_DATE_AFTER_ACQUISITION', 'review', `${path}.termsDate`, 'Recorded terms date follows acquisition', null, source.id);
  const match = { 'osm': 'ODbL-1.0', 'ltc': 'LTC-Terms', 'other': 'OTHER-OPEN' };
  if (match[source.provider] && source.terms !== match[source.provider]) add(findings, 'PROVIDER_TERMS_MISMATCH', 'block', `${path}.terms`, 'Terms do not match the provider family', null, source.id);
  if (source.provider === 'metrolinx' && !['Metrolinx-AUA', 'Metrolinx-OGL'].includes(source.terms)) add(findings, 'METROLINX_TERMS_MISMATCH', 'block', `${path}.terms`, 'Feed-specific terms required', null, source.id);
}
function noticeChecks(findings, page, notice, sourceMap) {
  const path = `pages.${page.id}.notices.${notice.id}`;
  const source = sourceMap.get(notice.sourceId);
  if (!source) add(findings, 'NOTICE_SOURCE_UNKNOWN', 'block', path, 'Notice has no source record', page.id, notice.sourceId);
  else if (!page.sourceIds.includes(source.id)) add(findings, 'NOTICE_SOURCE_UNDECLARED', 'block', path, 'Notice references a source not declared on this page', page.id, source.id);
  if (notice.visible !== 'YES') add(findings, 'NOTICE_HIDDEN_OR_UNKNOWN', 'block', `${path}.visible`, 'Notice visibility is not affirmative', page.id, notice.sourceId);
  if (notice.keyboard !== 'YES') add(findings, 'NOTICE_KEYBOARD_MISSING', 'block', `${path}.keyboard`, 'Keyboard evidence missing', page.id, notice.sourceId);
  if (notice.screenReader !== 'YES') add(findings, 'NOTICE_SCREEN_READER_MISSING', 'block', `${path}.screenReader`, 'Screen-reader evidence missing', page.id, notice.sourceId);
  if (notice.contrast !== 'YES') add(findings, 'NOTICE_CONTRAST_MISSING', 'block', `${path}.contrast`, 'Contrast evidence missing', page.id, notice.sourceId);
  if (notice.targetPx === UNKNOWN) add(findings, 'NOTICE_TARGET_UNKNOWN', 'block', `${path}.targetPx`, 'Target dimension is UNKNOWN', page.id, notice.sourceId);
  else if (notice.targetPx < MIN_TARGET_PX) add(findings, 'NOTICE_TARGET_SMALL', 'block', `${path}.targetPx`, 'Target below 44 px', page.id, notice.sourceId);
  if (notice.review !== 'accepted') add(findings, 'NOTICE_TRANSLATION_NOT_ACCEPTED', 'block', `${path}.review`, 'Editorial review is not accepted', page.id, notice.sourceId);
  if (notice.reviewDate === UNKNOWN) add(findings, 'NOTICE_REVIEW_DATE_UNKNOWN', 'block', `${path}.reviewDate`, 'Editorial review date is UNKNOWN', page.id, notice.sourceId);
  if (notice.evidenceUrl === UNKNOWN) add(findings, 'NOTICE_EVIDENCE_UNKNOWN', 'block', `${path}.evidenceUrl`, 'Review evidence URL is UNKNOWN', page.id, notice.sourceId);
  if (notice.licenceUrl === UNKNOWN) add(findings, 'NOTICE_TERMS_LINK_UNKNOWN', 'block', `${path}.licenceUrl`, 'Notice does not link to licence terms', page.id, notice.sourceId);
  if (source && source.licenceUrl !== UNKNOWN && notice.licenceUrl !== source.licenceUrl) add(findings, 'NOTICE_TERMS_LINK_MISMATCH', 'block', `${path}.licenceUrl`, 'Notice terms link differs from source terms', page.id, notice.sourceId);
  frenchChecks(findings, page, notice);
}
function pageChecks(findings, page, sources) {
  if (page.publicStatus !== 'included') return;
  const path = `pages.${page.id}`;
  if (page.offline !== 'YES') add(findings, 'PAGE_OFFLINE_UNKNOWN', 'block', `${path}.offline`, 'Offline record is not affirmative', page.id);
  if (page.targetPx === UNKNOWN) add(findings, 'PAGE_TARGET_UNKNOWN', 'block', `${path}.targetPx`, 'Page target dimension is UNKNOWN', page.id);
  else if (page.targetPx < MIN_TARGET_PX) add(findings, 'PAGE_TARGET_SMALL', 'block', `${path}.targetPx`, 'Page target below 44 px', page.id);
  if (page.publishedDate === UNKNOWN) add(findings, 'PAGE_DATE_UNKNOWN', 'review', `${path}.publishedDate`, 'Publication date is UNKNOWN', page.id);
  if (page.sourceIds.length === 0) add(findings, 'PAGE_NO_SOURCES', 'block', `${path}.sourceIds`, 'No source records declared', page.id);
  if (page.notices.length === 0) add(findings, 'PAGE_NO_NOTICES', 'block', `${path}.notices`, 'No notices declared', page.id);
  for (const id of page.sourceIds) {
    const source = sources.get(id);
    if (!source) add(findings, 'PAGE_SOURCE_UNKNOWN', 'block', `${path}.sourceIds`, 'Source ID not found', page.id, id);
    else if (source.status !== 'included') add(findings, 'PAGE_SOURCE_NOT_INCLUDED', 'block', `${path}.sourceIds`, 'Published page references held or excluded source', page.id, id);
    else legalChecks(findings, page, source);
  }
  for (const notice of page.notices) noticeChecks(findings, page, notice, sources);
}
function bilingualChecks(findings, pages, requireBilingual) {
  if (!requireBilingual) return;
  for (const [pairId, pair] of pairedPages({ pages })) {
    const en = pair.en?.publicStatus === 'included' ? pair.en : null;
    const fr = pair.fr?.publicStatus === 'included' ? pair.fr : null;
    if (!en || !fr) {
      add(findings, 'LOCALE_PAIR_MISSING', 'block', `pairs.${pairId}`, 'Both English and French publication pages are needed');
      continue;
    }
    const left = [...en.sourceIds].sort().join('|');
    const right = [...fr.sourceIds].sort().join('|');
    if (left !== right) add(findings, 'LOCALE_SOURCE_MISMATCH', 'block', `pairs.${pairId}`, 'English and French pages declare different sources');
    if (en.display !== fr.display) add(findings, 'LOCALE_DISPLAY_MISMATCH', 'block', `pairs.${pairId}`, 'Page display modes differ');
    if (en.offline !== fr.offline) add(findings, 'LOCALE_OFFLINE_MISMATCH', 'block', `pairs.${pairId}`, 'Offline evidence differs');
    if (en.targetPx !== fr.targetPx) add(findings, 'LOCALE_TARGET_DIFFERENCE', 'review', `pairs.${pairId}`, 'Target dimensions differ');
    for (const sourceId of new Set([...en.sourceIds, ...fr.sourceIds])) {
      const enKinds = [...new Set(en.notices.filter(n => n.sourceId === sourceId).map(n => n.kind))].sort();
      const frKinds = [...new Set(fr.notices.filter(n => n.sourceId === sourceId).map(n => n.kind))].sort();
      if (enKinds.join('|') !== frKinds.join('|')) add(findings, 'LOCALE_NOTICE_KIND_MISMATCH', 'block', `pairs.${pairId}`, `Notice categories differ for ${sourceId}`);
    }
  }
}
export function auditLocaleQa(release) {
  const findings = [];
  const sourceMap = new Map(release.sources.map(s => [s.id, s]));
  if (release.sources.length === 0) add(findings, 'RELEASE_NO_SOURCES', 'block', 'sources', 'No source evidence supplied');
  if (release.pages.length === 0) add(findings, 'RELEASE_NO_PAGES', 'block', 'pages', 'No publication pages supplied');
  release.sources.forEach((s, i) => sourceChecks(findings, s, i));
  release.pages.forEach(p => pageChecks(findings, p, sourceMap));
  bilingualChecks(findings, release.pages, release.requireBilingual);
  const used = sourcesUsedByPages(release);
  for (const source of release.sources) if (source.status === 'included' && (used.get(source.id) ?? []).length === 0) add(findings, 'INCLUDED_SOURCE_UNUSED', 'review', `sources.${source.id}`, 'Source is included but absent from publication pages', null, source.id);
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || String(a.pageId).localeCompare(String(b.pageId)));
  const blockingCount = findings.filter(f => f.severity === 'block').length;
  return {
    releaseId: release.releaseId,
    blocked: blockingCount > 0,
    blockingCount,
    reviewCount: findings.filter(f => f.severity === 'review').length,
    informationCount: findings.filter(f => f.severity === 'info').length,
    sourceCount: release.sources.length,
    pageCount: release.pages.length,
    findings,
    pageIdsBySource: Object.fromEntries([...used].sort(([a],[b]) => a.localeCompare(b))),
  };
}
export function findingsForPage(report, id) { return report.findings.filter(f => f.pageId === id); }
export function findingsForSource(report, id) { return report.findings.filter(f => f.sourceId === id); }
export function blockers(report) { return report.findings.filter(f => f.severity === 'block'); }
