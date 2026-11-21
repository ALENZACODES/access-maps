/** Audit the offline EN/FR disclosure catalogue and its actual page mappings. */
import {
  ACCESS, ageWithin, array, bilingual, calendar, digest, frenchType, hasExactly,
  held, identifier, inspectBilingual, inspectSource, label, makeAudit, maxInput,
  object, offlinePath, privateText, safeInteger, siloOf, stamp, unique,
  unsafeMarkup, validRoot,
} from './p15k-core.mjs';

const CONTROLS = ['button', 'link', 'input', 'select', 'checkbox', 'radio'];
const ROLES = ['heading', 'text', 'status', 'control', 'link'];
const FEATURES = ['entrance', 'washroom', 'parking', 'lift', 'path', 'surface', 'transfer'];
const MAX_COPY = 3000;

export function entryShape(value) {
  return hasExactly(value, ['id', 'kind', 'en', 'fr', 'role', 'minimumTargetPx', 'sourceId'], ['href', 'status']) &&
    identifier(value.id) && ['copy', 'evidence', 'status', 'action', 'heading', 'link'].includes(value.kind) &&
    label(value.en, MAX_COPY) && label(value.fr, MAX_COPY) && ROLES.includes(value.role) &&
    (value.minimumTargetPx === null || safeInteger(value.minimumTargetPx, 4096)) &&
    (value.sourceId === null || identifier(value.sourceId)) &&
    (value.href === undefined || offlinePath(value.href)) &&
    (value.status === undefined || ACCESS.includes(value.status));
}
export function pageShape(value) {
  return hasExactly(value, ['id', 'enPath', 'frPath', 'headingKey', 'statusKey', 'keyRefs', 'langSwitchKey', 'sourceIds']) &&
    identifier(value.id) && offlinePath(value.enPath) && offlinePath(value.frPath) &&
    identifier(value.headingKey) && identifier(value.statusKey) && identifier(value.langSwitchKey) &&
    array(value.keyRefs, 1000) && value.keyRefs.every(identifier) &&
    array(value.sourceIds, 1000) && value.sourceIds.every(identifier);
}
export function sourceShape(value) {
  return hasExactly(value, ['id', 'stamp', 'attribution', 'silo']) &&
    identifier(value.id) && stamp(value.stamp) && hasExactly(value.attribution, ['en', 'fr']) &&
    ['open', 'odbl'].includes(value.silo);
}
export function accessDisclosureShape(value) {
  return hasExactly(value, ['id', 'feature', 'access', 'sourceId', 'observedOn', 'enPageId', 'frPageId', 'evidenceIds']) &&
    identifier(value.id) && FEATURES.includes(value.feature) && ACCESS.includes(value.access) &&
    (value.sourceId === null || identifier(value.sourceId)) &&
    (value.observedOn === null || calendar(value.observedOn) !== null) &&
    identifier(value.enPageId) && identifier(value.frPageId) &&
    array(value.evidenceIds, 1000) && value.evidenceIds.every(identifier);
}
export function controlShape(value) {
  return hasExactly(value, ['id', 'pageId', 'copyKey', 'type', 'widthPx', 'heightPx', 'labelledBy', 'focusIndex']) &&
    identifier(value.id) && identifier(value.pageId) && identifier(value.copyKey) &&
    CONTROLS.includes(value.type) && safeInteger(value.widthPx, 4096) &&
    safeInteger(value.heightPx, 4096) && identifier(value.labelledBy) &&
    safeInteger(value.focusIndex, 10000);
}
export function evidenceShape(value) {
  return hasExactly(value, ['id', 'feature', 'access', 'sourceId', 'recordedOn']) &&
    identifier(value.id) && FEATURES.includes(value.feature) && ACCESS.includes(value.access) &&
    identifier(value.sourceId) && calendar(value.recordedOn) !== null;
}
function checkRoot(input) {
  return validRoot(input, ['schemaVersion', 'asOf', 'maxAgeDays', 'entries', 'pages', 'sources',
    'disclosures', 'controls', 'evidence', 'offlineAssets']) &&
    calendar(input.asOf) !== null && safeInteger(input.maxAgeDays, 36500) &&
    array(input.entries) && array(input.pages) && array(input.sources) &&
    array(input.disclosures) && array(input.controls) && array(input.evidence) &&
    array(input.offlineAssets);
}
function index(items, audit, path) {
  const ids = new Map();
  items.forEach((item, i) => {
    if (!object(item) || !identifier(item.id)) return;
    if (ids.has(item.id)) audit.add('DUPLICATE', `${path}[${i}]`);
    ids.set(item.id, item);
  });
  return ids;
}
function placeholders(value) {
  const tokens = [...value.matchAll(/\{([a-z][a-z0-9_]*)\}/gu)].map(match => match[1]);
  if (value.replace(/\{[a-z][a-z0-9_]*\}/gu, '').match(/[{}]/u)) return null;
  return [...new Set(tokens)].sort();
}
function checkEntry(entry, audit, path, sources) {
  if (!entryShape(entry)) { audit.add('SHAPE', path); return; }
  inspectBilingual({ en: entry.en, fr: entry.fr }, audit, path, MAX_COPY);
  const enTokens = placeholders(entry.en);
  const frTokens = placeholders(entry.fr);
  if (enTokens === null || frTokens === null || JSON.stringify(enTokens) !== JSON.stringify(frTokens)) {
    audit.add('LANGUAGE', `${path}.placeholders`);
  }
  const interactive = ['action', 'link'].includes(entry.kind) || ['control', 'link'].includes(entry.role);
  if (interactive && (entry.minimumTargetPx === null || entry.minimumTargetPx < 44)) {
    audit.add('TARGET', `${path}.minimumTargetPx`);
  }
  if (entry.kind === 'status' && entry.status !== 'UNKNOWN' && entry.sourceId === null) {
    audit.add('EVIDENCE', `${path}.sourceId`);
  }
  if (entry.status === 'UNKNOWN' && (entry.en !== 'UNKNOWN' || entry.fr !== 'UNKNOWN')) {
    audit.add('UNKNOWN', path);
  }
  if (entry.sourceId && !sources.has(entry.sourceId)) audit.add('REFERENCE', `${path}.sourceId`);
  if (entry.href !== undefined && !offlinePath(entry.href)) audit.add('PATH', `${path}.href`);
  if (entry.role === 'heading' && entry.kind !== 'heading') audit.add('SHAPE', `${path}.role`);
  if (entry.kind === 'link' && entry.href === undefined) audit.add('PATH', `${path}.href`);
  if (entry.kind === 'action' && !['control', 'link'].includes(entry.role)) audit.add('SHAPE', path);
}
function checkPage(page, audit, path, entries, sources) {
  if (!pageShape(page)) { audit.add('SHAPE', path); return; }
  if (page.enPath === page.frPath) audit.add('PATH', path);
  if (!page.enPath.startsWith('en/') || !page.frPath.startsWith('fr/')) audit.add('LANGUAGE', path);
  if (!unique(page.keyRefs) || !unique(page.sourceIds)) audit.add('DUPLICATE', path);
  const required = [page.headingKey, page.statusKey, page.langSwitchKey];
  for (const key of required) if (!page.keyRefs.includes(key)) audit.add('REFERENCE', `${path}.keyRefs`);
  for (const key of page.keyRefs) if (!entries.has(key)) audit.add('REFERENCE', `${path}.keyRefs.${key}`);
  for (const id of page.sourceIds) if (!sources.has(id)) audit.add('REFERENCE', `${path}.sourceIds.${id}`);
  if (entries.get(page.headingKey)?.kind !== 'heading') audit.add('SHAPE', `${path}.headingKey`);
  if (!['link', 'action'].includes(entries.get(page.langSwitchKey)?.kind)) audit.add('SHAPE', `${path}.langSwitchKey`);
  if (entries.get(page.statusKey)?.kind !== 'status') audit.add('SHAPE', `${path}.statusKey`);
}
function checkDisclosure(disclosure, audit, path, pages, sources, evidence, input) {
  if (!accessDisclosureShape(disclosure)) { audit.add('SHAPE', path); return; }
  if (!pages.has(disclosure.enPageId) || !pages.has(disclosure.frPageId)) audit.add('REFERENCE', path);
  if (disclosure.enPageId !== disclosure.frPageId) audit.add('LANGUAGE', path);
  if (!unique(disclosure.evidenceIds)) audit.add('DUPLICATE', `${path}.evidenceIds`);
  const current = disclosure.evidenceIds.map(id => evidence.get(id));
  if (current.some(item => !item)) audit.add('REFERENCE', `${path}.evidenceIds`);
  const matching = current.filter(item => item && item.feature === disclosure.feature &&
    item.access === disclosure.access && ageWithin(item.recordedOn, input.asOf, input.maxAgeDays));
  if (disclosure.access === 'UNKNOWN') {
    if (disclosure.sourceId !== null || disclosure.observedOn !== null) audit.add('UNKNOWN', path);
  } else {
    if (!disclosure.sourceId || !sources.has(disclosure.sourceId) || !disclosure.observedOn) {
      audit.add('EVIDENCE', path);
    } else if (!matching.some(item => item.sourceId === disclosure.sourceId &&
      item.recordedOn === disclosure.observedOn)) audit.add('EVIDENCE', path);
  }
  const yes = current.some(item => item?.access === 'YES');
  const no = current.some(item => item?.access === 'NO');
  if (yes && no && disclosure.access !== 'UNKNOWN') audit.add('CONFLICT', path);
  if (disclosure.sourceId && !pages.get(disclosure.enPageId)?.sourceIds?.includes(disclosure.sourceId)) {
    audit.add('REFERENCE', `${path}.sourceId`);
  }
}
function checkControl(control, audit, path, pages, entries) {
  if (!controlShape(control)) { audit.add('SHAPE', path); return; }
  if (control.widthPx < 44 || control.heightPx < 44) audit.add('TARGET', path);
  if (!pages.has(control.pageId)) audit.add('REFERENCE', `${path}.pageId`);
  if (!entries.has(control.copyKey) || !entries.has(control.labelledBy)) audit.add('REFERENCE', path);
  if (!pages.get(control.pageId)?.keyRefs?.includes(control.copyKey)) audit.add('REFERENCE', `${path}.copyKey`);
  if (!pages.get(control.pageId)?.keyRefs?.includes(control.labelledBy)) audit.add('REFERENCE', `${path}.labelledBy`);
}
export function auditDisclosures(input) {
  const audit = makeAudit();
  const totals = { entries: 0, pages: 0, sources: 0, disclosures: 0, controls: 0, evidence: 0 };
  if (!checkRoot(input)) { audit.add('SHAPE', '$'); return audit.finish(totals); }
  if (!maxInput(input, audit)) return audit.finish(totals);
  totals.entries = input.entries.length;
  totals.pages = input.pages.length;
  totals.sources = input.sources.length;
  totals.disclosures = input.disclosures.length;
  totals.controls = input.controls.length;
  totals.evidence = input.evidence.length;
  const entries = index(input.entries, audit, '$.entries');
  const pages = index(input.pages, audit, '$.pages');
  const sources = index(input.sources, audit, '$.sources');
  const evidence = index(input.evidence, audit, '$.evidence');
  index(input.disclosures, audit, '$.disclosures');
  index(input.controls, audit, '$.controls');
  input.sources.forEach((item, i) => {
    const path = `$.sources[${i}]`;
    if (!sourceShape(item)) { audit.add('SHAPE', path); return; }
    inspectSource(item.stamp, audit, `${path}.stamp`, input);
    inspectBilingual(item.attribution, audit, `${path}.attribution`);
    if (item.silo !== siloOf([item.stamp])) audit.add('SILO', `${path}.silo`);
  });
  input.entries.forEach((item, i) => checkEntry(item, audit, `$.entries[${i}]`, sources));
  input.pages.forEach((item, i) => checkPage(item, audit, `$.pages[${i}]`, entries, sources));
  input.evidence.forEach((item, i) => {
    const path = `$.evidence[${i}]`;
    if (!evidenceShape(item)) { audit.add('SHAPE', path); return; }
    if (!sources.has(item.sourceId)) audit.add('REFERENCE', `${path}.sourceId`);
    if (!ageWithin(item.recordedOn, input.asOf, input.maxAgeDays)) audit.add('STALE', path);
  });
  input.disclosures.forEach((item, i) =>
    checkDisclosure(item, audit, `$.disclosures[${i}]`, pages, sources, evidence, input));
  input.controls.forEach((item, i) => checkControl(item, audit, `$.controls[${i}]`, pages, entries));
  const allPaths = input.pages.filter(pageShape).flatMap(page => [page.enPath, page.frPath]);
  if (!unique(allPaths)) audit.add('DUPLICATE', '$.pages.paths');
  const seenFocus = new Set();
  for (const control of input.controls.filter(controlShape)) {
    const key = `${control.pageId}/${control.focusIndex}`;
    if (seenFocus.has(key)) audit.add('DUPLICATE', `$.controls.focus.${key}`);
    seenFocus.add(key);
  }
  const assets = new Set();
  input.offlineAssets.forEach((item, i) => {
    if (!offlinePath(item) || assets.has(item)) audit.add('PATH', `$.offlineAssets[${i}]`);
    assets.add(item);
  });
  for (const page of input.pages.filter(pageShape)) {
    for (const path of [page.enPath, page.frPath]) if (!assets.has(path)) audit.add('REFERENCE', `$.offlineAssets.${path}`);
  }
  for (const entry of input.entries.filter(entryShape)) {
    if (entry.href && !assets.has(entry.href)) audit.add('REFERENCE', `$.offlineAssets.${entry.href}`);
  }
  for (const source of input.sources.filter(sourceShape)) {
    if (!assets.has(source.stamp.reference)) audit.add('REFERENCE', `$.offlineAssets.${source.stamp.reference}`);
  }
  const referenced = new Set(input.pages.filter(pageShape).flatMap(page => page.keyRefs));
  for (const entry of input.entries.filter(entryShape)) {
    if (!referenced.has(entry.id)) audit.add('REFERENCE', `$.entries.${entry.id}`, 'NOTICE');
  }
  return audit.finish(totals);
}
