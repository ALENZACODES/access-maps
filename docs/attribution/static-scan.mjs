/** Static, offline source-credit scanner. It examines supplied HTML, not live places. */
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
  UNKNOWN } from './attribution-utils.mjs';

const DISCARDED = new Set(['script', 'style', 'template', 'noscript', 'svg', 'iframe']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const ENTITY_NAMES = Object.freeze({amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', ndash: '–', mdash: '—'});
function entity(match, key) {
  if (Object.hasOwn(ENTITY_NAMES, key)) return ENTITY_NAMES[key];
  if (key.startsWith('#')) {
    const hex = key[1]?.toLowerCase() === 'x';
    const digits = key.slice(hex ? 2 : 1);
    const value = Number.parseInt(digits, hex ? 16 : 10);
    if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return match;
    return String.fromCodePoint(value);
  }
  return match;
}
export function decodeHtml(value) {
  return String(value).replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/giu, entity);
}
function attributes(raw) {
  const found = Object.create(null);
  const rx = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of raw.matchAll(rx)) {
    const key = match[1]?.toLowerCase();
    if (key && !Object.hasOwn(found, key)) found[key] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return found;
}
function hidden(name, attr) {
  return DISCARDED.has(name) || Object.hasOwn(attr, 'hidden') || attr['aria-hidden'] === 'true' ||
    /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:;|$)/iu.test(attr.style ?? '');
}
/**
 * Parse visible text and links without an HTML parser package. Does not attempt
 * to simulate CSS layout; visual and assistive-technology review is separate.
 */
export function inspectStaticHtml(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 2_097_152) throw new TypeError('HTML exceeds limit');
  const tags = [];
  const stack = [];
  const visible = [];
  const links = [];
  const controls = [];
  const rx = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+|</giu;
  let rootLocale = null;
  let mainCount = 0;
  let navCount = 0;
  let h1Count = 0;
  let externalAssets = 0;
  let ariaLive = 0;
  let skipLinks = 0;
  let currentLink = null;
  for (const match of html.matchAll(rx)) {
    const token = match[0];
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (!token.startsWith('<') || token === '<') {
      if (!stack.some(frame => frame.hidden)) {
        const value = decodeHtml(token);
        visible.push(value);
        if (currentLink) currentLink.label += value;
      }
      continue;
    }
    const closing = /^<\//u.test(token);
    const parsed = /^<\/?([a-z][a-z0-9:-]*)\b([^>]*)>/iu.exec(token);
    if (!parsed) continue;
    const tag = parsed[1]?.toLowerCase();
    if (!tag) continue;
    if (closing) {
      while (stack.length) {
        const entry = stack.pop();
        if (entry?.name === 'a' && currentLink) {
          links.push(currentLink);
          currentLink = null;
        }
        if (entry?.name === tag) break;
      }
      continue;
    }
    const attr = attributes(parsed[2] ?? '');
    const invisible = hidden(tag, attr) || stack.some(entry => entry.hidden);
    if (['script', 'link', 'iframe', 'img'].includes(tag)) {
      const address = attr.src ?? attr.href ?? '';
      if (/^https?:\/\//iu.test(address)) externalAssets += 1;
    }
    if (tag === 'html' && rootLocale === null) rootLocale = attr.lang ?? UNKNOWN;
    if (!invisible) {
      if (tag === 'main') mainCount += 1;
      if (tag === 'nav') navCount += 1;
      if (tag === 'h1') h1Count += 1;
      if (attr['aria-live']) ariaLive += 1;
      if (tag === 'a') {
        currentLink = {href: attr.href ?? '', label: '', ariaLabel: attr['aria-label'] ?? ''};
        if (attr.href?.startsWith('#') && /(?:skip|aller)/iu.test(attr['aria-label'] ?? '')) skipLinks += 1;
      }
      if (['button', 'input', 'select', 'textarea'].includes(tag)) {
        controls.push({tag, label: attr['aria-label'] ?? '', id: attr.id ?? '', type: attr.type ?? '', disabled: Object.hasOwn(attr, 'disabled')});
      }
    }
    tags.push(tag);
    if (!VOID.has(tag) && !token.endsWith('/>')) stack.push({name: tag, hidden: invisible});
  }
  if (currentLink) links.push(currentLink);
  return Object.freeze({
    lang: rootLocale ?? UNKNOWN,
    text: visible.join(' ').replace(/\s+/gu, ' ').trim(),
    rawVisible: visible.join(' '),
    links: Object.freeze(links),
    controls: Object.freeze(controls),
    mainCount, navCount, h1Count, ariaLive, skipLinks, externalAssets,
    tagCount: tags.length,
  });
}
function norm(value) { return String(value).normalize('NFC').replace(/\s+/gu, ' ').trim(); }
function includes(haystack, needle) { return norm(haystack).includes(norm(needle)); }
function requiredNotices(credit, locale) {
  switch (credit.licence) {
    case 'ODbL-1.0': return [...SOURCES.osm.notices[locale]];
    case 'Metrolinx-AUA': return [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR];
    case 'OGL-Ontario-Metrolinx': return [METROLINX_OGL_NOTICE];
    case 'LTC-Open-Data-Terms': return [...SOURCES.ltc.notices[locale]];
    default: return [];
  }
}
function licenceFor(provider, licence) {
  return (provider === 'osm' && licence === 'ODbL-1.0') ||
    (provider === 'ltc' && licence === 'LTC-Open-Data-Terms') ||
    (provider === 'metrolinx' && ['Metrolinx-AUA', 'OGL-Ontario-Metrolinx'].includes(licence)) ||
    (provider === 'other' && licence === 'OTHER-OPEN');
}
function creditProblem(code, detail, pageId, creditId = null, severity = 'block') {
  return Object.freeze({code, detail, pageId, creditId, severity});
}
/** Fail closed on missing licence information, but never fabricate a dataset date. */
export function auditStaticPage(page, html) {
  const inspection = inspectStaticHtml(html);
  const findings = [];
  const add = (code, detail = '', creditId = null, severity = 'block') => findings.push(creditProblem(code, detail, page.id, creditId, severity));
  if (inspection.lang !== page.locale) add('LANGUAGE_MISMATCH', inspection.lang);
  if (inspection.mainCount !== 1) add('MAIN_LANDMARK', String(inspection.mainCount));
  if (inspection.h1Count !== 1) add('PAGE_HEADING', String(inspection.h1Count));
  if (inspection.navCount < 1) add('NAV_LANDMARK');
  if (inspection.externalAssets > 0) add('REMOTE_ASSETS', String(inspection.externalAssets));
  if (page.offline !== 'YES') add('OFFLINE_UNKNOWN_OR_NO', page.offline);
  if (page.minimumTargetPx === UNKNOWN) add('TARGET_UNKNOWN');
  else if (page.minimumTargetPx < 44) add('TARGET_TOO_SMALL', String(page.minimumTargetPx));
  if (!includes(inspection.text, page.navigationLabel)) add('NAVIGATION_LABEL_MISSING');
  if (inspection.controls.some(item => !item.disabled && item.tag === 'button' && !item.label && !item.id)) {
    add('CONTROL_LABEL_UNKNOWN');
  }
  if (!page.credits.length) add('NO_CREDITS');
  for (const credit of page.credits) {
    if (credit.provider === UNKNOWN) add('PROVIDER_UNKNOWN', '', credit.id);
    if (credit.permission !== 'YES') add(credit.permission === 'NO' ? 'PERMISSION_DENIED' : 'PERMISSION_UNKNOWN', '', credit.id);
    if (!licenceFor(credit.provider, credit.licence)) add('LICENCE_MISMATCH', credit.licence, credit.id);
    if (credit.sourceUrl === UNKNOWN) add('SOURCE_URL_UNKNOWN', '', credit.id);
    if (credit.licenceUrl === UNKNOWN) add('LICENCE_URL_UNKNOWN', '', credit.id);
    if (credit.tier === UNKNOWN) add('TIER_UNKNOWN', '', credit.id);
    if (credit.collectedDate === UNKNOWN) add('COLLECTION_DATE_UNKNOWN', '', credit.id);
    if (credit.termsDate === UNKNOWN) add('TERMS_DATE_UNKNOWN', '', credit.id);
    if (credit.datasetDate === UNKNOWN) add('DATASET_DATE_UNKNOWN', '', credit.id, 'info');
    if (credit.sourceUrl !== UNKNOWN && !inspection.links.some(link => link.href === credit.sourceUrl)) add('SOURCE_LINK_MISSING', credit.sourceUrl, credit.id);
    if (credit.licenceUrl !== UNKNOWN && !inspection.links.some(link => link.href === credit.licenceUrl)) add('LICENCE_LINK_MISSING', credit.licenceUrl, credit.id);
    if (!credit.notice.trim()) add('NOTICE_MISSING', '', credit.id);
    for (const notice of requiredNotices(credit, page.locale)) {
      if (!includes(inspection.text, notice)) add('LEGAL_TEXT_MISSING', notice.slice(0, 80), credit.id);
      if (!includes(credit.notice, notice)) add('EVIDENCE_NOTICE_MISSING', notice.slice(0, 80), credit.id);
    }
    if (credit.licence === 'Metrolinx-AUA' && includes(credit.notice, METROLINX_OGL_NOTICE)) add('INCOMPATIBLE_NOTICE', 'AUA and OGL are separate', credit.id);
    if (credit.licence === 'OGL-Ontario-Metrolinx' && includes(credit.notice, METROLINX_AUA_LEGEND)) add('INCOMPATIBLE_NOTICE', 'AUA and OGL are separate', credit.id);
    if (credit.provider === 'osm' && page.mapView !== 'NO') {
      if (page.mapView === UNKNOWN) add('MAP_CONTEXT_UNKNOWN', '', credit.id);
      else if (!includes(inspection.text, SOURCES.osm.notices.en[0])) add('MAP_CREDIT_MISSING', '', credit.id);
    }
  }
  findings.sort((a, b) => a.code.localeCompare(b.code) || String(a.creditId).localeCompare(String(b.creditId)));
  return Object.freeze({pageId: page.id, file: page.file, blocked: findings.some(f => f.severity === 'block'),
    findings: Object.freeze(findings), inspection});
}
export function auditStaticRelease(release, htmlByFile) {
  const results = release.pages.map(page => {
    const html = htmlByFile.get(page.file);
    if (typeof html !== 'string') return Object.freeze({pageId: page.id, file: page.file, blocked: true,
      findings: Object.freeze([creditProblem('PAGE_FILE_MISSING', page.file, page.id)]), inspection: null});
    return auditStaticPage(page, html);
  });
  return Object.freeze({releaseId: release.releaseId, blocked: results.some(result => result.blocked),
    results: Object.freeze(results), blockingCount: results.reduce((n, r) => n + r.findings.filter(f => f.severity === 'block').length, 0)});
}
export function compareStaticReleases(before, after) {
  const prior = new Map(before.results.map(result => [result.pageId, result]));
  const current = new Map(after.results.map(result => [result.pageId, result]));
  const changes = [];
  for (const [id, result] of prior) {
    const next = current.get(id);
    if (!next) { changes.push({code: 'PAGE_REMOVED', pageId: id, blocked: true}); continue; }
    const former = new Set(result.findings.filter(f => f.severity === 'block').map(f => `${f.code}:${f.creditId ?? ''}`));
    for (const finding of next.findings.filter(f => f.severity === 'block')) {
      if (!former.has(`${finding.code}:${finding.creditId ?? ''}`)) changes.push({code: 'NEW_BLOCKER', pageId: id, finding: finding.code, blocked: true});
    }
    if (!result.blocked && next.blocked && !changes.some(c => c.pageId === id)) changes.push({code: 'PAGE_REGRESSION', pageId: id, blocked: true});
  }
  return Object.freeze({blocked: after.blocked || changes.some(c => c.blocked), changes: Object.freeze(changes)});
}
